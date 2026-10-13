import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { supabase, BUCKET } from '../supabase.js';

const router = express.Router();
const MAX = (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX, files: 1 } });
const UUID = /^[0-9a-f-]{36}$/i;
const ok = (r, data, s = 200) => r.status(s).json({ success:true, data });
const err = (r, s, code, message) => r.status(s).json({ success:false, error:{ code, message } });

const TYPES = {
  pdf:'application/pdf', doc:'application/msword', txt:'text/plain', csv:'text/csv', png:'image/png',
  jpg:'image/jpeg', jpeg:'image/jpeg', xls:'application/vnd.ms-excel', ppt:'application/vnd.ms-powerpoint',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const MAGIC = { pdf:[0x25,0x50,0x44,0x46], png:[0x89,0x50,0x4e,0x47], jpg:[0xff,0xd8,0xff], jpeg:[0xff,0xd8,0xff],
  docx:[0x50,0x4b,3,4], xlsx:[0x50,0x4b,3,4], pptx:[0x50,0x4b,3,4],
  doc:[0xd0,0xcf,0x11,0xe0], xls:[0xd0,0xcf,0x11,0xe0], ppt:[0xd0,0xcf,0x11,0xe0] };
const CATEGORY = { pdf:'document', doc:'document', docx:'document', txt:'document', csv:'spreadsheet', xls:'spreadsheet', xlsx:'spreadsheet', ppt:'presentation', pptx:'presentation', png:'image', jpg:'image', jpeg:'image' };
const SORT = { name:'original_name', date:'created_at', size:'file_size' };
const pub = r => ({ id:r.id, originalName:r.original_name, fileSize:Number(r.file_size), mimeType:r.mime_type, fileExtension:r.file_extension, category:r.category, createdAt:r.created_at });

function validate(f) {
  if (!f) return 'No file provided';
  const ext = (f.originalname.split('.').pop() || '').toLowerCase();
  if (!TYPES[ext]) return `File type .${ext} is not allowed`;
  const sig = MAGIC[ext];
  if (sig) { if (!sig.every((b, i) => f.buffer[i] === b)) return 'File content does not match its extension'; }
  else if (f.buffer.includes(0)) return 'Text file contains binary data';
  return { ext };
}

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1), limit = Math.min(50, parseInt(req.query.limit) || 12);
    let q = supabase.from('files').select('*', { count:'exact' }).eq('user_id', req.user.uid)
      .order(SORT[req.query.sort] || 'created_at', { ascending: req.query.order === 'asc' }).range((page-1)*limit, page*limit-1);
    if (req.query.type) {
      if (!['document','spreadsheet','presentation','image'].includes(req.query.type)) return err(res, 400, 'BAD_QUERY', 'Unknown file type');
      q = q.eq('category', req.query.type);
    }
    if (req.query.search) q = q.ilike('original_name', `%${String(req.query.search).slice(0,100).replace(/[%_\\,()]/g, '')}%`);
    const { data, error, count } = await q; if (error) throw error;
    ok(res, { files: data.map(pub), total: count, page, limit });
  } catch (e) { next(e); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('file_stats', { p_user: req.user.uid }); if (error) throw error;
    const byType = {}; let totalFiles = 0, totalBytes = 0;
    data.forEach(r => { byType[r.category] = Number(r.cnt); totalFiles += Number(r.cnt); totalBytes += Number(r.bytes); });
    ok(res, { totalFiles, totalBytes, byType, maxFileBytes: MAX });
  } catch (e) { next(e); }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const v = validate(req.file); if (typeof v === 'string') return err(res, 400, 'INVALID_FILE', v);
    const id = crypto.randomUUID(), path = `${req.user.uid}/${id}.${v.ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: TYPES[v.ext], upsert: false });
    if (upErr) throw upErr;
    const { data, error } = await supabase.from('files').insert({ id, user_id: req.user.uid,
      original_name: req.file.originalname.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 255), storage_path: path,
      file_size: req.file.size, mime_type: TYPES[v.ext], file_extension: v.ext, category: CATEGORY[v.ext] }).select().single();
    if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; } // no orphan objects
    ok(res, pub(data), 201);
  } catch (e) { next(e); }
});

async function owned(req, res) {
  if (!UUID.test(req.params.id)) { err(res, 400, 'BAD_ID', 'Invalid file id'); return null; }
  const { data } = await supabase.from('files').select('*').eq('id', req.params.id).eq('user_id', req.user.uid).maybeSingle();
  if (!data) { err(res, 404, 'NOT_FOUND', 'File not found'); return null; }
  return data;
}

router.get('/:id/download', async (req, res, next) => {
  try {
    const f = await owned(req, res); if (!f) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60, { download: f.original_name });
    if (error) return err(res, 404, 'OBJECT_MISSING', 'File object is missing from storage');
    ok(res, { url: data.signedUrl, expiresIn: 60 });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const f = await owned(req, res); if (!f) return;
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([f.storage_path]);
    if (sErr) throw sErr; // keep the record so the user can retry
    const { error } = await supabase.from('files').delete().eq('id', f.id).eq('user_id', req.user.uid);
    if (error) throw error;
    ok(res, { deleted: f.id });
  } catch (e) { next(e); }
});
export default router;

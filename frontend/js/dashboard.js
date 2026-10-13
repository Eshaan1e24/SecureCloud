import { sb } from './supabase.js';
import { API_BASE } from '../config.js';
import { ic, hydrate } from './icons.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : b < 1073741824 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1073741824).toFixed(2)} GB`;
const dt = s => new Date(s).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
const CAT = { document:'Documents', spreadsheet:'Spreadsheets', presentation:'Presentations', image:'Images' };
const CATICON = { document:'list', spreadsheet:'grid', presentation:'layers', image:'eye' };
const ALLOWED = 'pdf,doc,docx,txt,csv,png,jpg,jpeg,xls,xlsx,ppt,pptx'.split(',');
const QUOTA = 1024 ** 3; // display-only 1 GB plan
const TITLES = ['overview','files','recent','categories','security','settings'];
const S = { page:1, type:'', sort:'date', order:'desc', q:'', mode:'list', view:'overview' };
let user, stats = { totalFiles:0, totalBytes:0, byType:{}, maxFileBytes:10485760 };

hydrate();
const RECOVERY = location.hash.includes('type=recovery');
async function token() { const { data } = await sb.auth.getSession(); if (!data.session) { location.replace('login.html'); throw new Error('Session expired'); } return data.session.access_token; }
const toast = (m, t = '') => { const e = document.createElement('div'); e.className = 'toast ' + t; e.textContent = m; $('#toasts').append(e); setTimeout(() => e.remove(), 4200); };
async function api(p, o = {}) {
  const tk = await token();
  let r; try { r = await fetch(API_BASE + p, { ...o, headers: { ...o.headers, Authorization: 'Bearer ' + tk } }); } catch { throw new Error('Cannot reach the server. Is the backend running?'); }
  let j; try { j = await r.json(); } catch { throw new Error('Unexpected server response'); }
  if (r.status === 401) { await sb.auth.signOut(); throw new Error('Session expired'); }
  if (!j.success) throw new Error(j.error.message);
  return j.data;
}
const skel = n => Array.from({ length: n }, () => '<div class="skel"></div>').join('');
const badge = f => `<div class="fi ${f.category}">${esc(f.fileExtension.toUpperCase())}</div>`;

function renderFiles(host, files, mode) {
  if (!files.length) { host.innerHTML = `<div class="empty">${ic('folder')}<h3>No files found</h3><p>Upload a file, or adjust your search and filters.</p></div>`; return; }
  const acts = f => `<button class="btn ghost sm" data-dl="${f.id}" aria-label="Download ${esc(f.originalName)}">${ic('download')}</button><button class="btn ghost sm del" data-del="${f.id}" data-name="${esc(f.originalName)}" aria-label="Delete ${esc(f.originalName)}">${ic('trash')}</button>`;
  host.innerHTML = mode === 'grid'
    ? `<div class="fgrid">${files.map(f => `<article class="fcard">${badge(f)}<h4 title="${esc(f.originalName)}">${esc(f.originalName)}</h4><p>${fmt(f.fileSize)} · ${dt(f.createdAt)}</p><span class="tag">${CAT[f.category]}</span><div class="acts">${acts(f)}</div></article>`).join('')}</div>`
    : `<div class="flist"><div class="row h"><span>Name</span><span class="c-m">Category</span><span class="c-m">Size</span><span class="c-m">Uploaded</span><span></span></div>${files.map(f => `<div class="row"><span class="nm">${badge(f)}<b title="${esc(f.originalName)}">${esc(f.originalName)}</b></span><span class="c-m"><span class="tag">${CAT[f.category]}</span></span><span class="c-m">${fmt(f.fileSize)}</span><span class="c-m">${dt(f.createdAt)}</span><span class="acts">${acts(f)}</span></div>`).join('')}</div>`;
}
async function loadRecent(host, limit, mode) {
  host.innerHTML = skel(3);
  try { const d = await api(`/files?sort=date&order=desc&limit=${limit}`); renderFiles(host, d.files, mode); } catch (e) { host.innerHTML = `<div class="empty"><h3>Could not load files</h3><p>${esc(e.message)}</p></div>`; }
}
async function loadFiles() {
  const host = $('#fileHost'); host.innerHTML = skel(6);
  try {
    const p = new URLSearchParams({ page:S.page, limit:12, sort:S.sort, order:S.order }); if (S.q) p.set('search', S.q); if (S.type) p.set('type', S.type);
    const d = await api('/files?' + p); renderFiles(host, d.files, S.mode);
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    $('#pgInfo').textContent = `Page ${d.page} of ${pages} · ${d.total} file${d.total === 1 ? '' : 's'}`; $('#prev').disabled = d.page <= 1; $('#next').disabled = d.page >= pages;
  } catch (e) { host.innerHTML = `<div class="empty"><h3>Could not load files</h3><p>${esc(e.message)}</p></div>`; }
}
async function loadStats() {
  try {
    stats = await api('/files/stats'); const t = stats.byType;
    $('#k1').textContent = stats.totalFiles; $('#k2').textContent = fmt(stats.totalBytes);
    $('#k3').textContent = (t.document || 0) + (t.spreadsheet || 0) + (t.presentation || 0); $('#k4').textContent = t.image || 0;
    $('#maxMb').textContent = Math.round(stats.maxFileBytes / 1048576);
    $('#qbar').style.width = Math.max(stats.totalBytes ? 2 : 0, Math.min(100, stats.totalBytes / QUOTA * 100)) + '%'; $('#qtxt').textContent = `${fmt(stats.totalBytes)} of ${fmt(QUOTA)} used`;
    $('#ovBars').innerHTML = Object.keys(CAT).map(c => `<div><small><span>${CAT[c]}</span><span>${t[c] || 0}</span></small><div class="meter"><i style="width:${stats.totalFiles ? (t[c] || 0) / stats.totalFiles * 100 : 0}%"></i></div></div>`).join('');
    $('#catHost').innerHTML = Object.keys(CAT).map(c => `<button class="card cat" data-cat="${c}"><div class="ibox">${ic(CATICON[c])}</div><b>${t[c] || 0}</b><span class="muted">${CAT[c]}</span></button>`).join('');
  } catch (e) { $('#qtxt').textContent = 'Unavailable'; toast(e.message, 'bad'); }
}
function refresh() { loadStats(); if (S.view === 'overview') loadRecent($('#ovRecent'), 5, 'list'); if (S.view === 'files') loadFiles(); if (S.view === 'recent') loadRecent($('#recentHost'), 12, 'grid'); }

function show(v) {
  S.view = v; TITLES.forEach(t => { $('#v-' + t).hidden = t !== v; });
  $$('.side .nav').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#side').classList.remove('open'); $('#scrim').classList.remove('show'); $('#pop').hidden = true; window.scrollTo(0, 0);
  if (v === 'overview') loadRecent($('#ovRecent'), 5, 'list'); if (v === 'files') loadFiles(); if (v === 'recent') loadRecent($('#recentHost'), 12, 'grid');
  if (v === 'security') fillSecurity(); if (v === 'categories') loadStats();
}
function fillProfile() {
  const full = user.user_metadata?.full_name || ''; const name = full || user.email.split('@')[0];
  $('#avatar').textContent = name[0].toUpperCase(); $('#pName').textContent = name; $('#pMail').textContent = user.email;
  $('#hello').textContent = `Welcome back, ${name.split(' ')[0]}`; $('#setName').value = full; $('#setMail').value = user.email;
}
function fillSecurity() {
  $('#sEmail').textContent = user.email; $('#sVer').textContent = user.email_confirmed_at ? 'Yes' : 'Not yet';
  $('#sCre').textContent = dt(user.created_at); $('#sLast').textContent = new Date(user.last_sign_in_at).toLocaleString();
  $('#verBox').innerHTML = user.email_confirmed_at ? '' : '<button class="btn ghost sm" id="reVer">Resend verification email</button>';
  const b = $('#reVer'); if (b) b.onclick = async () => { try { const { error } = await sb.auth.resend({ type:'signup', email:user.email }); if (error) throw error; toast('Verification email sent'); } catch { toast('Could not send email right now', 'bad'); } };
}

/* uploads */
const uploadOne = async (file, row) => {
  const bar = $('i', row), st = $('.st', row);
  const ext = file.name.split('.').pop().toLowerCase();
  const fail = m => { row.classList.add('bad'); st.textContent = m; toast(`${file.name}: ${m}`, 'bad'); };
  if (!ALLOWED.includes(ext)) return fail('File type not allowed');
  if (file.size > stats.maxFileBytes) return fail(`Larger than ${Math.round(stats.maxFileBytes / 1048576)} MB`);
  const tk = await token();
  await new Promise(res => {
    const fd = new FormData(); fd.append('file', file);
    const x = new XMLHttpRequest(); x.open('POST', API_BASE + '/files'); x.setRequestHeader('Authorization', 'Bearer ' + tk);
    x.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round(e.loaded / e.total * 100); bar.style.width = p + '%'; st.textContent = p + '%'; } };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (j.success) { bar.style.width = '100%'; st.textContent = 'Uploaded'; toast(`${file.name} uploaded`); } else fail(j.error?.message || 'Upload failed'); res(); };
    x.onerror = () => { fail('Network error'); res(); }; x.send(fd);
  });
};
async function uploadFiles(list) {
  const files = [...list]; if (!files.length) return; show('overview');
  for (const f of files) {
    const row = document.createElement('div'); row.className = 'up'; row.innerHTML = `<span>${esc(f.name)}</span><span class="st">Waiting…</span><div class="meter"><i style="width:0"></i></div>`; $('#ups').prepend(row);
    await uploadOne(f, row);
  }
  S.page = 1; refresh(); setTimeout(() => $$('#ups .up:not(.bad)').forEach(r => r.remove()), 4000);
}

/* events */
$('#content').addEventListener('click', async e => {
  const dl = e.target.closest('[data-dl]'), del = e.target.closest('[data-del]'), cat = e.target.closest('[data-cat]'), v = e.target.closest('[data-view]');
  if (dl) { try { const d = await api(`/files/${dl.dataset.dl}/download`); location.href = d.url; } catch (er) { toast(er.message, 'bad'); } }
  if (del) { const d = $('#dlg'); $('#dlgName').textContent = del.dataset.name; d.returnValue = ''; d.showModal();
    d.onclose = async () => { if (d.returnValue !== 'yes') return; try { await api('/files/' + del.dataset.del, { method:'DELETE' }); toast('File deleted'); refresh(); } catch (er) { toast(er.message, 'bad'); } }; }
  if (cat) { S.type = cat.dataset.cat; S.page = 1; $('#fType').value = S.type; show('files'); }
  if (v && !cat) show(v.dataset.view);
});
$$('.side .nav, .pop .nav[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
$('#burger').onclick = () => { $('#side').classList.add('open'); $('#scrim').classList.add('show'); };
$('#scrim').onclick = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('show'); };
$('#avatar').onclick = e => { e.stopPropagation(); $('#pop').hidden = !$('#pop').hidden; };
document.addEventListener('click', e => { if (!e.target.closest('.menu')) $('#pop').hidden = true; });
const out = () => sb.auth.signOut(); $('#logout').onclick = out; $('#logout2').onclick = out;
$('#upBtn').onclick = $('#browse').onclick = () => $('#fi').click();
$('#fi').onchange = e => { uploadFiles(e.target.files); e.target.value = ''; };
const dz = $('#drop');
dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); uploadFiles(e.dataTransfer.files); };
let tm; $('#q').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { S.q = e.target.value.trim(); S.page = 1; S.view === 'files' ? loadFiles() : show('files'); }, 300); };
$('#fType').onchange = e => { S.type = e.target.value; S.page = 1; loadFiles(); };
$('#fSort').onchange = e => { [S.sort, S.order] = e.target.value.split('-'); S.page = 1; loadFiles(); };
$('#mList').onclick = () => { S.mode = 'list'; $('#mList').classList.add('on'); $('#mGrid').classList.remove('on'); loadFiles(); };
$('#mGrid').onclick = () => { S.mode = 'grid'; $('#mGrid').classList.add('on'); $('#mList').classList.remove('on'); loadFiles(); };
$('#prev').onclick = () => { S.page--; loadFiles(); }; $('#next').onclick = () => { S.page++; loadFiles(); };
$('#nameForm').onsubmit = async e => { e.preventDefault(); try { const { data, error } = await sb.auth.updateUser({ data: { full_name: $('#setName').value.trim() } }); if (error) throw error; user = data.user; fillProfile(); toast('Profile updated'); } catch { toast('Could not update profile', 'bad'); } };
$('#pwForm').onsubmit = async e => { e.preventDefault(); const pw = $('#newPw').value; if (pw.length < 8) return toast('Password must be at least 8 characters', 'bad'); const { error } = await sb.auth.updateUser({ password: pw }); if (error) toast(error.message, 'bad'); else { toast('Password updated'); $('#newPw').value = ''; } };

sb.auth.onAuthStateChange((event, session) => {
  if (!session) return location.replace('login.html');
  setTimeout(() => { const first = !user; user = session.user;
    if (first) { fillProfile(); loadStats(); show(RECOVERY ? 'settings' : 'overview'); if (RECOVERY) toast('Set your new password below'); } }, 0);
});

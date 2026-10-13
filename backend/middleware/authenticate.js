import { supabase } from '../supabase.js';
const fail = (r, m) => r.status(401).json({ success:false, error:{ code:'UNAUTHORIZED', message:m } });
export async function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return fail(res, 'Missing access token');
  try {
    const { data, error } = await supabase.auth.getUser(h.slice(7)); // Supabase Auth verifies signature and expiry
    if (error || !data?.user) return fail(res, 'Invalid or expired session');
    req.user = { uid: data.user.id, email: data.user.email };
    next();
  } catch { fail(res, 'Invalid or expired session'); }
}

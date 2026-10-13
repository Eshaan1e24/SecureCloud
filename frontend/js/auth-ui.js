import { sb } from './supabase.js';
import { hydrate } from './icons.js';
const $ = id => document.getElementById(id);
const go = () => location.replace('dashboard.html');
function nice(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (m.includes('already registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts or emails sent. Wait a few minutes and try again.';
  if (m.includes('password should') || m.includes('weak')) return 'Password is too weak. Use at least 8 characters.';
  if (m.includes('valid email') || m.includes('invalid email')) return 'Enter a valid email address.';
  if (m.includes('api key') || m.includes('apikey')) return 'Invalid Supabase key. Check frontend/config.js.';
  if (m.includes('fetch') || m.includes('network')) return 'Cannot reach Supabase. Check your connection and the URL in frontend/config.js.';
  return e?.message || 'Something went wrong. Please try again.';
}
export function initAuthPage(mode) {
  hydrate();
  sb.auth.getSession().then(({ data }) => { if (data.session) go(); });
  const say = (t, ok = false) => { const e = $('msg'); e.textContent = t; e.className = 'msg ' + (t ? (ok ? 'ok' : 'bad') : ''); };
  const label = mode === 'login' ? 'Sign in' : 'Create account';
  const busy = b => { const s = $('submit'); s.disabled = b; s.textContent = b ? 'Please wait…' : label; };
  $('eye').onclick = () => { const p = $('password'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('form').onsubmit = async e => {
    e.preventDefault(); say('');
    const email = $('email').value.trim(), password = $('password').value;
    if (!email) return say('Enter your email address.');
    if (mode === 'register') {
      if (!$('name').value.trim()) return say('Enter your name.');
      if (password.length < 8) return say('Password must be at least 8 characters.');
      if (password !== $('confirm').value) return say('Passwords do not match.');
    }
    busy(true);
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; go();
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: $('name').value.trim() }, emailRedirectTo: location.origin + '/login.html' } });
        if (error) throw error;
        if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
        if (data.session) return go();
        say('Account created. Check your email for a confirmation link, then sign in.', true); busy(false);
      }
    } catch (er) { say(nice(er)); busy(false); }
  };
  if (mode === 'login') $('forgot').onclick = async () => {
    const em = $('email').value.trim(); if (!em) return say('Enter your email above first, then click "Forgot password".');
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + '/dashboard.html' });
    error ? say(nice(error)) : say('Password reset email sent. Check your inbox.', true);
  };
}

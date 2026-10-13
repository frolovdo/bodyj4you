// PIN login, same hashing as the Mac tool (PBKDF2-HMAC-SHA256, 200000 rounds, hex salt), sessions in Supabase.
import crypto from 'node:crypto';
import { db, audit } from './supabase.mjs';
import { cookies } from './http.mjs';

export const ROLES = { viewer: 0, analyst: 1, approver: 2, owner: 3 };
export const SESSION_SECS = 12 * 3600;

export const hashPin = (pin, saltHex) => crypto.pbkdf2Sync(String(pin), Buffer.from(saltHex, 'hex'), 200000, 32, 'sha256').toString('hex');

export async function userByPin(pin) {
  if (!/^\d{4,10}$/.test(String(pin))) return null;
  const { data: users } = await db().from('users').select('*').eq('active', true);
  for (const u of users || []) {
    const h = hashPin(pin, u.pin_salt);
    if (h.length === u.pin_hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.pin_hash))) return u;
  }
  return null;
}

export async function locked() {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db().from('login_attempts').select('*', { count: 'exact', head: true }).eq('ok', false).gte('at', since);
  return (count || 0) >= 5;
}

export async function noteLogin(ok, ip) {
  await db().from('login_attempts').insert({ ok, ip: ip || null });
}

export async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(16).toString('base64url');
  const expires_at = new Date(Date.now() + SESSION_SECS * 1000).toISOString();
  const { error } = await db().from('sessions').insert({ token, user_id: user.id, csrf, expires_at });
  if (error) throw error;
  await audit(user, 'login');
  return { token, csrf };
}

export async function currentUser(req) {
  const tok = cookies(req).ac;
  if (!tok) return null;
  const { data: s } = await db().from('sessions').select('token, csrf, expires_at, users(id, name, role, active)').eq('token', tok).maybeSingle();
  if (!s || !s.users || !s.users.active || new Date(s.expires_at) < new Date()) return null;
  return { id: s.users.id, name: s.users.name, role: s.users.role, csrf: s.csrf, token: s.token };
}

export const can = (user, role) => !!user && ROLES[user.role] >= ROLES[role];

export function csrfOk(user, req, form) {
  const sent = form?.csrf || req.headers.get('x-csrf') || '';
  return !!user && sent.length > 0 && sent === user.csrf;
}

export async function endSession(token) {
  await db().from('sessions').delete().eq('token', token);
}

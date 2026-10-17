// PIN login for the Ops page (/ops), separate from the Action Center users.
// One PIN (PBKDF2-HMAC-SHA256, 200000 rounds, like auth.mjs) in ops_auth; sessions in ops_sessions; cookie "ops".
import crypto from 'node:crypto';
import { db } from './supabase.mjs';
import { cookies } from './http.mjs';
import { hashPin } from './auth.mjs';

export const OPS_SESSION_SECS = 12 * 3600;

export async function pinOk(pin) {
  if (!/^\d{4,10}$/.test(String(pin))) return false;
  const { data } = await db().from('ops_auth').select('pin_hash, pin_salt').eq('id', 1).maybeSingle();
  if (!data) return false;
  const h = hashPin(pin, data.pin_salt);
  return h.length === data.pin_hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(data.pin_hash));
}

export async function opsLocked() {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db().from('ops_login_attempts').select('*', { count: 'exact', head: true }).eq('ok', false).gte('at', since);
  return (count || 0) >= 5;
}

export const noteOpsLogin = (ok, ip) => db().from('ops_login_attempts').insert({ ok, ip: ip || null });

export async function createOpsSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(16).toString('base64url');
  const expires_at = new Date(Date.now() + OPS_SESSION_SECS * 1000).toISOString();
  const { error } = await db().from('ops_sessions').insert({ token, csrf, expires_at });
  if (error) throw error;
  return { token, csrf };
}

export async function opsSession(req) {
  const tok = cookies(req).ops;
  if (!tok) return null;
  const { data: s } = await db().from('ops_sessions').select('token, csrf, expires_at').eq('token', tok).maybeSingle();
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s;
}

export const opsCookie = (token, secs) =>
  `ops=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${secs}`;

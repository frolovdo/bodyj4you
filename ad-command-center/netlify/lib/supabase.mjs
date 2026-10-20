// Service-role Supabase client: only functions use it, the browser never sees the key.
import { createClient } from '@supabase/supabase-js';

let client;
export function db() {
  if (!client) {
    const url = Netlify.env.get('SUPABASE_URL');
    const key = Netlify.env.get('SUPABASE_SERVICE_KEY');
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set on this site');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// The family a request works on: the page sends it (x-family header), set once per request in currentUser().
// One request runs at a time per function instance, so a module variable is safe here.
let CURRENT = null;
const FAMILY_OK = /^[A-Z0-9][A-Z0-9-]{1,40}$/;
export function useFamily(f) { CURRENT = f && FAMILY_OK.test(f) ? f : null; }
export const FAMILY = () => CURRENT || Netlify.env.get('AC_FAMILY') || 'EO-ROSEHIP';

export async function dataset(name, family = FAMILY()) {
  const { data, error } = await db().from('datasets').select('payload, data_through, produced_at, rows').eq('family', family).eq('name', name).maybeSingle();
  if (error) throw error;
  return data;
}

export async function putDataset(name, payload, extra = {}, family = FAMILY()) {
  const { error } = await db().from('datasets').upsert({ family, name, payload, produced_at: new Date().toISOString(), ...extra });
  if (error) throw error;
}

export async function audit(user, action, item = '', detail = '') {
  await db().from('audit').insert({ user_name: user?.name || null, role: user?.role || null, action, item, detail: String(detail).slice(0, 2000) });
}

// Budget Equalizer (~/sp-api/intel/ACCOUNT/budget_model_2026-11-16): a standalone page with its data inside, rebuilt by
// build_page.py and packed into ../pages/budget_equalizer.mjs. Served only to a signed-in user; the app shows it in a frame.
import { err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import html, { built } from '../pages/budget_equalizer.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-built': built } });
};

// Amazon Ads API client for functions: LWA refresh token -> access token (cached in memory and in Supabase), scoped requests,
// and the same entity lists the Mac tool used (sp_state, sb campaigns). Credentials come from Netlify env only.
import { db } from './supabase.mjs';

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ENDPOINTS = { na: 'https://advertising-api.amazon.com', eu: 'https://advertising-api-eu.amazon.com', fe: 'https://advertising-api-fe.amazon.com' };
let mem = { token: null, exp: 0 };

function creds() {
  const g = (k) => Netlify.env.get(k);
  const c = { id: g('ADS_CLIENT_ID'), secret: g('ADS_CLIENT_SECRET'), refresh: g('ADS_REFRESH_TOKEN'), profile: g('ADS_PROFILE_ID'), region: (g('ADS_REGION') || 'na').toLowerCase() };
  for (const k of ['id', 'secret', 'refresh', 'profile']) if (!c[k]) throw new Error(`Ads credential missing in Netlify env: ${k}`);
  return c;
}

export async function accessToken(force = false) {
  const now = Date.now() / 1000;
  if (!force && mem.token && mem.exp > now + 60) return mem.token;
  if (!force) {
    const { data } = await db().from('datasets').select('payload').eq('family', '_system').eq('name', 'lwa_token').maybeSingle();
    if (data?.payload?.expires_at > now + 60) { mem = { token: data.payload.access_token, exp: data.payload.expires_at }; return mem.token; }
  }
  const c = creds();
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh, client_id: c.id, client_secret: c.secret }) });
  if (!r.ok) throw new Error(`LWA token failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  mem = { token: d.access_token, exp: now + (d.expires_in || 3600) };
  await db().from('datasets').upsert({ family: '_system', name: 'lwa_token', payload: { access_token: mem.token, expires_at: mem.exp }, produced_at: new Date().toISOString() });
  return mem.token;
}

export async function ads(method, path, { body, profile, accept, contentType, params } = {}) {
  const c = creds();
  let url = path.startsWith('http') ? path : ENDPOINTS[c.region] + '/' + path.replace(/^\//, '');
  if (params) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const headers = { Authorization: 'Bearer ' + (await accessToken(attempt > 0 && mem.exp === 0)), 'Amazon-Advertising-API-ClientId': c.id, Accept: accept || 'application/json',
      'Amazon-Advertising-API-Scope': String(profile || c.profile) };
    if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
    const r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 4) { await new Promise((s) => setTimeout(s, delay)); delay *= 2; continue; }
    const txt = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status} ${txt.slice(0, 800)}`);
    return txt.trim() ? JSON.parse(txt) : {};
  }
}

// SP v3 list endpoints: (name, path, media type, response key)
const SP_LISTS = [
  ['campaigns', '/sp/campaigns/list', 'spCampaign', 'campaigns'],
  ['adGroups', '/sp/adGroups/list', 'spAdGroup', 'adGroups'],
  ['keywords', '/sp/keywords/list', 'spKeyword', 'keywords'],
  ['targets', '/sp/targets/list', 'spTargetingClause', 'targetingClauses'],
  ['negativeKeywords', '/sp/negativeKeywords/list', 'spNegativeKeyword', 'negativeKeywords'],
];

export async function spList(path, mt, key, extra = {}) {
  const ct = `application/vnd.${mt}.v3+json`;
  const out = [];
  let nextToken;
  do {
    const r = await ads('POST', path, { body: { maxResults: 1000, ...(nextToken ? { nextToken } : {}), ...extra }, accept: ct, contentType: ct });
    out.push(...(r[key] || []));
    nextToken = r.nextToken;
  } while (nextToken);
  return out;
}

export async function spState(campaignIds) {
  const S = {};
  for (const [name, path, mt, key] of SP_LISTS) {
    S[name] = [];
    for (let i = 0; i < campaignIds.length; i += 100) {
      S[name].push(...(await spList(path, mt, key, { campaignIdFilter: { include: campaignIds.slice(i, i + 100) } })));
    }
  }
  return S;
}

export async function sbCampaigns(ids) {
  const ct = 'application/vnd.sbcampaignresource.v4+json';
  const r = await ads('POST', '/sb/v4/campaigns/list', { body: { maxResults: 100, ...(ids ? { campaignIdFilter: { include: ids } } : {}) }, accept: ct, contentType: ct });
  return r.campaigns || [];
}

// PUT batches, same shape as the Mac apply.py
export const API = {
  'PUT /sp/campaigns': ['spCampaign', 'campaigns', 'campaignId'],
  'PUT /sp/keywords': ['spKeyword', 'keywords', 'keywordId'],
  'PUT /sp/targets': ['spTargetingClause', 'targetingClauses', 'targetId'],
  'POST /sp/keywords': ['spKeyword', 'keywords', 'keywordId'],
  'POST /sp/negativeKeywords': ['spNegativeKeyword', 'negativeKeywords', 'keywordId'],
};

export async function send(api, items) {
  const [mt, wrap] = API[api];
  const [method, path] = api.split(' ');
  const ct = `application/vnd.${mt}.v3+json`;
  return ads(method, path, { body: { [wrap]: items }, accept: ct, contentType: ct });
}

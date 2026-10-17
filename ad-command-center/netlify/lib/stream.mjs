// Amazon Marketing Stream, as stored in the Adstream Postgres database (the same table the engine's heat map reads):
// agg_campaign_hourly = campaign x Pacific date x hour x dataset (sp-traffic / sp-conversion / sb-...), impressions, clicks, cost, orders, sales.
// Traffic lands within an hour or two; conversions keep filling in for days (attribution), so recent orders always read low.
// Read-only: the connection sets the session read-only before any query. Password from ADSTREAM_PASSWORD in Netlify env.
import pg from 'pg';

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]);

export async function withStream(fn) {
  const password = env('ADSTREAM_PASSWORD');
  if (!password) throw new Error('ADSTREAM_PASSWORD is not set on this site');
  const client = new pg.Client({ host: 'adstream-3-230-237-71.nip.io', port: 5432, database: 'adstream', user: 'denis', password, ssl: false,
    connectionTimeoutMillis: 8000, query_timeout: 15000, statement_timeout: 15000 });
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Hourly rows for the campaigns since `fromDate` (PT date string). Returns [{cid, date, hour, kind:'traffic'|'conversion', imp, clk, cost, orders, sales}]. */
export async function hourlyRows(campaignIds, fromDate) {
  return withStream(async (c) => {
    const r = await c.query(
      `select campaign_id, amazon_metric_date, amazon_metric_hour, source_dataset,
              sum(impressions) imp, sum(clicks) clk, sum(cost) cost, sum(orders) orders, sum(sales) sales
         from agg_campaign_hourly
        where campaign_id = any($1) and amazon_metric_date >= $2
        group by 1,2,3,4`, [campaignIds.map(String), fromDate]);
    return r.rows.map((x) => {
      const h = String(x.amazon_metric_hour || '');
      const hour = h.includes('T') ? parseInt(h.slice(11, 13), 10) : parseInt(h, 10);
      return { cid: String(x.campaign_id), date: String(x.amazon_metric_date).slice(0, 10), hour: isFinite(hour) ? hour : 0,
        kind: /conversion/.test(x.source_dataset) ? 'conversion' : 'traffic', imp: +x.imp || 0, clk: +x.clk || 0, cost: +x.cost || 0, orders: +x.orders || 0, sales: +x.sales || 0 };
    });
  });
}

/** Fold hourly rows into per-campaign day totals and hour arrays: days[cid][date] = {imp, clk, cost, orders, sales, byHour: {hour: {clk, cost, imp}}} */
export function foldDays(rows) {
  const days = {};
  let lastTraffic = null, lastConv = null;
  for (const r of rows) {
    const d = ((days[r.cid] ||= {})[r.date] ||= { imp: 0, clk: 0, cost: 0, orders: 0, sales: 0, byHour: {} });
    const h = (d.byHour[r.hour] ||= { imp: 0, clk: 0, cost: 0, orders: 0, sales: 0 });
    if (r.kind === 'traffic') { d.imp += r.imp; d.clk += r.clk; d.cost += r.cost; h.imp += r.imp; h.clk += r.clk; h.cost += r.cost; const k = r.date + ' ' + String(r.hour).padStart(2, '0'); if (!lastTraffic || k > lastTraffic) lastTraffic = k; }
    else { d.orders += r.orders; d.sales += r.sales; h.orders += r.orders; h.sales += r.sales; const k = r.date + ' ' + String(r.hour).padStart(2, '0'); if (!lastConv || k > lastConv) lastConv = k; }
  }
  return { days, lastTraffic, lastConv };
}

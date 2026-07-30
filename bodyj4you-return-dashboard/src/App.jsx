import { useEffect, useMemo, useState } from 'react';
import Kpis from './components/Kpis.jsx';
import AlertStrip from './components/AlertStrip.jsx';
import ReturnsTable from './components/ReturnsTable.jsx';
import { usd0, shortDate, loadAcks, saveAck, clearAck } from './lib/format.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/returns.json`;

// Headline: the one sentence the CEO asked for. Red when money is burning,
// green when the page can be closed.
function Headline({ data, acks }) {
  const live = data.alerts.filter((a) => !acks[a.family]);
  const total = live.reduce((s, a) => s + a.r7, 0);
  if (live.length === 0) {
    return (
      <h1 className="headline headline-ok">
        Nothing needs attention — refunds in line with baseline.
      </h1>
    );
  }
  return (
    <h1 className="headline headline-bad">
      {live.length} product{live.length > 1 ? 's' : ''} need{live.length > 1 ? '' : 's'} attention —{' '}
      {usd0(total)} refunded last week.
    </h1>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [acks, setAcks] = useState({});

  useEffect(() => {
    setAcks(loadAcks());
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const toggle = (fam) =>
    setExpanded((e) => ({ ...e, [fam]: e[fam] === undefined ? false : !e[fam] }));

  const onAck = (family) => {
    const note = window.prompt('Optional note (what are you doing about it?)', '') ?? '';
    setAcks(saveAck(family, note.trim()));
  };
  const onUnack = (family) => setAcks(clearAck(family));

  const onJump = (family) => {
    document.getElementById(`fam-${family}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const parents = useMemo(() => (data ? data.parents : []), [data]);

  if (error) return <div className="main"><div className="empty">Could not load data: {error}</div></div>;
  if (!data) return <div className="main"><div className="empty">Loading…</div></div>;

  const w = data.windows;
  const liveAlerts = data.alerts.filter((a) => !acks[a.family]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BodyJ4You</span>
          <span className="brand-sep">/</span>
          <span className="brand-app">Return Dashboard</span>
        </div>
        <div className="freshness">
          <span className={`dot-live ${liveAlerts.length ? 'dot-bad' : ''}`} />
          Helium 10 · {new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <div className="eyebrow">
            RETURNS &amp; REFUNDS · {shortDate(w.d7.from)}–{shortDate(w.d7.to)} · AMAZON {data.marketplace}
          </div>
          <Headline data={data} acks={acks} />
          <p className="page-sub">
            Sales &amp; refunds are last 7 days; each product is judged against its own 30-day
            baseline. Top sellers first, only substantial movers alert.
          </p>
        </div>

        <AlertStrip alerts={data.alerts} acks={acks} onAck={onAck} onUnack={onUnack} onJump={onJump} />

        <section className="section">
          <div className="eyebrow">{data.alerts.length ? '02' : '01'} / OVERVIEW</div>
          <Kpis k={data.kpis} />
        </section>

        <section className="section">
          <div className="eyebrow">{data.alerts.length ? '03' : '02'} / PRODUCTS · BIGGEST REVENUE FIRST</div>
          <ReturnsTable parents={parents} expanded={expanded} toggle={toggle} />
        </section>

        <footer className="foot">
          Refund rate = refunded $ ÷ sales $. Critical = ≥{usd0(data.thresholds.critical.r7)} refunded/wk,
          up ≥{data.thresholds.critical.delta}pp vs its own 30-day baseline and ≥{data.thresholds.critical.rate7}%.
          Watch = ≥{usd0(data.thresholds.watch.r7)}/wk and rising ≥{data.thresholds.watch.delta}pp (or 2× baseline).
          Families under ${data.thresholds.minSales7d.toLocaleString()} weekly sales and variations with zero
          sales are hidden. Source: Helium 10 · Amazon Profits (P&L); refund dollars are the ground truth
          (units-returned lags FBA restock). Acknowledged alerts mute for 30 days on this device.
        </footer>
      </main>
    </div>
  );
}

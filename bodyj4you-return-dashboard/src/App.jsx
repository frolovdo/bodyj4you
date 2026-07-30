import { useEffect, useMemo, useState } from 'react';
import Kpis from './components/Kpis.jsx';
import Controls from './components/Controls.jsx';
import ReturnsTable from './components/ReturnsTable.jsx';
import { shortDate } from './lib/format.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/returns.json`;

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState('s7');
  const [cat, setCat] = useState('ALL');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const parents = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.parents.filter((p) => {
      if (cat !== 'ALL' && p.cat !== cat) return false;
      if (flaggedOnly && !p.flagged) return false;
      if (q) {
        const inParent =
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.family || '').toLowerCase().includes(q);
        const inChild = p.children.some(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.asin.toLowerCase().includes(q) ||
            (c.sku || '').toLowerCase().includes(q),
        );
        if (!inParent && !inChild) return false;
      }
      return true;
    });
    const val = (p) => (sort === 'delta' ? p.delta : sort === 'rate30' ? p.rate30 : p.s7);
    rows = [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
    return rows;
  }, [data, sort, cat, flaggedOnly, query]);

  const effExpanded = useMemo(() => {
    if (query.trim()) {
      const all = {};
      parents.forEach((p) => (all[p.family] = true));
      return all;
    }
    return expanded;
  }, [query, parents, expanded]);

  const allExpanded = parents.length > 0 && parents.every((p) => effExpanded[p.family]);

  const toggle = (asin) => setExpanded((e) => ({ ...e, [asin]: !e[asin] }));
  const expandAll = () => {
    const all = {};
    parents.forEach((p) => (all[p.family] = true));
    setExpanded(all);
  };
  const collapseAll = () => setExpanded({});

  if (error) {
    return (
      <div className="main">
        <div className="empty">Could not load data: {error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="main">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  const w = data.windows;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BodyJ4You</span>
          <span className="brand-sep">/</span>
          <span className="brand-app">Return Dashboard</span>
        </div>
        <nav className="subnav">
          <span className="nav-item active">Returns &amp; Refunds</span>
        </nav>
      </header>

      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Returns &amp; Refunds</h1>
            <p className="page-sub">
              Top sellers first by last-week revenue ({shortDate(w.d7.from)}–{shortDate(w.d7.to)}).
              Sales &amp; refunds are last 7 days; refund rate is the 30-day average
              ({shortDate(w.d30.from)}–{shortDate(w.d30.to)}). Amazon {data.marketplace}. Expand a
              product to see each selling variation.
            </p>
          </div>
          <div className="freshness">
            <span className="dot-live" /> Auto-synced from Helium 10
            <span className="freshness-time">
              {new Date(data.generatedAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <Kpis k={data.kpis} />

        <Controls
          sort={sort} setSort={setSort}
          cat={cat} setCat={setCat}
          flaggedOnly={flaggedOnly} setFlaggedOnly={setFlaggedOnly}
          query={query} setQuery={setQuery}
          onExpandAll={expandAll} onCollapseAll={collapseAll} allExpanded={allExpanded}
        />

        <ReturnsTable parents={parents} expanded={effExpanded} toggle={toggle} />

        <footer className="foot">
          Refund rate = refunded $ ÷ sales $ (30-day average). Only families with ≥ $
          {data.thresholds.minSales7d.toLocaleString()} in last-week sales are shown, and only
          variations that sold last week — everything not selling is hidden to keep the list
          actionable. Flagged = 30-day rate ≥ {data.thresholds.flagRate30d}% and up ≥
          {data.thresholds.flagDeltaPp} pp last week. ASINs link to Amazon. Source: Helium 10 ·
          Amazon Profits (P&L); units-returned is excluded (FBA return-to-stock lag), refund
          dollars are the ground truth.
        </footer>
      </main>
    </div>
  );
}

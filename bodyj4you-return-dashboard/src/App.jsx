import { useEffect, useMemo, useState } from 'react';
import Kpis from './components/Kpis.jsx';
import Controls from './components/Controls.jsx';
import ReturnsTable from './components/ReturnsTable.jsx';
import { shortDate } from './lib/format.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/returns.json`;

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState('rate7');
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
    const val = (p) => (sort === 'delta' ? p.delta : sort === 'r7' ? p.r7 : p.rate7);
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
              Refund rate by parent — last week ({shortDate(w.d7.from)}–{shortDate(w.d7.to)}) vs the
              30-day average ({shortDate(w.d30.from)}–{shortDate(w.d30.to)}). Amazon {data.marketplace}.
              Expand any product to see each variation.
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
          Refund rate = refunded $ ÷ sales $. Only parents with ≥{data.thresholds.minUnits30d} units
          over the last 30 days are shown. A product is flagged when its last-week rate is ≥
          {data.thresholds.flagRate7d}% and up ≥{data.thresholds.flagDeltaPp} pp vs its 30-day average.
          Source: Helium 10 · Amazon Profits (P&L). Units-returned is excluded (Amazon FBA
          return-to-stock lag makes it unreliable); refund dollars are the ground truth.
        </footer>
      </main>
    </div>
  );
}

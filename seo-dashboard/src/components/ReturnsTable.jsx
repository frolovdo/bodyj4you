import RateCell from './RateCell.jsx';
import TrendBadge from './TrendBadge.jsx';
import { usd0, int, pct } from '../lib/format.js';

function ChildRow({ c }) {
  return (
    <div className="row child-row">
      <div className="col-product child-product">
        <span className="child-tick" />
        <span className="child-label">{c.label}</span>
        <span className="child-asin">{c.asin}</span>
      </div>
      <div className="col-num">{int(c.u7)}</div>
      <div className="col-num">{usd0(c.s7)}</div>
      <div className="col-num">{usd0(c.r7)}</div>
      <div className="col-rate"><RateCell rate={c.rate7} /></div>
      <div className="col-num muted">{pct(c.rate30)}</div>
      <div className="col-trend"><TrendBadge delta={c.delta} /></div>
    </div>
  );
}

function ParentRow({ p, expanded, onToggle }) {
  const hasChildren = p.children.length > 1;
  return (
    <div className={`parent-block ${expanded ? 'open' : ''}`}>
      <div
        className={`row parent-row ${hasChildren ? 'expandable' : ''} ${p.flagged ? 'flagged' : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        <div className="col-product">
          <span className={`caret ${hasChildren ? '' : 'hidden'}`}>{expanded ? '▾' : '▸'}</span>
          {p.image ? (
            <img className="thumb" src={p.image} alt="" loading="lazy" />
          ) : (
            <span className="thumb thumb-blank" />
          )}
          <span className="product-meta">
            <span className="product-name">
              {p.name}
              {p.flagged && <span className="flag-dot" title="Rising & material">●</span>}
            </span>
            <span className="product-tags">
              <span className={`cat-pill cat-${p.cat}`}>{p.cat}</span>
              {hasChildren && <span className="child-count">{p.childCount} variations</span>}
            </span>
          </span>
        </div>
        <div className="col-num">{int(p.u7)}</div>
        <div className="col-num">{usd0(p.s7)}</div>
        <div className="col-num strong">{usd0(p.r7)}</div>
        <div className="col-rate"><RateCell rate={p.rate7} /></div>
        <div className="col-num muted">{pct(p.rate30)}</div>
        <div className="col-trend"><TrendBadge delta={p.delta} /></div>
      </div>
      {expanded && hasChildren && (
        <div className="children">
          {p.children.map((c) => <ChildRow key={c.asin} c={c} />)}
        </div>
      )}
    </div>
  );
}

export default function ReturnsTable({ parents, expanded, toggle }) {
  return (
    <div className="table">
      <div className="row head-row">
        <div className="col-product">Product</div>
        <div className="col-num">Units<span className="col-sub">7d</span></div>
        <div className="col-num">Sales<span className="col-sub">7d</span></div>
        <div className="col-num">Refunds<span className="col-sub">7d</span></div>
        <div className="col-rate">Refund rate<span className="col-sub">7d</span></div>
        <div className="col-num">Avg<span className="col-sub">30d</span></div>
        <div className="col-trend">Trend<span className="col-sub">vs 30d</span></div>
      </div>
      {parents.length === 0 && <div className="empty">No products match these filters.</div>}
      {parents.map((p) => (
        <ParentRow
          key={p.asin}
          p={p}
          expanded={!!expanded[p.asin]}
          onToggle={() => toggle(p.asin)}
        />
      ))}
    </div>
  );
}

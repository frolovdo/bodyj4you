import RateCell from './RateCell.jsx';
import TrendBadge from './TrendBadge.jsx';
import ProductImage from './ProductImage.jsx';
import { usd0, amazonUrl } from '../lib/format.js';

function AsinLink({ asin }) {
  return (
    <a
      className="asin-link"
      href={amazonUrl(asin)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open on Amazon"
    >
      {asin}
    </a>
  );
}

function ChildRow({ c, cat }) {
  return (
    <div className="row child-row">
      <div className="col-product child-product">
        <span className="child-tick" />
        <ProductImage src={c.image} cat={cat} alt="" small />
        <span className="sku-chip">{c.sku}</span>
        <AsinLink asin={c.asin} />
      </div>
      <div className="col-num">{usd0(c.s7)}</div>
      <div className="col-num">{usd0(c.r7)}</div>
      <div className="col-rate"><RateCell rate={c.rate30} /></div>
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
          <ProductImage src={p.image} cat={p.cat} alt={p.name} />
          <span className="product-meta">
            <span className="product-name">
              {p.name}
              {p.flagged && <span className="flag-dot" title="Returns rising & material">●</span>}
            </span>
            <span className="product-tags">
              <span className={`cat-pill cat-${p.cat}`}>{p.cat}</span>
              <span className="sku-chip">{p.sku}</span>
              <AsinLink asin={p.asin} />
              {hasChildren && <span className="child-count">{p.childCount} selling</span>}
            </span>
          </span>
        </div>
        <div className="col-num strong">{usd0(p.s7)}</div>
        <div className="col-num">{usd0(p.r7)}</div>
        <div className="col-rate"><RateCell rate={p.rate30} /></div>
        <div className="col-trend"><TrendBadge delta={p.delta} /></div>
      </div>
      {expanded && hasChildren && (
        <div className="children">
          {p.children.map((c) => <ChildRow key={c.asin} c={c} cat={p.cat} />)}
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
        <div className="col-num">Sales<span className="col-sub">7d</span></div>
        <div className="col-num">Refunds<span className="col-sub">7d</span></div>
        <div className="col-rate">Refund rate<span className="col-sub">30d avg</span></div>
        <div className="col-trend">Trend<span className="col-sub">vs 30d</span></div>
      </div>
      {parents.length === 0 && <div className="empty">No products match these filters.</div>}
      {parents.map((p) => (
        <ParentRow
          key={p.family}
          p={p}
          expanded={!!expanded[p.family]}
          onToggle={() => toggle(p.family)}
        />
      ))}
    </div>
  );
}

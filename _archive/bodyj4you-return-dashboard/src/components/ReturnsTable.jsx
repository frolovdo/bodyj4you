import { useState } from 'react';
import RateCompare from './RateCompare.jsx';
import ProductImage from './ProductImage.jsx';
import { usd0, amazonUrl } from '../lib/format.js';
import { Chevron, External } from './icons.jsx';

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
      <External width={8} height={8} />
    </a>
  );
}

function ChildRow({ c, cat, isDriver }) {
  return (
    <div className={`row child-row ${isDriver ? 'driver' : ''}`}>
      <div className="col-product child-product">
        <ProductImage src={c.image} cat={cat} alt="" small />
        <span className="sku-chip">{c.sku}</span>
        <AsinLink asin={c.asin} />
        {isDriver && <span className="driver-badge">Driver</span>}
      </div>
      <div className="col-rate">
        <RateCompare rate7={c.rate7} rate30={c.rate30} delta={c.delta} />
      </div>
      <div className="col-num">{usd0(c.s7)}</div>
      <div className="col-num">{usd0(c.r7)}</div>
    </div>
  );
}

function ParentRow({ p, expanded, onToggle }) {
  const hasChildren = p.children.length > 1;
  const driverAsin = p.driver?.asin;
  return (
    <div className={`parent-block ${expanded ? 'open' : ''}`} id={`fam-${p.family}`}>
      <div
        className={`row parent-row ${hasChildren ? 'expandable' : ''} ${p.tier ? `tier-row-${p.tier}` : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        <div className="col-product">
          <span className={`caret ${hasChildren ? '' : 'hidden'}`}>
            <Chevron open={expanded} width={11} height={11} />
          </span>
          <ProductImage src={p.image} cat={p.cat} alt={p.name} />
          <span className="product-meta">
            <span className="product-name">
              {p.name}
              {p.tier && <span className={`tier-badge tier-${p.tier}`}>{p.tier === 'critical' ? 'Critical' : 'Watch'}</span>}
            </span>
            <span className="product-tags">
              <span className={`cat-pill cat-${p.cat}`}>{p.cat}</span>
              <span className="sku-chip">{p.sku}</span>
              <AsinLink asin={p.asin} />
              {hasChildren && <span className="child-count">{p.childCount} selling</span>}
            </span>
          </span>
        </div>
        <div className="col-rate">
          <RateCompare rate7={p.rate7} rate30={p.rate30} delta={p.delta} tier={p.tier} big />
        </div>
        <div className="col-num strong">{usd0(p.s7)}</div>
        <div className="col-num">{usd0(p.r7)}</div>
      </div>
      {expanded && hasChildren && (
        <div className="children">
          {p.children.map((c) => (
            <ChildRow key={c.asin} c={c} cat={p.cat} isDriver={c.asin === driverAsin} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="row head-row">
      <div className="col-product">Product</div>
      <div className="col-rate">Refund rate<span className="col-sub">last 7d vs 30d avg</span></div>
      <div className="col-num">Sales<span className="col-sub">7d</span></div>
      <div className="col-num">Refunds<span className="col-sub">7d</span></div>
    </div>
  );
}

// Alerted families first (driver tinted when opened). All variations are
// collapsed by default; healthy families sit behind one summary line.
export default function ReturnsTable({ parents, expanded, toggle }) {
  const [showHealthy, setShowHealthy] = useState(false);
  const alerted = parents.filter((p) => p.tier);
  const healthy = parents.filter((p) => !p.tier);

  return (
    <div className="table">
      <Header />
      {alerted.map((p) => (
        <ParentRow key={p.family} p={p} expanded={!!expanded[p.family]} onToggle={() => toggle(p.family)} />
      ))}
      {healthy.length > 0 && (
        <button className="healthy-toggle" onClick={() => setShowHealthy((s) => !s)}>
          <Chevron open={showHealthy} width={11} height={11} />
          <span className="healthy-dot" />
          {healthy.length} products healthy — nothing moved
          <span className="healthy-hint">{showHealthy ? 'hide' : 'show'}</span>
        </button>
      )}
      {showHealthy &&
        healthy.map((p) => (
          <ParentRow key={p.family} p={p} expanded={!!expanded[p.family]} onToggle={() => toggle(p.family)} />
        ))}
    </div>
  );
}

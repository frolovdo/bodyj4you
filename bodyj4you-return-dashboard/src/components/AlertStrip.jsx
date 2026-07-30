import { usd0, pct1, pp, amazonUrl, reviewsUrl } from '../lib/format.js';
import ProductImage from './ProductImage.jsx';
import { External, Check, Bell } from './icons.jsx';

// "Action needed" strip — one card per alert, ranked critical-first then by
// refund dollars. Each card states the reason in plain words, names the child
// driving it, quantifies the excess vs baseline, and links out to Amazon.
// Acknowledge hides the card for 30 days (localStorage) so a known issue
// stops alarming while it's being worked.

function AlertCard({ a, onAck, onJump }) {
  return (
    <div className={`alert-card alert-${a.tier}`}>
      <div className="alert-head">
        <span className={`tier-badge tier-${a.tier}`}>
          <Bell width={10} height={10} />
          {a.tier === 'critical' ? 'Critical' : 'Watch'}
        </span>
        <span className="alert-excess">≈{usd0(a.excess7)}/wk above baseline</span>
      </div>
      <div className="alert-body">
        <ProductImage src={a.image} cat={a.cat} alt={a.name} />
        <div className="alert-text">
          <button className="alert-name" onClick={() => onJump(a.family)}>{a.name}</button>
          <div className="alert-reason">
            <strong>{pct1(a.rate7)}</strong> last wk vs {pct1(a.rate30)} avg
            ({pp(a.delta)}) · <strong>{usd0(a.r7)}</strong> refunded
          </div>
          {a.driver && (
            <div className="alert-driver">
              Driver: <span className="sku-chip">{a.driver.sku}</span>{' '}
              {pct1(a.driver.rate7)} · {usd0(a.driver.r7)}
            </div>
          )}
        </div>
      </div>
      <div className="alert-actions">
        <a className="alert-link" href={amazonUrl(a.driver?.asin || a.asin)} target="_blank" rel="noreferrer">
          Listing <External width={9} height={9} />
        </a>
        <a className="alert-link" href={reviewsUrl(a.driver?.asin || a.asin)} target="_blank" rel="noreferrer">
          Reviews <External width={9} height={9} />
        </a>
        <button className="alert-ack" onClick={() => onAck(a.family)} title="Mute this alert for 30 days">
          <Check width={9} height={9} /> Acknowledge 30d
        </button>
      </div>
    </div>
  );
}

export default function AlertStrip({ alerts, acks, onAck, onUnack, onJump }) {
  const live = alerts.filter((a) => !acks[a.family]);
  const acked = alerts.filter((a) => acks[a.family]);
  if (!alerts.length) return null;
  return (
    <section className="section">
      <div className="eyebrow">01 / ACTION NEEDED</div>
      {live.length > 0 && (
        <div className="alert-grid">
          {live.map((a) => <AlertCard key={a.family} a={a} onAck={onAck} onJump={onJump} />)}
        </div>
      )}
      {acked.length > 0 && (
        <div className="acked-rows">
          {acked.map((a) => (
            <div key={a.family} className="acked-row">
              <Check width={10} height={10} />
              <span className="acked-name">{a.name}</span>
              <span className="acked-info">
                acknowledged until {new Date(acks[a.family].until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {acks[a.family].note ? ` — ${acks[a.family].note}` : ''}
              </span>
              <button className="acked-undo" onClick={() => onUnack(a.family)}>Un-mute</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

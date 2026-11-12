import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// A family the ads robot has not been set up for: only the Budget boost runs. Every other page shows this instead, with the
// budget rules Amazon itself holds on the family's campaigns today (read live from the Ads API).
export default function NotSetUp({ fam }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('amazon-rules').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load'))); }, []);
  const rows = d?.rows || [];
  return (
    <div className="nsu">
      <div className="card">
        <h2 className="sec">The robot has not been set up for {fam?.parent_sku || fam?.family} yet</h2>
        <p>Only the <a href="#/boost"><b>Budget boost</b></a> runs on this family's campaigns: every hour it raises a campaign's budget for the rest of the day when the campaign is nearly out of budget and today's ROAS is above its level. The daily brief, campaign updates, keywords, search terms and the hourly judge are not switched on here.</p>
      </div>
      <div className="card">
        <h2 className="sec">Rules on Amazon today</h2>
        <p className="mut small">What Amazon's own budget rules do on these campaigns. Amazon checks them once a day and applies an increase the next day, which is why the Budget boost exists.</p>
        {error && <p className="bst-crit">{error}</p>}
        {!d && !error && <p className="mut">Reading Amazon…</p>}
        {d && !rows.length && <p className="mut">No campaigns on record for this family.</p>}
        {rows.length > 0 && (
          <table className="nsu-t">
            <thead><tr><th>Campaign</th><th>Daily budget</th><th>Amazon rule</th><th>When</th><th>Then</th><th>State</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.state === 'ACTIVE' ? 'on' : ''}>
                  <td>{r.campaign}</td>
                  <td>{r.budget != null ? '$' + r.budget : '–'}</td>
                  <td>{r.error ? <span className="bst-crit">{r.error}</span> : r.rule == null ? <span className="mut">no rule</span> : <b>{r.rule || '(unnamed)'}</b>}</td>
                  <td>{r.condition || ''}{r.recurrence ? <span className="mut"> · {r.recurrence.toLowerCase()}</span> : null}</td>
                  <td>{r.increase ? `budget ${r.increase}, next day` : ''}</td>
                  <td>{r.state ? <span className={'pill st ' + (r.state === 'ACTIVE' ? 'bst-good' : 'bst-mut')}>{r.state === 'ACTIVE' ? 'active' : r.state.toLowerCase()}</span> : ''}{r.since ? <div className="small mut">since {r.since}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

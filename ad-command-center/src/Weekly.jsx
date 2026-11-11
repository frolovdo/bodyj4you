import React, { useEffect, useState } from 'react';
import { FAM } from './App.jsx';

// Weekly report: a family's calendar-week ads report (built on the Mac, same campaigns and goals as the Dashboard).
// Shown as-is in a sandboxed frame so its own styles and charts stay intact. On "Whole account" a row of buttons
// switches between every family that has a report.
const load = (fam) => fetch('/api/weekly', { credentials: 'same-origin', headers: fam ? { 'x-family': fam } : {} }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not load the report.' }));

export default function Weekly() {
  const all = FAM.id === 'ACCOUNT';
  const [fam, setFam] = useState(all ? '' : FAM.id);
  const [fams, setFams] = useState([]);
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    load(fam || (all ? 'ACCOUNT' : FAM.id)).then((r) => {
      setFams(r.families || []);
      if (all && !fam && r.families?.length) setFam(r.families[0]); else setD(r);
    });
  }, [fam]);
  return (
    <div className="weekly">
      {all && fams.length > 0 && <div className="weekly-tabs" role="tablist" aria-label="Variation">
        {fams.map((f) => <button key={f} type="button" role="tab" aria-selected={f === fam} className={'btn sm' + (f === fam ? '' : ' alt')} onClick={() => setFam(f)}>{f}</button>)}
      </div>}
      {!d ? <p className="mut">Loading…</p>
        : !d.ok ? <p className="mut">{d.error || 'Could not load the report.'}</p>
        : !d.html ? <div className="card"><p>No weekly report for this family yet.</p>
            {fams.length > 0 && <p className="mut">Reports exist for: {fams.join(', ')}. Pick one in the Product family menu, or open Whole account.</p>}</div>
        : <>
            <p className="mut small">{d.week}. The Dashboard counts the last 7 complete days; this report counts the calendar week.</p>
            <iframe className="weekly-frame" title="Weekly ads report" sandbox="allow-scripts" srcDoc={d.html} />
          </>}
    </div>
  );
}

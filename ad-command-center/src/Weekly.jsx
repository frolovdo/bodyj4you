import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// Weekly report: the family's calendar-week ads report (built on the Mac, same campaigns and goals as the Dashboard).
// Shown as-is in a sandboxed frame so its own styles and charts stay intact.
export default function Weekly() {
  const [d, setD] = useState(null);
  useEffect(() => { api('weekly').then(setD); }, []);
  if (!d) return <p className="mut">Loading…</p>;
  if (!d.ok) return <p className="mut">{d.error || 'Could not load the report.'}</p>;
  if (!d.html) return <div className="card"><p>No weekly report for this family yet.</p>
    {d.families?.length > 0 && <p className="mut">Reports exist for: {d.families.join(', ')}. Pick one in the Product family menu.</p>}</div>;
  return (
    <div className="weekly">
      <p className="mut small">{d.week}. The Dashboard counts the last 7 complete days; this report counts the calendar week.</p>
      <iframe className="weekly-frame" title="Weekly ads report" sandbox="allow-scripts" srcDoc={d.html} />
    </div>
  );
}

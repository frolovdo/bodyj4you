import React from 'react';

// Budget Equalizer: the standalone planning page (one account figure spent in full, split across campaigns by product line),
// served by /api/equalizer behind the PIN login. Nothing on it writes to Amazon.
export default function Equalizer() {
  return (
    <div className="eqz">
      <p className="mut eqz-bar">Plan only: every budget shown is a proposal, nothing is sent from this page. <a href="/api/equalizer" target="_blank" rel="noopener">Open full screen →</a></p>
      <iframe className="eqz-frame" src="/api/equalizer" title="Budget Equalizer" />
    </div>
  );
}

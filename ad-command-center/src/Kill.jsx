import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// Stop all sending: a header button with a confirm; a banner while engaged; owners release it.
export default function Kill({ csrf, user }) {
  const [st, setSt] = useState(null);
  const [ask, setAsk] = useState(false);
  const load = () => api('kill').then((d) => d.ok && setSt(d));
  useEffect(() => { load(); }, []);
  const post = (doWhat) => api('kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf, do: doWhat }) }).then(load);
  if (!st) return null;
  const canStop = ['approver', 'owner'].includes(user.role), canRelease = user.role === 'owner';
  return (
    <>
      {!st.engaged && canStop && <button className="btn no sm" style={{ marginLeft: 24 }} onClick={() => setAsk(true)} title="Block every send to Amazon until an owner releases it">Stop all sending</button>}
      {ask && !st.engaged && <span className="killask">Stop ALL sending? Nothing goes to Amazon until an owner releases it. <button className="btn no sm" onClick={() => { post('engage'); setAsk(false); }}>Yes, stop</button> <button className="btn alt sm" onClick={() => setAsk(false)}>No</button></span>}
      {st.engaged && <span className="killon">ALL SENDING IS STOPPED (by {st.by}). {canRelease ? <button className="btn alt sm" onClick={() => post('release')}>Release</button> : 'Ask an owner to release it.'}</span>}
    </>
  );
}

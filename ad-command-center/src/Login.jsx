import React, { useState } from 'react';
import { api } from './App.jsx';

export default function Login({ onLogin }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const d = await api('login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
    setBusy(false);
    if (d.ok) onLogin(d.user, d.csrf); else setMsg(d.error || 'Wrong PIN.');
    setPin('');
  };
  return (
    <main className="wrap">
      <form className="card login" onSubmit={submit}>
        <h2>Sign in</h2>
        {msg && <p className="block">{msg}</p>}
        <label>PIN<input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} /></label>
        <button className="btn" disabled={busy || !pin}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

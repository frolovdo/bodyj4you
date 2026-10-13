import React, { useEffect, useState } from 'react';
import Login from './Login.jsx';
import EnginePage from './EnginePage.jsx';
import Update from './Update.jsx';
import History from './History.jsx';
import Keywords from './Keywords.jsx';
import Hourly from './Hourly.jsx';
import Kill from './Kill.jsx';

const NAV = [
  ['dashboard', 'Dashboard'],
  ['update', 'Update campaigns'],
  ['hourly', 'Hourly'],
  ['keywords', 'Keywords'],
  ['history', 'History'],
];

export async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, { credentials: 'same-origin', ...opts });
  const d = await r.json().catch(() => ({ ok: false, error: 'bad response' }));
  if (r.status === 401) d.unauth = true;
  return d;
}

function route() {
  const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  return NAV.some(([k]) => k === h) ? h : 'dashboard';
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [csrf, setCsrf] = useState('');
  const [page, setPage] = useState(route());
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ac_theme') || 'light'; } catch { return 'light'; } });

  useEffect(() => { api('me').then((d) => { setUser(d.ok ? d.user : null); setCsrf(d.csrf || ''); }); }, []);
  useEffect(() => { const f = () => setPage(route()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('ac_theme', theme); } catch {} }, [theme]);

  if (user === undefined) return <main className="wrap"><p className="mut">Loading…</p></main>;
  if (!user) return <Login onLogin={(u, c) => { setUser(u); setCsrf(c); }} />;

  const signOut = async () => { await api('logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf }) }); setUser(null); };

  return (
    <>
      <header>
        <b>EO-ROSEHIP Action Center</b>
        <nav>{NAV.map(([k, label]) => <a key={k} href={'#/' + k} className={page === k ? 'on' : ''}>{label}</a>)}</nav>
        <button className="btn alt sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        <span className="mut">{user.name} · {user.role}</span>
        <button className="btn alt sm" onClick={signOut}>Sign out</button>
        <Kill csrf={csrf} user={user} />
      </header>
      <main className="wrap">
        {page === 'update' ? <Update key="update" csrf={csrf} user={user} /> : page === 'history' ? <History key="history" csrf={csrf} user={user} /> : page === 'keywords' ? <Keywords key="keywords" csrf={csrf} user={user} /> : page === 'hourly' ? <Hourly key="hourly" csrf={csrf} user={user} /> : <EnginePage key={page} name={page} csrf={csrf} user={user} />}
      </main>
    </>
  );
}

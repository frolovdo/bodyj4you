import React, { useEffect, useState } from 'react';
import Login from './Login.jsx';
import EnginePage from './EnginePage.jsx';
import Update from './Update.jsx';
import History from './History.jsx';
import Keywords from './Keywords.jsx';
import Hourly from './Hourly.jsx';
import Kill from './Kill.jsx';
import SearchTerms from './SearchTerms.jsx';
import Audiences from './Audiences.jsx';

const NAV = [
  ['dashboard', 'Dashboard'],
  ['update', 'Update campaigns'],
  ['hourly', 'Hourly'],
  ['keywords', 'Keywords'],
  ['searchterms', 'Search terms'],
  ['audiences', 'Audiences'],
  ['history', 'History'],
];

// The family this page works on (picker in the header). Every request sends it; the functions read x-family.
export const FAM = { id: (() => { try { return localStorage.getItem('ac_family') || ''; } catch { return ''; } })(), label: 'Rosehip', head: 'rosehip oil' };

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}), ...(FAM.id ? { 'x-family': FAM.id } : {}) };
  const r = await fetch('/api/' + path, { credentials: 'same-origin', ...opts, headers });
  const d = await r.json().catch(() => ({ ok: false, error: 'bad response' }));
  if (r.status === 401) d.unauth = true;
  return d;
}

function route() {
  let h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  if (h === 'roadmap') h = 'audiences';   // old links
  return NAV.some(([k]) => k === h) ? h : 'dashboard';
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [fams, setFams] = useState([]);
  const [csrf, setCsrf] = useState('');
  const [page, setPage] = useState(route());
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ac_theme') || 'light'; } catch { return 'light'; } });

  useEffect(() => { api('me').then((d) => {
    if (d.ok) {
      const list = d.families || [];
      const cur = list.find((f) => f.family && f.family === (FAM.id || d.family)) || list.find((f) => f.family === d.family) || list.find((f) => f.family);
      if (cur) { FAM.id = cur.family; FAM.label = cur.label; FAM.head = cur.head; }
      setFams(list);
    }
    setUser(d.ok ? d.user : null); setCsrf(d.csrf || '');
  }); }, []);
  const pickFamily = (f) => { try { localStorage.setItem('ac_family', f); } catch {} location.hash = '#/dashboard'; location.reload(); };
  useEffect(() => { const f = () => setPage(route()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('ac_theme', theme); } catch {} }, [theme]);

  if (user === undefined) return <main className="wrap"><p className="mut">Loading…</p></main>;
  if (!user) return <Login onLogin={(u, c) => { setUser(u); setCsrf(c); }} />;

  const signOut = async () => { await api('logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf }) }); setUser(null); };

  return (
    <>
      <header>
        {fams.length > 0
          ? <select className="famsel" value={FAM.id} onChange={(e) => pickFamily(e.target.value)} aria-label="Product family (top 10 parent SKUs by revenue, last 30 days)" title="Top 10 parent SKUs by revenue, last 30 days">
              {fams.map((f) => <option key={f.parent_sku} value={f.family || ''} disabled={!f.family}>
                {f.parent_sku.replace(/-Master$/, '')}{f.sales_30d ? ' · $' + Math.round(f.sales_30d / 1000) + 'k' : ''}{f.family ? '' : ' (not set up)'}
              </option>)}
            </select>
          : <b>{FAM.id || 'EO-ROSEHIP'}</b>}
        <b>Action Center</b>
        <nav>{NAV.filter(([k]) => k !== 'audiences' || (FAM.id || 'EO-ROSEHIP') === 'EO-ROSEHIP').map(([k, label]) => <a key={k} href={'#/' + k} className={page === k ? 'on' : ''}>{label}</a>)}</nav>
        <button className="btn alt sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        <span className="mut">{user.name} · {user.role}</span>
        <button className="btn alt sm" onClick={signOut}>Sign out</button>
        <Kill csrf={csrf} user={user} />
      </header>
      <main className="wrap">
        {page === 'update' ? <Update key="update" csrf={csrf} user={user} /> : page === 'history' ? <History key="history" csrf={csrf} user={user} /> : page === 'keywords' ? <Keywords key="keywords" csrf={csrf} user={user} /> : page === 'hourly' ? <Hourly key="hourly" csrf={csrf} user={user} /> : page === 'searchterms' ? <SearchTerms key="searchterms" csrf={csrf} user={user} /> : page === 'audiences' ? <Audiences key="audiences" /> : <EnginePage key={page} name={page} csrf={csrf} user={user} />}
      </main>
    </>
  );
}

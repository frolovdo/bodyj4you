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
import Account from './Account.jsx';
import Top3 from './Top3.jsx';
import Weekly from './Weekly.jsx';

const NAV = [
  ['dashboard', 'Dashboard'],
  ['update', 'Update campaigns'],
  ['hourly', 'Hourly'],
  ['keywords', 'Keywords'],
  ['searchterms', 'Search terms'],
  ['top3', 'Top 3'],
  ['weekly', 'Weekly report'],
  ['audiences', 'Audiences'],
  ['history', 'History'],
];

// Nav icons in the Ops page style (24px stroke icons).
const sv = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICON = {
  dashboard: sv(<><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>),
  update: sv(<><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>),
  hourly: sv(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  keywords: sv(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></>),
  searchterms: sv(<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>),
  top3: sv(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></>),
  audiences: sv(<><circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/></>),
  weekly: sv(<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 14h4M7 17h7"/></>),
  history: sv(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>),
};

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
  let h = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('?')[0];   // #/update?focus=... keeps its query for the page
  if (h === 'roadmap') h = 'audiences';   // old links
  if (FAM.id === 'ACCOUNT') return 'dashboard';   // the whole-account page has one view
  return NAV.some(([k]) => k === h) ? h : 'dashboard';
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [fams, setFams] = useState([]);
  const [csrf, setCsrf] = useState('');
  const [page, setPage] = useState(route());
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ac_theme') || 'light'; } catch { return 'light'; } });

  // Loads the user and the family list; runs on page load and again right after sign-in.
  const loadMe = () => api('me').then((d) => {
    if (d.ok) {
      const list = d.families || [];
      const cur = list.find((f) => f.family && f.family === (FAM.id || d.family)) || list.find((f) => f.family === d.family) || list.find((f) => f.family);
      if (cur) { FAM.id = cur.family; FAM.label = cur.label; FAM.head = cur.head; }
      setFams(list);
    }
    setUser(d.ok ? d.user : null); setCsrf(d.csrf || '');
  });
  useEffect(() => { loadMe(); }, []);
  const pickFamily = (f) => { try { localStorage.setItem('ac_family', f); } catch {} location.hash = '#/dashboard'; location.reload(); };
  useEffect(() => { const f = () => setPage(route()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('ac_theme', theme); } catch {} }, [theme]);

  if (user === undefined) return <main className="wrap"><p className="mut">Loading…</p></main>;
  if (!user) return <Login onLogin={(u, c) => { setUser(u); setCsrf(c); loadMe(); }} />;

  const signOut = async () => { await api('logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf }) }); setUser(null); };

  const navItems = NAV.filter(([k]) => FAM.id !== 'ACCOUNT' || k === 'dashboard').filter(([k]) => k !== 'audiences' || (FAM.id || 'EO-ROSEHIP') === 'EO-ROSEHIP');
  const title = FAM.id === 'ACCOUNT' ? 'Whole account' : (NAV.find(([k]) => k === page) || NAV[0])[1];
  const curFam = fams.find((f) => f.family && f.family === FAM.id);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="mark"><span className="dot"></span>BodyJ4You Ads</div><div className="sub">ACTION CENTER</div></div>
        <div className="side-fam">
          <p className="nav-eyebrow">Product family</p>
          {fams.length > 0
            ? <select className="famsel" value={FAM.id} onChange={(e) => pickFamily(e.target.value)} aria-label="Product family (top 20 parent SKUs by revenue, last 30 days)" title="Top 20 parent SKUs by revenue, last 30 days">
                {fams.map((f) => <option key={f.parent_sku} value={f.family || ''} disabled={!f.family}>
                  {f.parent_sku}{f.family ? '' : ' (not set up)'}
                </option>)}
              </select>
            : <b className="famname">{FAM.id || 'EO-ROSEHIP'}</b>}
        </div>
        <nav>
          <p className="nav-eyebrow">Ads</p>
          {navItems.map(([k, label]) => <a key={k} href={'#/' + k} className={'nav-item' + (page === k ? ' active' : '')} aria-current={page === k ? 'page' : undefined}>{ICON[k]}{label}</a>)}
        </nav>
        <div className="side-foot">
          <span>{user.name} · {user.role}</span>
          <div className="side-btns">
            <button className="btn alt sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
            <button className="btn alt sm" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            <p className="lede">{FAM.id === 'ACCOUNT' ? 'All advertised families' : (curFam ? curFam.parent_sku : (FAM.id || 'EO-ROSEHIP'))}</p>
          </div>
          <div className="topbar-act"><Kill csrf={csrf} user={user} /></div>
        </div>
        <main className="wrap">
          {FAM.id === 'ACCOUNT' ? <Account key="account" /> : page === 'update' ? <Update key="update" csrf={csrf} user={user} /> : page === 'history' ? <History key="history" csrf={csrf} user={user} /> : page === 'keywords' ? <Keywords key="keywords" csrf={csrf} user={user} /> : page === 'hourly' ? <Hourly key="hourly" csrf={csrf} user={user} /> : page === 'searchterms' ? <SearchTerms key="searchterms" csrf={csrf} user={user} /> : page === 'audiences' ? <Audiences key="audiences" /> : page === 'top3' ? <Top3 key="top3" /> : page === 'weekly' ? <Weekly key="weekly" /> : <EnginePage key={page} name={page} csrf={csrf} user={user} />}
        </main>
      </div>
    </div>
  );
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import Top3 from '../src/Top3.jsx';
import data from './top3.json';

const realFetch = window.fetch.bind(window);
window.fetch = (url, opts) => (String(url).includes('/api/top3') ? Promise.resolve(new Response(JSON.stringify({ ok: true, model: data }), { status: 200 })) : realFetch(url, opts));
if (location.search.includes('dark')) document.documentElement.setAttribute('data-theme', 'dark');
createRoot(document.getElementById('root')).render(<Top3 />);

import { useEffect, useState } from 'react';
import { listSnapshots, fetchSnapshot } from './driveSource.js';
import DashboardView from './views/DashboardView.jsx';
import ShipmentView from './views/ShipmentView.jsx';
import { addToCart as cartAdd, updateQuantity as cartUpdate, removeFromCart as cartRemove } from './cart.js';

export default function App() {
  const [snapshots, setSnapshots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'shipment'

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await listSnapshots();
        if (cancelled) return;
        setSnapshots(list);
        if (list.length === 0) {
          setError('No reorder files found in the Drive folder yet.');
          setLoading(false);
          return;
        }
        const newest = list[0];
        setSelected(newest);
        const p = await fetchSnapshot(newest);
        if (cancelled) return;
        setParsed(p);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onPick(file) {
    if (!file || file.id === selected?.id) return;
    if (cart.length > 0) {
      const ok = window.confirm(
        `You have ${cart.length} item(s) in your shipment cart. Changing the snapshot will clear the cart. Continue?`
      );
      if (!ok) return;
      setCart([]);
    }
    setSelected(file);
    setLoading(true);
    setError(null);
    try {
      const p = await fetchSnapshot(file);
      setParsed(p);
      setView('dashboard');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSnapshots() {
    const list = await listSnapshots();
    setSnapshots(list);
    if (list.length === 0) return null;
    const newest = list[0];
    if (!selected || newest.id !== selected.id) {
      setSelected(newest);
      setLoading(true);
      try {
        const p = await fetchSnapshot(newest);
        setParsed(p);
      } finally {
        setLoading(false);
      }
    }
    return newest;
  }

  function handleAdd(item) { setCart((cur) => cartAdd(cur, item)); }
  function handleUpdateQty(fbaSku, quantity) { setCart((cur) => cartUpdate(cur, fbaSku, quantity)); }
  function handleRemove(fbaSku) { setCart((cur) => cartRemove(cur, fbaSku)); }
  function handleClearCart() { setCart([]); }

  if (loading && !parsed) {
    return (
      <div className="boot-page">
        <div className="boot-loader">
          <div className="boot-spinner" />
          <div className="boot-text">Loading latest snapshot from Drive…</div>
        </div>
      </div>
    );
  }

  if (error && !parsed) {
    return (
      <div className="boot-page">
        <div className="error-banner">
          <div className="error-banner-title">Couldn't load data from Drive</div>
          <div className="error-banner-msg">{error}</div>
        </div>
      </div>
    );
  }

  if (view === 'shipment') {
    return (
      <ShipmentView
        cart={cart}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
        onClear={handleClearCart}
        onBack={() => setView('dashboard')}
      />
    );
  }

  return (
    <DashboardView
      data={parsed.data}
      summary={parsed.summary}
      snapshots={snapshots}
      selected={selected}
      onPick={onPick}
      onRefresh={refreshSnapshots}
      loading={loading}
      error={error}
      cart={cart}
      onAdd={handleAdd}
      onOpenShipment={() => setView('shipment')}
    />
  );
}

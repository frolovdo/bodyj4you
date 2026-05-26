import { useEffect, useState } from 'react';
import { parseFile } from './parseFile.js';
import UploadZone from './components/UploadZone.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import DashboardView from './views/DashboardView.jsx';
import ShipmentView from './views/ShipmentView.jsx';
import { addToCart as cartAdd, updateQuantity as cartUpdate, removeFromCart as cartRemove } from './cart.js';
import { isDriveConfigured, hasCachedToken, loadLatestFromDrive } from './driveLoader.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function App() {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('dashboard');   // 'dashboard' | 'shipment'
  const [driveLoading, setDriveLoading] = useState(false);
  const [booting, setBooting] = useState(true);   // attempting bundled-snapshot load

  async function handleFile(file, extraMeta = {}) {
    setError(null);
    try {
      const result = await parseFile(file);
      setParsed(result);
      setFileMeta({
        name: file.name,
        lastModified: file.lastModified ? new Date(file.lastModified) : null,
        source: file.__driveSource ? 'drive' : (extraMeta.source || 'upload'),
        snapshotLabel: extraMeta.snapshotLabel || null,
      });
      setView('dashboard');
    } catch (e) {
      setError(e.message || String(e));
      setParsed(null);
      setFileMeta(null);
    }
  }

  async function loadFromDrive({ interactive }) {
    setError(null);
    setDriveLoading(true);
    try {
      const file = await loadLatestFromDrive({ interactive });
      file.__driveSource = true;
      await handleFile(file);
    } catch (e) {
      if (interactive) setError(e.message || String(e));
    } finally {
      setDriveLoading(false);
    }
  }

  // On open: load the bundled snapshot so the report shows immediately (no upload screen).
  // Falls back to the upload screen only if no snapshot is bundled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = import.meta.env.BASE_URL || '/';
      try {
        const mResp = await fetch(`${base}data/manifest.json`, { cache: 'no-store' });
        if (!mResp.ok) throw new Error('no snapshot');
        const manifest = await mResp.json();
        const fResp = await fetch(`${base}data/${manifest.file || 'latest.xlsx'}`, { cache: 'no-store' });
        if (!fResp.ok) throw new Error('snapshot file missing');
        const ab = await fResp.arrayBuffer();
        if (cancelled) return;
        const file = new File([ab], manifest.filename || 'snapshot.xlsx', {
          type: XLSX_MIME,
          lastModified: manifest.modifiedMs || Date.now(),
        });
        await handleFile(file, { source: 'snapshot', snapshotLabel: manifest.label || null });
      } catch {
        if (isDriveConfigured() && hasCachedToken()) {
          await loadFromDrive({ interactive: false });
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAll() {
    if (cart.length > 0) {
      const ok = window.confirm(
        `You have ${cart.length} item(s) in your shipment cart. Swapping the file will clear the cart. Continue?`
      );
      if (!ok) return;
    }
    setParsed(null);
    setError(null);
    setFileMeta(null);
    setCart([]);
    setView('dashboard');
  }

  function handleAdd(item) {
    setCart(cur => cartAdd(cur, item));
  }
  function handleUpdateQty(fbaSku, quantity) {
    setCart(cur => cartUpdate(cur, fbaSku, quantity));
  }
  function handleRemove(fbaSku) {
    setCart(cur => cartRemove(cur, fbaSku));
  }
  function handleClearCart() {
    setCart([]);
  }

  if (!parsed) {
    if (booting) {
      return (
        <div className="upload-page">
          <div className="boot-loader">
            <div className="boot-spinner" />
            <div className="boot-text">Loading latest snapshot…</div>
          </div>
        </div>
      );
    }
    return (
      <div className="upload-page">
        <div style={{ width: '100%', maxWidth: 560 }}>
          {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}
          <UploadZone
            onFile={handleFile}
            driveConfigured={isDriveConfigured()}
            driveLoading={driveLoading}
            onLoadDrive={() => loadFromDrive({ interactive: true })}
          />
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
      fileMeta={fileMeta}
      cart={cart}
      onAdd={handleAdd}
      onOpenShipment={() => setView('shipment')}
      onSwap={resetAll}
    />
  );
}

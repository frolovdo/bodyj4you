import { useRef, useState } from 'react';

export default function UploadZone({ onFile, driveConfigured, driveLoading, onLoadDrive }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function pickFile() {
    inputRef.current?.click();
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`upload-card ${dragging ? 'dragging' : ''}`}
      onClick={pickFile}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickFile(); }}
    >
      <div className="upload-icon">⬆</div>
      <h1>Miami Monday Reorder Dashboard</h1>
      <p>Upload your Miami Reorder xlsx file to view the dashboard.</p>

      {driveConfigured && (
        <div className="drive-row" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="drive-btn"
            onClick={onLoadDrive}
            disabled={driveLoading}
          >
            {driveLoading ? '⏳ Loading from Drive…' : '↧ Load latest from Google Drive'}
          </button>
          <div className="drive-or">or</div>
        </div>
      )}

      <button type="button" className="upload-btn" onClick={(e) => { e.stopPropagation(); pickFile(); }}>
        Choose file
      </button>
      <div className="upload-hint">or drag and drop here · .xlsx only</div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

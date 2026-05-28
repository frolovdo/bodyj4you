import { useRef, useState } from 'react'

export default function UploadZone({ onFile, error }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  function handleFiles(files) {
    const f = files && files[0]
    if (f) onFile(f)
  }

  return (
    <div className="mx-auto max-w-lg py-16">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          drag ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 bg-white hover:border-blue-400'
        }`}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-base font-medium text-gray-800">
          Drop your Excel file here or <span className="text-blue-600">browse</span>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Upload the weekly <span className="font-mono">Miami Warehouse - MM.DD.YY.xlsx</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
    </div>
  )
}

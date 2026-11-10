import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function ZoomControls({ zoom, setZoom, resetZoomAndPan }) {
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, +(prev + 0.15).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.2, +(prev - 0.15).toFixed(2)));
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="fixed top-28 right-2 sm:top-auto sm:bottom-6 sm:left-6 sm:right-auto z-30 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-xl shadow-lg border border-slate-200/90 text-slate-700 select-none">
      <button
        onClick={handleZoomOut}
        title="Diminuir Zoom"
        className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-95 transition-all cursor-pointer text-slate-600"
      >
        <ZoomOut size={16} />
      </button>

      <button
        onClick={resetZoomAndPan}
        title="Resetar Zoom para 100%"
        className="px-2 py-1 rounded-md hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors min-w-[50px] text-center"
      >
        {zoomPercent}%
      </button>

      <button
        onClick={handleZoomIn}
        title="Aumentar Zoom"
        className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-95 transition-all cursor-pointer text-slate-600"
      >
        <ZoomIn size={16} />
      </button>

      <div className="h-4 w-px bg-slate-200 mx-0.5" />

      <button
        onClick={resetZoomAndPan}
        title="Centralizar quadro"
        className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-95 transition-all cursor-pointer text-slate-600"
      >
        <RotateCcw size={15} />
      </button>
    </div>
  );
}

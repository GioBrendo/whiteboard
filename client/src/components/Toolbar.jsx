import React, { useRef } from 'react';
import {
  MousePointer2,
  BoxSelect,
  LassoSelect,
  Hand,
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle as CircleIcon,
  Minus,
  MoveRight,
  Type,
  StickyNote,
  Sigma,
  Image as ImageIcon
} from 'lucide-react';
import { TOOLS, COLOR_PALETTE, STROKE_WIDTHS, STICKY_COLORS } from '../constants';

export default function Toolbar({
  activeTool,
  setActiveTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  fillShape,
  setFillShape,
  stickyColor,
  setStickyColor,
  eraserMode,
  setEraserMode,
  onUploadImage
}) {
  const fileInputRef = useRef(null);

  const tools = [
    { id: TOOLS.SELECT, label: 'Mover e Redimensionar (V)', icon: MousePointer2 },
    { id: TOOLS.SELECT_RECT, label: 'Seleção em Retângulo (B)', icon: BoxSelect },
    { id: TOOLS.SELECT_LASSO, label: 'Seleção de Região (Q)', icon: LassoSelect },
    { id: TOOLS.HAND, label: 'Arrastar Tela (H ou Espaço)', icon: Hand },
    { id: TOOLS.PENCIL, label: 'Caneta (P)', icon: Pencil },
    { id: TOOLS.HIGHLIGHTER, label: 'Marcador (M)', icon: Highlighter },
    { id: TOOLS.ERASER, label: 'Borracha (E)', icon: Eraser },
    { id: TOOLS.RECTANGLE, label: 'Retângulo (R)', icon: Square },
    { id: TOOLS.CIRCLE, label: 'Círculo (C)', icon: CircleIcon },
    { id: TOOLS.LINE, label: 'Linha (L)', icon: Minus },
    { id: TOOLS.ARROW, label: 'Seta (A)', icon: MoveRight },
    { id: TOOLS.TEXT, label: 'Texto (T)', icon: Type },
    { id: TOOLS.LATEX, label: 'Fórmula LaTeX', icon: Sigma },
    { id: TOOLS.STICKY, label: 'Nota Adesiva (S)', icon: StickyNote },
  ];

  const isShapeTool = [TOOLS.RECTANGLE, TOOLS.CIRCLE].includes(activeTool);
  const isDrawTool = [TOOLS.PENCIL, TOOLS.HIGHLIGHTER, TOOLS.LINE, TOOLS.ARROW, TOOLS.RECTANGLE, TOOLS.CIRCLE, TOOLS.TEXT].includes(activeTool);

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (file && onUploadImage) {
      onUploadImage(file);
    }
    e.target.value = '';
  };

  return (
    <div className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 select-none w-[calc(100%-1rem)] sm:w-auto">
      {/* Properties Secondary Bar (Color, Width, Fill, Sticky note style) */}
      {(isDrawTool || activeTool === TOOLS.STICKY || activeTool === TOOLS.ERASER) && (
        <div className="flex flex-wrap items-center justify-center gap-2 bg-white/95 backdrop-blur-md px-2 sm:px-3 py-2 rounded-2xl shadow-lg border border-slate-200/90 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-full">
          {/* Eraser mode: whole element or only the part under the cursor */}
          {activeTool === TOOLS.ERASER && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 font-medium mr-1 whitespace-nowrap">Borracha:</span>
              <button
                onClick={() => setEraserMode('element')}
                title="Apaga o desenho inteiro ao tocar nele"
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  eraserMode === 'element'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                Elemento inteiro
              </button>
              <button
                onClick={() => setEraserMode('partial')}
                title="Apaga só o trecho por onde o cursor passar"
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  eraserMode === 'partial'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                Só onde passar
              </button>
            </div>
          )}
          {/* If drawing or shape tool: Color palette */}
          {isDrawTool && (
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                  style={{ backgroundColor: c.value }}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer shadow-xs ${
                    color === c.value ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : 'hover:scale-110'
                  }`}
                />
              ))}

              {/* Custom Color Input */}
              <label
                title="Cor personalizada"
                className="w-5 h-5 rounded-full border border-slate-300 relative overflow-hidden cursor-pointer flex items-center justify-center hover:scale-110 transition-transform bg-gradient-to-tr from-rose-400 via-emerald-400 to-blue-400"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                />
              </label>
            </div>
          )}

          {/* Stroke Width Selector */}
          {isDrawTool && activeTool !== TOOLS.TEXT && (
            <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
              {STROKE_WIDTHS.map((sw) => (
                <button
                  key={sw.value}
                  onClick={() => setStrokeWidth(sw.value)}
                  title={`${sw.label} (${sw.value}px)`}
                  className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    strokeWidth === sw.value
                      ? 'bg-blue-100 text-blue-700 font-bold'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <div
                    className="w-4 rounded-full bg-current mx-auto"
                    style={{ height: `${Math.min(sw.value, 8)}px` }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Shape Fill Toggle */}
          {isShapeTool && (
            <button
              onClick={() => setFillShape(!fillShape)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
                fillShape
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-sm border ${
                  fillShape ? 'bg-current border-current' : 'border-slate-500'
                }`}
              />
              <span>Preencher</span>
            </button>
          )}

          {/* Sticky Note Colors */}
          {activeTool === TOOLS.STICKY && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium mr-1">Cor do Post-it:</span>
              {STICKY_COLORS.map((sc) => (
                <button
                  key={sc.bg}
                  onClick={() => setStickyColor(sc)}
                  title={sc.name}
                  style={{ backgroundColor: sc.bg, borderColor: sc.border }}
                  className={`w-6 h-6 rounded-md border shadow-xs transition-transform cursor-pointer ${
                    stickyColor.bg === sc.bg
                      ? 'scale-115 ring-2 ring-blue-500 ring-offset-1'
                      : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Primary Floating Toolbar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-0.5 sm:gap-1 bg-white/95 backdrop-blur-md px-1.5 sm:px-2.5 py-1.5 rounded-2xl shadow-xl border border-slate-200/90 toolbar-shadow max-w-full">
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;

          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              title={t.label}
              className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer relative group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-105'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            </button>
          );
        })}

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        {/* Upload Image Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Inserir Imagem (ou Ctrl+V para colar)"
          className="p-2 sm:p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer active:scale-95"
        >
          <ImageIcon size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

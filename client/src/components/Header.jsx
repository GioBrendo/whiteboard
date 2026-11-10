import React, { useState, useRef, useEffect } from 'react';
import { 
  Share2, 
  Check, 
  X,
  Pencil,
  Undo2, 
  Redo2, 
  Trash2, 
  Download, 
  FileText,
  Image as ImageIcon,
  ChevronDown,
  Grid3X3, 
  Palette,
  Save,
  UserRound,
  Sparkles,
  FolderOpen,
  FileCode,
  Film,
  Circle
} from 'lucide-react';
import { BACKGROUND_COLORS, slugifyRoomName } from '../constants';

export default function Header({
  roomId,
  onRenameRoom,
  users,
  currentUser,
  onOpenUserModal,
  onOpenProjectsModal,
  isRecording,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
  onOpenTimelapse,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClearCanvas,
  onExportPNG,
  onExportPDF,
  onExportJSON,
  bg,
  onChangeBg,
  onSave,
  saveStatus
}) {
  const [copied, setCopied] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [roomInput, setRoomInput] = useState('');
  const roomInputRef = useRef(null);
  const exportMenuRef = useRef(null);
  const bgMenuRef = useRef(null);

  const startEditingRoom = () => {
    setRoomInput(roomId);
    setIsEditingRoom(true);
  };

  const submitRenameRoom = () => {
    const sanitized = slugifyRoomName(roomInput);
    if (!sanitized) {
      setIsEditingRoom(false);
      return;
    }
    if (sanitized !== roomId) {
      onRenameRoom?.(sanitized);
    }
    setIsEditingRoom(false);
  };

  const cancelEditingRoom = () => {
    setIsEditingRoom(false);
    setRoomInput(roomId);
  };

  useEffect(() => {
    if (isEditingRoom && roomInputRef.current) {
      roomInputRef.current.focus();
      roomInputRef.current.select();
    }
  }, [isEditingRoom]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const nextGridStyle = () => {
    const grid = bg?.grid || 'dots';
    if (grid === 'dots') onChangeBg({ grid: 'lines' });
    else if (grid === 'lines') onChangeBg({ grid: 'blank' });
    else onChangeBg({ grid: 'dots' });
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
      if (bgMenuRef.current && !bgMenuRef.current.contains(e.target)) {
        setShowBgMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  return (
    <header className="absolute top-0 left-0 right-0 min-h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-2 sm:px-4 py-2 sm:py-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 z-30 select-none shadow-sm">
      {/* Left: Branding & Room Share */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 font-bold text-slate-800 text-lg tracking-tight">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles size={20} />
          </div>
          <span className="hidden sm:inline">WhiteBoard</span>
        </div>

        <div className="hidden sm:block h-5 w-px bg-slate-200 mx-1" />

        {/* Room badge & Copy link button */}
        {isEditingRoom ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRenameRoom();
            }}
            className="flex items-center gap-1 bg-white py-1 px-1.5 rounded-lg border-2 border-blue-500 shadow-md text-xs animate-in fade-in duration-100"
          >
            <span className="text-[11px] font-bold text-blue-600 pl-1">Sala:</span>
            <input
              ref={roomInputRef}
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEditingRoom();
              }}
              placeholder="nome-da-sala"
              maxLength={64}
              className="w-28 sm:w-36 px-1.5 py-0.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              title="Salvar novo nome (Enter)"
              className="p-1 rounded hover:bg-emerald-50 text-emerald-600 cursor-pointer transition-colors"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={cancelEditingRoom}
              title="Cancelar (Esc)"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 transition-colors py-1.5 px-2 sm:px-2.5 rounded-lg border border-slate-200/60 text-xs font-medium text-slate-700">
            <span className="hidden sm:inline text-slate-400">Sala:</span>
            <span
              onClick={startEditingRoom}
              title="Clique para mudar o nome da sala"
              className="font-semibold text-slate-800 hover:text-blue-600 cursor-pointer max-w-[110px] sm:max-w-[160px] truncate"
            >
              {roomId}
            </span>
            <button
              onClick={startEditingRoom}
              title="Mudar nome da sala"
              className="p-1 hover:bg-white text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
            >
              <Pencil size={12} />
            </button>
            <div className="h-3.5 w-px bg-slate-300 mx-0.5 hidden sm:block" />
            <button
              onClick={handleCopyLink}
              title="Copiar link para convidar alguém"
              className="ml-0.5 sm:ml-1 flex items-center gap-1 bg-white hover:bg-blue-50 text-blue-600 px-2 py-0.5 rounded shadow-xs border border-slate-200 font-medium transition-all active:scale-95 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-600" />
                  <span className="hidden sm:inline text-emerald-600">Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 size={13} />
                  <span className="hidden sm:inline">Copiar Link</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Open Projects Button */}
        <button
          onClick={onOpenProjectsModal}
          title="Abrir projetos salvos em rooms (C:\Users\Giovanni Brendo\Downloads\WhiteBoard\rooms)"
          className="flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 py-1.5 px-2.5 rounded-lg border border-slate-200/70 text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
        >
          <FolderOpen size={15} className="text-amber-500 shrink-0" />
          <span>Projetos</span>
        </button>

        {/* Record / Timelapse Button */}
        {isRecording ? (
          <button
            onClick={onStopRecording}
            title="Parar gravação e abrir Time Lapse"
            className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-1.5 px-2.5 rounded-lg border border-rose-300 text-xs font-semibold shadow-xs animate-pulse cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 animate-ping" />
            <span>Parar ({Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')})</span>
          </button>
        ) : (
          <button
            onClick={onStartRecording}
            title="Gravar desenhos para Time Lapse"
            className="flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 py-1.5 px-2.5 rounded-lg border border-slate-200/70 text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Circle size={10} className="fill-rose-500 text-rose-500 shrink-0" />
            <span>Gravar</span>
          </button>
        )}
      </div>

      {/* Middle: Undo, Redo, Grid, Clear, Export, Save */}
      <div className="order-last w-full sm:order-none sm:w-auto flex items-center justify-start gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 shadow-xs overflow-visible">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
          className={`p-1.5 rounded-lg transition-all ${
            canUndo 
              ? 'hover:bg-white text-slate-700 hover:shadow-xs active:scale-95 cursor-pointer' 
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Undo2 size={18} />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Y)"
          className={`p-1.5 rounded-lg transition-all ${
            canRedo 
              ? 'hover:bg-white text-slate-700 hover:shadow-xs active:scale-95 cursor-pointer' 
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Redo2 size={18} />
        </button>

        <div className="h-4 w-px bg-slate-300/70 mx-1" />

        <button
          onClick={nextGridStyle}
          title={`Estilo da grade: ${bg?.grid === 'dots' ? 'Pontos' : bg?.grid === 'lines' ? 'Linhas' : 'Liso'}`}
          className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-xs"
        >
          <Grid3X3 size={18} />
        </button>

        <div ref={bgMenuRef} className="relative">
          <button
            onClick={() => setShowBgMenu((value) => !value)}
            title="Cor do fundo da página"
            className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Palette size={18} />
          </button>

          {showBgMenu && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex items-center gap-1.5 z-50">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onChangeBg({ color })}
                  title={color}
                  style={{ backgroundColor: color }}
                  className={`w-6 h-6 rounded-full border border-slate-300 transition-transform cursor-pointer ${
                    bg?.color === color ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'
                  }`}
                />
              ))}
              <label
                title="Cor personalizada"
                className="w-6 h-6 rounded-full border border-slate-300 relative overflow-hidden cursor-pointer bg-gradient-to-tr from-rose-400 via-emerald-400 to-blue-400"
              >
                <input
                  type="color"
                  value={bg?.color || '#f8fafc'}
                  onChange={(e) => onChangeBg({ color: e.target.value })}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        <button
          onClick={onClearCanvas}
          title="Limpar a página atual"
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-600 hover:shadow-xs active:scale-95 transition-all cursor-pointer"
        >
          <Trash2 size={18} />
        </button>

        {/* Export Dropdown (PNG, PDF, JSON) */}
        <div ref={exportMenuRef} className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            title="Exportar (PNG, PDF ou Projeto)"
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 hover:shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
          >
            <Download size={17} />
            <span className="hidden sm:inline">Exportar</span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>

          {showExportMenu && (
            <div className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-2xl border border-slate-200/90 py-1.5 px-1 min-w-[210px] z-50 flex flex-col gap-0.5 animate-in fade-in duration-100">
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onExportPNG();
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ImageIcon size={16} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Imagem (PNG)</div>
                  <div className="text-[10px] text-slate-500">Página atual em imagem</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onExportPDF();
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Documento (PDF)</div>
                  <div className="text-[10px] text-slate-500">Documento em PDF</div>
                </div>
              </button>

              <div className="h-px bg-slate-100 my-1" />

              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onExportJSON?.();
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileCode size={16} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Projeto (JSON)</div>
                  <div className="text-[10px] text-slate-500">Todas as páginas e dados</div>
                </div>
              </button>

              <div className="h-px bg-slate-100 my-1" />

              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onOpenTimelapse?.();
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Film size={16} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Time Lapse (Vídeo)</div>
                  <div className="text-[10px] text-slate-500">Reproduzir e salvar animação</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onSave}
          title="Gravar o quadro no servidor agora"
          className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-xs font-medium"
        >
          <Save size={18} />
          <span className="hidden md:inline">Salvar</span>
        </button>

        {saveStatus && (
          <span className="hidden sm:inline px-1.5 text-[11px] font-medium text-emerald-600 whitespace-nowrap">
            {saveStatus}
          </span>
        )}
      </div>

      {/* Right: Active Users & User profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {users.length > 0 && (
          <span
            title={`${users.length} pessoa(s) conectada(s) nesta sala`}
            className="px-2 py-1 rounded-lg bg-slate-100/90 border border-slate-200/70 text-[11px] font-semibold text-slate-700 whitespace-nowrap"
          >
            {users.length} {users.length === 1 ? 'conectado' : 'conectados'}
          </span>
        )}

        {/* Connected users avatars */}
        <div className="hidden sm:flex items-center -space-x-2">
          {users.slice(0, 5).map((u) => {
            const isMe = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                title={`${u.name} ${isMe ? '(Você)' : ''}`}
                style={{ backgroundColor: u.color }}
                className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-xs transition-transform hover:scale-110 cursor-pointer"
              >
                {u.name?.substring(0, 2).toUpperCase() || 'U'}
              </div>
            );
          })}
          {users.length > 5 && (
            <div className="w-8 h-8 rounded-full bg-slate-700 text-white text-xs font-bold border-2 border-white flex items-center justify-center">
              +{users.length - 5}
            </div>
          )}
        </div>

        {/* Change profile button */}
        <button
          onClick={onOpenUserModal}
          title="Alterar seu nome e cor"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/90 text-slate-700 text-xs font-medium border border-slate-200 transition-all cursor-pointer"
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: currentUser?.color || '#3b82f6' }}
          />
          <span className="hidden sm:inline max-w-[100px] truncate">{currentUser?.name || 'Você'}</span>
          <UserRound size={14} className="text-slate-400" />
        </button>
      </div>
    </header>
  );
}

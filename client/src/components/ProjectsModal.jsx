import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FolderOpen, 
  X, 
  Search, 
  RefreshCw, 
  Plus, 
  Upload, 
  Download, 
  Trash2, 
  ExternalLink, 
  FileText, 
  Clock, 
  Check, 
  Layers
} from 'lucide-react';

export default function ProjectsModal({ 
  isOpen, 
  onClose, 
  currentRoomId, 
  onSwitchRoom 
}) {
  const [rooms, setRooms] = useState([]);
  const [roomsDir, setRoomsDir] = useState('rooms');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const fileInputRef = useRef(null);
  const newRoomInputRef = useRef(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('Não foi possível obter a lista de projetos.');
      const data = await res.json();
      setRooms(data.rooms || []);
      if (data.roomsDir) setRoomsDir(data.roomsDir);
    } catch (err) {
      setError(err.message || 'Erro ao carregar projetos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      setSearch('');
      setIsCreating(false);
      setNewRoomName('');
      setActionMessage('');
    }
  }, [isOpen, fetchRooms]);

  useEffect(() => {
    if (isCreating && newRoomInputRef.current) {
      newRoomInputRef.current.focus();
    }
  }, [isCreating]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isCreating) {
          setIsCreating(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCreating, onClose]);

  if (!isOpen) return null;

  const handleOpenRoom = (roomId) => {
    if (onSwitchRoom) {
      onSwitchRoom(roomId);
    } else {
      window.location.href = `${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    }
    onClose();
  };

  const handleOpenNewTab = (roomId) => {
    window.open(`${window.location.pathname}?room=${encodeURIComponent(roomId)}`, '_blank');
  };

  const handleDownload = (roomId) => {
    const a = document.createElement('a');
    a.href = `/api/rooms/${encodeURIComponent(roomId)}`;
    a.download = `${roomId}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  };

  const handleDelete = async (roomId, e) => {
    e.stopPropagation();
    if (!window.confirm(`Tem certeza que deseja excluir o projeto "${roomId}" de ${roomsDir}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao excluir projeto.');
      setActionMessage(`Projeto "${roomId}" excluído com sucesso.`);
      setTimeout(() => setActionMessage(''), 3000);
      fetchRooms();
    } catch (err) {
      alert(err.message || 'Erro ao excluir.');
    }
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    const clean = newRoomName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    if (!clean) return;
    handleOpenRoom(clean);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let roomName = file.name.replace(/\.[^/.]+$/, '');
      const res = await fetch('/api/rooms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          data: parsed,
          overwrite: false
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Falha ao importar.');

      setActionMessage(`Projeto "${resData.roomId}" importado com sucesso!`);
      setTimeout(() => setActionMessage(''), 3500);

      // Refresh and switch
      await fetchRooms();
      if (window.confirm(`Projeto "${resData.roomId}" importado! Deseja abri-lo agora?`)) {
        handleOpenRoom(resData.roomId);
      }
    } catch (err) {
      alert(`Falha ao importar arquivo JSON: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredRooms = rooms.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div 
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-xs">
              <FolderOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">Projetos em rooms</h3>
                <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  {rooms.length} {rooms.length === 1 ? 'salvo' : 'salvos'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono truncate max-w-md" title={roomsDir}>
                {roomsDir}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action message banner */}
        {actionMessage && (
          <div className="bg-emerald-50 border-b border-emerald-100 text-emerald-700 px-5 py-2 text-xs font-semibold flex items-center gap-2">
            <Check size={14} className="text-emerald-600" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projeto por nome..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchRooms}
              disabled={loading}
              title="Atualizar lista de arquivos"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200/80 transition-colors cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
            </button>

            {/* Import JSON button */}
            <label 
              title="Importar um arquivo JSON de projeto"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg border border-slate-200/80 transition-colors cursor-pointer"
            >
              <Upload size={14} className="text-blue-600" />
              <span>Importar JSON</span>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".json,application/json" 
                onChange={handleImportFile} 
                className="hidden" 
              />
            </label>

            {/* Create New Room button */}
            <button
              onClick={() => setIsCreating(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-xs shadow-blue-500/30 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>Novo Projeto</span>
            </button>
          </div>
        </div>

        {/* Inline Create Room Form */}
        {isCreating && (
          <form 
            onSubmit={handleCreateRoom}
            className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150"
          >
            <span className="text-xs font-semibold text-blue-800 whitespace-nowrap">Nome do projeto:</span>
            <input 
              ref={newRoomInputRef}
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="ex: reuniao-design, sprint-1"
              className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
            <button
              type="submit"
              disabled={!newRoomName.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Criar e Abrir
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-md hover:bg-blue-100/60 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </form>
        )}

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[260px] max-h-[50vh]">
          {loading && rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <RefreshCw size={28} className="animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Carregando projetos de rooms...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              <p className="font-semibold mb-1">Erro ao listar projetos</p>
              <p>{error}</p>
              <button 
                onClick={fetchRooms}
                className="mt-2 text-xs font-semibold text-rose-800 underline cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
              <FileText size={36} className="text-slate-300 mb-2 stroke-1" />
              {search ? (
                <>
                  <p className="text-xs font-semibold text-slate-600">Nenhum projeto encontrado para "{search}"</p>
                  <p className="text-[11px] text-slate-400 mt-1">Tente pesquisar com outro termo ou crie um novo projeto.</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-600">Nenhum projeto salvo encontrado em rooms</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                    Os projetos salvos na pasta <code>{roomsDir}</code> aparecerão aqui automaticamente.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredRooms.map((r) => {
              const isCurrent = r.id === currentRoomId;
              const dateStr = r.updatedAt 
                ? new Date(r.updatedAt).toLocaleString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })
                : 'Recente';

              return (
                <div
                  key={r.id}
                  onClick={() => !isCurrent && handleOpenRoom(r.id)}
                  className={`group p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isCurrent 
                      ? 'bg-blue-50/60 border-blue-200 ring-1 ring-blue-500/20' 
                      : 'bg-white hover:bg-slate-50/90 border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-xs cursor-pointer'
                  }`}
                >
                  {/* Left: icon & details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isCurrent 
                        ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30' 
                        : 'bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700 transition-colors'
                    }`}>
                      <FileText size={18} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-sm truncate max-w-[200px] sm:max-w-[280px]">
                          {r.name}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                            Aberta agora
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1" title="Data da última modificação">
                          <Clock size={12} className="text-slate-400" />
                          <span>{dateStr}</span>
                        </span>

                        <span className="flex items-center gap-1" title="Páginas do quadro">
                          <Layers size={12} className="text-slate-400" />
                          <span>{r.pagesCount || 1} {r.pagesCount === 1 ? 'pág.' : 'págs.'}</span>
                        </span>

                        {r.elementsCount !== undefined && (
                          <span className="text-slate-400" title="Quantidade de desenhos/elementos">
                            • {r.elementsCount} {r.elementsCount === 1 ? 'elemento' : 'elementos'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenNewTab(r.id)}
                      title="Abrir em nova aba"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <ExternalLink size={15} />
                    </button>

                    <button
                      onClick={() => handleDownload(r.id)}
                      title="Baixar arquivo JSON deste projeto"
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Download size={15} />
                    </button>

                    {!isCurrent && (
                      <button
                        onClick={(e) => handleDelete(r.id, e)}
                        title="Excluir arquivo do projeto"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                    {isCurrent ? (
                      <span className="ml-1 px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-100/80 rounded-lg border border-blue-200">
                        Em uso
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOpenRoom(r.id)}
                        className="ml-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-xs shadow-blue-500/20 transition-all cursor-pointer"
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 truncate max-w-sm">
            <span className="font-medium text-slate-600">Local:</span>
            <span className="font-mono text-[11px] text-slate-600 truncate" title={roomsDir}>
              {roomsDir}
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-medium shadow-2xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

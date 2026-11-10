import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { USER_COLORS } from '../constants';

export default function UserNameModal({ isOpen, onClose, currentUser, onSave }) {
  const [name, setName] = useState(currentUser?.name || '');
  const [selectedColor, setSelectedColor] = useState(currentUser?.color || USER_COLORS[0]);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || '');
      setSelectedColor(currentUser?.color || USER_COLORS[0]);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), color: selectedColor });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">Seu Perfil no Quadro</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Seu Nome ou Apelido
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Giovanni, Ana..."
              maxLength={24}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Cor do seu Cursor e Avatar
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {USER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-8 h-8 rounded-full cursor-pointer transition-transform flex items-center justify-center ${
                    selectedColor === c ? 'scale-115 ring-2 ring-slate-800 ring-offset-2' : 'hover:scale-105'
                  }`}
                >
                  {selectedColor === c && <Check size={16} className="text-white drop-shadow-sm" />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer active:scale-98"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

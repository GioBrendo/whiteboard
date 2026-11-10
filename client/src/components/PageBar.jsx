import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function PageBar({ pages, activePageId, onSelect, onAdd, onRemove }) {
  const canRemove = pages.length > 1;

  return (
    <div className="fixed top-28 left-2 sm:top-auto sm:bottom-20 sm:left-6 z-30 flex flex-col items-center gap-2 select-none max-h-[45vh] overflow-y-auto no-scrollbar">
      <div className="flex flex-col gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-slate-200/90">
        {pages.map((page, index) => (
          <button
            key={page.id}
            onClick={() => onSelect(page.id)}
            title={`Página ${index + 1}`}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              page.id === activePageId
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {index + 1}
          </button>
        ))}

        <button
          onClick={onAdd}
          title="Nova página"
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-slate-600 hover:bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center cursor-pointer transition-colors"
        >
          <Plus size={16} />
        </button>

        <div className="w-6 h-px bg-slate-200 my-0.5 mx-auto" />

        <button
          onClick={onRemove}
          title={canRemove ? 'Remover página atual' : 'Limpar página atual'}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

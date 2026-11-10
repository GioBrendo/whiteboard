import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { X } from 'lucide-react';
import { texToSvg } from '../utils/latex';

const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

// { antes, depois } = texto inserido e onde o cursor fica (entre os dois)
const SNIPPETS = {
  '\\frac': { before: '\\frac{', after: '}{}' },
  '\\dfrac': { before: '\\dfrac{', after: '}{}' },
  '\\sqrt': { before: '\\sqrt{', after: '}' },
  '\\text': { before: '\\text{', after: '}' },
  '\\overline': { before: '\\overline{', after: '}' },
  '\\vec': { before: '\\vec{', after: '}' },
  '\\hat': { before: '\\hat{', after: '}' },
  '\\bar': { before: '\\bar{', after: '}' },
  '\\left': { before: '\\left(', after: '\\right)' }
};

const sym = (label, command) => ({ label, title: command, before: `${command} `, after: '' });
const op = (label, command) => ({ label, title: command, before: `${command}_{`, after: '}^{}' });

const PALETTE = [
  {
    name: 'Estruturas',
    items: [
      { label: 'a/b', title: '\\frac', before: '\\frac{', after: '}{}' },
      { label: 'A/B', title: '\\dfrac', before: '\\dfrac{', after: '}{}' },
      { label: '√', title: '\\sqrt', before: '\\sqrt{', after: '}' },
      { label: 'xⁿ', title: '^{}', before: '^{', after: '}' },
      { label: 'xₙ', title: '_{}', before: '_{', after: '}' },
      { label: '( )', title: '\\left( \\right)', before: '\\left(', after: '\\right)' },
      { label: '[ ]', title: '\\left[ \\right]', before: '\\left[', after: '\\right]' },
      { label: '| |', title: '\\left| \\right|', before: '\\left|', after: '\\right|' },
      { label: 'abc', title: '\\text', before: '\\text{', after: '}' },
      { label: 'v→', title: '\\vec', before: '\\vec{', after: '}' },
      { label: 'x̄', title: '\\overline', before: '\\overline{', after: '}' },
      { label: 'x̂', title: '\\hat', before: '\\hat{', after: '}' },
      { label: 'casos', title: '\\begin{cases}', before: '\\begin{cases}\n', after: '\n\\end{cases}' },
      { label: 'matriz', title: '\\begin{pmatrix}', before: '\\begin{pmatrix}\n', after: '\n\\end{pmatrix}' }
    ]
  },
  {
    name: 'Gregas',
    items: [
      sym('α', '\\alpha'), sym('β', '\\beta'), sym('γ', '\\gamma'), sym('δ', '\\delta'),
      sym('ε', '\\epsilon'), sym('θ', '\\theta'), sym('λ', '\\lambda'), sym('μ', '\\mu'),
      sym('π', '\\pi'), sym('ρ', '\\rho'), sym('σ', '\\sigma'), sym('τ', '\\tau'),
      sym('φ', '\\phi'), sym('ω', '\\omega'), sym('Γ', '\\Gamma'), sym('Δ', '\\Delta'),
      sym('Θ', '\\Theta'), sym('Λ', '\\Lambda'), sym('Π', '\\Pi'), sym('Σ', '\\Sigma'),
      sym('Φ', '\\Phi'), sym('Ω', '\\Omega')
    ]
  },
  {
    name: 'Operadores',
    items: [
      sym('×', '\\times'), sym('·', '\\cdot'), sym('÷', '\\div'), sym('±', '\\pm'),
      sym('≤', '\\leq'), sym('≥', '\\geq'), sym('≠', '\\neq'), sym('≈', '\\approx'),
      sym('∞', '\\infty'), sym('∂', '\\partial'), sym('∇', '\\nabla'), sym('→', '\\rightarrow'),
      sym('⇒', '\\Rightarrow'), sym('∈', '\\in'), sym('⊂', '\\subset'), sym('∪', '\\cup'),
      sym('∩', '\\cap'), sym('…', '\\ldots'),
      op('∑', '\\sum'), op('∏', '\\prod'), op('∫', '\\int'), op('∮', '\\oint'),
      { label: 'lim', title: '\\lim', before: '\\lim_{x \\to ', after: '}' }
    ]
  }
];

const GREEK_CMDS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho',
  'sigma', 'tau', 'phi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma',
  'Phi', 'Omega'
]);

const STRUCT_CMDS = new Set([
  'frac', 'dfrac', 'sqrt', 'text', 'left', 'right', 'begin', 'end', 'overline', 'vec',
  'hat', 'bar', 'mathbf', 'mathrm'
]);

const OP_CMDS = new Set([
  'times', 'cdot', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx', 'infty', 'partial',
  'nabla', 'rightarrow', 'Rightarrow', 'in', 'subset', 'cup', 'cap', 'sum', 'prod', 'int',
  'oint', 'lim', 'to', 'ldots', 'cdots'
]);

const TOKEN_RE = /(\\[a-zA-Z]+)|(\\.)|([{}])|([()[\]])|(\d+(?:\.\d+)?)|([\^_])|(%[^\n]*)/g;

function commandClass(command) {
  const name = command.slice(1);
  if (GREEK_CMDS.has(name)) return 'text-teal-600 font-semibold';
  if (STRUCT_CMDS.has(name)) return 'text-blue-600 font-semibold';
  if (OP_CMDS.has(name)) return 'text-fuchsia-600 font-semibold';
  return 'text-blue-500';
}

// Divide o código em pedaços coloridos: comandos, chaves (alternando a cor
// por nível de aninhamento), parênteses, números, ^/_ e comentários.
function tokenizeLatex(text) {
  const tokens = [];
  let last = 0;
  let depth = 0;

  for (const match of text.matchAll(TOKEN_RE)) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index) });

    let cls = '';
    if (match[1]) {
      cls = commandClass(match[1]);
    } else if (match[2]) {
      cls = 'text-amber-700';
    } else if (match[3]) {
      if (match[0] === '{') {
        cls = depth % 2 === 0 ? 'text-amber-600' : 'text-violet-600';
        depth += 1;
      } else {
        depth = Math.max(0, depth - 1);
        cls = depth % 2 === 0 ? 'text-amber-600' : 'text-violet-600';
      }
    } else if (match[4]) {
      cls = 'text-slate-500';
    } else if (match[5]) {
      cls = 'text-emerald-600';
    } else if (match[6]) {
      cls = 'text-fuchsia-600';
    } else if (match[7]) {
      cls = 'text-slate-400 italic';
    }

    tokens.push({ text: match[0], cls });
    last = match.index + match[0].length;
  }

  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

export default function LatexModal({ initialTex = '', onInsert, onClose }) {
  const [tex, setTex] = useState(initialTex);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [paletteTab, setPaletteTab] = useState(PALETTE[0].name);
  const textareaRef = useRef(null);
  const preRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setError('');
      if (!tex.trim()) {
        setPreview(null);
        return;
      }
      try {
        const result = await texToSvg(tex);
        if (!cancelled) setPreview(result);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err.message || 'Fórmula inválida.');
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tex]);

  const applyEdit = (next, selStart, selEnd = selStart) => {
    // flushSync garante que o textarea já tenha o texto novo antes de
    // reposicionar o cursor, mesmo digitando rápido.
    flushSync(() => setTex(next));
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(selStart, selEnd);
  };

  const insertAtCursor = (before, after) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? tex.length;
    const end = el.selectionEnd ?? start;
    const selected = tex.slice(start, end);
    const next = tex.slice(0, start) + before + selected + after + tex.slice(end);
    applyEdit(next, start + before.length, start + before.length + selected.length);
  };

  // \frac + espaço/Tab vira \frac{}{} com o cursor no primeiro campo
  const expandCommand = () => {
    const el = textareaRef.current;
    if (!el) return false;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = tex.slice(0, start);
    const match = before.match(/\\([a-zA-Z]+)$/);
    const snippet = match && SNIPPETS[match[0]];
    if (!snippet) return false;

    const from = start - match[0].length;
    const next = tex.slice(0, from) + snippet.before + snippet.after + tex.slice(end);
    applyEdit(next, from + snippet.before.length);
    return true;
  };

  const handleKeyDown = (e) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const key = e.key;

    if ((e.ctrlKey || e.metaKey) && key === 'Enter') {
      if (preview) {
        e.preventDefault();
        onInsert({ tex, ...preview });
      }
      return;
    }

    if (key === 'Tab') {
      e.preventDefault();
      expandCommand();
      return;
    }

    if (key === ' ') {
      if (start === end && expandCommand()) e.preventDefault();
      return;
    }

    if (PAIRS[key]) {
      // \{ e \[ são comandos literais, não devem fechar sozinhos
      if (tex[start - 1] === '\\') return;
      e.preventDefault();
      insertAtCursor(key, PAIRS[key]);
      return;
    }

    if (CLOSERS.has(key)) {
      // Se o fechamento já está ali, só passa o cursor por cima
      if (start === end && tex[start] === key) {
        e.preventDefault();
        // Em \frac{}{}, depois do primeiro campo o cursor entra no segundo
        const insideNext = key === '}' && tex[start + 1] === '{' && tex[start + 2] === '}';
        applyEdit(tex, insideNext ? start + 2 : start + 1);
      }
      return;
    }

    if (key === '^' || key === '_') {
      if (tex[start] === '{') return;
      e.preventDefault();
      insertAtCursor(`${key}{`, '}');
      return;
    }

    if (key === 'Backspace' && start === end && start > 0) {
      const open = tex[start - 1];
      if (PAIRS[open] && PAIRS[open] === tex[start]) {
        e.preventDefault();
        applyEdit(tex.slice(0, start - 1) + tex.slice(start + 1), start - 1);
      }
    }
  };

  const syncScroll = (e) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = e.target.scrollTop;
    preRef.current.scrollLeft = e.target.scrollLeft;
  };

  const palette = PALETTE.find((group) => group.name === paletteTab) || PALETTE[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Fórmula LaTeX</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Código com cores: o textarea fica transparente sobre o texto colorido */}
        <div className="relative">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 p-3 font-mono text-sm leading-6 whitespace-pre-wrap break-words overflow-hidden pointer-events-none rounded-xl border border-transparent"
          >
            {tokenizeLatex(tex).map((token, index) => (
              <span key={index} className={token.cls}>{token.text}</span>
            ))}
            {'\n'}
          </pre>
          <textarea
            ref={textareaRef}
            autoFocus
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            placeholder="Ex.: \frac{a}{b} = \sqrt{c}"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Código LaTeX"
            className="relative w-full h-28 font-mono text-sm leading-6 p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-400 resize-none bg-transparent text-transparent caret-slate-900 placeholder:text-slate-400 selection:bg-blue-200/60 break-words"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Tab completa comandos como <span className="font-mono">\frac</span> · Ctrl+Enter insere
        </p>

        {/* Paleta de símbolos */}
        <div className="mt-3 flex items-center gap-1">
          {PALETTE.map((group) => (
            <button
              key={group.name}
              onClick={() => setPaletteTab(group.name)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                paletteTab === group.name
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2">
          {palette.items.map((item) => (
            <button
              key={item.title}
              title={item.title}
              onClick={() => insertAtCursor(item.before, item.after)}
              className="h-9 min-w-9 px-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm hover:bg-blue-50 hover:border-blue-300 active:scale-95 cursor-pointer transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-[64px] flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 p-3 overflow-auto">
          {preview ? (
            <img src={preview.dataUrl} alt="Prévia" style={{ maxHeight: 120, maxWidth: '100%' }} />
          ) : (
            <span className="text-xs text-slate-400">
              {error || 'Digite para ver a prévia'}
            </span>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            disabled={!preview}
            onClick={() => onInsert({ tex, ...preview })}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Inserir
          </button>
        </div>
      </div>
    </div>
  );
}

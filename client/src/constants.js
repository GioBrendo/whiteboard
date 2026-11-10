export const TOOLS = {
  SELECT: 'select',
  SELECT_RECT: 'select_rect',
  SELECT_LASSO: 'select_lasso',
  HAND: 'hand',
  PENCIL: 'pencil',
  HIGHLIGHTER: 'highlighter',
  ERASER: 'eraser',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  LINE: 'line',
  ARROW: 'arrow',
  TEXT: 'text',
  STICKY: 'sticky',
  LATEX: 'latex'
};

export const BACKGROUND_COLORS = [
  '#f8fafc',
  '#ffffff',
  '#fef9c3',
  '#e0f2fe',
  '#dcfce7',
  '#fce7f3'
];

export const COLOR_PALETTE = [
  { name: 'Preto', value: '#1e293b' },
  { name: 'Cinza', value: '#64748b' },
  { name: 'Vermelho', value: '#ef4444' },
  { name: 'Laranja', value: '#f97316' },
  { name: 'Amarelo', value: '#eab308' },
  { name: 'Verde', value: '#10b981' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Roxo', value: '#8b5cf6' },
  { name: 'Rosa', value: '#ec4899' }
];

export const STICKY_COLORS = [
  { name: 'Amarelo', bg: '#fef08a', text: '#713f12', border: '#facc15' },
  { name: 'Verde', bg: '#bbf7d0', text: '#14532d', border: '#86efac' },
  { name: 'Azul', bg: '#bfdbfe', text: '#1e3a8a', border: '#93c5fd' },
  { name: 'Rosa', bg: '#fbcfe8', text: '#831843', border: '#f472b6' },
  { name: 'Roxo', bg: '#e9d5ff', text: '#581c87', border: '#d8b4fe' }
];

export const STROKE_WIDTHS = [
  { label: 'Fino', value: 2 },
  { label: 'Médio', value: 4 },
  { label: 'Grosso', value: 8 },
  { label: 'Extra', value: 14 }
];

export const USER_COLORS = [
  '#ef4444',
  '#f97316',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6'
];

export function slugifyRoomName(name) {
  if (typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

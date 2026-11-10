const CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
let loading = null;
const cache = new Map();

export function ensureMathJax() {
  if (window.MathJax?.tex2svg) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CDN;
    script.async = true;
    script.onload = () => {
      const mj = window.MathJax;
      if (!mj) {
        reject(new Error('MathJax não carregou.'));
        return;
      }
      (mj.startup?.promise || Promise.resolve()).then(() => resolve());
    };
    script.onerror = () => reject(new Error('Falha ao carregar MathJax. Verifique a internet.'));
    document.head.appendChild(script);
  });

  // Deixa tentar de novo depois de uma falha de rede/CDN
  loading.catch(() => { loading = null; });
  return loading;
}

export async function texToSvg(tex) {
  if (cache.has(tex)) return cache.get(tex);

  await ensureMathJax();
  const node = window.MathJax.tex2svg(tex, { display: true });
  const svg = node.querySelector('svg');
  if (!svg) throw new Error('Fórmula inválida.');
  // MathJax desenha um retângulo preto quando o TeX tem erro de sintaxe
  if (node.querySelector('merror, [data-mjx-error]')) throw new Error('Fórmula inválida.');

  const viewBox = (svg.getAttribute('viewBox') || '0 0 1000 400').split(/\s+/).map(Number);
  // O viewBox do MathJax usa 1000 unidades por em: sem isso a fórmula sai
  // com milhares de pixels de largura.
  const base = 0.02;
  const maxWidth = Math.max(120, window.innerWidth * 0.8);
  const maxHeight = Math.max(80, window.innerHeight * 0.6);
  const fit = Math.min(1, maxWidth / (viewBox[2] * base), maxHeight / (viewBox[3] * base));
  const scale = base * fit;
  const width = Math.max(1, viewBox[2] * scale);
  const height = Math.max(1, viewBox[3] * scale);

  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const markup = new XMLSerializer().serializeToString(svg);
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  const result = { dataUrl, width, height };
  cache.set(tex, result);
  return result;
}

const cache = new Map();
let onLoad = () => {};

export function setImageLoadHandler(fn) {
  onLoad = fn;
}

export function getCachedImage(src) {
  if (!src) return null;
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => onLoad();
    img.onerror = () => onLoad();
    img.src = src;
    cache.set(src, img);
    return null;
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function loadImage(src) {
  const cached = cache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  if (cached?.complete && cached.naturalWidth === 0) {
    return Promise.reject(new Error('Falha ao carregar imagem.'));
  }
  return new Promise((resolve, reject) => {
    const img = cached || new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      onLoad();
      resolve(img);
    };
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    if (!cached) {
      cache.set(src, img);
      img.src = src;
    }
  });
}

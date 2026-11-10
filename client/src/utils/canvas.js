import { getCachedImage } from './images';

/**
 * Canvas drawing utilities and rendering engine for Whiteboard
 */

// Draw an arrowhead at (x2, y2) pointing in direction from (x1, y1)
export function drawArrowHead(ctx, x1, y1, x2, y2, size = 18) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - size * Math.cos(angle - Math.PI / 6),
    y2 - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - (size * 0.7) * Math.cos(angle),
    y2 - (size * 0.7) * Math.sin(angle)
  );
  ctx.lineTo(
    x2 - size * Math.cos(angle + Math.PI / 6),
    y2 - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Render a single element onto canvas
export function renderElement(ctx, el) {
  ctx.save();

  if (el.type === 'pencil' || el.type === 'highlighter') {
    if (!el.points || el.points.length === 0) {
      ctx.restore();
      return;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'highlighter') {
      ctx.strokeStyle = el.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(16, (el.width || 4) * 3);
    } else {
      ctx.strokeStyle = el.color;
      ctx.globalAlpha = 1;
      ctx.lineWidth = el.width || 4;
    }

    ctx.beginPath();
    if (el.points.length === 1) {
      const pt = el.points[0];
      ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else if (el.points.length === 2) {
      ctx.moveTo(el.points[0].x, el.points[0].y);
      ctx.lineTo(el.points[1].x, el.points[1].y);
      ctx.stroke();
    } else {
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length - 1; i++) {
        const xc = (el.points[i].x + el.points[i + 1].x) / 2;
        const yc = (el.points[i].y + el.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
      }
      ctx.lineTo(
        el.points[el.points.length - 1].x,
        el.points[el.points.length - 1].y
      );
      ctx.stroke();
    }
  } else if (el.type === 'line') {
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width || 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(el.startX, el.startY);
    ctx.lineTo(el.endX, el.endY);
    ctx.stroke();
  } else if (el.type === 'arrow') {
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width || 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(el.startX, el.startY);
    ctx.lineTo(el.endX, el.endY);
    ctx.stroke();
    drawArrowHead(ctx, el.startX, el.startY, el.endX, el.endY, Math.max(14, (el.width || 4) * 3.5));
  } else if (el.type === 'rectangle') {
    const x = Math.min(el.startX, el.endX);
    const y = Math.min(el.startY, el.endY);
    const w = Math.abs(el.endX - el.startX);
    const h = Math.abs(el.endY - el.startY);

    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, 8);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
    }

    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width || 4;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 8);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.stroke();
  } else if (el.type === 'circle') {
    const rx = Math.abs(el.endX - el.startX) / 2;
    const ry = Math.abs(el.endY - el.startY) / 2;
    const cx = Math.min(el.startX, el.endX) + rx;
    const cy = Math.min(el.startY, el.endY) + ry;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);

    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fill();
    }

    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width || 4;
    ctx.stroke();
  } else if (el.type === 'text') {
    ctx.fillStyle = el.color;
    const fontSize = el.fontSize || 20;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    const lines = (el.text || '').split('\n');
    lines.forEach((line, index) => {
      ctx.fillText(line, el.x, el.y + index * (fontSize * 1.3));
    });
  } else if (el.type === 'sticky') {
    const w = el.width || 180;
    const h = el.height || 180;
    const x = el.x;
    const y = el.y;

    // Sticky shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    // Sticky background
    ctx.fillStyle = el.bg || '#fef08a';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 8);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.restore();

    // Sticky border
    ctx.strokeStyle = el.border || '#facc15';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sticky text
    ctx.fillStyle = el.textColor || '#713f12';
    const fontSize = 16;
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    // Simple word wrapping for sticky note text
    const padding = 16;
    const maxWidth = w - padding * 2;
    const lines = wrapText(ctx, el.text || 'Escreva algo...', maxWidth);

    lines.forEach((line, index) => {
      if ((index + 1) * (fontSize * 1.35) <= h - padding) {
        ctx.fillText(line, x + padding, y + padding + index * (fontSize * 1.35));
      }
    });
  } else if (el.type === 'image' || el.type === 'latex') {
    const img = getCachedImage(el.type === 'latex' ? el.svg : el.src);
    if (img) {
      ctx.drawImage(img, el.x, el.y, el.width, el.height);
    }
  }

  ctx.restore();
}

// Word wrap helper for canvas text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [''];
}

// Hit-testing to determine if a point touches an element (for Eraser or Select)
export function isPointHittingElement(pt, el, tolerance = 10) {
  if (el.type === 'pencil' || el.type === 'highlighter') {
    if (!el.points) return false;
    const threshold = tolerance + (el.width || 4);
    if (el.points.length === 1) {
      const p = el.points[0];
      return Math.hypot(pt.x - p.x, pt.y - p.y) <= threshold;
    }
    for (let i = 0; i < el.points.length - 1; i++) {
      const d = distanceToSegment(
        pt.x,
        pt.y,
        el.points[i].x,
        el.points[i].y,
        el.points[i + 1].x,
        el.points[i + 1].y
      );
      if (d <= threshold) return true;
    }
    return false;
  }

  if (el.type === 'line' || el.type === 'arrow') {
    const threshold = tolerance + (el.width || 4);
    return distanceToSegment(pt.x, pt.y, el.startX, el.startY, el.endX, el.endY) <= threshold;
  }

  if (el.type === 'rectangle') {
    const minX = Math.min(el.startX, el.endX) - tolerance;
    const maxX = Math.max(el.startX, el.endX) + tolerance;
    const minY = Math.min(el.startY, el.endY) - tolerance;
    const maxY = Math.max(el.startY, el.endY) + tolerance;
    return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
  }

  if (el.type === 'circle') {
    const rx = Math.abs(el.endX - el.startX) / 2;
    const ry = Math.abs(el.endY - el.startY) / 2;
    const cx = Math.min(el.startX, el.endX) + rx;
    const cy = Math.min(el.startY, el.endY) + ry;
    // Check normalized distance
    const normDist =
      Math.pow((pt.x - cx) / (rx + tolerance), 2) +
      Math.pow((pt.y - cy) / (ry + tolerance), 2);
    return normDist <= 1;
  }

  if (el.type === 'text') {
    const fontSize = el.fontSize || 20;
    const lines = (el.text || '').split('\n');
    const height = lines.length * (fontSize * 1.3);
    const approxWidth = Math.max(...lines.map(l => l.length * fontSize * 0.6), 50);
    return (
      pt.x >= el.x - tolerance &&
      pt.x <= el.x + approxWidth + tolerance &&
      pt.y >= el.y - tolerance &&
      pt.y <= el.y + height + tolerance
    );
  }

  if (el.type === 'sticky') {
    const w = el.width || 180;
    const h = el.height || 180;
    return pt.x >= el.x && pt.x <= el.x + w && pt.y >= el.y && pt.y <= el.y + h;
  }

  if (el.type === 'image' || el.type === 'latex') {
    const w = el.width || 100;
    const h = el.height || 40;
    return (
      pt.x >= el.x - tolerance &&
      pt.x <= el.x + w + tolerance &&
      pt.y >= el.y - tolerance &&
      pt.y <= el.y + h + tolerance
    );
  }

  return false;
}

// Check if a point hits any resize handle of an element
export function getResizeHandle(el, pt, zoom, tolerance = 12) {
  if (!el || !['image', 'latex', 'rectangle'].includes(el.type)) return null;
  const x = el.type === 'rectangle' ? Math.min(el.startX, el.endX) : el.x;
  const y = el.type === 'rectangle' ? Math.min(el.startY, el.endY) : el.y;
  const w = el.type === 'rectangle' ? Math.abs(el.endX - el.startX) : (el.width || 180);
  const h = el.type === 'rectangle' ? Math.abs(el.endY - el.startY) : (el.height || 180);

  const radius = tolerance / zoom;
  const corners = [
    { handle: 'nw', x: x - 4, y: y - 4 },
    { handle: 'ne', x: x + w + 4, y: y - 4 },
    { handle: 'se', x: x + w + 4, y: y + h + 4 },
    { handle: 'sw', x: x - 4, y: y + h + 4 }
  ];

  for (const c of corners) {
    if (Math.hypot(pt.x - c.x, pt.y - c.y) <= radius) {
      return c.handle;
    }
  }
  return null;
}

// Render selection bounding box and corner handles
export function renderSelectionBox(ctx, el, zoom) {
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 5 / zoom]);

  let x, y, w, h;
  if (['rectangle', 'sticky', 'image', 'latex'].includes(el.type)) {
    x = el.type === 'rectangle' ? Math.min(el.startX, el.endX) : el.x;
    y = el.type === 'rectangle' ? Math.min(el.startY, el.endY) : el.y;
    w = el.type === 'rectangle' ? Math.abs(el.endX - el.startX) : (el.width || 180);
    h = el.type === 'rectangle' ? Math.abs(el.endY - el.startY) : (el.height || 180);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  } else if (el.type === 'circle') {
    const rx = Math.abs(el.endX - el.startX) / 2;
    const ry = Math.abs(el.endY - el.startY) / 2;
    const cx = Math.min(el.startX, el.endX) + rx;
    const cy = Math.min(el.startY, el.endY) + ry;
    x = cx - rx;
    y = cy - ry;
    w = rx * 2;
    h = ry * 2;
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  } else if (el.type === 'text') {
    const fontSize = el.fontSize || 20;
    const lines = (el.text || '').split('\n');
    w = Math.max(...lines.map(l => l.length * fontSize * 0.6), 50);
    h = lines.length * (fontSize * 1.3);
    x = el.x;
    y = el.y;
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  }

  // Draw corner handles if element is resizable
  if (x !== undefined && ['image', 'latex', 'rectangle'].includes(el.type)) {
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5 / zoom;
    const hs = 9 / zoom;
    const half = hs / 2;

    [
      { x: x - 4, y: y - 4 },
      { x: x + w + 4, y: y - 4 },
      { x: x + w + 4, y: y + h + 4 },
      { x: x - 4, y: y + h + 4 }
    ].forEach(c => {
      ctx.fillRect(c.x - half, c.y - half, hs, hs);
      ctx.strokeRect(c.x - half, c.y - half, hs, hs);
    });
  }

  ctx.restore();
}

// Get the bounding box of any element
export function getElementBounds(el) {
  if (!el) return null;
  if (el.type === 'pencil' || el.type === 'highlighter') {
    if (!el.points || el.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    el.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    const pad = (el.width || 4) / 2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  if (el.type === 'line' || el.type === 'arrow' || el.type === 'rectangle') {
    const minX = Math.min(el.startX, el.endX);
    const maxX = Math.max(el.startX, el.endX);
    const minY = Math.min(el.startY, el.endY);
    const maxY = Math.max(el.startY, el.endY);
    const pad = (el.width || 4) / 2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  if (el.type === 'circle') {
    const rx = Math.abs(el.endX - el.startX) / 2;
    const ry = Math.abs(el.endY - el.startY) / 2;
    const cx = Math.min(el.startX, el.endX) + rx;
    const cy = Math.min(el.startY, el.endY) + ry;
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }

  if (el.type === 'text') {
    const fontSize = el.fontSize || 20;
    const lines = (el.text || '').split('\n');
    const width = Math.max(...lines.map(l => l.length * fontSize * 0.6), 50);
    const height = lines.length * (fontSize * 1.3);
    return { minX: el.x, minY: el.y, maxX: el.x + width, maxY: el.y + height };
  }

  if (el.type === 'sticky') {
    const w = el.width || 180;
    const h = el.height || 180;
    return { minX: el.x, minY: el.y, maxX: el.x + w, maxY: el.y + h };
  }

  if (el.type === 'image' || el.type === 'latex') {
    const w = el.width || 100;
    const h = el.height || 40;
    return { minX: el.x, minY: el.y, maxX: el.x + w, maxY: el.y + h };
  }

  return null;
}

// Check if an element is inside or intersects with a selection rectangle
export function isElementInRect(el, rect) {
  const b = getElementBounds(el);
  if (!b) return false;
  return !(
    b.maxX < rect.minX ||
    b.minX > rect.maxX ||
    b.maxY < rect.minY ||
    b.minY > rect.maxY
  );
}

// Ray-casting point in polygon
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if an element is inside or intersects with a polygonal region (Lasso)
export function isElementInPolygon(el, polygon) {
  if (!polygon || polygon.length < 3) return false;

  // If pencil or highlighter, check if any point is in polygon
  if (el.type === 'pencil' || el.type === 'highlighter') {
    if (!el.points || el.points.length === 0) return false;
    const step = Math.max(1, Math.floor(el.points.length / 20));
    for (let i = 0; i < el.points.length; i += step) {
      if (isPointInPolygon(el.points[i], polygon)) return true;
    }
    return false;
  }

  const b = getElementBounds(el);
  if (!b) return false;

  // Check center point
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (isPointInPolygon(center, polygon)) return true;

  // Check 4 corners
  const corners = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY }
  ];
  return corners.some(c => isPointInPolygon(c, polygon));
}

// Get the unified bounding box of a list of elements
export function getGroupBounds(elements) {
  if (!elements || elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;

  elements.forEach(el => {
    const b = getElementBounds(el);
    if (b) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
      count++;
    }
  });

  if (count === 0) return null;
  return { minX, minY, maxX, maxY };
}

// Draw the in-progress rectangular marquee selection box
export function renderMarqueeBox(ctx, box, zoom) {
  if (!box) return;
  const x = Math.min(box.startX, box.endX);
  const y = Math.min(box.startY, box.endY);
  const w = Math.abs(box.endX - box.startX);
  const h = Math.abs(box.endY - box.startY);

  ctx.save();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

// Draw the in-progress lasso polygon selection region
export function renderLassoRegion(ctx, points, zoom) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Render group selection outline
export function renderGroupSelection(ctx, bounds, zoom) {
  if (!bounds) return;
  const x = bounds.minX - 6;
  const y = bounds.minY - 6;
  const w = bounds.maxX - bounds.minX + 12;
  const h = bounds.maxY - bounds.minY + 12;

  ctx.save();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 5 / zoom]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  // Corner indicators
  ctx.setLineDash([]);
  ctx.fillStyle = '#2563eb';
  const size = 6 / zoom;
  const half = size / 2;
  [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ].forEach(pt => {
    ctx.fillRect(pt.x - half, pt.y - half, size, size);
  });

  ctx.restore();
}

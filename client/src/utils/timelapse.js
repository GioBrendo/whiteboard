import { getElementBounds } from './canvas';

export function formatTime(ms) {
  if (!ms || isNaN(ms)) return '00:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Compute bounding box for all elements across initial state and events
export function computeEventsBounds(initialElements = [], events = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBoundsWithEl(el) {
    if (!el) return;
    const b = getElementBounds(el);
    if (b) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
  }

  initialElements.forEach(updateBoundsWithEl);

  events.forEach(ev => {
    if (ev.element) updateBoundsWithEl(ev.element);
    if (ev.elements && Array.isArray(ev.elements)) ev.elements.forEach(updateBoundsWithEl);
    if (ev.point) {
      minX = Math.min(minX, ev.point.x);
      minY = Math.min(minY, ev.point.y);
      maxX = Math.max(maxX, ev.point.x);
      maxY = Math.max(maxY, ev.point.y);
    }
    if (ev.startX !== undefined && ev.endX !== undefined) {
      minX = Math.min(minX, ev.startX, ev.endX);
      minY = Math.min(minY, ev.startY, ev.endY);
      maxX = Math.max(maxX, ev.startX, ev.endX);
      maxY = Math.max(maxY, ev.startY, ev.endY);
    }
  });

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 1280, maxY: 720, width: 1280, height: 720 };
  }

  const padding = 60;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(640, Math.ceil(maxX - minX)),
    height: Math.max(400, Math.ceil(maxY - minY))
  };
}

// Reconstruct element list at given timeMs
export function reconstructElementsAtTime(initialElements = [], events = [], timeMs = 0) {
  const map = new Map();

  // Initial state
  initialElements.forEach(el => {
    map.set(el.id, JSON.parse(JSON.stringify(el)));
  });

  // Apply events up to timeMs
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.timestamp > timeMs) break;

    switch (ev.type) {
      case 'stroke_start': {
        map.set(ev.id, {
          id: ev.id,
          pageId: ev.pageId,
          type: ev.tool,
          color: ev.color,
          width: ev.width,
          points: [...ev.points]
        });
        break;
      }
      case 'stroke_point': {
        const item = map.get(ev.id);
        if (item && item.points) {
          item.points.push(ev.point);
        }
        break;
      }
      case 'stroke_end':
      case 'element_commit':
      case 'element_add':
      case 'element_update': {
        if (ev.element && ev.element.id) {
          map.set(ev.element.id, JSON.parse(JSON.stringify(ev.element)));
        }
        break;
      }
      case 'shape_start': {
        map.set(ev.id, {
          id: ev.id,
          pageId: ev.pageId,
          type: ev.tool,
          color: ev.color,
          width: ev.width,
          fill: ev.fill,
          startX: ev.startX,
          startY: ev.startY,
          endX: ev.endX,
          endY: ev.endY
        });
        break;
      }
      case 'shape_update': {
        const item = map.get(ev.id);
        if (item) {
          item.endX = ev.endX;
          item.endY = ev.endY;
        }
        break;
      }
      case 'elements_delete': {
        if (Array.isArray(ev.elementIds)) {
          ev.elementIds.forEach(id => map.delete(id));
        }
        break;
      }
      case 'clear': {
        map.clear();
        break;
      }
      case 'batch_add':
      case 'batch_update': {
        if (Array.isArray(ev.elements)) {
          ev.elements.forEach(el => map.set(el.id, JSON.parse(JSON.stringify(el))));
        }
        break;
      }
      case 'batch_delete': {
        if (Array.isArray(ev.elementIds)) {
          ev.elementIds.forEach(id => map.delete(id));
        }
        break;
      }
      default:
        break;
    }
  }

  return Array.from(map.values());
}

// Synthesize animation events from canvas elements when no manual REC was made
export function generateSyntheticEvents(elements = [], bg = { color: '#f8fafc', grid: 'dots' }) {
  if (!elements || elements.length === 0) {
    return {
      events: [],
      totalDuration: 1000,
      initialElements: [],
      bg,
      isLiveRecorded: false
    };
  }

  const events = [];
  let currentTime = 150;

  elements.forEach((el) => {
    if (el.type === 'pencil' || el.type === 'highlighter') {
      const points = el.points || [];
      if (points.length === 0) return;

      events.push({
        type: 'stroke_start',
        id: el.id,
        tool: el.type,
        color: el.color,
        width: el.width,
        points: [points[0]],
        timestamp: currentTime
      });

      // Distribute points over 200ms - 1200ms
      const strokeDuration = Math.min(1200, Math.max(200, points.length * 15));
      const step = strokeDuration / Math.max(1, points.length - 1);

      for (let i = 1; i < points.length; i++) {
        events.push({
          type: 'stroke_point',
          id: el.id,
          point: points[i],
          timestamp: Math.round(currentTime + i * step)
        });
      }

      currentTime += strokeDuration;
      events.push({
        type: 'stroke_end',
        id: el.id,
        element: el,
        timestamp: currentTime
      });
      currentTime += 60;
    } else if (['rectangle', 'circle', 'line', 'arrow'].includes(el.type)) {
      events.push({
        type: 'shape_start',
        id: el.id,
        tool: el.type,
        color: el.color,
        width: el.width,
        fill: el.fill,
        startX: el.startX,
        startY: el.startY,
        endX: el.startX,
        endY: el.startY,
        timestamp: currentTime
      });

      const shapeDuration = 350;
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const factor = i / steps;
        events.push({
          type: 'shape_update',
          id: el.id,
          endX: el.startX + (el.endX - el.startX) * factor,
          endY: el.startY + (el.endY - el.startY) * factor,
          timestamp: Math.round(currentTime + i * (shapeDuration / steps))
        });
      }

      currentTime += shapeDuration;
      events.push({
        type: 'element_commit',
        element: el,
        timestamp: currentTime
      });
      currentTime += 60;
    } else {
      // Text, sticky note, image, latex
      events.push({
        type: 'element_add',
        element: el,
        timestamp: currentTime
      });
      currentTime += 300;
    }
  });

  return {
    events,
    totalDuration: Math.max(1500, currentTime + 200),
    initialElements: [],
    bg,
    isLiveRecorded: false
  };
}

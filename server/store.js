import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dataDir = process.env.WB_DATA_DIR || path.join(__dirname, 'data');
export const roomsDir = process.env.WB_ROOMS_DIR || (process.env.WB_DATA_DIR ? path.join(process.env.WB_DATA_DIR, 'rooms') : path.join(__dirname, '..', 'rooms'));
export const uploadsDir = path.join(dataDir, 'uploads');

fs.mkdirSync(roomsDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const rooms = new Map();
const timers = new Map();

export function slugifyRoomId(name) {
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

export function sanitizeRoomId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export function newPage() {
  return {
    id: 'p_' + crypto.randomBytes(4).toString('hex'),
    bg: { color: '#f8fafc', grid: 'dots' },
    elements: []
  };
}

export function newRoom() {
  const page = newPage();
  return {
    version: 1,
    activePageId: page.id,
    pages: [page],
    updatedAt: new Date().toISOString()
  };
}

export function loadRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (!id) return null;
  if (rooms.has(id)) return rooms.get(id);

  const file = path.join(roomsDir, id + '.json');
  let room = null;
  try {
    room = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[store] sala ${id} ilegível, começando vazia: ${err.message}`);
    }
  }
  if (!room || !Array.isArray(room.pages) || room.pages.length === 0) {
    room = newRoom();
  }

  room.version = 1;
  for (const page of room.pages) {
    if (!page.bg || typeof page.bg !== 'object') {
      page.bg = { color: '#f8fafc', grid: 'dots' };
    }
    if (!Array.isArray(page.elements)) page.elements = [];
  }
  if (!room.pages.some((page) => page.id === room.activePageId)) {
    room.activePageId = room.pages[0].id;
  }

  rooms.set(id, room);
  return room;
}

export function markDirty(roomId) {
  const id = sanitizeRoomId(roomId);
  if (!id) return;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    flush(id);
  }, 400));
}

export function flush(roomId) {
  const id = sanitizeRoomId(roomId);
  const room = id && rooms.get(id);
  if (!room) return null;

  room.updatedAt = new Date().toISOString();
  const file = path.join(roomsDir, id + '.json');
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(room));
  fs.renameSync(tmp, file);
  return room.updatedAt;
}

export function renameRoom(oldRoomId, newRoomId) {
  const oldId = sanitizeRoomId(oldRoomId);
  const newId = sanitizeRoomId(newRoomId);
  if (!oldId || !newId) {
    return { success: false, error: 'Nome de sala inválido. Use apenas letras, números e traços.' };
  }
  if (oldId === newId) {
    return { success: false, error: 'O novo nome é idêntico ao atual.' };
  }

  const oldFile = path.join(roomsDir, oldId + '.json');
  const newFile = path.join(roomsDir, newId + '.json');

  if (oldId.toLowerCase() !== newId.toLowerCase()) {
    if (rooms.has(newId) || fs.existsSync(newFile)) {
      return { success: false, error: 'Já existe uma sala com esse nome.' };
    }
  }

  // Clear timers for oldId
  if (timers.has(oldId)) {
    clearTimeout(timers.get(oldId));
    timers.delete(oldId);
  }
  flush(oldId);

  // Load and migrate memory instance
  const room = rooms.get(oldId) || loadRoom(oldId);
  if (!room) {
    return { success: false, error: 'Sala de origem não encontrada.' };
  }
  rooms.delete(oldId);
  rooms.set(newId, room);

  // Persist under new room id
  flush(newId);

  // Remove old file if it was a different filename
  if (oldId.toLowerCase() !== newId.toLowerCase() && fs.existsSync(oldFile)) {
    try {
      fs.unlinkSync(oldFile);
    } catch (err) {
      console.warn(`[store] erro ao remover arquivo antigo ${oldFile}: ${err.message}`);
    }
  }

  return { success: true, oldRoomId: oldId, newRoomId: newId };
}

export function listRooms() {
  const files = fs.readdirSync(roomsDir);
  const result = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;
    const id = path.basename(file, '.json');
    const filePath = path.join(roomsDir, file);
    try {
      const stats = fs.statSync(filePath);
      const memRoom = rooms.get(id);
      let content = memRoom;
      if (!content) {
        content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
      const pages = Array.isArray(content?.pages) ? content.pages : [];
      const elementsCount = pages.reduce((acc, p) => acc + (p.elements?.length || 0), 0);
      result.push({
        id,
        name: id,
        updatedAt: content?.updatedAt || stats.mtime.toISOString(),
        pagesCount: pages.length || 1,
        elementsCount,
        size: stats.size
      });
    } catch (err) {
      result.push({
        id,
        name: id,
        updatedAt: new Date().toISOString(),
        pagesCount: 1,
        elementsCount: 0,
        size: 0
      });
    }
  }
  result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return result;
}

export function deleteRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (!id) return false;
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  rooms.delete(id);
  const file = path.join(roomsDir, id + '.json');
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

export function saveRoomDirect(roomId, roomData) {
  const id = sanitizeRoomId(roomId);
  if (!id) return false;
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  rooms.set(id, roomData);
  flush(id);
  return true;
}

export function flushAll() {
  for (const id of rooms.keys()) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    flush(id);
  }
}

process.on('SIGINT', () => {
  flushAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushAll();
  process.exit(0);
});

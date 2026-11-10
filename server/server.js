import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  loadRoom,
  markDirty,
  flush,
  sanitizeRoomId,
  slugifyRoomId,
  renameRoom,
  newPage,
  uploadsDir,
  roomsDir,
  listRooms,
  deleteRoom,
  saveRoomDirect
} from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// List all saved rooms in roomsDir
app.get('/api/rooms', (req, res) => {
  try {
    const roomList = listRooms();
    res.json({ rooms: roomList, roomsDir });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar projetos: ' + err.message });
  }
});

// Download raw room JSON
app.get('/api/rooms/:id', (req, res) => {
  const id = sanitizeRoomId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Sala inválida.' });
  const file = path.join(roomsDir, id + '.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Projeto não encontrado.' });
  }
  res.download(file, `${id}.json`);
});

// Import / save a room JSON
app.post('/api/rooms/import', (req, res) => {
  try {
    const { name, data, overwrite } = req.body;
    let baseId = sanitizeRoomId(slugifyRoomId(name || data?.roomId || 'quadro'));
    if (!baseId) baseId = 'quadro-' + crypto.randomBytes(3).toString('hex');
    
    let targetId = baseId;
    let counter = 1;
    const destFile = (id) => path.join(roomsDir, id + '.json');
    
    if (!overwrite) {
      while (fs.existsSync(destFile(targetId))) {
        targetId = `${baseId}-${counter++}`;
      }
    }
    
    let room = typeof data === 'string' ? JSON.parse(data) : data;
    if (!room || !Array.isArray(room.pages) || room.pages.length === 0) {
      return res.status(400).json({ error: 'Formato de projeto inválido. O arquivo precisa conter "pages".' });
    }
    
    room.version = 1;
    room.updatedAt = new Date().toISOString();
    if (!room.activePageId || !room.pages.some(p => p.id === room.activePageId)) {
      room.activePageId = room.pages[0].id;
    }
    
    saveRoomDirect(targetId, room);
    res.json({ success: true, roomId: targetId, message: `Projeto salvo com sucesso como "${targetId}".` });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao importar projeto: ' + err.message });
  }
});

// Delete a room
app.delete('/api/rooms/:id', (req, res) => {
  const id = sanitizeRoomId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Sala inválida.' });
  const ok = deleteRoom(id);
  if (!ok) return res.status(500).json({ error: 'Não foi possível excluir o projeto.' });
  res.json({ success: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve client static build if it exists
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

// roomId -> Map(socketId -> user). Users are ephemeral, never persisted.
const usersByRoom = new Map();

function getUsers(roomId) {
  if (!usersByRoom.has(roomId)) usersByRoom.set(roomId, new Map());
  return usersByRoom.get(roomId);
}

function pageMeta(room) {
  return room.pages.map(({ id, bg }) => ({ id, bg }));
}

function findPage(room, pageId) {
  return (
    room.pages.find((page) => page.id === pageId) ||
    room.pages.find((page) => page.id === room.activePageId) ||
    room.pages[0]
  );
}

function detectImage(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('ascii'))) {
    return 'gif';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

app.post('/api/upload', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const roomId = sanitizeRoomId(req.query.room);
  if (!roomId) return res.status(400).json({ error: 'Sala inválida.' });

  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return res.status(400).json({ error: 'Arquivo vazio.' });
  }

  const ext = detectImage(buf);
  if (!ext) {
    return res.status(400).json({ error: 'Formato não suportado. Use PNG, JPEG, GIF ou WebP.' });
  }

  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  res.json({ url: '/uploads/' + name });
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Imagem maior que 10 MB.' });
  }
  next(err);
});

io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  Object.defineProperty(socket, 'wbRoomId', {
    get() { return currentRoomId; },
    set(v) { currentRoomId = v; }
  });

  socket.on('join_room', ({ roomId, user } = {}) => {
    const id = sanitizeRoomId(roomId);
    if (!id) {
      socket.emit('room_error', 'Sala inválida.');
      return;
    }

    if (currentRoomId && currentRoomId !== id) {
      socket.leave(currentRoomId);
      const prevRoom = getUsers(currentRoomId);
      prevRoom.delete(socket.id);
      socket.to(currentRoomId).emit('user_left', {
        socketId: socket.id,
        users: Array.from(prevRoom.values())
      });
    }

    currentRoomId = id;
    currentUser = {
      id: socket.id,
      name: user?.name || `Usuário-${socket.id.substring(0, 4)}`,
      color: user?.color || '#3b82f6',
      cursor: { x: 0, y: 0 }
    };

    socket.join(id);
    getUsers(id).set(socket.id, currentUser);

    const room = loadRoom(id);
    socket.emit('room_init', {
      pages: pageMeta(room),
      activePageId: room.activePageId,
      elements: findPage(room, room.activePageId).elements,
      users: Array.from(getUsers(id).values()),
      selfId: socket.id
    });

    socket.to(id).emit('user_joined', {
      user: currentUser,
      users: Array.from(getUsers(id).values())
    });

    console.log(`[Room: ${id}] ${currentUser.name} (${socket.id}) conectado. Total: ${getUsers(id).size}`);
  });

  socket.on('cursor_move', ({ x, y } = {}) => {
    if (!currentRoomId || !currentUser) return;
    currentUser.cursor = { x, y };
    socket.to(currentRoomId).emit('cursor_updated', {
      socketId: socket.id,
      name: currentUser.name,
      color: currentUser.color,
      x,
      y
    });
  });

  socket.on('element_preview', (element) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('element_preview', { socketId: socket.id, element });
  });

  socket.on('element_create', (element) => {
    if (!currentRoomId || !element?.id) return;
    const room = loadRoom(currentRoomId);
    const page = findPage(room, element.pageId);
    element.pageId = page.id;
    if (!page.elements.some((el) => el.id === element.id)) {
      page.elements.push(element);
    }
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('element_created', { socketId: socket.id, element });
  });

  socket.on('element_update', (updated) => {
    if (!currentRoomId || !updated?.id) return;
    const room = loadRoom(currentRoomId);
    const page = findPage(room, updated.pageId);
    const index = page.elements.findIndex((el) => el.id === updated.id);
    if (index === -1) return;
    page.elements[index] = updated;
    markDirty(currentRoomId);
    socket.to(currentRoomId).emit('element_updated', updated);
  });

  socket.on('elements_delete', (elementIds) => {
    if (!currentRoomId || !Array.isArray(elementIds)) return;
    const room = loadRoom(currentRoomId);
    const idSet = new Set(elementIds);
    for (const page of room.pages) {
      page.elements = page.elements.filter((el) => !idSet.has(el.id));
    }
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('elements_deleted', {
      socketId: socket.id,
      elementIds
    });
  });

  socket.on('canvas_clear', () => {
    if (!currentRoomId) return;
    const room = loadRoom(currentRoomId);
    findPage(room, room.activePageId).elements = [];
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('canvas_cleared', { socketId: socket.id });
  });

  socket.on('page_add', () => {
    if (!currentRoomId) return;
    const room = loadRoom(currentRoomId);
    const page = newPage();
    room.pages.push(page);
    room.activePageId = page.id;
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('page_added', {
      pages: pageMeta(room),
      activePageId: room.activePageId
    });
    io.to(currentRoomId).emit('page_switched', {
      activePageId: page.id,
      elements: page.elements
    });
  });

  socket.on('page_switch', ({ pageId } = {}) => {
    if (!currentRoomId) return;
    const room = loadRoom(currentRoomId);
    const page = room.pages.find((p) => p.id === pageId);
    if (!page) return;
    room.activePageId = page.id;
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('page_switched', {
      activePageId: page.id,
      elements: page.elements
    });
  });

  socket.on('page_delete', ({ pageId } = {}) => {
    if (!currentRoomId) return;
    const room = loadRoom(currentRoomId);
    if (!pageId || room.pages.length <= 1) return;

    const pageIndex = room.pages.findIndex((p) => p.id === pageId);
    if (pageIndex === -1) return;

    // Remove the page
    room.pages.splice(pageIndex, 1);

    // If the active page was deleted, switch to adjacent page
    if (room.activePageId === pageId) {
      const nextIndex = Math.max(0, pageIndex - 1);
      room.activePageId = room.pages[nextIndex].id;
    }

    markDirty(currentRoomId);

    const activePage = findPage(room, room.activePageId);
    io.to(currentRoomId).emit('page_deleted', {
      deletedPageId: pageId,
      pages: pageMeta(room),
      activePageId: room.activePageId,
      elements: activePage.elements
    });
  });

  socket.on('page_bg_update', ({ pageId, bg } = {}) => {
    if (!currentRoomId || !bg) return;
    const room = loadRoom(currentRoomId);
    const page = findPage(room, pageId);
    if (typeof bg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(bg.color)) {
      page.bg.color = bg.color;
    }
    if (['dots', 'lines', 'blank'].includes(bg.grid)) {
      page.bg.grid = bg.grid;
    }
    markDirty(currentRoomId);
    io.to(currentRoomId).emit('page_bg_updated', { pageId: page.id, bg: page.bg });
  });

  socket.on('save_flush', () => {
    if (!currentRoomId) return;
    socket.emit('saved', { at: flush(currentRoomId) });
  });

  socket.on('update_user', ({ name, color } = {}) => {
    if (!currentRoomId || !currentUser) return;
    if (name) currentUser.name = name;
    if (color) currentUser.color = color;
    io.to(currentRoomId).emit('users_updated', Array.from(getUsers(currentRoomId).values()));
  });

  socket.on('room_rename', ({ newRoomId } = {}) => {
    if (!currentRoomId) return;
    const targetId = sanitizeRoomId(slugifyRoomId(newRoomId));
    if (!targetId) {
      socket.emit('room_error', 'Nome de sala inválido. Use letras, números e traços (máx. 64 caracteres).');
      return;
    }
    if (targetId === currentRoomId) return;

    const oldRoomId = currentRoomId;
    const result = renameRoom(oldRoomId, targetId);
    if (!result.success) {
      socket.emit('room_error', result.error || 'Não foi possível renomear a sala.');
      return;
    }

    // Migrate users map
    const oldUsers = usersByRoom.get(oldRoomId) || new Map();
    const newUsers = usersByRoom.get(targetId) || new Map();
    for (const [sid, u] of oldUsers.entries()) {
      newUsers.set(sid, u);
    }
    usersByRoom.delete(oldRoomId);
    usersByRoom.set(targetId, newUsers);

    // Update all sockets that were in oldRoomId
    const roomSockets = io.sockets.adapter.rooms.get(oldRoomId);
    if (roomSockets) {
      for (const sid of Array.from(roomSockets)) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.wbRoomId = targetId;
          s.leave(oldRoomId);
          s.join(targetId);
        }
      }
    }
    currentRoomId = targetId;

    io.to(targetId).emit('room_renamed', {
      oldRoomId,
      newRoomId: targetId
    });

    console.log(`[Room rename] "${oldRoomId}" -> "${targetId}" por ${currentUser?.name || socket.id}`);
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = getUsers(currentRoomId);
    room.delete(socket.id);
    socket.to(currentRoomId).emit('user_left', {
      socketId: socket.id,
      users: Array.from(room.values())
    });
    console.log(`[Room: ${currentRoomId}] ${currentUser?.name} saiu. Restantes: ${room.size}`);
  });
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.send('Whiteboard Server is running. In dev mode, open the client on port 5173.');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎨 Whiteboard Server running at http://localhost:${PORT}`);
});

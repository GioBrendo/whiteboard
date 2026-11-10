import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-store-'));
process.env.WB_DATA_DIR = dir;
const store = await import('./store.js');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('sanitizeRoomId aceita ids seguros e recusa caminhos', () => {
  assert.equal(store.sanitizeRoomId('quadro-abc_1'), 'quadro-abc_1');
  assert.equal(store.sanitizeRoomId('../x'), null);
  assert.equal(store.sanitizeRoomId(''), null);
  assert.equal(store.sanitizeRoomId(null), null);
});

test('grava e recarrega a sala', () => {
  const room = store.loadRoom('sala1');
  room.pages[0].elements.push({
    id: 'el1',
    type: 'pencil',
    pageId: room.pages[0].id,
    points: []
  });
  const at = store.flush('sala1');
  assert.ok(at);

  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'rooms', 'sala1.json'), 'utf8'));
  assert.equal(raw.pages[0].elements[0].id, 'el1');
  assert.equal(raw.activePageId, room.activePageId);
});

test('arquivo corrompido não derruba o carregamento', () => {
  fs.writeFileSync(path.join(dir, 'rooms', 'quebrada.json'), '{oops');
  const room = store.loadRoom('quebrada');
  assert.equal(room.pages.length, 1);
  assert.ok(room.activePageId);
});

test('gravações seguidas deixam JSON válido', () => {
  const room = store.loadRoom('rajada');
  for (let i = 0; i < 20; i++) {
    room.pages[0].elements.push({ id: 'e' + i });
    store.flush('rajada');
    const raw = fs.readFileSync(path.join(dir, 'rooms', 'rajada.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
  }
});

test('slugifyRoomId formata nomes amigáveis', () => {
  assert.equal(store.slugifyRoomId('Minha Sala de Reunião!'), 'minha-sala-de-reuniao');
  assert.equal(store.slugifyRoomId('  Quadro #42 -- teste  '), 'quadro-42-teste');
  assert.equal(store.slugifyRoomId('Ação & Emoção'), 'acao-emocao');
  assert.equal(store.slugifyRoomId(''), '');
});

test('renameRoom renomeia sala em memória e arquivo no disco', () => {
  const room = store.loadRoom('origem');
  room.pages[0].elements.push({ id: 'el-rename', type: 'text', text: 'Olá mundo' });
  store.flush('origem');

  const oldFile = path.join(dir, 'rooms', 'origem.json');
  const newFile = path.join(dir, 'rooms', 'destino.json');
  assert.ok(fs.existsSync(oldFile));

  const res = store.renameRoom('origem', 'destino');
  assert.equal(res.success, true);
  assert.equal(res.newRoomId, 'destino');

  // Arquivo antigo não deve mais existir e o novo deve existir com os dados corretos
  assert.equal(fs.existsSync(oldFile), false);
  assert.ok(fs.existsSync(newFile));

  const loadedDest = store.loadRoom('destino');
  assert.equal(loadedDest.pages[0].elements[0].id, 'el-rename');

  // Não permite renomear para uma sala existente
  const conflictRes = store.renameRoom('origem-2', 'destino');
  assert.equal(conflictRes.success, false);
  assert.match(conflictRes.error, /Já existe/);

  // Não permite renomear para o mesmo nome
  const sameRes = store.renameRoom('destino', 'destino');
  assert.equal(sameRes.success, false);
});

test('listRooms e deleteRoom funcionam corretamente', () => {
  store.saveRoomDirect('projeto-alpha', {
    version: 1,
    activePageId: 'p1',
    pages: [{ id: 'p1', bg: { color: '#ffffff', grid: 'dots' }, elements: [{ id: '1' }, { id: '2' }] }],
    updatedAt: new Date().toISOString()
  });

  const rooms = store.listRooms();
  const alpha = rooms.find(r => r.id === 'projeto-alpha');
  assert.ok(alpha);
  assert.equal(alpha.elementsCount, 2);
  assert.equal(alpha.pagesCount, 1);

  const deleted = store.deleteRoom('projeto-alpha');
  assert.equal(deleted, true);

  const afterDelete = store.listRooms();
  assert.equal(afterDelete.some(r => r.id === 'projeto-alpha'), false);
});

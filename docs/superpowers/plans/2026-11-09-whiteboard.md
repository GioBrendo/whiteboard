# Whiteboard colaborativo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar persistência, páginas, fundo, LaTeX, imagem colada, botão Salvar e túnel público ao whiteboard React + Socket.IO já existente.

**Architecture:** O servidor Express/Socket.IO passa a guardar cada sala em JSON atômico em `server/data/rooms/` e a rotear eventos por `pageId`. O cliente mantém `elements` como a página ativa, ganha barra de páginas, ferramenta LaTeX (MathJax SVG desenhado no canvas), colagem de imagem via upload e status de salvamento. O `start.cmd` builda, sobe o servidor e o túnel Cloudflare.

**Tech Stack:** Node 26, Express 4, Socket.IO 4, React 19, Vite 8, Tailwind 4, MathJax 3 (CDN), cloudflared.

**Spec:** `docs/superpowers/specs/2026-11-09-whiteboard-design.md`

## Global Constraints

- Nenhuma dependência nova de runtime além das já instaladas; MathJax e cloudflared vêm de fora.
- `roomId` só aceita `[A-Za-z0-9_-]{1,64}`; caminho de arquivo nunca vem cru do cliente.
- Upload: PNG, JPEG, GIF, WebP por magic bytes; máximo 10 MB; nome aleatório; `X-Content-Type-Options: nosniff`.
- Autosave com debounce de 400 ms; gravação atômica (`.tmp` + rename).
- O diretório não é repositório Git: não há passos de commit.
- Textos de UI em português.

## Review Focus

- Reinício do servidor com abas abertas → cliente reentra na sala sozinho e substitui o estado.
- Troca de página no meio de um traço ou edição → traço/texto fica na página de origem.
- Upload de arquivo que não é imagem, ou acima de 10 MB → 400 com mensagem, nada gravado.
- Duas gravações concorrentes → JSON nunca fica truncado; recarregar a sala funciona.
- Elemento remoto duplicado (eco do próprio evento) → não duplica no estado.

---

### Task 1: Store de salas em disco

**Files:**
- Create: `server/store.js`
- Create: `server/store.test.js`
- Modify: `server/package.json` (script `test`)

**Interfaces:**
- Produces:
  - `sanitizeRoomId(id) -> string|null`
  - `newRoom() -> { version:1, activePageId, pages:[{ id, bg:{color,grid}, elements:[] }], updatedAt }`
  - `loadRoom(roomId) -> room` (cria se não existir)
  - `markDirty(roomId) -> void` (agenda gravação em 400 ms)
  - `flush(roomId) -> string` (grava agora, retorna ISO do horário)
  - `dataDir` respeita `WB_DATA_DIR` (usado nos testes)

- [ ] **Step 1: Escrever o teste que falha**

`server/store.test.js` com `node:test`: cria sala, adiciona elemento, `flush`, confere arquivo JSON; `loadRoom` de outro processo/módulo devolve o elemento; `sanitizeRoomId('../x')` devolve `null`; `flush` deixa o arquivo parseável após 20 gravações seguidas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server; node --test store.test.js`
Expected: FAIL porque `store.js` não existe.

- [ ] **Step 3: Implementar `server/store.js`**

`fs.mkdirSync(dataDir, {recursive:true})`; `loadRoom` lê `rooms/<id>.json` e faz merge com `newRoom()`; `markDirty` usa `setTimeout` por sala; `flush` grava `JSON.stringify(room)` em `.tmp` e `renameSync`; `process.on('SIGINT'|'SIGTERM')` grava todas as salas sujas.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server; node --test store.test.js`
Expected: PASS.

---

### Task 2: Servidor com páginas, upload e eventos novos

**Files:**
- Modify: `server/server.js`
- Modify: `server/package.json` (nada de dependência nova; só script se preciso)

**Interfaces:**
- Consumes: `store.js` da Task 1.
- Produces:
  - `room_init` → `{ pages:[{id,bg}], activePageId, elements, users, selfId }`
  - eventos `page_add`, `page_switch`, `page_bg_update`, `save_flush` (ack `saved { at }`)
  - `POST /api/upload?room=<id>` (corpo binário) → `{ url }` ou 400
  - `GET /uploads/<arquivo>` com `nosniff`

- [ ] **Step 1: Trocar o armazenamento em memória pelo store**

`getOrCreateRoom` passa a usar `loadRoom`; todo `element_create/update/delete` recebe `pageId`, acha a página (fallback `activePageId`), altera e chama `markDirty`.

- [ ] **Step 2: Eventos de página**

`page_add`: nova página `p{n}`, `activePageId = nova`, broadcast `page_added {pages, activePageId}` e `page_switched {activePageId, elements:[]}`. `page_switch`: valida id, atualiza `activePageId`, `markDirty`, broadcast `page_switched {activePageId, elements}`. `page_bg_update`: atualiza `bg`, `markDirty`, broadcast. `canvas_clear`: limpa só a página ativa.

- [ ] **Step 3: Upload**

`express.raw({ type: '*/*', limit: '10mb' })` em `/api/upload`; detecta magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46`, WebP `52 49 46 46…57 45 42 50`); grava `uploads/<random>.<ext>`; responde `{url:'/uploads/<file>'}`; erro 400 com `{error}`. Serve `uploads` com `nosniff` e cache curto.

- [ ] **Step 4: `join_room` idempotente + save**

Reentrar na mesma sala não duplica usuário; `save_flush` chama `flush` e responde `saved { at }`.

- [ ] **Step 5: Verificar manualmente o protocolo**

Subir o servidor e usar o cliente em duas abas: desenhar nas duas, adicionar página, trocar, mudar fundo, salvar. Conferir que `server/data/rooms/<sala>.json` contém as páginas e elementos.

---

### Task 3: LaTeX no cliente

**Files:**
- Create: `client/src/utils/latex.js`
- Create: `client/src/components/LatexModal.jsx`
- Modify: `client/src/utils/canvas.js`
- Modify: `client/src/constants.js`
- Modify: `client/src/components/Toolbar.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/index.html` (script do MathJax, `defer`)

**Interfaces:**
- Produces:
  - `ensureMathJax(): Promise<void>`
  - `texToSvg(tex) -> { dataUrl, width, height }` (assíncrono; cache por `tex`)
  - elemento `{ id, type:'latex', pageId, x, y, tex, svg, width, height, color }`
  - `renderElement` desenha `image`/`latex` via cache `getCachedImage(src)` de `client/src/utils/images.js`
  - `isPointHittingElement` trata `image` e `latex` como retângulo

- [ ] **Step 1: `latex.js`**

Carrega `https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js` uma vez e espera `MathJax.startup.promise`; `texToSvg` usa `MathJax.tex2svg(tex,{display:true})`, serializa o `<svg>`, mede `viewBox`, devolve data URL base64. Cache `Map`.

- [ ] **Step 2: `images.js` + canvas**

`getCachedImage(src)` devolve `Image` do cache ou `null` e dispara o load chamando `onImageLoad` (callback registrado por `App` para forçar re-render). `renderElement`: `image`/`latex` desenham `drawImage(img, x, y, width, height)` quando carregada.

- [ ] **Step 3: Ferramenta e modal**

`TOOLS.LATEX = 'latex'`, botão `Sigma` no Toolbar. Clique no canvas com a ferramenta abre `LatexModal` com textarea, prévia (`texToSvg` + `<img>`), botões Inserir/Cancelar. Inserir cria o elemento centralizado no clique. Duplo clique com a ferramenta de seleção sobre um `latex` reabre o modal preenchido e atualiza via `element_update`.

- [ ] **Step 4: Arrastar/apagar**

No arraste da seleção, tratar `latex`/`image` como `{x,y}`. A borracha e o Delete já funcionam pelo hit-test.

---

### Task 4: Imagem colada com Ctrl+V

**Files:**
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `/api/upload`, cache de imagens, `element_create` com `pageId`.

- [ ] **Step 1: Listener de paste**

`window.addEventListener('paste')`: se `clipboardData.files` tiver imagem, `fetch('/api/upload?room='+roomId, {method:'POST', body:file, headers:{'Content-Type':file.type}})`. Em sucesso, calcula largura/altura (máx. 480 px) e cria `{type:'image', x, y, width, height, src}` no centro da área visível da página ativa. Erro → `alert` com a mensagem do servidor.

- [ ] **Step 2: Verificar**

Colar um print em uma aba e conferir que aparece na outra, que o arquivo existe em `server/data/uploads/` e que sobrevive ao reload.

---

### Task 5: Páginas e fundo

**Files:**
- Create: `client/src/components/PageBar.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Header.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `page_add`, `page_switch`, `page_bg_update`, `page_added`, `page_switched`.
- Produces: estado `pages:[{id,bg}]`, `activePageId`; `bg:{color,grid}`.

- [ ] **Step 1: Estado e sockets**

`room_init` popula `pages`/`activePageId`; `page_switched` troca `elements`, limpa undo/redo, seleção e `editingText` (confirmando texto na página de origem). `page_added` atualiza a lista.

- [ ] **Step 2: PageBar**

Barra fixa no canto inferior esquerdo: um chip por página (`1`, `2`, …), chip ativo destacado, botão `+` emite `page_add`. `page_switch` ao clicar.

- [ ] **Step 3: Fundo**

No Header, o botão de grade passa a emitir `page_bg_update` com a página ativa. Ao lado, um seletor de cor (6 presets + input color) faz o mesmo. O container usa `backgroundColor` da página e a classe de grade correspondente.

- [ ] **Step 4: Traço na página de origem**

`currentElement` e `editingText` ganham `pageId` no `pointerdown`; `element_create` usa esse `pageId`, não o `activePageId` do momento do `pointerup`.

---

### Task 6: Salvar, reconectar e exportar

**Files:**
- Modify: `client/src/components/Header.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `save_flush`/`saved`.

- [ ] **Step 1: Botão Salvar**

Botão com ícone `Save` emite `save_flush`; ao receber `saved`, mostra "Salvo às HH:MM" por alguns segundos. Autosave do servidor continua independente.

- [ ] **Step 2: Reconexão**

No handler de `connect` do socket, se já houver `roomId`, reemite `join_room`; `room_init` substitui `pages`, `activePageId` e `elements`.

- [ ] **Step 3: Export PNG**

Desenhar o fundo da página ativa, depois os elementos (incluindo `image` e `latex` pelo cache de imagens); aguardar imagens carregadas antes de gerar o data URL.

---

### Task 7: start.cmd, README e verificação final

**Files:**
- Create: `start.cmd`
- Create: `README.md`
- Modify: `client/README.md` (substituir pelo README do projeto ou remover duplicata)

- [ ] **Step 1: `start.cmd`**

`npm run build` se `client/dist/index.html` não existir; sobe `node server/server.js` em janela separada; procura `cloudflared` no PATH ou em `bin\cloudflared.exe`; se faltar, baixa de `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe`; roda `cloudflared tunnel --url http://localhost:3001` e deixa a URL visível.

- [ ] **Step 2: README**

Como rodar, como convidar (mesmo `?room=`), o que fica salvo, limitações (URL muda, sem login, MathJax precisa de internet).

- [ ] **Step 3: Verificação ponta a ponta**

Com Playwright (skill webapp-testing), dois contextos no mesmo `?room=`: A desenha, B vê; B cola imagem e A vê; A adiciona página e B acompanha; B muda fundo; Salvar responde; Export baixa PNG; recarregar mantém; reiniciar o servidor e recarregar mantém.

- [ ] **Step 4: Rodar `npm run lint` no cliente**

Expected: sem erros novos.

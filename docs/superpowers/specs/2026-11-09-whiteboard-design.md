# Whiteboard colaborativo — desenho

## Por que

Duas pessoas, cada uma no seu computador e na sua internet, precisam de um quadro
branco compartilhado para desenhar juntas em tempo real. O que for desenhado tem que
sobreviver ao fechamento da aba e ao reinício do servidor, e o resultado tem que poder
ser exportado como imagem.

## O que já existe

`C:\Users\Giovanni Brendo\Downloads\WhiteBoard` já contém um projeto funcional criado
hoje: React 19 + Vite 8 + Tailwind 4 no cliente, Express 4 + Socket.IO 4 no servidor,
com salas por `?room=`, caneta, marca-texto, borracha, retângulo, círculo, linha, seta,
texto, post-it, seleção/arraste, pan/zoom, cursores remotos, undo/redo, grade e export
PNG. O estado das salas fica **apenas em memória** (`server/server.js`), então reiniciar
o servidor apaga tudo. Não existem páginas, LaTeX, imagem colada, cor de fundo
sincronizada, botão de salvar nem túnel.

Este desenho estende esse projeto; não recomeça.

## Objetivos

- Duas pessoas desenham na mesma sala em tempo real.
- Ferramentas pedidas: caneta livre, borracha, marca-texto, texto, LaTeX e imagem colada
  com Ctrl+V.
- Várias páginas por sala, com botão de adicionar página e troca entre elas.
- Fundo configurável por página (cor e grade).
- Tudo salvo em disco automaticamente; botão **Salvar** que confirma a gravação.
- Exportar a página atual como PNG.
- Acesso pelo link gerado por um túnel Cloudflare, já que o servidor roda na máquina
  de um dos dois.

## Não-objetivos

- Login, contas ou permissões: quem tem o link entra.
- Redimensionar imagens, mover páginas, miniaturas, histórico global entre sessões.
- Suporte fino a celular.
- Hospedagem permanente ou domínio próprio.

## Anti-objetivos

- Perder o quadro quando o servidor reinicia ou a aba fecha.
- Os dois clientes divergirem sobre o conteúdo ou sobre a página atual.
- Depender de serviço pago ou de conta para o túnel.

## Decisões tomadas por você

- Cada um no seu computador, em redes diferentes → servidor local + túnel.
- O quadro precisa ficar salvo depois.
- O botão Salvar serve para garantir que está salvo; **Exportar PNG** é separado.
- Páginas, fundo, LaTeX, imagem colada e marca-texto entram no escopo.

## Decisões que eu tomei (pode discordar)

- **Página atual é compartilhada**: quando um troca de página, o outro acompanha. É o
  que combina com "desenhar juntos" e evita um dos dois desenhar numa página que o
  outro não está vendo.
- **LaTeX é renderizado com MathJax (SVG)**, não KaTeX: o SVG vira imagem e é desenhado
  direto no canvas, então aparece nítido e sai no PNG sem gambiarra. Vem de CDN, então o
  navegador precisa de internet (o túnel já exige).
- **Imagem colada é enviada ao servidor** e guardada em `server/data/uploads/`; o quadro
  guarda só o caminho. Limite de 10 MB por imagem.
- **Autosave com debounce (~400 ms)** por sala, arquivo JSON reescrito de forma atômica
  (tmp + rename). O botão Salvar força a gravação na hora e mostra "Salvo às HH:MM".
- **Fundo por página** = cor de fundo + estilo de grade (pontos, linhas, liso). O botão
  de grade atual passa a ser sincronizado e persistido; um seletor de cor entra ao lado.
- **Túnel Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:3001`),
  sem conta. O `start.cmd` baixa o `cloudflared.exe` na primeira execução se ele não
  estiver no PATH.
- **Sem autenticação**: o link do túnel é a única proteção. Aceitável para duas pessoas;
  a URL muda a cada reinício.

## Decisões fechadas na revisão do desenho

- **Reconexão**: ao reconectar, o cliente reemite `join_room` e substitui o estado local
  pelo `room_init`. Assim um reinício do servidor não deixa as abas abertas mudas.
- **Undo/redo**: as pilhas são limpas ao trocar de página. Sem histórico entre páginas.
- **Troca de página no meio de um traço**: o traço termina na página em que começou
  (`pageId` capturado no `pointerdown`). Editor de texto aberto é confirmado na página
  de origem; o modal de LaTeX é fechado sem inserir.
- **Imagem e LaTeX** são elementos de primeira classe: selecionáveis, arrastáveis,
  apagáveis pela borracha e pelo Delete. LaTeX existente reabre no modal com duplo
  clique para corrigir o código.
- **Upload**: só PNG, JPEG, GIF e WebP, validados pelos magic bytes, até 10 MB; nome
  aleatório e `X-Content-Type-Options: nosniff` ao servir. O túnel é público, então o
  endpoint não confia no corpo.
- **Páginas não podem ser apagadas nem renomeadas nesta versão** (só adicionar e
  trocar); os chips mostram o número. Se virar problema, entra depois.

## Arquitetura

Servidor único em Node na porta 3001:

- Express serve `client/dist` e os uploads em `/uploads`.
- Socket.IO mantém as salas em memória e persiste cada sala em
  `server/data/rooms/<roomId>.json`.
- Upload de imagem: `POST /api/upload?room=<roomId>` com o corpo binário; responde
  `{ url }`.
- O cliente é o mesmo build servido pelo servidor (sem CORS em produção; o modo dev do
  Vite continua funcionando na 5173 falando com a 3001).

### Modelo de dados

```json
{
  "version": 1,
  "activePageId": "p1",
  "updatedAt": "2026-11-09T12:00:00.000Z",
  "pages": [
    {
      "id": "p1",
      "bg": { "color": "#f8fafc", "grid": "dots" },
      "elements": [
        { "id": "el_...", "type": "pencil", "pageId": "p1", "points": [], "color": "#1e293b", "width": 4 },
        { "id": "el_...", "type": "latex", "pageId": "p1", "x": 100, "y": 200, "tex": "E=mc^2", "svg": "data:image/svg+xml;base64,...", "width": 120, "height": 40 },
        { "id": "el_...", "type": "image", "pageId": "p1", "x": 10, "y": 20, "width": 400, "height": 300, "src": "/uploads/abc.png" }
      ]
    }
  ]
}
```

Elementos ganham `pageId`; o servidor roteia cada evento para a página certa.

### Protocolo Socket.IO

Mantém os eventos atuais (`join_room`, `room_init`, `element_preview`,
`element_create`, `element_update`, `elements_delete`, `canvas_clear`, cursores,
usuários) com duas mudanças:

- `room_init` passa a enviar `{ pages: [{id, bg}], activePageId, elements, users, selfId }`
  — `elements` é o conteúdo da página ativa.
- Eventos de elemento carregam `pageId`.

Novos eventos:

| Evento | Direção | Efeito |
| --- | --- | --- |
| `page_add` | cliente → servidor | cria página, ativa e transmite `page_added` |
| `page_switch` | cliente → servidor | troca a página ativa e transmite `page_switched` com os elementos |
| `page_bg_update` | cliente → servidor | atualiza cor/grade da página e transmite |
| `save_flush` | cliente → servidor | grava agora e responde `saved` com o horário |

`canvas_clear` limpa só a página ativa.

### Cliente

- `elements` continua sendo o array renderizado, agora sempre da página ativa.
- Novos componentes: `PageBar` (chips de página + botão "+"), `LatexModal` (textarea com
  prévia), seletor de fundo no `Header`.
- Ctrl+V: lê `clipboardData` como imagem, envia para `/api/upload`, cria elemento
  `image` centralizado na área visível.
- LaTeX: `MathJax.tex2svg(tex, { display: true })` → SVG serializado em data URL →
  cache `tex → { image, width, height }` → `renderElement` desenha com `drawImage`.
- `renderElement` e `isPointHittingElement` ganham os tipos `image` e `latex`
  (retângulo delimitador).
- Export PNG passa a desenhar a cor de fundo da página e os elementos `image`/`latex`
  junto com o resto.

## Arquivos

Novos:

- `server/store.js` — carregar/gravar salas, uploads, sanitização de `roomId`.
- `client/src/components/PageBar.jsx`
- `client/src/components/LatexModal.jsx`
- `client/src/utils/latex.js` — carregamento do MathJax e cache de SVG.
- `start.cmd` — build se necessário, sobe o servidor e o túnel, mostra a URL.
- `README.md` — como rodar e como convidar.

Alterados:

- `server/server.js` — páginas, persistência, upload, eventos novos.
- `client/src/App.jsx` — páginas, fundo, Ctrl+V, LaTeX, salvar.
- `client/src/components/Header.jsx` — fundo, salvar, status.
- `client/src/components/Toolbar.jsx` — ferramenta LaTeX.
- `client/src/constants.js` — ferramenta e fundos.
- `client/src/utils/canvas.js` — render e hit-test de imagem/LaTeX.
- `client/src/index.css` — grades com cor de fundo.

## Como rodar

```powershell
cd "C:\Users\Giovanni Brendo\Downloads\WhiteBoard"
.\start.cmd
```

O script builda o cliente, sobe o servidor em `http://localhost:3001` e imprime a URL
pública do túnel. Os dois abrem essa URL com o mesmo `?room=...`.

## Riscos e limites

- A URL do quick tunnel muda a cada reinício; o link antigo deixa de funcionar.
- MathJax vem de CDN: sem internet no navegador, o LaTeX não renderiza.
- Sem login, qualquer pessoa com o link entra.
- O JSON inteiro é reescrito a cada gravação; suficiente para dois usuários, não para
  quadros enormes. Se crescer, trocar por SQLite.
- Imagens ficam em disco sem limpeza automática de órfãs.

## O que fica com o construtor

Layout exato dos controles, tamanhos, textos, tempo do debounce, escala inicial da
imagem colada e detalhes de estilo.

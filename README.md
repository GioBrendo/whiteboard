# WhiteBoard colaborativo

Quadro branco compartilhado em tempo real para duas pessoas em computadores
diferentes. Cada um abre o mesmo link, desenha no mesmo quadro e tudo fica salvo
no computador que roda o servidor.

## Como rodar

```powershell
cd "C:\Users\Giovanni Brendo\Downloads\WhiteBoard"
.\start.cmd
```

Na primeira execução o script baixa o `cloudflared` (túnel da Cloudflare). Depois ele:

1. sobe o servidor em `http://localhost:3001`;
2. abre um túnel público e imprime uma URL `https://....trycloudflare.com`;
3. mantém as duas janelas abertas enquanto o quadro estiver em uso.

Envie a URL do túnel para a outra pessoa. O link já inclui a sala (`?room=...`);
quem abrir o mesmo link entra no mesmo quadro. Para começar um quadro novo, troque
o valor de `room` na URL ou abra `http://localhost:3001` sem parâmetro.

## O que tem

- Caneta, marca-texto, borracha, formas, seta, texto e post-it.
- Fórmulas LaTeX (botão Σ): digite o código, veja a prévia e insira. Duplo clique
  com a ferramenta de seleção reabre a fórmula para corrigir.
- **Seleção e Regiões**:
  - **Mover e Selecionar (`V`)**: clique em um elemento para selecionar ou arraste o fundo para abrir a caixa de seleção.
  - **Seleção em Retângulo (`B`)**: clique e arraste para envolver múltiplos elementos com uma caixa retangular.
  - **Seleção de Região / Laço (`Q`)**: desenhe um laço/área livre com o mouse para selecionar todos os elementos dentro da região.
  - **Ações em Grupo**: mova todos os elementos selecionados juntos, use a barra flutuante para **Duplicar (`Ctrl+D`)** ou **Excluir (`Delete`/`Backspace`)**.
- **Imagens**:
  - Inserir pelo novo botão de imagem na barra de ferramentas ou colando com `Ctrl+V`.
  - **Redimensionar (aumentar/diminuir)**: selecione a imagem (ferramenta `V`) e arraste qualquer uma das 4 alças nos cantos, ou use os botões rápidos **"Aumentar" (+25%)** e **"Diminuir" (-20%)** que surgem embaixo da imagem.
- **Páginas**:
  - Barra no canto inferior esquerdo com os números das páginas.
  - Botão `+` para criar uma nova página.
  - **Botão 🗑️ para remover a página atual** (sincronizado em tempo real entre todos os usuários).
  - A página atual é compartilhada: ambos navegam juntos.
- Fundo por página: cor e grade no topo.
- Seleção/arraste, pan/zoom, cursores remotos, undo/redo.
- **Salvar** grava na hora e mostra o horário. O quadro também salva sozinho a
  cada alteração.
- **Gerenciador de Projetos (rooms)**:
  - Botão **"Projetos"** no topo para visualizar, abrir e gerenciar quadros salvos em `rooms/`.
  - Permite abrir salas existentes, abrir em nova aba, criar novas salas e importar arquivos `.json`.
  - Baixar backup em arquivo `.json` de qualquer projeto salvo ou excluir projetos antigos.
- **Gravação e Time Lapse de Desenhos**:
  - Botão **"Gravar"** no topo para iniciar a gravação em tempo real com contador de duração.
  - Ao clicar em **"Parar"**, abre o reprodutor de **Time Lapse** com animação traço a traço.
  - Também acessível pelo menu **Exportar -> Time Lapse (Vídeo)** para qualquer desenho existente.
  - **Controle de velocidade configurável**: predefinições rápidas (1x, 2x, 4x, 8x, 16x, 32x) e controle deslizante (slider) de 0.5x até 50x.
  - **Salvar é opcional**: o usuário pode apenas assistir ao time lapse ou clicar em **"Salvar Vídeo (WebM)"** para baixar o arquivo de vídeo.
- **Exportação Corrigida e Expandida**:
  - Menu no topo com opções de **Salvar como PNG (Imagem)**, **Salvar como PDF (Documento)** e **Exportar Projeto (JSON)**.
  - Download confiável em todos os navegadores com cálculo automático de bounding box e suporte a imagens com CORS.

## Onde fica salvo

- Quadros: `rooms/<sala>.json`
- Imagens coladas/enviadas: `server/data/uploads/`

Apagar esses arquivos apaga o quadro.

## Desenvolvimento

```powershell
npm run dev      # servidor (3001) + Vite (5173)
npm run build    # gera client/dist
npm run start    # serve o build na 3001
```

Testes do armazenamento:

```powershell
npm test --prefix server
```

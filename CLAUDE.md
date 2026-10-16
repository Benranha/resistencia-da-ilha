# A Resistência da Ilha

Jogo web (PWA) de dedução social e sobrevivência para até 9 jogadores. Servidor Node autoritativo (WebSocket), cliente em Canvas 2D sem build. O dono do projeto é brasileiro: texto do jogo, commits e conversa em português.

## Comandos
- `npm install`, `npm start` (http://localhost:3000), `npm run dev` (reinicia ao salvar), `npm test`
- `npm run icons` regenera os PNGs do PWA a partir de `scripts/make-icons.js`
- Deploy: precisa de WebSocket persistente (Render, Railway, Fly). Há `Dockerfile` e `render.yaml`. Vercel só serve a pasta `public/`.

## Arquitetura
- `src/config.js`: constantes, papéis, zonas, obstáculos, itens, botes. É onde se balanceia o jogo.
- `src/game.js`: regras e bots (lógica pura, sem rede). Tick de 20 Hz.
- `src/server.js`: HTTP estático, WebSocket, salas de 4 letras, reconexão por token, `/healthz`.
- `public/client.js`: render Canvas, HUD, toque, áudio. O servidor só manda o que cada jogador vê (névoa).
- `public/art/`: ícones SVG do jogo. `public/sw.js`: service worker, suba a versão de `CACHE` quando mudar arquivos da casca.
- `test/`: regras, simulações com bots (devem dar mais ou menos 3 vitórias Resistência e 5 Tropas em 8 partidas) e smoke test de WebSocket.

## Regras de ouro
- Nada de emoji em lugar nenhum (UI, mapa, HUD, textos). Use SVG próprio em `public/art/`, no estilo da identidade.
- Cores, tipografia e componentes seguem `docs/identidade-visual.md` e `docs/design-tokens.json` (temas noite e dia; Fraunces para títulos, Atkinson Hyperlegible para texto). Contorno de tinta `#2a1d0f` de 2,5px nos ícones.
- Sem travessão (—) em textos do jogo.
- Mudou regra ou constante? Rode `npm test` e confira as simulações com bots.
- Cliente não decide nada de jogo: toda regra fica em `game.js`.

## Decisões em aberto
- Sabotador e Tropa são da mesma facção (Tropas). 6 Resistência x 3 Tropas.
- `GUARD_FRIENDLY_FIRE_ENDS_MATCH` em `config.js` controla a regra do Guarda.
- O mapa ainda é de retângulos por baixo; só o desenho é orgânico (`buildTerrain` em `client.js`).

## Backlog
1. Costa de ilha com colisão, tempestade e maré mais bonitas.
2. Ilustrar itens com mais detalhe (rádio de baquelite, chave "BOTE 01", mapa queimado).
3. Marcador do bote, botões de tábua de navio, fundo do menu ao pôr do sol.
4. Personagens (sprites) e texturas de terreno.
5. Reunião de emergência com votação, voz por proximidade (WebRTC), gazua como minigame.

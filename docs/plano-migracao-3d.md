# Plano de migração 3D — A Resistência da Ilha

## Objetivo

Transformar a apresentação da partida de Canvas 2D para um mundo 3D executado no navegador, mantendo o jogo atual reconhecível e preservando suas regras, controles, salas e servidor multiplayer.

## Decisões de implementação

- **Cliente 3D:** Three.js carregado como módulo local, servido pelo próprio projeto para evitar dependência de CDN durante a partida.
- **Servidor e autoridade:** manter `src/server.js`, `src/game.js`, protocolo WebSocket `/ws`, salas e snapshots do servidor como fonte autoritativa. A interface continua se conectando ao mesmo domínio; em HTTPS, usa `wss://<domínio>/ws`.
- **Coordenadas:** converter a posição 2D `(x, y)` do servidor para o plano 3D `(x, altura, z)`, com `z = y`. O servidor continua decidindo movimento, colisões, interações, papéis, maré, tempestade e vitória.
- **Cena:** ilha navegável estilizada em perspectiva oblíqua, com terreno, água e maré, vegetação e rochas derivadas do mapa existente; personagens, itens, cofre, botes e passagens serão representados por modelos geométricos e ícones já fornecidos pelo projeto.
- **Identidade visual:** reutilizar a direção já documentada em `docs/identidade-visual.md`: carta náutica, pergaminho, tinta escura, mar profundo e laranja reservado às ações. Menu, lobby, HUD, minimapa, dicas, chat, telas de papel e controles atuais permanecem em HTML/CSS.
- **Entrada e rede:** conservar WASD/setas, Shift, E, G, Q, R, Enter, joystick e botões de toque. O cliente continua enviando os mesmos eventos (`in`, `act`, `chat`, `start`, `rematch` e `leave`) e interpola os snapshots para renderizar o movimento suavemente.
- **PWA:** incluir os novos módulos e o runtime local do Three.js no shell cacheado, com versão de cache atualizada.
- **Deploy:** manter a configuração existente do Render. A migração será trabalhada em `manus/migracao-3d-threejs`; nenhuma alteração será enviada à `main` nem publicada automaticamente nesta etapa.

## Estrutura proposta

- `public/client.js`: manter conexão, telas, HUD, chat, controles e sincronização; substituir o loop de desenho 2D por chamadas ao renderer 3D.
- `public/game3d.js`: criar a cena Three.js, terreno e objetos, personagens, câmera, etiquetas, efeitos de visibilidade e projeção do minimapa.
- `public/vendor/three/`: arquivos do runtime Three.js copiados da dependência instalada em `postinstall` para servir e cachear localmente.
- `scripts/copy-three.js`: preparar os módulos de runtime usados pelo cliente no `public/` durante a instalação.
- `public/index.html`, `public/style.css` e `public/sw.js`: trocar a superfície de renderização, ajustar camadas e atualizar o cache PWA.
- `package.json` e `package-lock.json`: fixar a dependência Three.js e preparar o runtime estático.
- `src/` e `test/`: preservar a simulação e os contratos existentes; ajustar testes de fumaça somente para verificar os novos arquivos estáticos se necessário.

## Validação e limites

Executar os testes existentes de regras e conexão, verificar que o servidor continua oferecendo `/healthz` e `/ws`, e checar que os módulos 3D são servidos corretamente pelo servidor local. A hospedagem Render existente será mantida; não será feito push para `main` nem publicação de produção durante esta execução. A conversão do renderer não altera a lógica da simulação.
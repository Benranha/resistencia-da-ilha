# A Resistência da Ilha (protótipo web / PWA)

Jogo de dedução social e sobrevivência para até 9 jogadores, direto no navegador e instalável como PWA.
Baseado no GDD "A Resistência da Ilha": 9 sobreviventes chegam à Praia da Barra, a Resistência precisa
juntar o mapa, abrir o cofre e escapar de bote com o Capitão, enquanto Tropas e Sabotador se escondem entre eles.

## Rodar

```bash
npm install
npm start          # http://localhost:3000
npm test           # regras do jogo + teste de conexão WebSocket
```

Abra duas abas (ou celulares na mesma rede) para testar. Quem cria a sala vê um código de 4 letras e um link de convite.
Com menos de 9 jogadores, **bots completam a sala**, então dá para testar sozinho.

## Controles

| Ação | Teclado | Toque |
| --- | --- | --- |
| Mover | WASD / setas | joystick |
| Correr | Shift | botão Correr |
| Pegar item, abrir cofre, usar passagem, reviver, embarcar | E (segurar nas ações demoradas) | botão E |
| Entregar peças/chave/kit ao jogador mais próximo | G | botão G |
| Habilidade do papel | Q | botão Q |
| Ligar o rádio quebrado | R | botão R |
| Conversar (só quem está perto ouve) | Enter | botão Chat |

## Papéis (9 jogadores: 6 Resistência x 3 Tropas)

| Papel | Facção | O que faz |
| --- | --- | --- |
| Resistência (x3) | Resistência | Bônus de velocidade ao andar com 2 ou mais aliados Resistência por perto |
| Capitão | Resistência | Só ele vê o waypoint quando junta 3 peças de mapa. Precisa da chave para embarcar |
| Médico | Resistência | Com o Kit Médico, revive um jogador caído (uma vez) |
| Guarda | Resistência | 1 tiro letal (Q). Se acertar um inocente, a Resistência perde |
| Sabotador | Tropas | Q: forja uma peça de mapa falsa, ou tranca o cofre se estiver perto dele |
| Tropa (x2) | Tropas | Q: emboscada silenciosa. Usam as passagens secretas do Morro do Índio |

**Vitória da Resistência:** o Capitão, com a chave e as 3 peças verdadeiras, segura E por 3s no bote verdadeiro (ou todos os infiltrados caem).
**Vitória das Tropas:** maioria da Resistência eliminada, Capitão caído sem reviver em 20s, ou o tempo de 10 minutos acabar (o apocalipse chega).

## Mecânicas da ilha (do GDD)

- **Maré dinâmica:** a linha d'água sobe durante a partida e desacelera quem está na água.
- **Fadiga na areia:** correr na areia gasta 30% mais estamina.
- **Clima:** tempestades reduzem a visão e desligam o rádio por 25s.
- **Cofre:** a chave do bote fica num cofre que se arromba segurando E por 6s (o Sabotador pode trancá-lo).
- **Bote e pistas falsas:** existem um bote verdadeiro e um furado. Uma peça falsa no mapa leva o Capitão ao bote errado.
- **Informação escondida:** o servidor só envia o que cada jogador consegue ver. Papéis só aparecem para quem caiu ou no fim.
- **Chat por proximidade:** substitui, por enquanto, o chat de voz.

## Decisões que fugiram do texto original

- O GDD dizia 9 jogadores mas as quantidades somavam 10. Usei 3 Resistência + Capitão + Médico + Guarda (6) contra Sabotador + 2 Tropas (3), que bate com o balanceamento 6 vs 3 do próprio GDD.
- A regra do Guarda (matar inocente encerra a partida) está implementada como no texto. Para suavizar, mude `GUARD_FRIENDLY_FIRE_ENDS_MATCH` para `false` em `src/config.js`.
- A "janela de reviver" de 20s do Capitão não está no GDD. Ela evita que o Médico fique inútil quando o Capitão cai.
- O mini-game de gazua virou "segurar E" por enquanto.

## Estrutura

```
src/config.js    constantes, papéis, mapa (zonas, obstáculos, itens, botes)
src/game.js      regras do jogo e bots (lógica pura, testável sem rede)
src/server.js    HTTP estático + WebSocket + salas
public/          cliente (Canvas), PWA (manifest, service worker, ícones)
test/            testes de regras, simulação com bots e teste de ponta a ponta
```

O servidor é autoritativo: o cliente só envia entradas (`in`, `act`, `chat`) e desenha os snapshots recebidos a 20 Hz.

## PWA

Abra o jogo no Chrome/Edge/Safari e use "Instalar app" ou "Adicionar à tela inicial". O service worker guarda a casca do app,
mas o jogo precisa de internet. Para instalar fora de localhost é preciso servir com HTTPS (o cliente usa `wss://` automaticamente).

## Publicar

O servidor precisa de conexão WebSocket persistente. Use Render, Railway ou Fly.io (`npm start`, porta pela variável `PORT`).
A Vercel serve bem os arquivos de `public/`, mas não mantém o WebSocket do servidor de jogo.

## Próximos passos sugeridos

1. Jogar com amigos e ajustar tempos, velocidades e balanceamento em `src/config.js`.
2. Reunião de emergência com votação (hoje a dedução é só por conversa de proximidade).
3. Voz por proximidade (WebRTC) no lugar do chat de texto.
4. Mini-game real de gazua, arte e sons.
5. Mais mapas e salas públicas com matchmaking. Depois, avaliar migrar para Unity/Unreal + Steam.

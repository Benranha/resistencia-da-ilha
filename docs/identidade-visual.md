Identidade visual de **A Resistência da Ilha**, jogo online de dedução social e sobrevivência. O conceito é uma **carta náutica rasgada**: pergaminho e tinta sobre mar profundo, com o laranja de um pôr do sol como única cor de ação. Tudo que o jogador toca parece parte de um mapa que alguém rasgou em pedaços e espalhou pela ilha.

## Fundamentos de conteúdo

- Escreva em português do Brasil, falando com o jogador por **você**. Frases curtas, sem gíria.
- Botões e dicas do HUD usam o infinitivo ou o imperativo curto: "Pegar peça do mapa", "Segure E para arrombar o cofre".
- O tom é de suspense sem ironia. A interface informa o que aconteceu e nunca revela papéis fora do momento certo.
- Vocabulário fixo, sempre com inicial maiúscula nos papéis e facções: **Resistência**, **Tropas** (a facção) e **Tropa** (o papel), **Capitão**, **Médico**, **Guarda**, **Sabotador**. Em minúscula: bote, chave do bote, cofre, maré, tempestade. Peças do **Mapa Roto**. Regiões: Praia da Barra, Dunas, Morro do Índio, Sambaquis, Rochas da Ponta.
- Caixa alta só no estilo `rotulo`, com no máximo 3 palavras. Sem emoji na interface final. Ponto de exclamação só em alertas fortes (tempestade, Capitão caído) e na vitória.
- Exemplos reais do jogo: "Você é da Resistência", "Cofre trancado por 25s.", "O Capitão caiu! O Médico tem 20s para reviver.", "Tempestade! Visibilidade baixa e rádios sem sinal.", "O apocalipse chegou antes do bote partir."

## Fundamentos visuais

**Temas.** `noite` é o padrão de menu, lobby e HUD. `dia` é a versão em pergaminho, para telas de leitura. Superfícies de documento (peças do Mapa Roto, cartão de papel) usam `papel` com `tinta` nos dois temas, e o texto de cor sobre elas vem de `tinta-mare`, `tinta-brasa` e `tinta-coral`.

**Cor.**
- Telas: `fundo`, depois `superficie` para cartões e `superficie-alta` para botões e slots. Texto em `texto`, secundário em `texto-suave`.
- `brasa` é a única cor de ação, com texto `on-brasa`. Nunca use `brasa` para decoração.
- `ouro` é orientação: waypoint do Capitão, bússola, cronômetro em alerta e o anel de foco `focus`.
- As facções são `faccao-resistencia` (mare) e `faccao-tropas` (coral). A cor nunca vem sozinha: sempre com o nome do papel ou um ícone. `folha` é sucesso. `coral` é perigo e exaustão.
- Texto sobre `vidro` usa apenas `texto`. As cores de terreno (`areia`, `duna`, `sambaqui`, `mata`, `rocha`, `rocha-ponta`, `agua`, `agua-rasa`, `espuma`, `folhagem`) existem para o mapa e não entram em telas de interface.

**Tipografia.** Títulos em `titulo-1`, `titulo-2` e `titulo-3` (Fraunces, serifada e levemente irregular, como letra de carta antiga). Todo o resto em Atkinson Hyperlegible (`corpo`, `corpo-pequeno`, `botao`, `rotulo`), escolhida por ser legível em celular, ao sol, em pé. Cronômetro e contadores usam `hud-num`. Nunca abaixo de 12px, e nada abaixo de 14px em tela de toque, exceto `rotulo`.

**Espaço e forma.** Cartões usam `raio-lg` e `espaco-6` de padding. Botões e campos usam `raio-md`. Pílulas do HUD e botões de toque usam `raio-pilula`. Todo alvo clicável tem pelo menos `alvo-toque`, e os botões redondos do controle têm `botao-toque`. No mapa não existem cantos retos: costas, zonas e manchas de vegetação são formas orgânicas.

**Bordas e sombras.** Filete de 1px em `linha`. Controles interativos usam `linha-forte`, que mantém 3:1 de contraste. `sombra-cartao` só em cartões flutuantes, `sombra-hud` só no HUD.

**Estilo do mapa.** Formas planas com contorno de `tinta` de 2,5px, sombreado em duas tonalidades (cel-shading) e um grão leve por cima, como pintura de capa de livro. Cada zona usa a sua cor de terreno. A costa tem águas rasas (`agua-rasa`) e uma linha de `espuma`. Árvores e pedras levam um ponto de luz (`folhagem-luz`, `rocha-luz`). Fora do raio de visão, `nevoa`.

**Movimento.** Transições de 120 a 200 ms com ease-out, sem quique. Ondas e chuva são lentas. Respeite `prefers-reduced-motion`.

**Estados.** Hover clareia levemente o fundo. Pressionado desce 1px. Desabilitado fica a 50% de opacidade. Foco: anel sólido `focus` de 3px com 2px de distância.

## Iconografia

Os ícones do jogo ficam em `assets/Itens`: `peca-mapa`, `chave`, `kit-medico`, `radio`, `bote`, `cofre` e `bussola`. A marca está em `assets/Marca/marca.svg`. São SVGs coloridos em 48x48, com contorno de `tinta` de 2,5px e preenchimento próprio, então funcionam sobre `fundo` escuro e sobre `papel`. Use sempre como imagem (`<img>`). Os emojis do protótipo atual são provisórios e devem ser trocados por estes ícones. Faltam ícones dos seis papéis e os personagens.

## Ícones de funções, dicas e interface

Seguem a direção de arte do GDD: Resistência em azul-marinho e dourado, Tropas em vermelho-sangue, Médico em verde-esmeralda, Guarda em cinza-aço, Sabotador em roxo. Estão em `assets/Funcoes`, `assets/Dicas` e `assets/Interface`. Pendentes: marcador do bote, botões de tábua de navio e o fundo panorâmico do menu.

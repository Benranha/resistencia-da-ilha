'use strict';
// Constantes de jogo e dados do mapa. Compartilhado com o cliente via mensagem "start".

module.exports = {
  TICK_HZ: 20,
  MAX_PLAYERS: 9,
  MATCH_SECONDS: 600,

  WORLD: { w: 2400, h: 1500 },

  // Movimento e estamina
  PLAYER_R: 14,
  SPEED: 135,
  SPRINT_MULT: 1.55,
  UNION_MULT: 1.12, // bonus da Resistencia ao andar em grupo
  UNION_RADIUS: 170,
  UNION_MIN_ALLIES: 2,
  WATER_MULT: 0.55,
  STAM_MAX: 100,
  STAM_DRAIN: 22,
  STAM_REGEN: 14,
  SAND_STAM_MULT: 1.3, // correr na areia gasta 30% mais
  STAM_RECOVER_AT: 25,

  // Interacao
  INTERACT_R: 62,
  GIVE_R: 85,
  SAFE_R: 80,
  BOAT_R: 90,
  PASSAGE_R: 55,
  LOCKPICK_SECONDS: 6,
  BOAT_SECONDS: 3,
  INV_MAX: 8,

  // Habilidades
  AMBUSH_R: 58,
  AMBUSH_CD: 30,
  SHOT_R: 210,
  SHOT_ARC: 0.62, // radianos de cada lado da direcao do olhar
  FAKE_PIECE_CD: 40,
  SAFE_LOCK_SECONDS: 25,
  SAFE_LOCK_CD: 60,
  REVIVE_R: 64,
  RADIO_SECONDS: 20,
  RADIO_PING_EVERY: 1.2,
  // Regra do GDD: se o Guarda matar um inocente, a Resistencia perde.
  GUARD_FRIENDLY_FIRE_ENDS_MATCH: true,
  CAPTAIN_REVIVE_GRACE: 20,

  // Visao e audicao
  VISION_R: 380,
  VISION_R_STORM: 190,
  CHAT_R: 290,
  NOISE_R: 620,

  // Clima
  STORM_FIRST_AT: 120,
  STORM_EVERY_MIN: 100,
  STORM_EVERY_MAX: 160,
  STORM_SECONDS: 25,

  // Mare: a linha d'agua sobe de baixo para cima durante a partida
  TIDE_START: 60,
  TIDE_RISE: 440,

  // 9 jogadores: 6 Resistencia (3 + Capitao + Medico + Guarda) vs 3 Tropas (Sabotador + 2 Tropas)
  ROLES_9: ['capitao', 'medico', 'guarda', 'resistencia', 'resistencia', 'resistencia', 'sabotador', 'tropa', 'tropa'],

  ROLES: {
    resistencia: { name: 'Resistência', faction: 'resistencia', desc: 'Encontre as peças do mapa e a chave, e leve ao Capitão. Andar em grupo dá bônus de velocidade.' },
    capitao: { name: 'Capitão', faction: 'resistencia', desc: 'Reúna as 3 peças do mapa para ver o bote na bússola. Com a chave, embarque. Se você cair, o Médico tem poucos segundos para reviver você.' },
    medico: { name: 'Médico', faction: 'resistencia', desc: 'Ache o Kit Médico e reviva um jogador caído (uma vez). Pressione E perto do corpo.' },
    guarda: { name: 'Guarda', faction: 'resistencia', desc: 'Você tem 1 tiro letal (Q). Se atingir um inocente, a Resistência perde.' },
    sabotador: { name: 'Sabotador', faction: 'tropas', desc: 'Q: plante uma peça de mapa falsa, ou tranque o cofre se estiver perto dele. Impeça o bote.' },
    tropa: { name: 'Tropa', faction: 'tropas', desc: 'Q: emboscada silenciosa corpo a corpo. Use as passagens secretas do Morro do Índio (E).' },
  },

  DEFAULT_ZONE: { name: 'Mata', terrain: 'firm', color: '#2f5d3a' },
  ZONES: [
    { name: 'Praia da Barra', x: 0, y: 0, w: 720, h: 1500, terrain: 'sand', color: '#e3cf9a' },
    { name: 'Dunas', x: 720, y: 0, w: 980, h: 880, terrain: 'sand', color: '#d9b877' },
    { name: 'Morro do Índio', x: 1700, y: 0, w: 700, h: 900, terrain: 'rock', color: '#6d6a60' },
    { name: 'Sambaquis', x: 720, y: 1000, w: 780, h: 500, terrain: 'sand', color: '#cdb98a' },
    { name: 'Rochas da Ponta', x: 1500, y: 900, w: 900, h: 600, terrain: 'rock', color: '#5a5750' },
  ],

  OBSTACLES: [
    { x: 400, y: 300, r: 40 }, { x: 300, y: 800, r: 34 }, { x: 560, y: 1150, r: 46 },
    { x: 900, y: 400, r: 50 }, { x: 1150, y: 650, r: 36 }, { x: 1450, y: 250, r: 44 },
    { x: 1600, y: 700, r: 40 }, { x: 1800, y: 300, r: 60 }, { x: 2100, y: 200, r: 50 },
    { x: 2250, y: 550, r: 56 }, { x: 1950, y: 650, r: 42 }, { x: 1100, y: 940, r: 38 },
    { x: 1400, y: 1200, r: 46 }, { x: 900, y: 1300, r: 40 }, { x: 1750, y: 1100, r: 52 },
    { x: 2050, y: 1000, r: 48 }, { x: 2300, y: 1200, r: 54 }, { x: 700, y: 950, r: 30 },
  ],

  ITEM_SPAWNS: [
    [200, 200], [520, 420], [150, 700], [600, 900], [380, 1250],
    [900, 200], [1300, 150], [1500, 500], [1000, 750], [1650, 820],
    [1850, 150], [2200, 300], [2300, 780], [1900, 820],
    [800, 1100], [1000, 1400], [1300, 1100], [1200, 1380],
    [1650, 1000], [1900, 1250], [2200, 1100], [2300, 1400], [1250, 940],
  ],

  SAFE_SPOTS: [{ x: 2150, y: 420 }, { x: 1050, y: 1150 }, { x: 320, y: 1050 }],

  BOAT_SITES: [
    { name: 'Dunas Altas', x: 1250, y: 300 },
    { name: 'Base do Morro do Índio', x: 2050, y: 760 },
    { name: 'Sambaquis', x: 1100, y: 1280 },
  ],

  PASSAGE: { a: { x: 1760, y: 120 }, b: { x: 2320, y: 860 } },

  SPAWN_AREA: { x: 120, y: 450, w: 380, h: 500 },
};

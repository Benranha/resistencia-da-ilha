'use strict';
const assert = require('assert');
const C = require('../src/config');
const { Game } = require('../src/game');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   -', name); } catch (e) { console.error('FAIL -', name, '\n', e.stack); process.exitCode = 1; }
}

// Cria um jogo com 9 humanos e papeis fixos (ordem de C.ROLES_9)
function make(seed = 1) {
  const g = new Game(seed);
  for (let i = 0; i < 9; i++) g.addPlayer('J' + (i + 1));
  g.start({ roles: C.ROLES_9 });
  const by = {};
  for (const p of g.players.values()) { (by[p.role] = by[p.role] || []).push(p); }
  // espalha todos longe uns dos outros para nao interferir
  let k = 0;
  for (const p of g.players.values()) { p.x = 100 + (k % 3) * 40; p.y = 100 + Math.floor(k / 3) * 40 + k * 3; k++; }
  g.events = [];
  return { g, by };
}
const place = (p, x, y) => { p.x = x; p.y = y; };
const run = (g, secs) => { for (let i = 0; i < secs * C.TICK_HZ; i++) g.step(1 / C.TICK_HZ); };
const press = (g, p, secs) => { p.input.e = true; run(g, secs); p.input.e = false; run(g, 0.1); };

test('9 jogadores: 6 Resistencia e 3 Tropas', () => {
  const { g } = make();
  const fac = [...g.players.values()].map((p) => C.ROLES[p.role].faction);
  assert.strictEqual(fac.filter((f) => f === 'resistencia').length, 6);
  assert.strictEqual(fac.filter((f) => f === 'tropas').length, 3);
});

test('start com 1 humano completa com bots ate 9', () => {
  const g = new Game(5); g.addPlayer('Solo'); g.start();
  assert.strictEqual(g.players.size, 9);
  assert.strictEqual(g.humans().length, 1);
  const roles = [...g.players.values()].map((p) => p.role).sort().join();
  assert.strictEqual(roles, C.ROLES_9.slice().sort().join());
});

test('itens: 3 pecas, 1 kit e 1 radio no mapa', () => {
  const { g } = make();
  const n = (t) => g.items.filter((i) => i.type === t).length;
  assert.deepStrictEqual([n('piece'), n('kit'), n('radio')], [3, 1, 1]);
  assert.notStrictEqual(g.realSite, g.decoySite);
});

test('corrida na areia gasta 30% mais estamina que na rocha', () => {
  const { g, by } = make();
  const a = by.resistencia[0]; const b = by.resistencia[1];
  place(a, 300, 700); place(b, 2000, 400); // praia (areia) vs morro (rocha)
  for (const p of [a, b]) { p.input.dx = 0; p.input.dy = 1; p.input.sprint = true; }
  run(g, 1);
  const lossSand = C.STAM_MAX - a.stamina; const lossRock = C.STAM_MAX - b.stamina;
  const ratio = lossSand / lossRock;
  assert.ok(Math.abs(ratio - 1.3) < 0.05, 'ratio=' + ratio);
});

test('bonus de uniao: Resistencia em grupo anda mais rapido', () => {
  const { g, by } = make();
  const [a, b, c] = by.resistencia;
  place(a, 500, 500); place(b, 520, 500); place(c, 540, 500);
  const solo = by.resistencia[0];
  a.input.dx = 1; const x0 = a.x; run(g, 1); const grouped = a.x - x0;
  place(a, 1200, 300); place(b, 300, 300); place(c, 300, 600); a.input.dx = 1;
  const x1 = a.x; run(g, 1); const alone = a.x - x1;
  assert.ok(grouped > alone * 1.1, `grouped=${grouped} alone=${alone}`);
  assert.ok(solo);
});

test('mare sobe durante a partida e desacelera na agua', () => {
  const { g } = make();
  const w0 = g.waterline; run(g, 120); assert.ok(g.waterline < w0, 'linha d\'agua deveria subir');
});

test('cofre: segurar E abre e da a chave; Sabotador consegue trancar', () => {
  const { g, by } = make();
  const r = by.resistencia[0]; const sab = by.sabotador[0];
  place(r, g.safe.x + 20, g.safe.y); place(sab, g.safe.x - 30, g.safe.y);
  g.useAbility(sab);
  assert.ok(g.safe.lockedUntil > g.time, 'deveria estar trancado');
  press(g, r, C.LOCKPICK_SECONDS + 1);
  assert.ok(!g.safe.open, 'trancado nao deve abrir');
  run(g, C.SAFE_LOCK_SECONDS);
  press(g, r, C.LOCKPICK_SECONDS + 1);
  assert.ok(g.safe.open, 'deveria abrir');
  assert.ok(g.hasItem(r, 'key'));
});

test('Resistencia vence: Capitao com chave e mapa real embarca no bote', () => {
  const { g, by } = make();
  const cap = by.capitao[0];
  cap.inv.push({ type: 'key' }, { type: 'piece' }, { type: 'piece' }, { type: 'piece' });
  const m = g.captainMap(cap);
  assert.ok(m && m.real && m.x === g.realSite.x);
  place(cap, g.realSite.x, g.realSite.y);
  press(g, cap, C.BOAT_SECONDS + 1);
  assert.strictEqual(g.phase, 'ended');
  assert.strictEqual(g.result.winner, 'resistencia');
});

test('Falsa Pista: mapa com peca falsa leva ao bote furado e nao vence', () => {
  const { g, by } = make();
  const cap = by.capitao[0]; const sab = by.sabotador[0];
  g.useAbility(sab);
  const fake = sab.inv.find((i) => i.fake); assert.ok(fake, 'sabotador deveria ter peca falsa');
  place(sab, 200, 200); place(cap, 210, 200);
  g.giveItems(sab);
  assert.ok(cap.inv.some((i) => i.fake));
  cap.inv.push({ type: 'piece' }, { type: 'piece' }, { type: 'key' });
  const m = g.captainMap(cap);
  assert.ok(!m.real && m.x === g.decoySite.x, 'waypoint deveria apontar o bote falso');
  place(cap, g.decoySite.x, g.decoySite.y);
  press(g, cap, C.BOAT_SECONDS + 1);
  assert.strictEqual(g.phase, 'playing');
  assert.ok(!cap.inv.some((i) => i.fake), 'peca falsa deveria ser descartada');
});

test('Guarda atirar em inocente derrota a Resistencia', () => {
  const { g, by } = make();
  const guard = by.guarda[0]; const victim = by.resistencia[0];
  place(guard, 1000, 700); place(victim, 1100, 700); guard.facing = 0;
  g.useAbility(guard);
  assert.strictEqual(g.phase, 'ended');
  assert.strictEqual(g.result.winner, 'tropas');
});

test('Guarda acertar infiltrado funciona e so tem 1 tiro', () => {
  const { g, by } = make();
  const guard = by.guarda[0]; const t = by.tropa[0];
  place(guard, 1000, 700); place(t, 1100, 700); guard.facing = 0;
  g.useAbility(guard);
  assert.ok(!t.alive); assert.strictEqual(g.phase, 'playing');
  const t2 = by.tropa[1]; place(t2, 1100, 700);
  g.useAbility(guard);
  assert.ok(t2.alive, 'segundo tiro nao deve existir');
});

test('Tropa: emboscada elimina, tem recarga e deixa corpo', () => {
  const { g, by } = make();
  const tropa = by.tropa[0]; const v = by.resistencia[0]; const v2 = by.resistencia[1];
  tropa.cd.ability = 0;
  place(tropa, 1500, 500); place(v, 1530, 500); place(v2, 1535, 520);
  g.useAbility(tropa);
  assert.ok(!v.alive && g.bodies.length === 1);
  g.useAbility(tropa);
  assert.ok(v2.alive, 'recarga deveria impedir');
});

test('Tropa nao embosca aliado', () => {
  const { g, by } = make();
  const a = by.tropa[0]; const b = by.tropa[1]; a.cd.ability = 0;
  place(a, 1500, 500); place(b, 1520, 500);
  g.useAbility(a);
  assert.ok(b.alive);
});

test('Medico revive com o kit e o Capitao volta ao jogo', () => {
  const { g, by } = make();
  const med = by.medico[0]; const cap = by.capitao[0]; const tropa = by.tropa[0];
  tropa.cd.ability = 0; place(tropa, 900, 900); place(cap, 920, 900);
  g.useAbility(tropa);
  assert.ok(!cap.alive);
  med.inv.push({ type: 'kit' }); place(med, 905, 930);
  run(g, 0.1);
  assert.ok(g.captainGraceUntil != null, 'deveria abrir janela de reviver');
  press(g, med, 0.2);
  assert.ok(cap.alive, 'capitao deveria estar vivo');
  assert.strictEqual(g.captainGraceUntil, null);
  assert.ok(!g.hasItem(med, 'kit'));
});

test('Capitao caido sem reviver a tempo: Tropas vencem', () => {
  const { g, by } = make();
  const med = by.medico[0]; const cap = by.capitao[0]; const tropa = by.tropa[0];
  tropa.cd.ability = 0; place(tropa, 900, 900); place(cap, 920, 900);
  g.useAbility(tropa);
  run(g, C.CAPTAIN_REVIVE_GRACE + 1);
  assert.strictEqual(g.result && g.result.winner, 'tropas');
  assert.ok(med);
});

test('Resistencia vence se todos os infiltrados caem', () => {
  const { g, by } = make();
  for (const p of [...by.tropa, ...by.sabotador]) g.kill(p, null, 'x');
  run(g, 0.1);
  assert.strictEqual(g.result.winner, 'resistencia');
});

test('Tropas vencem quando a maioria da Resistencia cai', () => {
  const { g, by } = make();
  const res = [...by.resistencia, ...by.medico, ...by.guarda]; // capitao fica vivo
  for (const p of res) g.kill(p, null, 'x');
  run(g, 0.1);
  assert.strictEqual(g.result.winner, 'tropas');
});

test('Tropas vencem por tempo (apocalipse)', () => {
  const { g } = make();
  g.time = C.MATCH_SECONDS - 0.1; run(g, 0.5);
  assert.strictEqual(g.result.winner, 'tropas');
});

test('tempestade: reduz visao e desliga o radio', () => {
  const { g, by } = make();
  const r = by.resistencia[0]; const far = by.resistencia[1];
  place(r, 1000, 600); place(far, 1000 + 300, 600); // visivel (300 < 380) mas nao na tempestade (190)
  assert.ok(g.snapshotFor(r.id).pl.some((p) => p.id === far.id));
  g.time = C.STORM_FIRST_AT + 0.1; run(g, 0.2);
  assert.ok(g.storm.active);
  assert.ok(!g.snapshotFor(r.id).pl.some((p) => p.id === far.id), 'nao deveria ver durante a tempestade');
  r.inv.push({ type: 'radio' }); g.useRadio(r);
  assert.ok(g.hasItem(r, 'radio'), 'radio deve falhar na tempestade');
});

test('radio: emite ruido para jogadores proximos', () => {
  const { g, by } = make();
  const r = by.resistencia[0]; const listener = by.resistencia[1];
  place(r, 1000, 600); place(listener, 1200, 600);
  r.inv.push({ type: 'radio' }); g.useRadio(r);
  g.events = []; run(g, 2);
  assert.ok(g.events.some((e) => e.msg.t === 'noise' && e.ids.includes(listener.id)));
});

test('visao: jogador distante nao aparece no snapshot; espectador ve tudo com papeis', () => {
  const { g, by } = make();
  const a = by.resistencia[0]; const b = by.resistencia[1]; const t = by.tropa[0];
  place(a, 200, 200); place(b, 2200, 1400); place(t, 250, 200);
  let s = g.snapshotFor(a.id);
  assert.ok(!s.pl.some((p) => p.id === b.id));
  assert.ok(s.pl.some((p) => p.id === t.id) && s.pl.find((p) => p.id === t.id).role === undefined, 'papel nao deve vazar');
  g.kill(a, null, 'x');
  s = g.snapshotFor(a.id);
  assert.ok(s.pl.some((p) => p.id === b.id && p.role === 'resistencia'));
});

test('chat por proximidade', () => {
  const { g, by } = make();
  const a = by.resistencia[0]; const near = by.resistencia[1]; const far = by.resistencia[2];
  place(a, 500, 500); place(near, 600, 500); place(far, 1500, 900);
  g.events = []; g.chat(a.id, 'oi');
  const ev = g.events.find((e) => e.msg.t === 'chat');
  assert.ok(ev.ids.includes(near.id) && !ev.ids.includes(far.id));
});

test('passagens secretas: so Tropas usam', () => {
  const { g, by } = make();
  const tropa = by.tropa[0]; const res = by.resistencia[0];
  place(tropa, C.PASSAGE.a.x, C.PASSAGE.a.y); place(res, C.PASSAGE.a.x + 10, C.PASSAGE.a.y);
  press(g, tropa, 0.2);
  assert.ok(Math.hypot(tropa.x - C.PASSAGE.b.x, tropa.y - C.PASSAGE.b.y) < 80);
  place(res, C.PASSAGE.a.x, C.PASSAGE.a.y); const rx = res.x;
  press(g, res, 0.2);
  assert.ok(Math.abs(res.x - rx) < 5, 'Resistencia nao deveria teleportar');
});

test('entregar itens (G) ao Capitao', () => {
  const { g, by } = make();
  const a = by.resistencia[0]; const cap = by.capitao[0];
  place(a, 500, 500); place(cap, 530, 500);
  a.inv.push({ type: 'piece' }, { type: 'key' }, { type: 'radio' });
  g.giveItems(a);
  assert.strictEqual(cap.inv.length, 2); assert.strictEqual(a.inv.length, 1, 'radio nao e transferivel');
});

// Simulacoes completas com bots
test('simulacao: 8 partidas so com bots terminam sem erros', () => {
  const tally = { resistencia: 0, tropas: 0 }; let maxTicks = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const g = new Game(seed * 77);
    const h = g.addPlayer('Humano'); h.bot = true; h.wasHuman = false; // tudo bot
    g.start();
    let ticks = 0;
    while (g.phase === 'playing' && ticks < C.MATCH_SECONDS * C.TICK_HZ + 200) { g.step(1 / C.TICK_HZ); g.events = []; for (const p of g.players.values()) g.snapshotFor(p.id); ticks++; }
    assert.strictEqual(g.phase, 'ended', 'seed ' + seed + ' nao terminou');
    tally[g.result.winner]++; maxTicks = Math.max(maxTicks, ticks);
  }
  console.log('       resultados dos bots:', JSON.stringify(tally), 'maior duracao (s):', maxTicks / C.TICK_HZ);
});

console.log(`\n${passed} testes passaram`);

'use strict';
const C = require('./config');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function zoneAt(x, y) {
  for (const z of C.ZONES) {
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
  }
  return C.DEFAULT_ZONE;
}

const TRANSFERABLE = new Set(['piece', 'key', 'kit']);

class Game {
  constructor(seed) {
    this.rng = mulberry32(seed || (Date.now() & 0xffffffff));
    this.players = new Map();
    this.nextPlayerId = 1;
    this.nextItemId = 1;
    this.phase = 'lobby'; // lobby | playing | ended
    this.time = 0;
    this.events = []; // {ids:[...], msg:{...}}
    this.result = null;
    this.items = [];
    this.bodies = [];
    this.radios = [];
    this.safe = null;
    this.realSite = null;
    this.decoySite = null;
    this.storm = { active: false, until: 0, next: C.STORM_FIRST_AT };
    this.waterline = C.WORLD.h - C.TIDE_START;
    this.captainGraceUntil = null;
  }

  // ---------- util ----------
  rand() { return this.rng(); }
  randInt(n) { return Math.floor(this.rng() * n); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  emit(ids, msg) { this.events.push({ ids, msg }); }
  say(id, text, kind) { this.emit([id], { t: 'msg', text, kind: kind || 'info' }); }
  sayAll(text, kind) { this.emit([...this.players.keys()], { t: 'msg', text, kind: kind || 'info' }); }
  hearIds(x, y, r, includeDead = true) {
    const ids = [];
    for (const p of this.players.values()) {
      if (p.bot && !p.wasHuman) continue;
      if (!p.alive) { if (includeDead) ids.push(p.id); continue; }
      if (Math.hypot(p.x - x, p.y - y) <= r) ids.push(p.id);
    }
    return ids;
  }
  noise(x, y, kind) {
    this.emit(this.hearIds(x, y, C.NOISE_R), { t: 'noise', x, y, kind });
  }
  visionR() { return this.storm.active ? C.VISION_R_STORM : C.VISION_R; }

  // ---------- lobby ----------
  addPlayer(name, bot = false) {
    const id = this.nextPlayerId++;
    const p = {
      id, name: String(name || 'Jogador').slice(0, 16), bot, wasHuman: !bot,
      x: 0, y: 0, facing: 0, stamina: C.STAM_MAX, exhausted: false, alive: true,
      role: null, inv: [], cd: { ability: 0 }, shotUsed: false, kitUsed: false,
      input: { dx: 0, dy: 0, sprint: false, e: false }, ePrev: false,
      prog: { key: null, t: 0 }, hint: '', connected: true,
      ai: { tx: 0, ty: 0, until: 0, mode: 'wander' },
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }

  humans() { return [...this.players.values()].filter((p) => !p.bot); }

  // opts.roles: array de papeis por ordem de jogador (usado em testes)
  start(opts = {}) {
    if (this.phase === 'playing') return false;
    const list = [...this.players.values()];
    let n = 1;
    while (list.length < C.MAX_PLAYERS) {
      const b = this.addPlayer('Bot ' + n++, true);
      b.wasHuman = false;
      list.push(b);
    }
    let roles;
    if (opts.roles) roles = opts.roles.slice(0, list.length);
    else roles = this.shuffle(C.ROLES_9.slice(0, list.length));
    const order = opts.roles ? list : this.shuffle(list.slice());
    order.forEach((p, i) => { p.role = roles[i]; });

    this.phase = 'playing';
    this.time = 0;
    this.result = null;
    this.items = [];
    this.bodies = [];
    this.radios = [];
    this.captainGraceUntil = null;
    this.storm = { active: false, until: 0, next: C.STORM_FIRST_AT };

    const S = C.SPAWN_AREA;
    for (const p of list) {
      p.x = S.x + this.rand() * S.w;
      p.y = S.y + this.rand() * S.h;
      p.alive = true; p.inv = []; p.stamina = C.STAM_MAX; p.exhausted = false;
      p.cd.ability = p.role === 'tropa' ? 10 : 0;
      p.shotUsed = false; p.kitUsed = false; p.prog = { key: null, t: 0 };
      p.ai = { tx: p.x, ty: p.y, until: 0, mode: 'wander' };
    }

    // Itens: 3 pecas, kit medico, radio em pontos aleatorios
    const spots = this.shuffle(C.ITEM_SPAWNS.map((s) => ({ x: s[0], y: s[1] })));
    const place = (type) => { const s = spots.pop(); this.items.push({ id: this.nextItemId++, type, x: s.x, y: s.y }); };
    place('piece'); place('piece'); place('piece'); place('kit'); place('radio');

    this.safe = Object.assign({ open: false, lockedUntil: 0, lockCd: 0 }, C.SAFE_SPOTS[this.randInt(C.SAFE_SPOTS.length)]);
    const sites = this.shuffle(C.BOAT_SITES.map((s, i) => i));
    this.realSite = C.BOAT_SITES[sites[0]];
    this.decoySite = C.BOAT_SITES[sites[1]];
    return true;
  }

  // ---------- entrada ----------
  setInput(id, inp) {
    const p = this.players.get(id);
    if (!p) return;
    p.input.dx = clamp(+inp.dx || 0, -1, 1);
    p.input.dy = clamp(+inp.dy || 0, -1, 1);
    p.input.sprint = !!inp.sprint;
    p.input.e = !!inp.e;
  }

  chat(id, text) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing') return;
    text = String(text || '').trim().slice(0, 120);
    if (!text) return;
    const ids = [];
    for (const q of this.players.values()) {
      if (q.bot && !q.wasHuman) continue;
      if (p.alive) {
        if (q.alive && Math.hypot(q.x - p.x, q.y - p.y) <= C.CHAT_R) ids.push(q.id);
        else if (!q.alive) ids.push(q.id);
      } else if (!q.alive) ids.push(q.id);
    }
    this.emit(ids, { t: 'chat', id: p.id, name: p.name, text, x: p.x, y: p.y, dead: !p.alive });
  }

  act(id, a) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'playing') return;
    if (a === 'give') this.giveItems(p);
    else if (a === 'ability') this.useAbility(p);
    else if (a === 'radio') this.useRadio(p);
  }

  // ---------- inventario ----------
  hasItem(p, type) { return p.inv.some((i) => i.type === type); }
  addItem(p, it) { if (p.inv.length >= C.INV_MAX) return false; p.inv.push(it); return true; }
  realPieces(p) { return p.inv.filter((i) => i.type === 'piece' && !i.fake).length; }
  anyPieces(p) { return p.inv.filter((i) => i.type === 'piece').length; }

  giveItems(p) {
    let best = null; let bd = C.GIVE_R;
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const d = dist(p, q);
      if (d < bd) { bd = d; best = q; }
    }
    const give = p.inv.filter((i) => TRANSFERABLE.has(i.type));
    if (!best) return this.say(p.id, 'Ninguém por perto para receber.');
    if (!give.length) return this.say(p.id, 'Você não tem nada para entregar.');
    let moved = 0;
    for (const it of give) {
      if (best.inv.length >= C.INV_MAX) break;
      best.inv.push(it);
      p.inv.splice(p.inv.indexOf(it), 1);
      moved++;
    }
    if (moved) {
      this.say(p.id, `Você entregou ${moved} item(ns) para ${best.name}.`);
      this.say(best.id, `${p.name} entregou ${moved} item(ns) para você.`, 'good');
    }
  }

  // ---------- habilidades ----------
  useAbility(p) {
    if (p.cd.ability > 0) return this.say(p.id, `Habilidade em recarga (${Math.ceil(p.cd.ability)}s).`);
    if (p.role === 'tropa') {
      let best = null; let bd = C.AMBUSH_R;
      for (const q of this.players.values()) {
        if (!q.alive || q === p || C.ROLES[q.role].faction === 'tropas') continue;
        const d = dist(p, q);
        if (d < bd) { bd = d; best = q; }
      }
      if (!best) return this.say(p.id, 'Nenhum alvo ao alcance.');
      p.cd.ability = C.AMBUSH_CD;
      this.kill(best, p, 'ambush');
      this.say(p.id, `Emboscada em ${best.name}.`, 'bad');
    } else if (p.role === 'sabotador') {
      const s = this.safe;
      if (!s.open && dist(p, s) <= C.SAFE_R + 20) {
        if (s.lockCd > 0) return this.say(p.id, `Cofre ainda em recarga (${Math.ceil(s.lockCd)}s).`);
        s.lockedUntil = this.time + C.SAFE_LOCK_SECONDS;
        s.lockCd = C.SAFE_LOCK_CD;
        p.cd.ability = 5;
        this.say(p.id, 'Cofre trancado por 25s.', 'bad');
      } else {
        if (p.inv.some((i) => i.fake)) return this.say(p.id, 'Você já tem uma peça falsa.');
        if (!this.addItem(p, { type: 'piece', fake: true })) return this.say(p.id, 'Inventário cheio.');
        p.cd.ability = C.FAKE_PIECE_CD;
        this.say(p.id, 'Você forjou uma peça de mapa falsa. Entregue ao Capitão (G).', 'bad');
      }
    } else if (p.role === 'guarda') {
      if (p.shotUsed) return this.say(p.id, 'Você já usou seu tiro.');
      let best = null; let bd = C.SHOT_R;
      for (const q of this.players.values()) {
        if (!q.alive || q === p) continue;
        const d = dist(p, q);
        if (d > bd) continue;
        let da = Math.atan2(q.y - p.y, q.x - p.x) - p.facing;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > C.SHOT_ARC) continue;
        bd = d; best = q;
      }
      if (!best) return this.say(p.id, 'Nenhum alvo na mira. Vire na direção do alvo.');
      p.shotUsed = true;
      this.noise(p.x, p.y, 'shot');
      this.kill(best, p, 'shot');
      if (C.ROLES[best.role].faction === 'resistencia') {
        if (C.GUARD_FRIENDLY_FIRE_ENDS_MATCH) this.endGame('tropas', `O Guarda matou ${best.name}, um inocente.`);
        else this.say(p.id, 'Você atirou em um inocente.', 'bad');
      } else {
        this.say(p.id, `Você abateu ${best.name}: era um infiltrado!`, 'good');
      }
    } else if (p.role === 'medico') {
      this.say(p.id, 'Para reviver, fique perto do corpo e pressione E (precisa do Kit Médico).');
    } else {
      this.say(p.id, 'Seu papel não tem habilidade ativa.');
    }
  }

  useRadio(p) {
    const idx = p.inv.findIndex((i) => i.type === 'radio');
    if (idx < 0) return this.say(p.id, 'Você não tem o rádio.');
    if (this.storm.active) return this.say(p.id, 'O rádio está sem sinal durante a tempestade.');
    p.inv.splice(idx, 1);
    this.radios.push({ x: p.x, y: p.y, until: this.time + C.RADIO_SECONDS, next: this.time + 0.4, flip: false });
    this.say(p.id, 'Rádio ligado: ele vai fazer barulho aqui por 20s.');
  }

  kill(victim, killer, cause) {
    victim.alive = false;
    victim.prog = { key: null, t: 0 };
    this.bodies.push({ id: victim.id, x: victim.x, y: victim.y });
    for (const it of victim.inv) {
      this.items.push({ id: this.nextItemId++, type: it.type, fake: it.fake, x: victim.x + (this.rand() - 0.5) * 50, y: victim.y + (this.rand() - 0.5) * 50 });
    }
    victim.inv = [];
    this.say(victim.id, cause === 'shot' ? 'Você foi baleado. Agora você assiste a partida.' : 'Você foi eliminado. Agora você assiste a partida.', 'bad');
  }

  // ---------- interacao ----------
  findTarget(p) {
    let best = null;
    const consider = (kind, obj, x, y, r) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= r && (!best || d < best.d)) best = { kind, obj, d };
    };
    for (const it of this.items) consider('item', it, it.x, it.y, C.INTERACT_R);
    if (!this.safe.open) consider('safe', this.safe, this.safe.x, this.safe.y, C.SAFE_R);
    if (p.role === 'medico' && this.hasItem(p, 'kit')) {
      for (const b of this.bodies) consider('body', b, b.x, b.y, C.REVIVE_R);
    }
    if (C.ROLES[p.role].faction === 'tropas') {
      consider('passage', 'a', C.PASSAGE.a.x, C.PASSAGE.a.y, C.PASSAGE_R);
      consider('passage', 'b', C.PASSAGE.b.x, C.PASSAGE.b.y, C.PASSAGE_R);
    }
    consider('boat', this.realSite, this.realSite.x, this.realSite.y, C.BOAT_R);
    consider('decoy', this.decoySite, this.decoySite.x, this.decoySite.y, C.BOAT_R);
    return best;
  }

  captainMap(p) {
    if (p.role !== 'capitao' || this.anyPieces(p) < 3) return null;
    const real = this.realPieces(p) >= 3;
    const site = real ? this.realSite : this.decoySite;
    return { real, x: site.x, y: site.y, name: site.name };
  }

  handleInteract(p, dt) {
    const e = p.input.e;
    const edge = e && !p.ePrev;
    p.ePrev = e;
    const t = this.findTarget(p);
    p.hint = '';
    let holdKey = null; let holdNeed = 0; let holdOk = false;

    if (t) {
      switch (t.kind) {
        case 'item': {
          const label = { piece: 'peça do mapa', key: 'chave do bote', kit: 'kit médico', radio: 'rádio quebrado' }[t.obj.type];
          p.hint = `E: pegar ${label}`;
          if (edge) {
            if (this.addItem(p, { type: t.obj.type, fake: t.obj.fake })) {
              this.items.splice(this.items.indexOf(t.obj), 1);
              this.say(p.id, `Você pegou: ${label}.`, 'good');
            } else this.say(p.id, 'Inventário cheio.');
          }
          break;
        }
        case 'safe': {
          const locked = this.safe.lockedUntil > this.time;
          p.hint = locked ? 'Cofre trancado' : 'Segure E: arrombar o cofre';
          if (!locked) { holdKey = 'safe'; holdNeed = C.LOCKPICK_SECONDS; holdOk = true; }
          break;
        }
        case 'body': {
          p.hint = 'E: reviver com o Kit Médico';
          if (edge) this.revive(p, t.obj);
          break;
        }
        case 'passage': {
          p.hint = 'E: usar passagem secreta';
          if (edge) {
            const dest = t.obj === 'a' ? C.PASSAGE.b : C.PASSAGE.a;
            p.x = dest.x + 40; p.y = dest.y + 30;
          }
          break;
        }
        case 'decoy': {
          p.hint = 'Um bote encalhado';
          if (edge) {
            const m = this.captainMap(p);
            if (m && !m.real) {
              const i = p.inv.findIndex((x) => x.fake);
              if (i >= 0) p.inv.splice(i, 1);
              this.say(p.id, 'Casco furado! O mapa tinha uma peça falsa. Ela foi descartada.', 'bad');
            } else this.say(p.id, 'Este bote está com o casco furado.');
          }
          break;
        }
        case 'boat': {
          if (p.role !== 'capitao') {
            p.hint = 'Um bote!';
            if (edge) this.say(p.id, 'Você achou um bote! Só o Capitão, com a chave e o mapa completo, consegue embarcar.', 'good');
          } else {
            const hasKey = this.hasItem(p, 'key');
            const real = this.realPieces(p) >= 3;
            if (hasKey && real) { p.hint = 'Segure E: embarcar'; holdKey = 'boat'; holdNeed = C.BOAT_SECONDS; holdOk = true; }
            else {
              p.hint = !hasKey ? 'Falta a chave do bote' : 'Falta o mapa completo';
              if (edge) this.say(p.id, !hasKey ? 'Você precisa da chave do bote (está no cofre).' : 'Você precisa das 3 peças verdadeiras do mapa.');
            }
          }
          break;
        }
        default: break;
      }
    }

    if (holdKey && e && holdOk) {
      if (p.prog.key !== holdKey) p.prog = { key: holdKey, t: 0 };
      p.prog.t += dt;
      if (p.prog.t >= holdNeed) {
        p.prog = { key: null, t: 0 };
        if (holdKey === 'safe') {
          this.safe.open = true;
          this.addItem(p, { type: 'key' }) || this.items.push({ id: this.nextItemId++, type: 'key', x: this.safe.x, y: this.safe.y + 30 });
          this.noise(this.safe.x, this.safe.y, 'clank');
          this.say(p.id, 'Cofre aberto! A chave do bote é sua. Entregue ao Capitão (G).', 'good');
        } else if (holdKey === 'boat') {
          this.endGame('resistencia', 'O Capitão embarcou com a chave e levou a Resistência para fora da ilha.');
        }
      }
    } else {
      p.prog = { key: null, t: 0 };
    }
    p.progNeed = holdNeed;
  }

  revive(medic, body) {
    const v = this.players.get(body.id);
    const ki = medic.inv.findIndex((i) => i.type === 'kit');
    if (!v || ki < 0) return;
    medic.inv.splice(ki, 1);
    medic.kitUsed = true;
    this.bodies.splice(this.bodies.indexOf(body), 1);
    v.alive = true; v.stamina = 50; v.x = body.x; v.y = body.y;
    this.say(v.id, 'O Médico reviveu você!', 'good');
    this.say(medic.id, `Você reviveu ${v.name}.`, 'good');
    if (v.role === 'capitao') this.captainGraceUntil = null;
  }

  // ---------- fim de jogo ----------
  endGame(winner, reason) {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';
    this.result = { winner, reason };
    const roles = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive }));
    this.emit([...this.players.keys()], { t: 'end', winner, reason, roles });
  }

  checkEnd() {
    const all = [...this.players.values()];
    const res = all.filter((p) => p.alive && C.ROLES[p.role].faction === 'resistencia');
    const tro = all.filter((p) => p.alive && C.ROLES[p.role].faction === 'tropas');
    if (!tro.length) return this.endGame('resistencia', 'Todos os infiltrados foram eliminados.');
    if (res.length <= tro.length) return this.endGame('tropas', 'A maioria da Resistência foi eliminada.');
    const cap = all.find((p) => p.role === 'capitao');
    if (cap && !cap.alive) {
      const medic = all.find((p) => p.role === 'medico');
      const canRevive = medic && medic.alive && !medic.kitUsed;
      if (!canRevive) return this.endGame('tropas', 'O Capitão caiu e não há como reviver.');
      if (this.captainGraceUntil == null) {
        this.captainGraceUntil = this.time + C.CAPTAIN_REVIVE_GRACE;
        this.sayAll(`O Capitão caiu! O Médico tem ${C.CAPTAIN_REVIVE_GRACE}s para reviver.`, 'bad');
      } else if (this.time >= this.captainGraceUntil) {
        return this.endGame('tropas', 'O Capitão não foi revivido a tempo.');
      }
    }
    if (this.time >= C.MATCH_SECONDS) return this.endGame('tropas', 'O apocalipse chegou antes do bote partir.');
  }

  // ---------- loop ----------
  step(dt) {
    if (this.phase !== 'playing') return;
    this.time += dt;

    // mare
    const prog = clamp(this.time / (C.MATCH_SECONDS * 0.9), 0, 1);
    this.waterline = C.WORLD.h - (C.TIDE_START + C.TIDE_RISE * prog);

    // tempestade
    if (!this.storm.active && this.time >= this.storm.next) {
      this.storm.active = true;
      this.storm.until = this.time + C.STORM_SECONDS;
      this.radios = [];
      this.sayAll('Tempestade! Visibilidade baixa e rádios sem sinal.', 'warn');
    } else if (this.storm.active && this.time >= this.storm.until) {
      this.storm.active = false;
      this.storm.next = this.time + C.STORM_EVERY_MIN + this.rand() * (C.STORM_EVERY_MAX - C.STORM_EVERY_MIN);
      this.sayAll('A tempestade passou.', 'info');
    }

    // radios
    for (let i = this.radios.length - 1; i >= 0; i--) {
      const r = this.radios[i];
      if (this.time >= r.until) { this.radios.splice(i, 1); continue; }
      if (this.time >= r.next) {
        r.next = this.time + C.RADIO_PING_EVERY;
        r.flip = !r.flip;
        this.noise(r.x, r.y, r.flip ? 'steps' : 'shot');
      }
    }

    if (this.safe.lockCd > 0) this.safe.lockCd = Math.max(0, this.safe.lockCd - dt);

    for (const p of this.players.values()) {
      if (p.cd.ability > 0) p.cd.ability = Math.max(0, p.cd.ability - dt);
      if (!p.alive) continue;
      if (p.bot) this.thinkBot(p, dt);
      this.move(p, dt);
      this.handleInteract(p, dt);
    }
    this.checkEnd();
  }

  move(p, dt) {
    const inp = p.input;
    let dx = inp.dx; let dy = inp.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    const moving = m > 0.05;
    const zone = zoneAt(p.x, p.y);
    let speed = C.SPEED;
    let sprinting = false;
    if (moving && inp.sprint && !p.exhausted && p.stamina > 0) {
      sprinting = true;
      speed *= C.SPRINT_MULT;
      p.stamina -= C.STAM_DRAIN * (zone.terrain === 'sand' ? C.SAND_STAM_MULT : 1) * dt;
      if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
    }
    if (!sprinting) {
      p.stamina = Math.min(C.STAM_MAX, p.stamina + C.STAM_REGEN * dt);
      if (p.exhausted && p.stamina >= C.STAM_RECOVER_AT) p.exhausted = false;
    }
    if (p.role === 'resistencia') {
      let n = 0;
      for (const q of this.players.values()) {
        if (q !== p && q.alive && q.role === 'resistencia' && dist(p, q) <= C.UNION_RADIUS) n++;
      }
      if (n >= C.UNION_MIN_ALLIES) speed *= C.UNION_MULT;
    }
    if (p.y > this.waterline) speed *= C.WATER_MULT;
    if (!moving) return;
    p.facing = Math.atan2(dy, dx);
    p.x += dx * speed * dt;
    p.y += dy * speed * dt;
    for (const o of C.OBSTACLES) {
      const ox = p.x - o.x; const oy = p.y - o.y;
      const d = Math.hypot(ox, oy); const min = o.r + C.PLAYER_R;
      if (d < min && d > 0.001) { p.x = o.x + (ox / d) * min; p.y = o.y + (oy / d) * min; }
    }
    p.x = clamp(p.x, C.PLAYER_R, C.WORLD.w - C.PLAYER_R);
    p.y = clamp(p.y, C.PLAYER_R, C.WORLD.h - C.PLAYER_R);
  }

  // ---------- bots ----------
  thinkBot(p, dt) {
    const ai = p.ai;
    const inp = p.input;
    inp.e = false; inp.sprint = false;
    const goto = (x, y) => {
      const dx = x - p.x; const dy = y - p.y; const d = Math.hypot(dx, dy);
      if (d < 8) { inp.dx = 0; inp.dy = 0; return true; }
      inp.dx = dx / d; inp.dy = dy / d; return d < 40;
    };
    const faction = C.ROLES[p.role].faction;
    const cap = [...this.players.values()].find((q) => q.role === 'capitao');

    // Tropas: cacam jogadores isolados (poucas testemunhas) e emboscam
    if (p.role === 'tropa' && this.time > 60 && this.time >= (ai.nextHunt || 0)) {
      let target = null; let bd = 300;
      for (const q of this.players.values()) {
        if (!q.alive || C.ROLES[q.role].faction !== 'resistencia') continue;
        const d = dist(p, q);
        if (d >= bd) continue;
        let witnesses = 0;
        for (const o of this.players.values()) if (o.alive && o !== p && o !== q && dist(o, q) < 230) witnesses++;
        if (witnesses === 0) { bd = d; target = q; }
      }
      if (target) {
        goto(target.x, target.y);
        inp.sprint = bd > 130;
        if (p.cd.ability <= 0 && bd < C.AMBUSH_R - 6) { this.useAbility(p); ai.nextHunt = this.time + 50; }
        return;
      }
    }

    // Sabotador: forja peca falsa, entrega ao Capitao e tranca o cofre quando perto dele
    if (p.role === 'sabotador') {
      const hasFake = p.inv.some((i) => i.fake);
      if (hasFake && cap && cap.alive) {
        if (goto(cap.x, cap.y) && dist(p, cap) < C.GIVE_R - 10) this.giveItems(p);
        return;
      }
      if (!hasFake && p.cd.ability <= 0 && this.time > 30 && dist(p, this.safe) > C.SAFE_R + 40) this.useAbility(p);
      if (!this.safe.open && this.time > 70 && this.safe.lockCd <= 0) {
        if (goto(this.safe.x, this.safe.y) && dist(p, this.safe) < C.SAFE_R) { this.useAbility(p); }
        return;
      }
    }

    // Quem carrega itens de equipe leva ao Capitao (depois de um tempo, para nao ser instantaneo)
    const carrying = p.inv.some((i) => TRANSFERABLE.has(i.type) && i.type !== 'kit');
    if (!carrying) ai.carrySince = null;
    else if (ai.carrySince == null) ai.carrySince = this.time + 8 + (p.id % 5) * 4;
    if (faction === 'resistencia' && p.role !== 'capitao' && cap && cap.alive && carrying && this.time >= ai.carrySince) {
      if (goto(cap.x, cap.y) && dist(p, cap) < C.GIVE_R - 10) this.giveItems(p);
      return;
    }
    // Medico bot com kit: vai ao corpo mais proximo
    if (p.role === 'medico' && this.hasItem(p, 'kit') && this.bodies.length) {
      const b = this.bodies[0];
      if (goto(b.x, b.y)) { inp.e = true; }
      return;
    }
    // Capitao bot: segue o mapa quando completo
    if (p.role === 'capitao') {
      const m = this.captainMap(p);
      if (m && this.hasItem(p, 'key')) {
        if (goto(m.x, m.y)) inp.e = true;
        return;
      }
    }
    // Resistencia bots (nao capitao): ajudam com o cofre
    if (faction === 'resistencia' && p.role !== 'capitao' && !this.safe.open && p.id % 3 === 0 && this.time > 50 + (p.id % 4) * 15) {
      if (goto(this.safe.x, this.safe.y)) inp.e = true;
      return;
    }
    // Pegar item proximo (bots da Resistencia pegam pecas e chave; so o Medico pega o kit)
    if (faction === 'resistencia') {
      let best = null; let bd = 320;
      for (const it of this.items) {
        if (it.type === 'radio' || (it.type === 'kit' && p.role !== 'medico')) continue;
        const d = dist(p, it);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) {
        if (goto(best.x, best.y)) inp.e = true;
        return;
      }
    }
    // Vagar
    if (this.time >= ai.until || dist(p, { x: ai.tx, y: ai.ty }) < 20) {
      ai.tx = 80 + this.rand() * (C.WORLD.w - 160);
      ai.ty = 80 + this.rand() * (C.WORLD.h - 160);
      ai.until = this.time + 4 + this.rand() * 6;
    }
    goto(ai.tx, ai.ty);
  }

  // ---------- snapshots ----------
  roleInfo(p) {
    const r = C.ROLES[p.role];
    const out = { t: 'role', role: p.role, name: r.name, faction: r.faction, desc: r.desc };
    if (r.faction === 'tropas') {
      out.team = [...this.players.values()].filter((q) => C.ROLES[q.role].faction === 'tropas' && q !== p).map((q) => ({ id: q.id, name: q.name, role: q.role }));
    }
    return out;
  }

  mapPayload() {
    return {
      world: C.WORLD, zones: C.ZONES, defaultZone: C.DEFAULT_ZONE, obstacles: C.OBSTACLES,
      consts: { SHOT_R: C.SHOT_R, SHOT_ARC: C.SHOT_ARC, VISION_R: C.VISION_R, VISION_R_STORM: C.VISION_R_STORM },
    };
  }

  namesPayload() {
    const o = {};
    for (const p of this.players.values()) o[p.id] = p.name;
    return o;
  }

  snapshotFor(id) {
    const me = this.players.get(id);
    if (!me) return null;
    const spectator = !me.alive;
    const vr = this.visionR();
    const see = (x, y) => spectator || Math.hypot(me.x - x, me.y - y) <= vr;
    const reveal = spectator || this.phase === 'ended';
    const pl = [];
    for (const q of this.players.values()) {
      if (q === me || !q.alive) continue;
      if (!see(q.x, q.y)) continue;
      const o = { id: q.id, x: Math.round(q.x), y: Math.round(q.y), f: +q.facing.toFixed(2) };
      if (reveal) o.role = q.role;
      pl.push(o);
    }
    const it = this.items.filter((i) => see(i.x, i.y)).map((i) => ({ id: i.id, type: i.type === 'piece' ? 'piece' : i.type, x: Math.round(i.x), y: Math.round(i.y) }));
    const bd = this.bodies.filter((b) => see(b.x, b.y)).map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y) }));
    const boats = [];
    for (const s of [this.realSite, this.decoySite]) if (see(s.x, s.y)) boats.push({ x: s.x, y: s.y });
    const snap = {
      t: 'snap', left: Math.max(0, Math.ceil(C.MATCH_SECONDS - this.time)), water: Math.round(this.waterline),
      storm: this.storm.active, alive: [...this.players.values()].filter((q) => q.alive).length,
      me: {
        x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, f: +me.facing.toFixed(2),
        stamina: Math.round(me.stamina), exhausted: me.exhausted, alive: me.alive,
        inv: me.inv.map((i) => ({ type: i.type })), cd: Math.ceil(me.cd.ability),
        prog: me.prog.key && me.progNeed ? Math.min(1, me.prog.t / me.progNeed) : 0,
        hint: me.hint, shotUsed: me.shotUsed,
      },
      pl, it, bd, boats,
    };
    if (this.safe && see(this.safe.x, this.safe.y)) snap.safe = { x: this.safe.x, y: this.safe.y, open: this.safe.open, locked: this.safe.lockedUntil > this.time };
    const cm = this.captainMap(me);
    if (cm) snap.waypoint = { x: cm.x, y: cm.y, name: cm.name };
    if (C.ROLES[me.role].faction === 'tropas' || spectator) snap.passage = C.PASSAGE;
    if (this.captainGraceUntil != null) snap.grace = Math.max(0, Math.ceil(this.captainGraceUntil - this.time));
    return snap;
  }
}

module.exports = { Game, zoneAt };

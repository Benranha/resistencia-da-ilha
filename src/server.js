'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const C = require('./config');
const { Game } = require('./game');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const rooms = new Map();

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(c)) return c;
  }
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

class Room {
  constructor(code) {
    this.code = code;
    this.game = new Game();
    this.clients = new Map(); // playerId -> ws
    this.hostId = null;
    this.timer = null;
    this.lastActive = Date.now();
  }

  lobbyMsg() {
    return {
      t: 'lobby', room: this.code, hostId: this.hostId, phase: this.game.phase,
      players: [...this.game.players.values()].filter((p) => !p.bot).map((p) => ({ id: p.id, name: p.name, host: p.id === this.hostId, connected: p.connected })),
    };
  }

  broadcast(obj) { for (const ws of this.clients.values()) send(ws, obj); }
  sendLobby() { this.broadcast(this.lobbyMsg()); }

  join(ws, name, token) {
    const g = this.game;
    if (token) {
      const p = [...g.players.values()].find((q) => q.token === token);
      if (p) {
        p.connected = true;
        if (g.phase === 'playing') p.bot = false;
        this.attach(ws, p);
        if (g.phase === 'playing') {
          send(ws, { t: 'start', map: g.mapPayload(), names: g.namesPayload() });
          send(ws, g.roleInfo(p));
        }
        return true;
      }
    }
    if (g.phase !== 'lobby') { send(ws, { t: 'error', text: 'A partida já começou nesta sala.' }); return false; }
    if (g.humans().length >= C.MAX_PLAYERS) { send(ws, { t: 'error', text: 'Sala cheia (9 jogadores).' }); return false; }
    const p = g.addPlayer(name, false);
    p.token = crypto.randomBytes(12).toString('hex');
    if (this.hostId == null) this.hostId = p.id;
    this.attach(ws, p);
    return true;
  }

  attach(ws, p) {
    const old = this.clients.get(p.id);
    if (old && old !== ws) { try { old.close(); } catch (e) { /* ignore */ } }
    ws.room = this; ws.pid = p.id;
    this.clients.set(p.id, ws);
    this.lastActive = Date.now();
    send(ws, { t: 'welcome', id: p.id, token: p.token, room: this.code, hostId: this.hostId, phase: this.game.phase });
    this.sendLobby();
  }

  leave(ws) {
    const g = this.game;
    const p = g.players.get(ws.pid);
    if (this.clients.get(ws.pid) === ws) this.clients.delete(ws.pid);
    this.lastActive = Date.now();
    if (!p) return;
    if (g.phase === 'playing') {
      p.connected = false;
      p.bot = true; // um bot assume o personagem
      p.input.e = false;
    } else {
      g.removePlayer(p.id);
      if (this.hostId === p.id) {
        const nh = g.humans()[0];
        this.hostId = nh ? nh.id : null;
      }
    }
    this.sendLobby();
  }

  start(ws) {
    const g = this.game;
    if (ws.pid !== this.hostId || g.phase !== 'lobby') return;
    g.start();
    const map = g.mapPayload();
    const names = g.namesPayload();
    for (const [id, c] of this.clients) {
      send(c, { t: 'start', map, names });
      send(c, g.roleInfo(g.players.get(id)));
    }
    this.sendLobby();
    this.timer = setInterval(() => this.tick(), 1000 / C.TICK_HZ);
  }

  tick() {
    const g = this.game;
    g.step(1 / C.TICK_HZ);
    const events = g.events; g.events = [];
    for (const ev of events) for (const id of ev.ids) send(this.clients.get(id), ev.msg);
    for (const [id, ws] of this.clients) {
      const s = g.snapshotFor(id);
      if (s) send(ws, s);
    }
    if (g.phase === 'ended') {
      clearInterval(this.timer); this.timer = null;
      this.sendLobby();
    }
  }

  rematch(ws) {
    if (ws.pid !== this.hostId || this.game.phase !== 'ended') return;
    const entries = [...this.clients.entries()].filter(([id]) => this.game.players.get(id) && !this.game.players.get(id).bot);
    const old = this.game.players;
    this.game = new Game();
    this.clients = new Map();
    let first = true;
    for (const [id, c] of entries) {
      const op = old.get(id);
      const p = this.game.addPlayer(op.name, false);
      p.token = op.token;
      if (first) { this.hostId = p.id; first = false; }
      c.pid = p.id;
      this.clients.set(p.id, c);
      send(c, { t: 'welcome', id: p.id, token: p.token, room: this.code, hostId: this.hostId, phase: 'lobby' });
    }
    this.sendLobby();
  }

  destroy() { if (this.timer) clearInterval(this.timer); rooms.delete(this.code); }
}

// ---------- HTTP estatico ----------
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  let rel = url === '/' ? '/index.html' : url;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(file);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (rel === '/sw.js' || rel === '/index.html') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.room = null; ws.pid = null; ws.msgCount = 0; ws.isAlive = true;
  const rl = setInterval(() => { ws.msgCount = 0; }, 1000);
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (++ws.msgCount > 120) return; // limite por segundo
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (ws.room) return;
      const name = String(m.name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Jogador';
      let room;
      if (m.room) {
        room = rooms.get(String(m.room).toUpperCase().slice(0, 4));
        if (!room) return send(ws, { t: 'error', text: 'Sala não encontrada.' });
      } else {
        room = new Room(makeCode());
        rooms.set(room.code, room);
      }
      if (!room.join(ws, name, m.token) && room.clients.size === 0) room.destroy();
      return;
    }

    const room = ws.room;
    if (!room) return;
    const g = room.game;
    room.lastActive = Date.now();
    switch (m.t) {
      case 'in': g.setInput(ws.pid, m); break;
      case 'act': g.act(ws.pid, String(m.a)); break;
      case 'chat': g.chat(ws.pid, m.text); break;
      case 'start': room.start(ws); break;
      case 'rematch': room.rematch(ws); break;
      default: break;
    }
  });

  ws.on('close', () => {
    clearInterval(rl);
    if (ws.room) ws.room.leave(ws);
  });
  ws.on('error', () => {});
});

// keepalive e limpeza de salas vazias
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
  for (const r of rooms.values()) {
    if (r.clients.size === 0 && Date.now() - r.lastActive > 60000) r.destroy();
  }
}, 15000).unref();

function listen(port) {
  return new Promise((resolve) => server.listen(port, () => resolve(server.address().port)));
}

if (require.main === module) {
  const port = +process.env.PORT || 3000;
  listen(port).then((p) => console.log(`A Resistencia da Ilha rodando em http://localhost:${p}`));
}

module.exports = { server, listen, rooms };

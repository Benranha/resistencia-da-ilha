'use strict';
// Teste de ponta a ponta: sobe o servidor, conecta clientes WebSocket reais e joga alguns segundos.
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const { listen } = require('../src/server');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, host: '127.0.0.1' }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: b }));
    }).on('error', reject);
  });
}

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, msgs: [], waiters: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw); c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => { if (w.pred(m)) { w.res(m); return false; } return true; });
  });
  c.open = new Promise((r) => ws.on('open', r));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (pred, ms = 4000) => {
    const hit = c.msgs.find(pred); if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout esperando mensagem')), ms); c.waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } }); });
  };
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = await listen(0);

  // arquivos estaticos e PWA
  const idx = await get(port, '/'); assert.strictEqual(idx.status, 200); assert.ok(idx.body.includes('manifest.webmanifest'));
  const man = await get(port, '/manifest.webmanifest'); assert.strictEqual(man.status, 200); assert.ok(JSON.parse(man.body).icons.length >= 2);
  assert.strictEqual((await get(port, '/sw.js')).status, 200);
  assert.strictEqual((await get(port, '/client.js')).status, 200);
  const ic = await get(port, '/icons/icon-192.png'); assert.strictEqual(ic.type, 'image/png');
  assert.ok([403, 404].includes((await get(port, '/..%2f..%2fpackage.json')).status), 'path traversal deve ser bloqueado');
  assert.strictEqual((await get(port, '/healthz')).body, 'ok');
  console.log('ok   - arquivos estaticos, manifest, service worker e icones');

  // sala + lobby
  const a = client(port); await a.open; a.send({ t: 'join', name: 'Ana' });
  const wa = await a.wait((m) => m.t === 'welcome');
  assert.ok(/^[A-Z]{4}$/.test(wa.room));
  const b = client(port); await b.open; b.send({ t: 'join', name: 'Beto', room: wa.room.toLowerCase() });
  const wb = await b.wait((m) => m.t === 'welcome');
  assert.strictEqual(wb.room, wa.room);
  const lob = await a.wait((m) => m.t === 'lobby' && m.players.length === 2);
  assert.strictEqual(lob.hostId, wa.id);
  const bad = client(port); await bad.open; bad.send({ t: 'join', name: 'X', room: 'ZZZZ' });
  assert.strictEqual((await bad.wait((m) => m.t === 'error')).text, 'Sala não encontrada.');
  console.log('ok   - criar sala, entrar por codigo, lobby, sala inexistente');

  // so o anfitriao inicia
  b.send({ t: 'start' }); await sleep(200);
  assert.ok(!b.msgs.some((m) => m.t === 'start'), 'convidado nao pode iniciar');
  a.send({ t: 'start' });
  const st = await a.wait((m) => m.t === 'start'); assert.strictEqual(Object.keys(st.names).length, 9);
  const roleA = await a.wait((m) => m.t === 'role'); const roleB = await b.wait((m) => m.t === 'role');
  assert.ok(roleA.role && roleB.role);
  const snap1 = await a.wait((m) => m.t === 'snap');
  assert.ok(snap1.me && Array.isArray(snap1.pl) && snap1.left <= 600);
  console.log('ok   - partida iniciada com 9 jogadores (bots), papeis e snapshots', `(${roleA.name} / ${roleB.name})`);

  // movimento autoritativo
  const x0 = (await a.wait((m) => m.t === 'snap')).me.x;
  a.send({ t: 'in', dx: 1, dy: 0, sprint: false, e: false });
  await sleep(600);
  const last = [...a.msgs].reverse().find((m) => m.t === 'snap');
  assert.ok(last.me.x > x0 + 20, `x0=${x0} x=${last.me.x}`);
  console.log('ok   - entrada de movimento processada pelo servidor');

  // desconectar no meio: bot assume; reconectar com token
  const tokB = wb.token; b.ws.close(); await sleep(300);
  const b2 = client(port); await b2.open; b2.send({ t: 'join', name: 'Beto', room: wa.room, token: tokB });
  const w2 = await b2.wait((m) => m.t === 'welcome'); assert.strictEqual(w2.id, wb.id);
  await b2.wait((m) => m.t === 'start'); const r2 = await b2.wait((m) => m.t === 'role'); assert.strictEqual(r2.role, roleB.role);
  await b2.wait((m) => m.t === 'snap');
  console.log('ok   - reconexao com token retoma o mesmo personagem e papel');

  // chat
  a.send({ t: 'chat', text: 'oi pessoal' }); await sleep(200);
  const chatSeen = a.msgs.some((m) => m.t === 'chat');
  console.log(chatSeen ? 'ok   - chat entregue' : 'info - chat nao entregue (jogadores longe um do outro)');

  // entradas invalidas nao derrubam o servidor
  a.ws.send('nao e json'); a.ws.send(JSON.stringify({ t: 'in', dx: 'abc', dy: null })); a.ws.send(JSON.stringify({ t: 'act', a: {} })); await sleep(200);
  assert.ok((await get(port, '/healthz')).body === 'ok');
  console.log('ok   - mensagens invalidas ignoradas');

  // deixar sala: anfitriao escolhe substituto, convidado so sai
  const rc = client(port); await rc.open; rc.send({ t: 'join', name: 'Rosa' });
  const wrc = await rc.wait((m) => m.t === 'welcome');
  const rd = client(port); await rd.open; rd.send({ t: 'join', name: 'Duda', room: wrc.room });
  const wrd = await rd.wait((m) => m.t === 'welcome');
  await rc.wait((m) => m.t === 'lobby' && m.players.length === 2);
  rd.send({ t: 'leave' }); // convidado sai: anfitriao nao muda
  const leftRd = await rd.wait((m) => m.t === 'left');
  assert.ok(leftRd);
  const lobAfterGuestLeft = await rc.wait((m) => m.t === 'lobby' && m.players.length === 1);
  assert.strictEqual(lobAfterGuestLeft.hostId, wrc.id);
  rc.send({ t: 'leave' }); // anfitriao sozinho: fecha a sala
  await rc.wait((m) => m.t === 'left');
  const re = client(port); await re.open; re.send({ t: 'join', name: 'X', room: wrc.room });
  assert.strictEqual((await re.wait((m) => m.t === 'error')).text, 'Sala não encontrada.');
  console.log('ok   - deixar sala (convidado sai sem afetar anfitriao) e fechar sala (anfitriao sozinho)');

  // deixar sala escolhendo novo anfitriao
  const rf = client(port); await rf.open; rf.send({ t: 'join', name: 'Fabio' });
  const wrf = await rf.wait((m) => m.t === 'welcome');
  const rg = client(port); await rg.open; rg.send({ t: 'join', name: 'Gil', room: wrf.room });
  const wrg = await rg.wait((m) => m.t === 'welcome');
  await rf.wait((m) => m.t === 'lobby' && m.players.length === 2);
  rf.send({ t: 'leave', newHost: wrg.id });
  await rf.wait((m) => m.t === 'left');
  const lobNewHost = await rg.wait((m) => m.t === 'lobby' && m.players.length === 1);
  assert.strictEqual(lobNewHost.hostId, wrg.id);
  console.log('ok   - anfitriao deixa a sala escolhendo substituto');

  console.log('\nsmoke test passou');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

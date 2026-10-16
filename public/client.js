'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $('screen-menu'), lobby: $('screen-lobby'), game: $('screen-game') };
  const ROLE_NAMES = { resistencia: 'Resistência', capitao: 'Capitão', medico: 'Médico', guarda: 'Guarda', sabotador: 'Sabotador', tropa: 'Tropa' };
  const ICON = { piece: '🗺️', key: '🗝️', kit: '🧰', radio: '📻' };
  const ITEM_LABEL = { piece: 'Peça do mapa', key: 'Chave do bote', kit: 'Kit médico', radio: 'Rádio quebrado' };

  let ws = null;
  let S = { id: null, token: null, room: null, hostId: null, phase: 'menu', name: '' };
  let map = null; let names = {}; let consts = {};
  let role = null; let team = [];
  let snap = null;
  const ents = new Map();
  let meP = { x: 0, y: 0 };
  let ripples = []; let bubbles = [];
  let reconnectTimer = null; let wantConnect = false;

  // ---------- util ----------
  function showScreen(n) { for (const k in screens) screens[k].classList.toggle('active', k === n); }
  function save() { try { localStorage.setItem('rdi-session', JSON.stringify({ room: S.room, token: S.token, name: S.name })); } catch (e) { /* ignore */ } }
  function loadSession() { try { return JSON.parse(localStorage.getItem('rdi-session') || 'null'); } catch (e) { return null; } }
  function fmt(sec) { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- rede ----------
  function connect(joinMsg) {
    wantConnect = true;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.onopen = () => { ws.send(JSON.stringify(joinMsg)); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = () => {
      if (!wantConnect) return;
      if (S.phase === 'playing' && S.room && S.token) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect({ t: 'join', name: S.name, room: S.room, token: S.token }), 1500);
        addLog('Conexão perdida. Tentando reconectar...', 'warn');
      } else if (S.phase !== 'menu') { showScreen('menu'); S.phase = 'menu'; $('menu-error').textContent = 'Conexão encerrada.'; }
    };
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function onMsg(m) {
    switch (m.t) {
      case 'welcome':
        S.id = m.id; S.token = m.token; S.room = m.room; S.hostId = m.hostId; S.phase = m.phase === 'playing' ? 'playing' : 'lobby';
        save();
        history.replaceState(null, '', `?sala=${m.room}`);
        $('lobby-code').textContent = m.room;
        if (S.phase === 'lobby') { $('end-card').hidden = true; showScreen('lobby'); }
        break;
      case 'lobby': renderLobby(m); break;
      case 'start': startGame(m); break;
      case 'role': showRole(m); break;
      case 'snap': onSnap(m); break;
      case 'msg': addLog(m.text, m.kind); break;
      case 'noise': addRipple(m); break;
      case 'chat': onChat(m); break;
      case 'end': onEnd(m); break;
      case 'error': $('menu-error').textContent = m.text; if (S.phase === 'menu') { wantConnect = false; try { ws.close(); } catch (e) { /* ignore */ } } break;
      default: break;
    }
  }

  // ---------- menu e lobby ----------
  function nameValue() { return $('name').value.trim() || 'Jogador'; }
  $('btn-create').onclick = () => { unlockAudio(); S.name = nameValue(); $('menu-error').textContent = ''; connect({ t: 'join', name: S.name }); };
  $('btn-join').onclick = () => {
    unlockAudio();
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) { $('menu-error').textContent = 'Digite o código de 4 letras.'; return; }
    S.name = nameValue(); $('menu-error').textContent = '';
    const ses = loadSession();
    const token = ses && ses.room === code ? ses.token : undefined;
    connect({ t: 'join', name: S.name, room: code, token });
  };
  $('btn-start').onclick = () => send({ t: 'start' });
  $('btn-copy').onclick = async () => {
    const link = `${location.origin}/?sala=${S.room}`;
    try { await navigator.clipboard.writeText(link); $('btn-copy').textContent = 'Link copiado!'; } catch (e) { prompt('Copie o link:', link); }
    setTimeout(() => { $('btn-copy').textContent = 'Copiar link de convite'; }, 1800);
  };
  $('end-again').onclick = () => send({ t: 'rematch' });
  $('rc-ok').onclick = () => { $('role-card').hidden = true; };

  function renderLobby(m) {
    S.hostId = m.hostId;
    const ul = $('lobby-list'); ul.innerHTML = '';
    for (const p of m.players) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(p.name)}${p.id === S.id ? ' (você)' : ''}</span><span class="tag">${p.host ? 'anfitrião' : p.connected ? '' : 'offline'}</span>`;
      ul.appendChild(li);
    }
    const host = S.id === m.hostId;
    $('btn-start').hidden = !host || m.phase !== 'lobby';
    $('lobby-wait').hidden = host;
    $('end-again').hidden = !host;
    $('end-wait').hidden = host;
  }

  // ---------- jogo ----------
  function startGame(m) {
    map = m.map; names = m.names || {}; consts = m.map.consts || {};
    S.phase = 'playing'; snap = null; ents.clear(); ripples = []; bubbles = [];
    $('end-card').hidden = true; $('hud-log').innerHTML = ''; meP = { x: 0, y: 0 };
    $('hud-keys').textContent = 'E pegar/usar   G entregar   Q habilidade   R rádio   Shift correr   Enter conversar';
    showScreen('game'); resize();
  }

  function showRole(m) {
    role = m.role; team = m.team || [];
    $('rc-faction').textContent = m.faction === 'resistencia' ? 'Você é da Resistência' : 'Você é das Tropas (infiltrado)';
    $('rc-name').textContent = m.name;
    $('rc-desc').textContent = m.desc;
    $('rc-team').textContent = team.length ? `Seus aliados: ${team.map((t) => `${t.name} (${ROLE_NAMES[t.role]})`).join(', ')}` : '';
    $('role-card').hidden = false;
    const hr = $('hud-role');
    hr.textContent = m.name; hr.className = 'pill role ' + (m.faction === 'resistencia' ? 'res' : 'tro');
  }

  function onSnap(m) {
    snap = m;
    const seen = new Set();
    for (const p of m.pl) {
      seen.add(p.id);
      let e = ents.get(p.id);
      if (!e) { e = { x: p.x, y: p.y }; ents.set(p.id, e); }
      e.tx = p.x; e.ty = p.y; e.f = p.f; e.role = p.role;
    }
    for (const id of [...ents.keys()]) if (!seen.has(id)) ents.delete(id);
    if (!meP.init) { meP.x = m.me.x; meP.y = m.me.y; meP.init = true; }
    // HUD
    $('hud-time').textContent = fmt(m.left);
    $('hud-alive').textContent = `${m.alive} vivos`;
    $('hud-storm').hidden = !m.storm;
    const st = $('hud-stamina'); st.firstElementChild.style.width = m.me.stamina + '%'; st.classList.toggle('low', m.me.exhausted);
    const inv = $('hud-inv'); inv.innerHTML = '';
    for (const it of m.me.inv) { const s = document.createElement('span'); s.textContent = ICON[it.type]; s.title = ITEM_LABEL[it.type]; inv.appendChild(s); }
    if (role === 'guarda') { const s = document.createElement('span'); s.textContent = m.me.shotUsed ? '🚫' : '🔫'; s.title = 'Tiro (Q)'; inv.appendChild(s); }
    if (m.me.cd > 0) { const s = document.createElement('span'); s.textContent = `Q ${m.me.cd}s`; s.style.fontSize = '13px'; inv.appendChild(s); }
    const h = $('hud-hint'); h.style.display = m.me.hint && m.me.alive ? 'block' : 'none'; h.textContent = m.me.hint;
    const pr = $('hud-prog'); pr.hidden = !(m.me.prog > 0); pr.firstElementChild.style.width = Math.round(m.me.prog * 100) + '%';
    const g = $('hud-grace'); g.hidden = m.grace == null; if (m.grace != null) g.textContent = `Capitão caído: ${m.grace}s para reviver`;
    if (!m.me.alive) $('hud-keys').textContent = 'Você caiu: assistindo. Enter para conversar com outros caídos.';
  }

  function addLog(text, kind) {
    const ul = $('hud-log');
    const li = document.createElement('li'); li.textContent = text; li.className = kind || '';
    ul.appendChild(li);
    while (ul.children.length > 4) ul.removeChild(ul.firstChild);
    setTimeout(() => { li.style.opacity = '0'; setTimeout(() => li.remove(), 700); }, 6000);
  }

  function addRipple(m) { ripples.push({ x: m.x, y: m.y, kind: m.kind, t: 0 }); sfx(m.kind); }

  function onChat(m) {
    bubbles = bubbles.filter((b) => b.id !== m.id);
    bubbles.push({ id: m.id, text: m.text, t: 0, x: m.x, y: m.y });
    const ul = $('hud-log');
    const li = document.createElement('li'); li.className = 'chat';
    li.innerHTML = `<b>${esc(m.name)}${m.dead ? ' (caído)' : ''}:</b> ${esc(m.text)}`;
    ul.appendChild(li);
    while (ul.children.length > 4) ul.removeChild(ul.firstChild);
    setTimeout(() => { li.style.opacity = '0'; setTimeout(() => li.remove(), 700); }, 9000);
  }

  function onEnd(m) {
    S.phase = 'ended';
    const youRes = role && ['resistencia', 'capitao', 'medico', 'guarda'].includes(role);
    const won = (m.winner === 'resistencia') === !!youRes;
    $('end-eyebrow').textContent = won ? 'Vitória' : 'Derrota';
    $('end-title').textContent = m.winner === 'resistencia' ? 'A Resistência escapou' : 'As Tropas venceram';
    $('end-reason').textContent = m.reason;
    const ul = $('end-roles'); ul.innerHTML = '';
    for (const r of m.roles) {
      const fac = ['resistencia', 'capitao', 'medico', 'guarda'].includes(r.role) ? 'res' : 'tro';
      const li = document.createElement('li'); li.className = `${fac} ${r.alive ? '' : 'dead'}`;
      li.innerHTML = `<span>${esc(r.name)}${r.id === S.id ? ' (você)' : ''}</span><span class="tag">${ROLE_NAMES[r.role]}${r.alive ? '' : ' (caído)'}</span>`;
      ul.appendChild(li);
    }
    $('role-card').hidden = true; $('end-card').hidden = false;
    $('end-again').hidden = S.id !== S.hostId; $('end-wait').hidden = S.id === S.hostId;
  }

  // ---------- audio ----------
  let actx = null;
  function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* ignore */ } }
  function sfx(kind) {
    if (!actx) return;
    const t = actx.currentTime;
    const g = actx.createGain(); g.connect(actx.destination);
    if (kind === 'shot') {
      const len = Math.floor(actx.sampleRate * 0.18); const b = actx.createBuffer(1, len, actx.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const s = actx.createBufferSource(); s.buffer = b; g.gain.value = 0.35; s.connect(g); s.start(t);
    } else {
      const o = actx.createOscillator(); o.type = kind === 'clank' ? 'triangle' : 'sine';
      o.frequency.value = kind === 'clank' ? 880 : 90;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'clank' ? 0.4 : 0.15));
      o.connect(g); o.start(t); o.stop(t + 0.45);
      if (kind === 'steps') { const o2 = actx.createOscillator(); const g2 = actx.createGain(); o2.frequency.value = 80; g2.gain.setValueAtTime(0.25, t + 0.25); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o2.connect(g2); g2.connect(actx.destination); o2.start(t + 0.25); o2.stop(t + 0.45); }
    }
  }

  // ---------- entrada ----------
  const keys = new Set();
  let joy = { x: 0, y: 0 };
  let sprintToggle = false; let eTouch = false;
  const chatForm = $('chat-form'); const chatInput = $('chat-input');
  function chatOpen() { return chatForm.classList.contains('open'); }
  function openChat() { chatForm.classList.add('open'); chatInput.focus(); }
  function closeChat() { chatForm.classList.remove('open'); chatInput.blur(); chatInput.value = ''; }

  window.addEventListener('keydown', (e) => {
    if (S.phase !== 'playing' && S.phase !== 'ended') return;
    if (chatOpen()) {
      if (e.key === 'Escape') closeChat();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'enter') { openChat(); e.preventDefault(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    unlockAudio();
    keys.add(k);
    if (k === 'g') send({ t: 'act', a: 'give' });
    if (k === 'q') send({ t: 'act', a: 'ability' });
    if (k === 'r') send({ t: 'act', a: 'radio' });
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => keys.clear());
  chatForm.addEventListener('submit', (e) => { e.preventDefault(); const t = chatInput.value.trim(); if (t) send({ t: 'chat', text: t }); closeChat(); });

  // toque
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) $('touch').hidden = false;
  const joyEl = $('joy'); const knob = $('knob'); let joyId = null;
  function joyMove(ev) {
    const r = joyEl.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    let dx = (ev.clientX - cx) / (r.width / 2); let dy = (ev.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    joy.x = Math.abs(dx) < 0.12 ? 0 : dx; joy.y = Math.abs(dy) < 0.12 ? 0 : dy;
    knob.style.transform = `translate(${dx * 42}px, ${dy * 42}px)`;
  }
  joyEl.addEventListener('pointerdown', (ev) => { joyId = ev.pointerId; joyEl.setPointerCapture(joyId); joyMove(ev); unlockAudio(); });
  joyEl.addEventListener('pointermove', (ev) => { if (ev.pointerId === joyId) joyMove(ev); });
  const joyEnd = (ev) => { if (ev.pointerId === joyId) { joyId = null; joy = { x: 0, y: 0 }; knob.style.transform = ''; } };
  joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
  document.querySelectorAll('#tbtns button').forEach((b) => {
    const a = b.dataset.act;
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); unlockAudio();
      if (a === 'e') { eTouch = true; b.classList.add('on'); }
      else if (a === 'sprint') { sprintToggle = !sprintToggle; b.classList.toggle('on', sprintToggle); }
      else if (a === 'chat') { openChat(); }
      else send({ t: 'act', a: a });
    });
    const up = () => { if (a === 'e') { eTouch = false; b.classList.remove('on'); } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });

  let lastIn = ''; let lastInAt = 0;
  setInterval(() => {
    if (S.phase !== 'playing') return;
    let dx = 0; let dy = 0;
    if (!chatOpen()) {
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    }
    if (joy.x || joy.y) { dx = joy.x; dy = joy.y; }
    const sprint = (!chatOpen() && keys.has('shift')) || sprintToggle;
    const e = (!chatOpen() && keys.has('e')) || eTouch;
    const o = { t: 'in', dx: +dx.toFixed(2), dy: +dy.toFixed(2), sprint, e };
    const s = JSON.stringify(o); const now = performance.now();
    if (s !== lastIn || now - lastInAt > 300) { lastIn = s; lastInAt = now; send(o); }
  }, 50);

  // ---------- render ----------
  const cv = $('view'); const ctx = cv.getContext('2d');
  const mm = $('minimap'); const mctx = mm.getContext('2d');
  let W = 0; let H = 0; let dpr = 1; let zoom = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    zoom = Math.max(0.65, Math.min(1.25, Math.min(W, H) / 640));
    const mw = mm.clientWidth || 150; mm.width = mw * 2; mm.height = Math.round(mw * 2 * (map ? map.world.h / map.world.w : 0.625));
  }
  window.addEventListener('resize', resize);

  function hue(id) { return (id * 47) % 360; }

  function drawWorld(camX, camY, t) {
    const wd = map.world;
    ctx.fillStyle = map.defaultZone.color; ctx.fillRect(0, 0, wd.w, wd.h);
    for (const z of map.zones) { ctx.fillStyle = z.color; ctx.fillRect(z.x, z.y, z.w, z.h); }
    // textura simples
    ctx.globalAlpha = 0.07; ctx.fillStyle = '#000';
    for (let gx = 0; gx < wd.w; gx += 120) for (let gy = 0; gy < wd.h; gy += 120) { if (((gx + gy) / 120) % 2 === 0) ctx.fillRect(gx, gy, 120, 120); }
    ctx.globalAlpha = 1;
    // agua
    const wl = snap ? snap.water : wd.h - 60;
    const grad = ctx.createLinearGradient(0, wl - 40, 0, wl + 30);
    grad.addColorStop(0, 'rgba(30,110,150,0)'); grad.addColorStop(1, 'rgba(30,110,150,0.85)');
    ctx.fillStyle = grad; ctx.fillRect(0, wl - 40, wd.w, 70);
    ctx.fillStyle = 'rgba(24,95,135,0.85)'; ctx.fillRect(0, wl + 30, wd.w, wd.h - wl);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= wd.w; x += 40) { const y = wl + Math.sin(x * 0.03 + t * 2) * 4; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    // nomes de regioes
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.font = '700 34px Georgia, serif'; ctx.textAlign = 'center';
    for (const z of map.zones) ctx.fillText(z.name, z.x + z.w / 2, z.y + 50);
    // obstaculos
    for (const o of map.obstacles) {
      const rocky = o.x > 1500 && o.y > 0 && (o.x > 1700 || o.y > 900);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(o.x + 6, o.y + 8, o.r, o.r * 0.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = rocky ? '#7c786d' : '#3e7a4a'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = rocky ? '#98937f' : '#52965c'; ctx.beginPath(); ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.55, 0, 7); ctx.fill();
    }
  }

  function drawEmoji(ch, x, y, size) { ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y); }

  function drawPlayer(x, y, f, id, label, isMe, roleKey) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 14, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `hsl(${hue(id)},62%,55%)`; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
    ctx.lineWidth = isMe ? 3 : 2; ctx.strokeStyle = isMe ? '#fff' : 'rgba(0,0,0,0.5)'; ctx.stroke();
    if (roleKey && ['sabotador', 'tropa'].includes(roleKey)) { ctx.strokeStyle = '#e2574c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(f) * 9, y + Math.sin(f) * 9, 4, 0, 7); ctx.fill();
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const txt = roleKey ? `${label} (${ROLE_NAMES[roleKey]})` : label;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(txt, x, y - 22); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y - 22);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    requestAnimationFrame(frame);
    if (S.phase === 'menu' || S.phase === 'lobby' || !map || !snap) return;
    const k = 1 - Math.exp(-dt * 16);
    meP.x += (snap.me.x - meP.x) * k; meP.y += (snap.me.y - meP.y) * k;
    for (const e of ents.values()) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
    for (const r of ripples) r.t += dt; ripples = ripples.filter((r) => r.t < 1.4);
    for (const b of bubbles) b.t += dt; bubbles = bubbles.filter((b) => b.t < 6);

    const spectator = !snap.me.alive;
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#071218'; ctx.fillRect(0, 0, W, H);
    const camX = meP.x - W / (2 * zoom); const camY = meP.y - H / (2 * zoom);
    ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-camX, -camY);
    drawWorld(camX, camY, t);

    if (snap.passage) {
      for (const p of [snap.passage.a, snap.passage.b]) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, 7); ctx.fill(); ctx.strokeStyle = '#e2574c'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); }
    }
    for (const b of snap.boats) drawEmoji('⛵', b.x, b.y, 44);
    if (snap.safe) drawEmoji(snap.safe.open ? '🔓' : snap.safe.locked ? '⛓️' : '🔒', snap.safe.x, snap.safe.y, 36);
    for (const it of snap.it) { ctx.fillStyle = 'rgba(255,230,150,0.25)'; ctx.beginPath(); ctx.arc(it.x, it.y, 20 + Math.sin(t * 3) * 2, 0, 7); ctx.fill(); drawEmoji(ICON[it.type] || '?', it.x, it.y, 26); }
    for (const b of snap.bd) drawEmoji('💀', b.x, b.y, 26);

    // cone de mira do Guarda
    if (role === 'guarda' && !snap.me.shotUsed && snap.me.alive) {
      const R = consts.SHOT_R || 210; const A = consts.SHOT_ARC || 0.62;
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(meP.x, meP.y); ctx.arc(meP.x, meP.y, R, snap.me.f - A, snap.me.f + A); ctx.closePath(); ctx.fill();
    }

    for (const [id, e] of ents) drawPlayer(e.x, e.y, e.f || 0, id, names[id] || '?', false, e.role);
    if (snap.me.alive) drawPlayer(meP.x, meP.y, snap.me.f, S.id, names[S.id] || 'Você', true, null);
    else { ctx.globalAlpha = 0.6; drawPlayer(meP.x, meP.y, snap.me.f, S.id, 'Você (caído)', true, null); ctx.globalAlpha = 1; }

    for (const b of bubbles) {
      const e = b.id === S.id ? meP : ents.get(b.id) || b;
      ctx.font = '13px system-ui'; const w = ctx.measureText(b.text).width + 16;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.roundRect(e.x - w / 2, e.y - 62, w, 24, 8); ctx.fill();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, e.x, e.y - 50);
    }
    for (const r of ripples) {
      const col = r.kind === 'shot' ? '226,87,76' : r.kind === 'clank' ? '232,184,74' : '255,255,255';
      ctx.strokeStyle = `rgba(${col},${1 - r.t / 1.4})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, 20 + r.t * 90, 0, 7); ctx.stroke();
      drawEmoji(r.kind === 'shot' ? '💥' : r.kind === 'clank' ? '🔔' : '👣', r.x, r.y, 22);
    }
    // waypoint do Capitao
    if (snap.waypoint) {
      const w = snap.waypoint;
      ctx.strokeStyle = '#e8b84a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(w.x, w.y, 40 + Math.sin(t * 4) * 5, 0, 7); ctx.stroke();
      ctx.fillStyle = '#e8b84a'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(w.name, w.x, w.y - 54);
    }
    ctx.restore();

    // neblina / visao
    if (!spectator) {
      const vr = (snap.storm ? (consts.VISION_R_STORM || 190) : (consts.VISION_R || 380)) * zoom;
      const sx = W / 2; const sy = H / 2;
      const g = ctx.createRadialGradient(sx, sy, vr * 0.7, sx, sy, vr);
      g.addColorStop(0, 'rgba(4,10,14,0)'); g.addColorStop(1, 'rgba(4,10,14,0.96)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); // o gradiente se estende com a ultima cor alem do raio
    }
    if (snap.storm) {
      ctx.fillStyle = 'rgba(10,20,40,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 70; i++) { const rx = (i * 97 + t * 500) % (W + 80); const ry = (i * 53 + t * 900) % H; ctx.moveTo(rx, ry); ctx.lineTo(rx - 10, ry + 22); }
      ctx.stroke();
    }
    drawMinimap();
  }

  function drawMinimap() {
    const wd = map.world; const sc = mm.width / wd.w;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = map.defaultZone.color; mctx.fillRect(0, 0, mm.width, mm.height);
    for (const z of map.zones) { mctx.fillStyle = z.color; mctx.fillRect(z.x * sc, z.y * sc, z.w * sc, z.h * sc); }
    mctx.fillStyle = 'rgba(24,95,135,0.85)'; mctx.fillRect(0, snap.water * sc, mm.width, mm.height - snap.water * sc);
    if (snap.waypoint) { mctx.fillStyle = '#e8b84a'; mctx.beginPath(); mctx.arc(snap.waypoint.x * sc, snap.waypoint.y * sc, 6, 0, 7); mctx.fill(); }
    for (const e of ents.values()) { mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(e.x * sc, e.y * sc, 3, 0, 7); mctx.fill(); }
    mctx.fillStyle = '#e07a3c'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(meP.x * sc, meP.y * sc, 5, 0, 7); mctx.fill(); mctx.stroke();
  }
  requestAnimationFrame(frame);

  // ---------- PWA ----------
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  // ---------- inicio ----------
  const params = new URLSearchParams(location.search);
  const ses = loadSession();
  if (ses && ses.name) $('name').value = ses.name;
  if (params.get('sala')) { $('code').value = params.get('sala').toUpperCase().slice(0, 4); }
})();

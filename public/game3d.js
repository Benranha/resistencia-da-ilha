import * as THREE from '/vendor/three/three.module.js';

const ROLE_NAMES = {
  resistencia: 'Resistência', capitao: 'Capitão', medico: 'Médico',
  guarda: 'Guarda', sabotador: 'Sabotador', tropa: 'Tropa',
};
const ITEM_ART = {
  piece: '/art/peca-mapa.svg', key: '/art/chave.svg',
  kit: '/art/kit-medico.svg', radio: '/art/radio.svg',
};

function randomFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorFor(id) {
  const hue = (id * 47) % 360;
  return new THREE.Color(`hsl(${hue} 48% 53%)`);
}

function mapShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, -points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].y);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function coastPoints(world) {
  const points = [];
  const rand = randomFrom(20261016);
  const cx = world.w / 2;
  const cy = world.h / 2;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rough = 0.965 + rand() * 0.055;
    points.push({
      x: cx + Math.cos(a) * (world.w * 0.495) * rough,
      y: cy + Math.sin(a) * (world.h * 0.49) * rough,
    });
  }
  return points;
}

function zonePoints(zone, seed) {
  const rand = randomFrom(seed);
  const corners = [
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.w, y: zone.y },
    { x: zone.x + zone.w, y: zone.y + zone.h },
    { x: zone.x, y: zone.y + zone.h },
  ];
  const points = [];
  for (let edge = 0; edge < corners.length; edge++) {
    const a = corners[edge];
    const b = corners[(edge + 1) % corners.length];
    const steps = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 110));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const normalX = b.y - a.y;
      const normalY = a.x - b.x;
      const length = Math.hypot(normalX, normalY) || 1;
      const offset = (rand() - 0.5) * 34;
      points.push({
        x: a.x + (b.x - a.x) * t + (normalX / length) * offset,
        y: a.y + (b.y - a.y) * t + (normalY / length) * offset,
      });
    }
  }
  return points;
}

function addGroundDisc(parent, radius, color, opacity = 0.18) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.8;
  parent.add(mesh);
  return mesh;
}

function makePerson(id, isSelf = false) {
  const root = new THREE.Group();
  const main = new THREE.MeshStandardMaterial({ color: colorFor(id), roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#253743', roughness: 1, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: '#c68e62', roughness: 1, flatShading: true });
  const cloth = new THREE.Mesh(new THREE.CapsuleGeometry(11, 18, 3, 7), main);
  cloth.position.y = 27;
  cloth.castShadow = true;
  root.add(cloth);
  const head = new THREE.Mesh(new THREE.SphereGeometry(8, 9, 7), skin);
  head.position.set(0, 45, 0);
  root.add(head);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 7, 6), dark);
  cap.position.set(0, 51, 0);
  root.add(cap);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 18, 6), main);
    arm.position.set(side * 14, 27, 0);
    arm.rotation.z = side * -0.16;
    root.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 14, 6), dark);
    leg.position.set(side * 5, 9, 0);
    root.add(leg);
  }
  const bag = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 8), new THREE.MeshStandardMaterial({ color: '#8d613e', roughness: 1 }));
  bag.position.set(0, 26, 9);
  root.add(bag);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(isSelf ? 20 : 18, isSelf ? 2.2 : 1.5, 5, 24),
    new THREE.MeshBasicMaterial({ color: isSelf ? '#f0c95b' : '#ead9b1', transparent: true, opacity: isSelf ? 0.88 : 0.48 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.5;
  root.add(ring);
  addGroundDisc(root, 18, '#071218', 0.28);
  root.userData = { isSelf, roleRing: ring };
  return root;
}

function makeTree(radius, seed) {
  const rand = randomFrom(seed);
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(5, radius * 0.13), Math.max(7, radius * 0.18), radius * 1.25, 6),
    new THREE.MeshStandardMaterial({ color: '#6f5035', roughness: 1, flatShading: true }),
  );
  trunk.position.y = radius * 0.6;
  tree.add(trunk);
  const greens = ['#276148', '#347451', '#477f50', '#5b8b55'];
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(radius * (0.6 + rand() * 0.18), radius * (0.95 + rand() * 0.2), 7),
      new THREE.MeshStandardMaterial({ color: greens[Math.floor(rand() * greens.length)], roughness: 1, flatShading: true }),
    );
    crown.position.set((rand() - 0.5) * radius * 0.35, radius * (1.08 + i * 0.29), (rand() - 0.5) * radius * 0.25);
    crown.rotation.y = rand() * Math.PI;
    tree.add(crown);
  }
  return tree;
}

function makeRock(radius, seed) {
  const rand = randomFrom(seed);
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius * 0.8, 0),
    new THREE.MeshStandardMaterial({ color: rand() > 0.5 ? '#777267' : '#625f57', roughness: 1, flatShading: true }),
  );
  rock.scale.set(1.15, 0.72 + rand() * 0.18, 0.9);
  rock.rotation.set(rand() * 0.4, rand() * 3, rand() * 0.25);
  return rock;
}

export class IslandScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1d26');
    this.scene.fog = new THREE.Fog('#0b1d26', 1700, 4300);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000);
    this.camera.up.set(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor('#0b1d26');
    this.container.appendChild(this.renderer.domElement);

    this.labels = document.createElement('div');
    this.labels.className = 'world-labels';
    this.container.appendChild(this.labels);
    this.vignette = document.createElement('div');
    this.vignette.className = 'world-vignette';
    this.container.appendChild(this.vignette);

    this.scene.add(new THREE.HemisphereLight('#fff1d2', '#23434a', 2.05));
    const sun = new THREE.DirectionalLight('#ffe2a4', 2.2);
    sun.position.set(-500, 1200, 650);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#80bfce', 0.7);
    fill.position.set(800, 700, -800);
    this.scene.add(fill);

    this.loader = new THREE.TextureLoader();
    this.textures = new Map();
    this.players = new Map();
    this.playerLabels = new Map();
    this.items = new Map();
    this.boats = [];
    this.rippleNodes = [];
    this.shotCone = null;
    this.map = null;
    this.water = null;
    this.safe = null;
    this.waypoint = null;
    this.passageGroup = null;
    this.lastWater = null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = width < 720 ? 900 : 820;
    this.viewHeight = viewHeight;
    this.camera.left = -(viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  getTexture(path) {
    if (!this.textures.has(path)) {
      const texture = this.loader.load(path);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(path, texture);
    }
    return this.textures.get(path);
  }

  makeSprite(path, size, y = 35) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.getTexture(path), transparent: true, depthWrite: false, sizeAttenuation: false,
    }));
    sprite.scale.set(size, size, 1);
    sprite.position.y = y;
    return sprite;
  }

  setMap(map) {
    this.map = map;
    this.lastWater = null;
    const world = map.world;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(world.w + 1800, world.h + 1500),
      new THREE.MeshStandardMaterial({ color: '#144d67', roughness: 0.32, metalness: 0.08 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(world.w / 2, -16, world.h / 2);
    this.scene.add(water);

    const outline = coastPoints(world);
    const coast = mapShape(outline);
    const island = new THREE.Mesh(
      new THREE.ExtrudeGeometry(coast, { depth: 18, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 9, bevelThickness: 3 }),
      new THREE.MeshStandardMaterial({ color: '#3b694b', roughness: 1, flatShading: true }),
    );
    island.rotation.x = -Math.PI / 2;
    island.position.y = -14;
    island.receiveShadow = true;
    this.scene.add(island);

    const coastLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline.map((p) => new THREE.Vector3(p.x, 5, p.y))),
      new THREE.LineBasicMaterial({ color: '#e9dfbd', transparent: true, opacity: 0.55 }),
    );
    this.scene.add(coastLine);

    for (let i = 0; i < map.zones.length; i++) {
      const zone = map.zones[i];
      const geometry = mapShape(zonePoints(zone, 711 + i * 67));
      const mat = new THREE.MeshStandardMaterial({ color: zone.color, roughness: 1, flatShading: true, side: THREE.DoubleSide });
      const ground = new THREE.Mesh(geometry, mat);
      ground.position.y = 5.2 + i * 0.02;
      ground.receiveShadow = true;
      this.scene.add(ground);
    }

    for (let i = 0; i < map.obstacles.length; i++) {
      const obstacle = map.obstacles[i];
      const group = new THREE.Group();
      const rocky = obstacle.x > 1500 && (obstacle.x > 1700 || obstacle.y > 900);
      const model = rocky ? makeRock(obstacle.r, i + 120) : makeTree(obstacle.r, i + 120);
      model.position.y = 5.3;
      group.add(model);
      addGroundDisc(group, obstacle.r * 1.25, '#152e27', 0.16);
      group.position.set(obstacle.x, 0, obstacle.y);
      this.scene.add(group);
    }

    for (const zone of map.zones) {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const c = canvas.getContext('2d');
      c.font = '700 36px Georgia, serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(35, 37, 28, 0.42)';
      c.fillText(zone.name, 256, 48);
      const texture = new THREE.CanvasTexture(canvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      label.scale.set(Math.min(zone.w * 0.48, 470), Math.min(zone.w * 0.09, 90), 1);
      label.position.set(zone.x + zone.w / 2, 12, zone.y + zone.h / 2);
      this.scene.add(label);
    }

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(world.w + 100, 1),
      new THREE.MeshBasicMaterial({ color: '#267895', transparent: true, opacity: 0.64, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 6.15;
    this.water.scale.y = 1;
    this.scene.add(this.water);
  }

  updateWater(line) {
    if (!this.map || !this.water || line === this.lastWater) return;
    this.lastWater = line;
    const height = Math.max(2, this.map.world.h - line + 20);
    this.water.geometry.dispose();
    this.water.geometry = new THREE.PlaneGeometry(this.map.world.w + 100, height);
    this.water.position.set(this.map.world.w / 2, 6.15, (this.map.world.h + line) / 2);
  }

  playerNode(id, self) {
    let node = this.players.get(id);
    if (!node) {
      node = makePerson(id, self);
      this.players.set(id, node);
      this.scene.add(node);
    }
    return node;
  }

  labelNode(id) {
    let node = this.playerLabels.get(id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'world-label';
      this.labels.appendChild(node);
      this.playerLabels.set(id, node);
    }
    return node;
  }

  syncPlayers(players, names, selfId, chatBubbles, time, camera) {
    const aliveIds = new Set();
    for (const p of players) {
      aliveIds.add(p.id);
      const isSelf = p.id === selfId;
      const node = this.playerNode(p.id, isSelf);
      const bob = this.reducedMotion || !p.moving ? 0 : Math.sin(time * 9 + p.id) * 1.8;
      node.position.set(p.x, 5.3 + bob, p.y);
      const f = p.f || 0;
      const targetYaw = Math.atan2(-Math.cos(f), -Math.sin(f));
      node.rotation.y += Math.atan2(Math.sin(targetYaw - node.rotation.y), Math.cos(targetYaw - node.rotation.y)) * 0.35;
      node.userData.roleRing.material.color.set(p.role ? (['sabotador', 'tropa'].includes(p.role) ? '#e2574c' : '#5cc28a') : (isSelf ? '#e8b84a' : '#ead9b1'));
      node.userData.roleRing.material.opacity = p.role ? 0.9 : isSelf ? 0.9 : 0.38;
      const label = this.labelNode(p.id);
      const roleText = p.role ? ` · ${ROLE_NAMES[p.role] || ''}` : '';
      label.textContent = `${names[p.id] || (isSelf ? 'Você' : '?')}${roleText}${isSelf && !p.alive ? ' (caído)' : ''}`;
      label.classList.toggle('self', isSelf);
      label.classList.toggle('dead', !p.alive);
      const worldPoint = new THREE.Vector3(p.x, 68, p.y).project(camera);
      label.style.left = `${(worldPoint.x * 0.5 + 0.5) * this.container.clientWidth}px`;
      label.style.top = `${(-worldPoint.y * 0.5 + 0.5) * this.container.clientHeight}px`;
      const bubble = chatBubbles.find((b) => b.id === p.id);
      label.dataset.chat = bubble ? bubble.text : '';
    }
    for (const [id, node] of this.players) {
      if (!aliveIds.has(id)) { this.scene.remove(node); this.players.delete(id); }
    }
    for (const [id, node] of this.playerLabels) {
      if (!aliveIds.has(id)) { node.remove(); this.playerLabels.delete(id); }
    }
  }

  syncItems(snapshot) {
    const seen = new Set();
    for (const item of snapshot.it || []) {
      seen.add(item.id);
      let node = this.items.get(item.id);
      if (!node) {
        const art = ITEM_ART[item.type] || ITEM_ART.piece;
        node = this.makeSprite(art, item.type === 'key' ? 42 : 46, 34);
        node.userData.baseY = 34;
        const glow = new THREE.Mesh(
          new THREE.TorusGeometry(22, 1.4, 5, 24),
          new THREE.MeshBasicMaterial({ color: '#e8b84a', transparent: true, opacity: 0.55 }),
        );
        glow.rotation.x = Math.PI / 2;
        glow.position.y = -28;
        node.add(glow);
        this.items.set(item.id, node);
        this.scene.add(node);
      }
      node.position.set(item.x, node.userData.baseY, item.y);
    }
    for (const [id, node] of this.items) {
      if (!seen.has(id)) { this.scene.remove(node); this.items.delete(id); }
    }
  }

  syncBoats(snapshot) {
    const boats = snapshot.boats || [];
    for (let i = 0; i < boats.length; i++) {
      let node = this.boats[i];
      if (!node) {
        node = new THREE.Group();
        const wood = new THREE.MeshStandardMaterial({ color: '#845837', roughness: 0.95, flatShading: true });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(74, 13, 32), wood);
        hull.position.y = 9;
        node.add(hull);
        const bow = new THREE.Mesh(new THREE.ConeGeometry(19, 28, 4), wood);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(40, 9, 0);
        node.add(bow);
        const inside = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 18), new THREE.MeshStandardMaterial({ color: '#c49b62', roughness: 1 }));
        inside.position.set(-2, 18, 0);
        node.add(inside);
        addGroundDisc(node, 56, '#112b36', 0.25);
        this.boats[i] = node;
        this.scene.add(node);
      }
      node.position.set(boats[i].x, 5.3, boats[i].y);
    }
    for (let i = boats.length; i < this.boats.length; i++) {
      this.scene.remove(this.boats[i]);
      this.boats.splice(i, 1); i--;
    }
  }

  syncSafe(snapshot) {
    if (snapshot.safe && !this.safe) {
      this.safe = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: '#5b3e2a', roughness: 1, flatShading: true });
      const box = new THREE.Mesh(new THREE.BoxGeometry(42, 28, 34), wood);
      box.position.y = 20;
      this.safe.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(45, 8, 37), new THREE.MeshStandardMaterial({ color: '#8d6541', roughness: 1, flatShading: true }));
      lid.position.y = 38;
      this.safe.add(lid);
      const lock = new THREE.Mesh(new THREE.TorusGeometry(5, 2, 5, 12), new THREE.MeshStandardMaterial({ color: '#e8b84a', roughness: 0.7 }));
      lock.position.set(0, 23, -18);
      this.safe.add(lock);
      this.safe.userData.lock = lock;
      addGroundDisc(this.safe, 35, '#172d2b', 0.2);
      this.scene.add(this.safe);
    }
    if (!snapshot.safe && this.safe) { this.scene.remove(this.safe); this.safe = null; }
    if (this.safe && snapshot.safe) {
      this.safe.position.set(snapshot.safe.x, 5.3, snapshot.safe.y);
      this.safe.userData.lock.visible = snapshot.safe.locked;
      this.safe.children[0].material.color.set(snapshot.safe.open ? '#795b3f' : '#5b3e2a');
    }
  }

  syncWaypoints(snapshot, time) {
    if (snapshot.waypoint && !this.waypoint) {
      this.waypoint = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 6, 90, 8), new THREE.MeshBasicMaterial({ color: '#e8b84a', transparent: true, opacity: 0.5 }));
      beam.position.y = 52;
      this.waypoint.add(beam);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(32, 3, 6, 28), new THREE.MeshBasicMaterial({ color: '#e8b84a' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 8;
      this.waypoint.add(ring);
      this.scene.add(this.waypoint);
    }
    if (!snapshot.waypoint && this.waypoint) { this.scene.remove(this.waypoint); this.waypoint = null; }
    if (this.waypoint && snapshot.waypoint) {
      this.waypoint.position.set(snapshot.waypoint.x, 5.3, snapshot.waypoint.y);
      this.waypoint.children[1].scale.setScalar(1 + Math.sin(time * 3) * 0.08);
    }
  }

  syncPassages(snapshot) {
    if (snapshot.passage && !this.passageGroup) {
      this.passageGroup = new THREE.Group();
      for (const p of [snapshot.passage.a, snapshot.passage.b]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 2.5, 6, 24), new THREE.MeshBasicMaterial({ color: '#e2574c', transparent: true, opacity: 0.86 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, 9, p.y);
        this.passageGroup.add(ring);
      }
      this.scene.add(this.passageGroup);
    }
    if (!snapshot.passage && this.passageGroup) { this.scene.remove(this.passageGroup); this.passageGroup = null; }
  }

  syncBodies(snapshot) {
    if (!this.bodies) this.bodies = new Map();
    const seen = new Set();
    for (const body of snapshot.bd || []) {
      seen.add(body.id);
      let node = this.bodies.get(body.id);
      if (!node) {
        node = this.makeSprite('/art/corpo.svg', 40, 15);
        this.bodies.set(body.id, node); this.scene.add(node);
      }
      node.position.set(body.x, 15, body.y);
    }
    for (const [id, node] of this.bodies) {
      if (!seen.has(id)) { this.scene.remove(node); this.bodies.delete(id); }
    }
  }

  syncRipples(ripples, time) {
    const events = ripples || [];
    for (let i = 0; i < events.length; i++) {
      const ripple = events[i];
      let node = this.rippleNodes[i];
      if (!node) {
        const colors = { shot: '#e2574c', clank: '#e8b84a', steps: '#e9dfbd' };
        node = new THREE.Mesh(
          new THREE.TorusGeometry(16, 1.8, 5, 28),
          new THREE.MeshBasicMaterial({ color: colors[ripple.kind] || '#e9dfbd', transparent: true, opacity: 0.7, depthWrite: false }),
        );
        node.rotation.x = Math.PI / 2;
        this.rippleNodes.push(node);
        this.scene.add(node);
      }
      const progress = Math.min(1, ripple.t / 1.4);
      node.position.set(ripple.x, 9 + Math.sin(time * 3 + i) * 1.5, ripple.y);
      node.scale.setScalar(0.7 + progress * 2.8);
      node.material.opacity = Math.max(0, 0.72 * (1 - progress));
    }
    while (this.rippleNodes.length > events.length) {
      const node = this.rippleNodes.pop();
      this.scene.remove(node);
      node.geometry.dispose();
      node.material.dispose();
    }
  }

  syncShotCone(snapshot, self, role) {
    const visible = role === 'guarda' && snapshot.me.alive && !snapshot.me.shotUsed;
    if (!visible) {
      if (this.shotCone) this.shotCone.visible = false;
      return;
    }
    const radius = this.map.consts.SHOT_R || 210;
    const arc = this.map.consts.SHOT_ARC || 0.62;
    if (!this.shotCone) {
      const steps = 40;
      const positions = new Float32Array((steps + 2) * 3);
      const indices = [];
      for (let i = 0; i <= steps; i++) {
        const angle = -arc + (2 * arc * i) / steps;
        positions[(i + 1) * 3] = Math.sin(angle);
        positions[(i + 1) * 3 + 2] = -Math.cos(angle);
        if (i < steps) indices.push(0, i + 1, i + 2);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      this.shotCone = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: '#fff5cc', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false,
      }));
      this.scene.add(this.shotCone);
    }
    this.shotCone.visible = true;
    this.shotCone.position.set(self.x, 6.5, self.y);
    this.shotCone.rotation.y = Math.atan2(-Math.cos(snapshot.me.f), -Math.sin(snapshot.me.f));
    this.shotCone.scale.set(radius, 1, radius);
  }

  update({ map, snapshot, players, names, selfId, bubbles, ripples, time, position, role }) {
    if (!this.map && map) this.setMap(map);
    if (!this.map || !snapshot) return;
    this.updateWater(snapshot.water);
    this.syncItems(snapshot);
    this.syncBoats(snapshot);
    this.syncSafe(snapshot);
    this.syncWaypoints(snapshot, time);
    this.syncPassages(snapshot);
    this.syncBodies(snapshot);
    this.syncRipples(ripples, time);

    const self = {
      ...snapshot.me,
      x: position ? position.x : snapshot.me.x,
      y: position ? position.y : snapshot.me.y,
    };
    const allPlayers = players.slice();
    allPlayers.push({ id: selfId, x: self.x, y: self.y, f: self.f, role: null, alive: self.alive, moving: true });
    const target = new THREE.Vector3(self.x, 0, self.y);
    const cameraPosition = new THREE.Vector3(self.x + 230, 930, self.y + 680);
    this.camera.position.lerp(cameraPosition, 0.16);
    this.camera.lookAt(target.x, 10, target.z - 90);
    this.syncPlayers(allPlayers, names, selfId, bubbles, time, this.camera);
    this.syncShotCone(snapshot, self, role);

    this.vignette.classList.toggle('storm', Boolean(snapshot.storm));
    this.vignette.classList.toggle('spectator', !self.alive);
    if (self.alive) {
      const vision = snapshot.storm ? (this.map.consts.VISION_R_STORM || 190) : (this.map.consts.VISION_R || 380);
      const radius = Math.max(1, vision * this.container.clientHeight / this.viewHeight);
      const overlay = snapshot.storm ? 'linear-gradient(rgba(8,15,27,.24), rgba(8,15,27,.24)), ' : '';
      this.vignette.style.background = `${overlay}radial-gradient(circle at 50% 54%, transparent 0 ${radius * 0.7}px, rgba(4,10,14,.96) ${radius}px, rgba(4,10,14,.98) 100%)`;
    } else {
      this.vignette.style.background = '';
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.renderer.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.container.replaceChildren();
  }
}

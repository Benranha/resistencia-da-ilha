'use strict';
// Gera os ícones PNG do PWA sem dependências (encoder PNG mínimo com zlib).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pix) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pix.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Desenho: fundo azul-petróleo, sol, ilha de areia, mar e um barco.
function draw(size, maskable) {
  const pix = Buffer.alloc(size * size * 4);
  const s = size;
  const safe = maskable ? 0.62 : 1; // área segura para ícones maskable
  const set = (x, y, r, g, b, a = 255) => { if (x < 0 || y < 0 || x >= s || y >= s) return; const i = (y * s + x) * 4; const f = a / 255; pix[i] = pix[i] * (1 - f) + r * f; pix[i + 1] = pix[i + 1] * (1 - f) + g * f; pix[i + 2] = pix[i + 2] * (1 - f) + b * f; pix[i + 3] = 255; };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const t = y / s;
    set(x, y, 11 + 30 * t, 29 + 50 * t, 38 + 40 * t); // gradiente do fundo
  }
  const cx = s / 2; const cy = s / 2; const R = (s / 2) * safe;
  const px = (v) => cx + (v - 0.5) * 2 * R; // coord normalizada [0,1] dentro da area segura
  const py = (v) => cy + (v - 0.5) * 2 * R;
  const circle = (x0, y0, r, col) => { for (let y = Math.floor(y0 - r); y <= y0 + r; y++) for (let x = Math.floor(x0 - r); x <= x0 + r; x++) { const d = Math.hypot(x - x0, y - y0); if (d <= r) set(x, y, col[0], col[1], col[2], d > r - 1 ? 160 : 255); } };
  const tri = (a, b, c, col) => {
    const minX = Math.floor(Math.min(a[0], b[0], c[0])); const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1])); const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const e = (p, q, r) => (r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0]);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5]; const w0 = e(b, c, p); const w1 = e(c, a, p); const w2 = e(a, b, p);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) set(x, y, col[0], col[1], col[2]);
    }
  };
  const rect = (x0, y0, x1, y1, col) => { for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) set(x, y, col[0], col[1], col[2]); };

  circle(px(0.72), py(0.28), R * 0.2, [232, 184, 74]); // sol
  // ilha
  for (let y = Math.floor(py(0.55)); y < py(0.8); y++) for (let x = Math.floor(px(0.1)); x < px(0.9); x++) {
    const u = (x - px(0.5)) / (R * 0.8); const v = (y - py(0.8)) / (R * 0.28);
    if (u * u + v * v < 1 && y < py(0.8)) set(x, y, 232, 214, 168);
  }
  // morro
  tri([px(0.55), py(0.38)], [px(0.3), py(0.7)], [px(0.8), py(0.7)], [109, 106, 96]);
  // mar
  rect(0, py(0.76), s, s, [24, 95, 135]);
  rect(0, py(0.76), s, py(0.76) + Math.max(2, s * 0.01), [140, 200, 225]);
  // barco
  rect(px(0.28), py(0.82), px(0.5), py(0.86), [224, 122, 60]);
  tri([px(0.38), py(0.58)], [px(0.38), py(0.8)], [px(0.5), py(0.8)], [232, 214, 168]);
  return png(s, pix);
}

const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, false));
fs.writeFileSync(path.join(out, 'maskable-512.png'), draw(512, true));
console.log('icones gerados em', out);

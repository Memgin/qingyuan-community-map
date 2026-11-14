// 生成分类图钉图标（纯色水滴 + 白描边 + 白心），供 Map Kit MarkerOptions.icon 使用
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'entry', 'src', 'main', 'resources', 'base', 'media');
const SIZE = 72;
const CX = SIZE / 2;
const CY = SIZE * 0.40;
const R = SIZE * 0.28;
const CONE = SIZE * 0.42;
const BORDER = SIZE * 0.055;

const PINS = [
  ['pin_scenic', '#5995A8'],
  ['pin_food', '#EB765E'],
  ['pin_shopping', '#B4778E'],
  ['pin_medical', '#68A678'],
  ['pin_school', '#6F7FC0'],
  ['pin_transit', '#D39A47']
];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// 覆盖率：在形状内返回 1，外返回 0，边缘按子采样平滑
function coverage(x, y, radius, cone, samples) {
  let inside = 0;
  const step = 1 / samples;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = x + (sx + 0.5) * step;
      const py = y + (sy + 0.5) * step;
      const dx = px - CX;
      const dy = py - CY;
      if (dy <= 0) {
        if (dx * dx + dy * dy <= radius * radius) inside++;
      } else {
        const t = Math.min(dy / cone, 1);
        const halfWidth = radius * (1 - t * t);
        const circle = dx * dx + dy * dy <= radius * radius;
        if (circle || (Math.abs(dx) <= halfWidth && py <= CY + cone)) inside++;
      }
    }
  }
  return inside / (samples * samples);
}

function coreCoverage(x, y, samples) {
  const radius = R * 0.42;
  let inside = 0;
  const step = 1 / samples;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = x + (sx + 0.5) * step;
      const py = y + (sy + 0.5) * step;
      const dx = px - CX;
      const dy = py - CY;
      if (dx * dx + dy * dy <= radius * radius) inside++;
    }
  }
  return inside / (samples * samples);
}

// src-over 合成
function over(dst, r, g, b, a) {
  if (a <= 0) return dst;
  const ia = 1 - a;
  return [
    r * a + dst[0] * ia,
    g * a + dst[1] * ia,
    b * a + dst[2] * ia,
    a + dst[3] * ia
  ];
}

function render(hex) {
  const [cr, cg, cb] = hexToRgb(hex);
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const samples = 4;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const white = coverage(x, y, R + BORDER, CONE + BORDER, samples);
      const color = coverage(x, y, R, CONE, samples);
      const core = coreCoverage(x, y, samples);
      let px = [0, 0, 0, 0];
      px = over(px, 255, 255, 255, white);
      px = over(px, cr, cg, cb, color);
      px = over(px, 255, 255, 255, core * 0.9);
      const i = (y * SIZE + x) * 4;
      pixels[i] = Math.round(px[0]);
      pixels[i + 1] = Math.round(px[1]);
      pixels[i + 2] = Math.round(px[2]);
      pixels[i + 3] = Math.round(px[3] * 255);
    }
  }
  return pixels;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
for (const [name, hex] of PINS) {
  const buf = png(render(hex));
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  console.log(`${name}.png ${buf.length} bytes`);
}

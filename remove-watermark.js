/**
 * Removes watermark from gojosad.png by making watermark-colored pixels
 * in the bottom region transparent.
 */
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const FILE = path.join(__dirname, 'renderer', 'gojosad.png');

// ── PNG decode helpers ────────────────────────────────────────────────────
function readUint32(buf, off) {
  return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}
function writeUint32(buf, off, val) {
  buf[off]   = (val >>> 24) & 0xff;
  buf[off+1] = (val >>> 16) & 0xff;
  buf[off+2] = (val >>>  8) & 0xff;
  buf[off+3] =  val         & 0xff;
}
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Paeth predictor
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// ── Read PNG ──────────────────────────────────────────────────────────────
const raw = fs.readFileSync(FILE);
let pos = 8; // skip PNG signature

let width, height, bitDepth, colorType;
const idatChunks = [];
const otherChunks = []; // before IDAT
const afterChunks = []; // after IDAT
let seenIDAT = false;

while (pos < raw.length) {
  const len  = readUint32(raw, pos);
  const type = raw.slice(pos+4, pos+8).toString('ascii');
  const data = raw.slice(pos+8, pos+8+len);
  pos += 12 + len;

  if (type === 'IHDR') {
    width     = readUint32(data, 0);
    height    = readUint32(data, 4);
    bitDepth  = data[8];
    colorType = data[9];
    console.log(`Image: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
    otherChunks.push({ type, data });
  } else if (type === 'IDAT') {
    seenIDAT = true;
    idatChunks.push(data);
  } else if (type === 'IEND') {
    afterChunks.push({ type, data });
  } else {
    if (!seenIDAT) otherChunks.push({ type, data });
    else afterChunks.push({ type, data });
  }
}

// ── Decompress & reconstruct pixels ──────────────────────────────────────
const compressed = Buffer.concat(idatChunks);
const filtered   = zlib.inflateSync(compressed);

// colorType 6 = RGBA (4 bytes/pixel), colorType 2 = RGB (3 bytes/pixel)
const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
const stride = width * bpp;
const pixels = Buffer.alloc(height * stride);

for (let y = 0; y < height; y++) {
  const filterType = filtered[y * (stride + 1)];
  const src  = y * (stride + 1) + 1;
  const dst  = y * stride;
  const prev = y > 0 ? pixels.slice((y-1) * stride) : Buffer.alloc(stride);

  for (let x = 0; x < stride; x++) {
    const raw_  = filtered[src + x];
    const left  = x >= bpp ? pixels[dst + x - bpp] : 0;
    const up    = prev[x];
    const uplft = x >= bpp ? prev[x - bpp] : 0;
    switch (filterType) {
      case 0: pixels[dst+x] = raw_; break;
      case 1: pixels[dst+x] = (raw_ + left) & 0xff; break;
      case 2: pixels[dst+x] = (raw_ + up)   & 0xff; break;
      case 3: pixels[dst+x] = (raw_ + ((left + up) >> 1)) & 0xff; break;
      case 4: pixels[dst+x] = (raw_ + paeth(left, up, uplft)) & 0xff; break;
    }
  }
}

console.log(`Pixels reconstructed. Scanning for watermark...`);

// ── Remove watermark ──────────────────────────────────────────────────────
// The watermark "@oiioioibakaa :3" sits in the bottom region of the image.
// Strategy: in the bottom 18% of the image, erase any pixel whose alpha > 0
// that is NOT a dominant black outline (very dark) and NOT a significant
// character color (sufficiently saturated or bright).
// Watermark text is typically mid-grey (#808080 ish) or dark grey.

let removed = 0;
const startY = Math.floor(height * 0.78); // scan bottom 22%

for (let y = startY; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const off = y * stride + x * bpp;
    const r = pixels[off], g = pixels[off+1], b = pixels[off+2];
    const a = bpp === 4 ? pixels[off+3] : 255;

    if (a < 20) continue; // already transparent

    // Watermark is grey/dark-grey text — low saturation, mid-dark brightness
    const brightness = (r + g + b) / 3;
    const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
    const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

    // Erase if: low saturation (grey/black text) AND not pure character black
    // Pure outline black is r<30,g<30,b<30 — we keep those
    // Watermark grey: brightness 40-180, saturation < 0.25
    if (saturation < 0.25 && brightness > 35 && brightness < 200) {
      pixels[off+3] = 0; // make transparent
      removed++;
    }
  }
}

console.log(`Erased ${removed} watermark pixels.`);

// ── Re-filter (None filter = type 0) & compress ───────────────────────────
const refiltered = Buffer.alloc(height * (stride + 1));
for (let y = 0; y < height; y++) {
  refiltered[y * (stride + 1)] = 0; // None filter
  pixels.copy(refiltered, y * (stride + 1) + 1, y * stride, (y+1) * stride);
}
const recompressed = zlib.deflateSync(refiltered, { level: 9 });

// ── Rebuild PNG ───────────────────────────────────────────────────────────
function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); writeUint32(len, 0, data.length);
  const crcBuf = Buffer.alloc(4);
  writeUint32(crcBuf, 0, crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([137,80,78,71,13,10,26,10]);
const parts = [sig];
for (const c of otherChunks) parts.push(makeChunk(c.type, c.data));
parts.push(makeChunk('IDAT', recompressed));
for (const c of afterChunks) parts.push(makeChunk(c.type, c.data));

const out = Buffer.concat(parts);
fs.writeFileSync(FILE, out);
console.log(`Done! Saved cleaned gojosad.png (${out.length} bytes)`);

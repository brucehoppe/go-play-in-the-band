// PNG in, animated GIF out, with nothing but Node's zlib. Enough for a short screen recording of
// a flat UI: a global 256-colour palette by popularity, nearest-colour mapping, LZW at 8 bits.
import { inflateSync } from "node:zlib";

/** Decode an 8-bit RGB/RGBA (non-interlaced) PNG into RGBA bytes. */
export function decodePng(buf) {
  let p = 8;
  let width = 0, height = 0, channels = 4, depth = 8;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8];
      const ct = data[9];
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
      if (depth !== 8 || !channels || data[12] !== 0) throw new Error("PNG must be 8-bit, non-interlaced");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (channels >= 3) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = channels === 4 ? line[s + 3] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = channels === 2 ? line[s + 1] : 255; }
    }
    prev.set(line);
  }
  return { width, height, rgba: out };
}

/** Box-average downscale of RGBA to `w` pixels wide (keeps the aspect ratio). */
export function scaleTo(img, w) {
  const h = Math.round((img.height * w) / img.width);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.width + xx) * 4; r += img.rgba[i]; g += img.rgba[i + 1]; b += img.rgba[i + 2]; n++; }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, rgba: out };
}

const key = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** A 256-colour palette shared by all frames: the most common 5-bit colours, exact averages inside each. */
function palette(frames) {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  for (const f of frames) for (let i = 0; i < f.rgba.length; i += 4) {
    const k = key(f.rgba[i], f.rgba[i + 1], f.rgba[i + 2]);
    count[k]++; sum[k * 3] += f.rgba[i]; sum[k * 3 + 1] += f.rgba[i + 1]; sum[k * 3 + 2] += f.rgba[i + 2];
  }
  const bins = [];
  for (let k = 0; k < 32768; k++) if (count[k]) bins.push(k);
  bins.sort((a, b) => count[b] - count[a]);
  const pal = bins.slice(0, 256).map((k) => [sum[k * 3] / count[k], sum[k * 3 + 1] / count[k], sum[k * 3 + 2] / count[k]].map(Math.round));
  while (pal.length < 2) pal.push([0, 0, 0]);
  return pal;
}

function indexFrame(f, pal, cache) {
  const idx = new Uint8Array(f.width * f.height);
  for (let i = 0, p = 0; i < f.rgba.length; i += 4, p++) {
    const r = f.rgba[i], g = f.rgba[i + 1], b = f.rgba[i + 2];
    const k = key(r, g, b);
    let best = cache[k];
    if (best === 255 + 1) {
      let d = Infinity;
      for (let c = 0; c < pal.length; c++) { const dr = pal[c][0] - r, dg = pal[c][1] - g, db = pal[c][2] - b; const dd = dr * dr + dg * dg + db * db; if (dd < d) { d = dd; best = c; } }
      cache[k] = best;
    }
    idx[p] = best;
  }
  return idx;
}

/** LZW-compress an indexed image into GIF sub-blocks (minimum code size 8). */
function lzw(indexes) {
  const MIN = 8, CLEAR = 256, EOI = 257;
  const out = [];
  let cur = 0, bits = 0;
  let codeSize = MIN + 1;
  const emit = (code) => { cur |= code << bits; bits += codeSize; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  let dict = new Map(); let next = EOI + 1;
  const reset = () => { dict = new Map(); next = EOI + 1; codeSize = MIN + 1; };
  emit(CLEAR);
  let prefix = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const k = indexes[i];
    const joined = prefix * 256 + k;
    const found = dict.get(joined);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(joined, next++); if (next - 1 === 1 << codeSize && codeSize < 12) codeSize++; }
    else { emit(CLEAR); reset(); }
    prefix = k;
  }
  emit(prefix);
  emit(EOI);
  if (bits > 0) out.push(cur & 255);
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) { const chunk = out.slice(i, i + 255); blocks.push(chunk.length, ...chunk); }
  blocks.push(0);
  return Buffer.from(blocks);
}

/** Build a looping GIF from RGBA frames of one size. `delays` are per frame in hundredths of a second. */
export function encodeGif(frames, delays) {
  const { width, height } = frames[0];
  const pal = palette(frames);
  const cache = new Uint16Array(32768).fill(256);
  const parts = [];
  const header = Buffer.alloc(13);
  header.write("GIF89a", 0, "ascii");
  header.writeUInt16LE(width, 6); header.writeUInt16LE(height, 8);
  header[10] = 0xf7; header[11] = 0; header[12] = 0;
  parts.push(header);
  const table = Buffer.alloc(256 * 3);
  pal.forEach((c, i) => { table[i * 3] = c[0]; table[i * 3 + 1] = c[1]; table[i * 3 + 2] = c[2]; });
  parts.push(table);
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "ascii"), 0x03, 0x01, 0x00, 0x00, 0x00])); // loop forever
  frames.forEach((f, i) => {
    const gce = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0, 0, 0x00, 0x00]);
    gce.writeUInt16LE(delays[i] ?? 100, 4);
    parts.push(gce);
    const desc = Buffer.alloc(10);
    desc[0] = 0x2c; desc.writeUInt16LE(0, 1); desc.writeUInt16LE(0, 3); desc.writeUInt16LE(width, 5); desc.writeUInt16LE(height, 7); desc[9] = 0;
    parts.push(desc, Buffer.from([8]), lzw(indexFrame(f, pal, cache)));
  });
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

// A small PNG reader and writer that keeps every sample: every PNG kind, interlaced or not, read as 8 or 16 bits with
// its profile. The browser's decoder is never used for a PNG: it would change its numbers.
export interface Raster {data: Uint8Array | Uint16Array; width: number; height: number; icc?: Uint8Array}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let table: Uint32Array | undefined;
function crc32(parts: Uint8Array[]): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const part of parts) for (let i = 0; i < part.length; i++) c = table[(c ^ part[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const isPng = (b: Uint8Array): boolean => b.length > 8 && SIG.every((v, i) => b[i] === v);

/** Reads a PNG: RGBA samples, a Uint16Array for a 16-bit PNG. Returns null for a file it cannot read whole. */
export async function decodePng(b: Uint8Array): Promise<Raster | null> {
  if (!isPng(b)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | undefined, trns: Uint8Array | undefined, icc: Uint8Array | undefined;
  while (pos + 8 <= b.length) {
    const len = view.getUint32(pos);
    const name = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const body = b.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12);
      depth = b[pos + 16]; type = b[pos + 17]; interlace = b[pos + 20];
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'iCCP') {
      const nul = body.indexOf(0);
      if (nul > 0) icc = await inflate(body.subarray(nul + 2));
    } else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const channels = ({0: 1, 2: 3, 3: 1, 4: 2, 6: 4} as Record<number, number>)[type];
  const depths = ({0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]} as Record<number, number[]>)[type];
  if (!channels || !depths.includes(depth) || interlace > 1 || !width || !height || (type === 3 && !palette)) return null;
  let total = 0;
  for (const part of idat) total += part.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of idat) { joined.set(part, at); at += part.length; }
  const raw = await inflate(joined);
  const bits = channels * depth, bpp = Math.max(1, bits >> 3), max = (1 << depth) - 1;
  const wide = depth === 16, full = wide ? 65535 : 255;
  // A sample as stored, and as 8 or 16 bits (gray at 1, 2 or 4 bits is scaled to 8).
  const stored = (rows: Uint8Array, row: number, i: number) =>
    wide ? rows[row + i * 2] << 8 | rows[row + i * 2 + 1]
    : depth === 8 ? rows[row + i]
    : (rows[row + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & max;
  const key = (i: number) => (trns && trns.length >= 2 * (i + 1) ? trns[i * 2] << 8 | trns[i * 2 + 1] : -1);
  const out = wide ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
  let from = 0;
  for (const [x0, y0, dx, dy] of interlace ? ADAM7 : [[0, 0, 1, 1]]) {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil(pw * bits / 8);
    const rows = unfilter(raw, from, stride, ph, bpp);
    if (!rows) return null;
    from += (stride + 1) * ph;
    for (let y = 0; y < ph; y++) {
      const row = y * stride;
      for (let x = 0; x < pw; x++) {
        const o = ((y0 + y * dy) * width + x0 + x * dx) * 4, i = x * channels;
        if (type === 3) {
          const k = stored(rows, row, i);
          if (k * 3 + 2 >= palette!.length) return null;
          out[o] = palette![k * 3]; out[o + 1] = palette![k * 3 + 1]; out[o + 2] = palette![k * 3 + 2];
          out[o + 3] = trns && k < trns.length ? trns[k] : 255;
        } else if (type === 0) {
          const g = stored(rows, row, i);
          out[o] = out[o + 1] = out[o + 2] = depth < 8 ? Math.round(g * 255 / max) : g;
          out[o + 3] = g === key(0) ? 0 : full;
        } else if (type === 4) {
          out[o] = out[o + 1] = out[o + 2] = stored(rows, row, i); out[o + 3] = stored(rows, row, i + 1);
        } else {
          const r = stored(rows, row, i), g = stored(rows, row, i + 1), b2 = stored(rows, row, i + 2);
          out[o] = r; out[o + 1] = g; out[o + 2] = b2;
          out[o + 3] = type === 6 ? stored(rows, row, i + 3) : r === key(0) && g === key(1) && b2 === key(2) ? 0 : full;
        }
      }
    }
  }
  return {data: out, width, height, icc};
}

const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** The rows of one image (or one interlace pass), filters undone. */
function unfilter(raw: Uint8Array, from: number, stride: number, height: number, bpp: number): Uint8Array | null {
  if (raw.length < from + (stride + 1) * height) return null;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[from + y * (stride + 1)];
    if (filter > 4) return null;
    const src = from + y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp] : 0;
      const up = y ? rows[dst - stride + x] : 0;
      const c = x >= bpp && y ? rows[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      rows[dst + x] = v & 255;
    }
  }
  return rows;
}

const u32 = (n: number): Uint8Array => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (name: string, body: Uint8Array): Uint8Array => {
  const head = new Uint8Array([name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)]);
  const out = new Uint8Array(12 + body.length);
  out.set(u32(body.length), 0); out.set(head, 4); out.set(body, 8); out.set(u32(crc32([head, body])), 8 + body.length);
  return out;
};

/** Writes an RGBA PNG, 8-bit or (from Uint16Array samples) 16-bit. Drops the alpha channel when every pixel is opaque. */
export async function encodePng(r: Raster): Promise<Uint8Array> {
  const {data, width, height} = r;
  const wide = data instanceof Uint16Array, full = wide ? 65535 : 255, bytes = wide ? 2 : 1;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== full) { opaque = false; break; }
  const ch = opaque ? 3 : 4, stride = width * ch * bytes;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    let o = y * (stride + 1);
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      for (let c = 0; c < ch; c++) {
        const v = data[s + c];
        if (wide) raw[o++] = v >> 8;
        raw[o++] = v & 255;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0); ihdr.set(u32(height), 4); ihdr[8] = wide ? 16 : 8; ihdr[9] = opaque ? 2 : 6;
  const parts: Uint8Array[] = [new Uint8Array(SIG), chunk('IHDR', ihdr)];
  if (r.icc) {
    const packed = await deflate(r.icc);
    const body = new Uint8Array(5 + packed.length);
    body.set([105, 99, 99, 0, 0]); // "icc", NUL, method 0
    body.set(packed, 5);
    parts.push(chunk('iCCP', body));
  }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

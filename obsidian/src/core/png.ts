// A small PNG reader and writer that keeps every sample. The browser's own decoder is
// the fallback for the rare cases this reader declines (16-bit, interlaced, low bit depth).
export interface Raster {data: Uint8Array; width: number; height: number; icc?: Uint8Array}

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

/** Reads 8-bit PNGs that are not interlaced. Returns null for any other PNG. */
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
  if (depth !== 8 || interlace !== 0 || !width || !height) return null;
  const channels = ({0: 1, 2: 3, 3: 1, 4: 2, 6: 4} as Record<number, number>)[type];
  if (!channels || (type === 3 && !palette)) return null;
  let total = 0;
  for (const part of idat) total += part.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of idat) { joined.set(part, at); at += part.length; }
  const raw = await inflate(joined);
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[dst + x - channels] : 0;
      const up = y ? rows[dst - stride + x] : 0;
      const c = x >= channels && y ? rows[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else if (filter > 4) return null;
      rows[dst + x] = v & 255;
    }
  }
  const out = new Uint8Array(width * height * 4);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (type === 6) { out[o] = rows[o]; out[o + 1] = rows[o + 1]; out[o + 2] = rows[o + 2]; out[o + 3] = rows[o + 3]; }
    else if (type === 2) {
      const s = i * 3;
      out[o] = rows[s]; out[o + 1] = rows[s + 1]; out[o + 2] = rows[s + 2]; out[o + 3] = 255;
      if (trns && trns.length >= 6 && rows[s] === trns[1] && rows[s + 1] === trns[3] && rows[s + 2] === trns[5]) out[o + 3] = 0;
    } else if (type === 0) {
      const g = rows[i];
      out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = trns && trns.length >= 2 && g === trns[1] ? 0 : 255;
    } else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = rows[i * 2]; out[o + 3] = rows[i * 2 + 1]; }
    else {
      const k = rows[i];
      out[o] = palette![k * 3]; out[o + 1] = palette![k * 3 + 1]; out[o + 2] = palette![k * 3 + 2];
      out[o + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return {data: out, width, height, icc};
}

const u32 = (n: number): Uint8Array => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (name: string, body: Uint8Array): Uint8Array => {
  const head = new Uint8Array([name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)]);
  const out = new Uint8Array(12 + body.length);
  out.set(u32(body.length), 0); out.set(head, 4); out.set(body, 8); out.set(u32(crc32([head, body])), 8 + body.length);
  return out;
};

/** Writes an RGBA PNG (8-bit). Drops the alpha channel when every pixel is opaque. */
export async function encodePng(r: Raster): Promise<Uint8Array> {
  const {data, width, height} = r;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
  const ch = opaque ? 3 : 4;
  const raw = new Uint8Array((width * ch + 1) * height);
  for (let y = 0; y < height; y++) {
    let o = y * (width * ch + 1);
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      raw[o++] = data[s]; raw[o++] = data[s + 1]; raw[o++] = data[s + 2];
      if (!opaque) raw[o++] = data[s + 3];
    }
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0); ihdr.set(u32(height), 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
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

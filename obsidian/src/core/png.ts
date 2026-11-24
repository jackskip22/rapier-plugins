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
  const data = await samples(idat, width, height, type, palette, trns);
  return data ? {data, width, height, icc} : null;
}

/** The RGBA samples of one 8-bit, non-interlaced image whose compressed rows are `idat`. Null when they are not whole. */
async function samples(idat: Uint8Array[], width: number, height: number, type: number, palette?: Uint8Array, trns?: Uint8Array): Promise<Uint8Array | null> {
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
  return out;
}

const u32 = (n: number): Uint8Array => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (name: string, body: Uint8Array): Uint8Array => {
  const head = new Uint8Array([name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)]);
  const out = new Uint8Array(12 + body.length);
  out.set(u32(body.length), 0); out.set(head, 4); out.set(body, 8); out.set(u32(crc32([head, body])), 8 + body.length);
  return out;
};

const isOpaque = (data: Uint8Array): boolean => {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
  return true;
};

const scanlines = (data: Uint8Array, width: number, height: number, opaque: boolean): Uint8Array => {
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
  return raw;
};

const join = (parts: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const iccChunk = async (icc: Uint8Array): Promise<Uint8Array> => {
  const packed = await deflate(icc);
  const body = new Uint8Array(5 + packed.length);
  body.set([105, 99, 99, 0, 0]); // "icc", NUL, method 0
  body.set(packed, 5);
  return chunk('iCCP', body);
};

/** Writes an RGBA PNG (8-bit). Drops the alpha channel when every pixel is opaque. */
export async function encodePng(r: Raster): Promise<Uint8Array> {
  const {data, width, height} = r;
  const opaque = isOpaque(data);
  const raw = scanlines(data, width, height, opaque);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0); ihdr.set(u32(height), 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  const parts: Uint8Array[] = [new Uint8Array(SIG), chunk('IHDR', ihdr)];
  if (r.icc) parts.push(await iccChunk(r.icc));
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  return join(parts);
}

/** Writes an animated PNG one band of rows at a time, so the whole animation is never held raw: each frame has its own open
 * deflate stream, and a band's rows for every frame go in as they are decoded. Only the compressed frames stay in memory.
 * Every frame is a whole picture, so a viewer needs nothing else to play it. `loops` 0 repeats forever. */
export class ApngWriter {
  private readonly writers: WritableStreamDefaultWriter<Uint8Array>[] = [];
  private readonly parts: Promise<Uint8Array[]>[] = [];
  private readonly channels: number;
  constructor(private readonly width: number, private readonly height: number, private readonly delaysMs: number[],
    private readonly loops: number, private readonly alpha: boolean, private readonly icc?: Uint8Array) {
    this.channels = alpha ? 4 : 3;
    for (let k = 0; k < delaysMs.length; k++) {
      const stream = new CompressionStream('deflate');
      this.writers.push(stream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>);
      const reader = stream.readable.getReader();
      this.parts.push((async () => {
        const out: Uint8Array[] = [];
        for (;;) { const r = await reader.read(); if (r.done) return out; out.push(r.value); }
      })());
    }
  }
  /** The RGBA rows of one frame, in order from the top. Rows of different frames may arrive in any order. */
  async rows(frame: number, rgba: Uint8Array, count: number): Promise<void> {
    const ch = this.channels, stride = this.width * ch;
    const raw = new Uint8Array((stride + 1) * count);
    let o = 0;
    for (let y = 0; y < count; y++) {
      raw[o++] = 0;
      let s = y * this.width * 4;
      if (this.alpha) { raw.set(rgba.subarray(s, s + this.width * 4), o); o += this.width * 4; }
      else for (let x = 0; x < this.width; x++, s += 4) { raw[o++] = rgba[s]; raw[o++] = rgba[s + 1]; raw[o++] = rgba[s + 2]; }
    }
    await this.writers[frame].write(raw);
  }
  async finish(): Promise<Uint8Array> {
    await Promise.all(this.writers.map(w => w.close()));
    const compressed = await Promise.all(this.parts);
    const ihdr = new Uint8Array(13);
    ihdr.set(u32(this.width), 0); ihdr.set(u32(this.height), 4); ihdr[8] = 8; ihdr[9] = this.alpha ? 6 : 2;
    const actl = new Uint8Array(8);
    actl.set(u32(compressed.length), 0); actl.set(u32(Math.max(0, Math.floor(this.loops))), 4);
    const out: Uint8Array[] = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('acTL', actl)];
    if (this.icc) out.push(await iccChunk(this.icc));
    let seq = 0;
    compressed.forEach((pieces, n) => {
      // Delay is a fraction of a second: milliseconds over 1000, at most 65535.
      const ms = Math.min(65535, Math.max(0, Math.round(this.delaysMs[n])));
      const fctl = new Uint8Array(26);
      fctl.set(u32(seq++), 0); fctl.set(u32(this.width), 4); fctl.set(u32(this.height), 8);
      fctl[20] = ms >> 8; fctl[21] = ms & 255; fctl[22] = 1000 >> 8; fctl[23] = 1000 & 255; // delay_den 1000; dispose none; blend source
      out.push(chunk('fcTL', fctl));
      const packed = join(pieces);
      if (n === 0) out.push(chunk('IDAT', packed));
      else { const body = new Uint8Array(4 + packed.length); body.set(u32(seq++), 0); body.set(packed, 4); out.push(chunk('fdAT', body)); }
    });
    out.push(chunk('IEND', new Uint8Array(0)));
    return join(out);
  }
}

/** Writes an animated PNG one frame at a time, as frames arrive, keeping only each frame's compressed bytes. `frame` returns the
 * same picture as a plain PNG (the frame's compressed data is its IDAT), so a viewer can show it at once. `loops` 0 repeats forever. */
export class ApngBuilder {
  private readonly packed: Uint8Array[] = [];
  private readonly delays: number[] = [];
  constructor(private readonly width: number, private readonly height: number, private readonly loops: number,
    private readonly alpha: boolean, private readonly icc?: Uint8Array) {}
  get count(): number { return this.packed.length; }
  /** The compressed bytes held so far. */
  get size(): number { let n = 0; for (const p of this.packed) n += p.length; return n; }
  private ihdr(): Uint8Array {
    const ihdr = new Uint8Array(13);
    ihdr.set(u32(this.width), 0); ihdr.set(u32(this.height), 4); ihdr[8] = 8; ihdr[9] = this.alpha ? 6 : 2;
    return ihdr;
  }
  async frame(rgba: Uint8Array, delayMs: number): Promise<Uint8Array> {
    const packed = await deflate(scanlines(rgba, this.width, this.height, !this.alpha));
    this.packed.push(packed); this.delays.push(delayMs);
    const parts: Uint8Array[] = [new Uint8Array(SIG), chunk('IHDR', this.ihdr())];
    if (this.icc) parts.push(await iccChunk(this.icc));
    parts.push(chunk('IDAT', packed), chunk('IEND', new Uint8Array(0)));
    return join(parts);
  }
  async finish(): Promise<Uint8Array> {
    if (this.packed.length < 2) throw new Error('An animation needs two frames.');
    const actl = new Uint8Array(8);
    actl.set(u32(this.packed.length), 0); actl.set(u32(Math.max(0, Math.floor(this.loops))), 4);
    const out: Uint8Array[] = [new Uint8Array(SIG), chunk('IHDR', this.ihdr()), chunk('acTL', actl)];
    if (this.icc) out.push(await iccChunk(this.icc));
    let seq = 0;
    this.packed.forEach((packed, n) => {
      const ms = Math.min(65535, Math.max(0, Math.round(this.delays[n])));
      const fctl = new Uint8Array(26);
      fctl.set(u32(seq++), 0); fctl.set(u32(this.width), 4); fctl.set(u32(this.height), 8);
      fctl[20] = ms >> 8; fctl[21] = ms & 255; fctl[22] = 1000 >> 8; fctl[23] = 1000 & 255;
      out.push(chunk('fcTL', fctl));
      if (n === 0) out.push(chunk('IDAT', packed));
      else { const body = new Uint8Array(4 + packed.length); body.set(u32(seq++), 0); body.set(packed, 4); out.push(chunk('fdAT', body)); }
    });
    out.push(chunk('IEND', new Uint8Array(0)));
    return join(out);
  }
}

/** Whether a PNG states an animation (acTL) at all, even one frame. Such a file may hold a default picture apart from its frame. */
export function hasActl(b: Uint8Array): boolean {
  if (!isPng(b)) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let pos = 8; pos + 8 <= b.length;) {
    const len = view.getUint32(pos);
    const name = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    if (name === 'acTL') return true;
    if (name === 'IDAT' || name === 'IEND') return false;
    pos += 12 + len;
  }
  return false;
}

/** Whether a PNG is animated: it states its frames (acTL) before its picture data. */
export function isApng(b: Uint8Array): boolean {
  if (!isPng(b)) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let pos = 8; pos + 8 <= b.length;) {
    const len = view.getUint32(pos);
    const name = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    if (name === 'acTL') return len >= 8 && view.getUint32(pos + 8) > 1;
    if (name === 'IDAT' || name === 'IEND') return false;
    pos += 12 + len;
  }
  return false;
}

export type AnimatedFrame = {data: Uint8Array; duration: number};
/** `frames` is a list, or an async iterable that decodes each frame as the encoder takes it. */
export interface Animated {width: number; height: number; loops: number; frames: AnimatedFrame[] | AsyncIterable<AnimatedFrame>; icc?: Uint8Array; /** The file's default picture is not one of its frames. */ hiddenDefault?: boolean}

/** The canvas size and frame count of an animated PNG, read before any frame is decoded. */
export function apngSize(b: Uint8Array): {width: number; height: number; frames: number} | null {
  if (!isApng(b)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let frames = 0;
  for (let pos = 8; pos + 8 <= b.length;) {
    const len = view.getUint32(pos);
    if (String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]) === 'acTL') frames = view.getUint32(pos + 8);
    pos += 12 + len;
  }
  return {width: view.getUint32(16), height: view.getUint32(20), frames};
}

/** Reads an animated PNG into whole-canvas frames, applying each frame's offset, dispose and blend, so each is the picture as
 * shown at that time. Null for what this reader does not handle (16-bit, interlaced, low bit depth: the caller leaves the file). */
export async function decodeApng(b: Uint8Array, stream?: false): Promise<(Animated & {frames: AnimatedFrame[]}) | null>;
export async function decodeApng(b: Uint8Array, stream: boolean): Promise<Animated | null>;
export async function decodeApng(b: Uint8Array, stream = false): Promise<Animated | null> {
  if (!isApng(b)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0, loops = 0;
  let palette: Uint8Array | undefined, trns: Uint8Array | undefined, icc: Uint8Array | undefined;
  type Part = {x: number; y: number; w: number; h: number; delay: number; dispose: number; blend: number; data: Uint8Array[]};
  const parts: Part[] = [];
  let current: Part | null = null, defaultFrameHasControl = false, sawIdat = false;
  for (let pos = 8; pos + 8 <= b.length;) {
    const len = view.getUint32(pos);
    const name = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const body = b.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { width = view.getUint32(pos + 8); height = view.getUint32(pos + 12); depth = b[pos + 16]; type = b[pos + 17]; interlace = b[pos + 20]; }
    else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'acTL') loops = view.getUint32(pos + 12);
    else if (name === 'iCCP') { const nul = body.indexOf(0); if (nul > 0) icc = await inflate(body.subarray(nul + 2)); }
    else if (name === 'fcTL') {
      const den = view.getUint16(pos + 8 + 22) || 100;
      current = {x: view.getUint32(pos + 8 + 12), y: view.getUint32(pos + 8 + 16), w: view.getUint32(pos + 8 + 4), h: view.getUint32(pos + 8 + 8),
        delay: view.getUint16(pos + 8 + 20) * 1000 / den, dispose: b[pos + 8 + 24], blend: b[pos + 8 + 25], data: []};
      parts.push(current);
      if (parts.length === 1) defaultFrameHasControl = !sawIdat;
    } else if (name === 'IDAT') { sawIdat = true; if (defaultFrameHasControl && parts.length === 1) current!.data.push(body); }
    else if (name === 'fdAT') { if (current) current.data.push(body.subarray(4)); }
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  // A file whose picture is not one of its frames (no fcTL before IDAT) shows that picture only on a viewer without animation: the frames still play.
  if (depth !== 8 || interlace !== 0 || !width || !height || parts.length < 2) return null;
  for (const p of parts) if (p.x + p.w > width || p.y + p.h > height || !p.w || !p.h) return null;
  // Each frame is composed when it is taken, so a long animation is never held whole (the encoder reads frames as they come).
  async function* each(): AsyncGenerator<AnimatedFrame> {
    const canvas = new Uint8Array(width * height * 4);
    let previous: Uint8Array | null = null;
    for (const p of parts) {
      const px = await samples(p.data, p.w, p.h, type, palette, trns);
      if (!px) throw new Error('An animated PNG this reader cannot decode.');
      if (p.dispose === 2) previous = canvas.slice();
      for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < p.w; x++) {
          const s = (y * p.w + x) * 4, d = ((p.y + y) * width + p.x + x) * 4;
          const a = px[s + 3];
          if (p.blend === 0 || a === 255) { canvas[d] = px[s]; canvas[d + 1] = px[s + 1]; canvas[d + 2] = px[s + 2]; canvas[d + 3] = a; }
          else if (a > 0) {
            // Straight-alpha "over" with rounding, as the specification's compositing equation.
            const ba = canvas[d + 3], oa = a + Math.round(ba * (255 - a) / 255);
            for (let c = 0; c < 3; c++) canvas[d + c] = oa ? Math.round((px[s + c] * a + canvas[d + c] * ba * (255 - a) / 255) / oa) : 0;
            canvas[d + 3] = oa;
          }
        }
      }
      yield {data: canvas.slice(), duration: p.delay};
      if (p.dispose === 1) for (let y = 0; y < p.h; y++) canvas.fill(0, ((p.y + y) * width + p.x) * 4, ((p.y + y) * width + p.x + p.w) * 4);
      else if (p.dispose === 2 && previous) canvas.set(previous);
    }
  }
  const hiddenDefault = sawIdat && !defaultFrameHasControl;
  if (stream) return {width, height, loops, frames: each(), icc, hiddenDefault};
  const frames: AnimatedFrame[] = [];
  try { for await (const frame of each()) frames.push(frame); } catch { return null; }
  return {width, height, loops, frames, icc, hiddenDefault: sawIdat && !defaultFrameHasControl};
}

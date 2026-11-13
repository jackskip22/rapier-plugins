// Runs inside the worker (and in Node tests). No Obsidian code here.
import {encode} from 'rapier-jxl/animation';
import {recompress, restore} from 'rapier-jxl/jpeg';
import {decode} from 'rapier-jxl/decode';
import {header} from 'rapier-jxl/metadata';
import {verify, configureDecoder} from 'rapier-jxl/verify';
import {classify, type Look} from './classify.js';
import {decodePng, encodePng, isPng, type Raster} from './png.js';

// The check decodes with rapier-jxl itself: what the plug-in shows is what it checks, at every depth and color.
configureDecoder(decode, restore);

export type Mode = 'auto' | 'screenshot' | 'photo';
export interface ConvertOptions {mode: Mode; quality: number; effort?: number; maxPixels?: number}
export type Kept = 'jpeg-bytes' | 'pixels' | 'lossy';
/** rapier-jxl's record of a conversion: what the check needs besides the file. */
export type JxlRecord = Parameters<typeof verify>[1];
export interface Converted {
  bytes: Uint8Array | null;
  kept?: Kept;
  record?: JxlRecord;
  look?: Look;
  animated?: boolean;
  reason?: string;
}
export type BrowserRaster = (bytes: Uint8Array, ext: string) => Promise<Raster>;

/** The most pixels the codec accepts (`maxPixels` above this is refused). A phone gets less. */
export const MAX_PIXELS = 64_000_000;
export const maxPixelsFor = (mobile: boolean): number => (mobile ? 24_000_000 : MAX_PIXELS);
export const INPUT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const isGif = (b: Uint8Array) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
/** Any 'VP8 ' chunk from `from` to `end`, walking the RIFF chunks and the frames of an animation. */
function lossyChunk(b: Uint8Array, from: number, end: number): boolean {
  for (let at = from; at + 8 <= end;) {
    const len = (b[at + 4] | b[at + 5] << 8 | b[at + 6] << 16 | b[at + 7] << 24) >>> 0;
    const t = tag(b, at);
    if (t === 'VP8 ') return true;
    if (t === 'ANMF' && lossyChunk(b, at + 24, Math.min(end, at + 8 + len))) return true;
    at += 8 + len + (len & 1);
  }
  return false;
}
/** An animated WebP (the VP8X animation flag, or an ANMF frame) or PNG (acTL). Read as one picture, it would become a still. */
export function isAnimated(b: Uint8Array): boolean {
  if (b.length >= 20 && tag(b, 0) === 'RIFF' && tag(b, 8) === 'WEBP') {
    for (let at = 12; at + 8 <= b.length;) {
      const len = (b[at + 4] | b[at + 5] << 8 | b[at + 6] << 16 | b[at + 7] << 24) >>> 0;
      const t = tag(b, at);
      if (t === 'ANMF' || t === 'ANIM' || (t === 'VP8X' && at + 8 < b.length && b[at + 8] & 0x02)) return true;
      at += 8 + len + (len & 1);
    }
    return false;
  }
  if (!isPng(b)) return false;
  for (let at = 8; at + 8 <= b.length;) {
    const len = (b[at] << 24 | b[at + 1] << 16 | b[at + 2] << 8 | b[at + 3]) >>> 0;
    const t = tag(b, at + 4);
    if (t === 'acTL') return true;
    if (t === 'IDAT' || t === 'IEND') return false;
    at += 12 + len;
  }
  return false;
}
const ANIMATED = 'It is animated.';

/** A WebP made with loss: a 'VP8 ' chunk, in the file or in a frame. Coding its pixels again is never smaller and can take very long. */
export const isLossyWebp = (b: Uint8Array): boolean =>
  b.length >= 20 && tag(b, 0) === 'RIFF' && tag(b, 8) === 'WEBP' && lossyChunk(b, 12, b.length);

/** The ICC profile in a WebP's ICCP chunk. */
function webpIcc(b: Uint8Array): Uint8Array | undefined {
  for (let at = 12; at + 8 <= b.length;) {
    const len = (b[at + 4] | b[at + 5] << 8 | b[at + 6] << 16 | b[at + 7] << 24) >>> 0;
    if (tag(b, at) === 'ICCP') return b.slice(at + 8, at + 8 + len);
    at += 8 + len + (len & 1);
  }
  return undefined;
}

/** A lossless WebP's own numbers and profile. The browser decodes it with no color conversion and no premultiplying,
 * and WebGL reads the samples as decoded (a 2D canvas would premultiply them). Not used in Node tests. */
export const browserRaster: BrowserRaster = async bytes => {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], {type: 'image/webp'}), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
  try {
    const {width, height} = bitmap;
    const gl = new OffscreenCanvas(width, height).getContext('webgl2', {premultipliedAlpha: false});
    if (!gl) throw new Error('Not converted.');
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    const frame = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const data = new Uint8Array(width * height * 4);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const failed = gl.getError() !== gl.NO_ERROR;
    gl.deleteFramebuffer(frame); gl.deleteTexture(texture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (failed) throw new Error('Not converted.');
    return {data, width, height, icc: webpIcc(bytes)};
  } finally { bitmap.close(); }
};

/** What rapier-jxl is given, and the check with it: the picture's own samples at their own depth, with its own profile.
 * Every PNG is read here; a lossless WebP by the browser, unconverted. */
async function raster(bytes: Uint8Array, ext: string, fallback: BrowserRaster): Promise<Raster> {
  if (!isPng(bytes)) return fallback(bytes, ext);
  const r = await decodePng(bytes);
  if (!r) throw new Error('Not converted.');
  return r;
}
/** 8-bit numbers for the look test. */
const eight = (r: Raster): Uint8Array => (r.data instanceof Uint16Array ? Uint8Array.from(r.data, v => v >> 8) : r.data);

type Measured = {ok: true} | {ok: false; unavailable: boolean};
/** Codes that mean the check could not run here, not that the file is wrong. */
const UNAVAILABLE = new Set(['JXL_UNSUPPORTED', 'JXL_WASM', 'JXL_PLATFORM', 'JXL_MEMORY', 'JXL_LIMIT', 'JXL_DIMENSIONS']);
async function measure(o: Raster | Blob | Uint8Array, record: JxlRecord, maxPixels: number): Promise<Measured> {
  try { await verify(o, record, {maxPixels}); return {ok: true}; }
  catch (e) {
    // Unavailable: the code says the check could not run here, and nothing was measured.
    const err = e as {code?: string; verification?: {score?: number}};
    return {ok: false, unavailable: !!err.code && UNAVAILABLE.has(err.code) && err.verification?.score === undefined};
  }
}
const LOOK_MISSED = 'It did not look close enough to the original.';

const cap = (o: ConvertOptions) => Math.min(o.maxPixels ?? MAX_PIXELS, MAX_PIXELS);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Converts one PNG, JPEG, WebP or GIF to JPEG XL. Never throws for a picture it cannot convert: bytes is null with a reason. */
export async function convert(input: Uint8Array, ext: string, o: ConvertOptions, fallback: BrowserRaster = browserRaster): Promise<Converted> {
  ext = ext.toLowerCase();
  try {
    if (isJpeg(input)) {
      // Lossless: the original JPEG comes back byte for byte.
      const r = await recompress(input, {maxPixels: cap(o)});
      if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
      if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
      return {bytes: r.bytes, kept: 'jpeg-bytes', look: 'photo', record: r};
    }
    if (isGif(input)) {
      const r = await encode(new Blob([input as BlobPart], {type: 'image/gif'}), {fidelity: 'exact', effort: o.effort ?? 3} as never);
      if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
      if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
      return {bytes: r.bytes, kept: 'pixels', look: 'screenshot', animated: true, record: r};
    }
    if (isAnimated(input)) return {bytes: null, reason: ANIMATED};
    if (isLossyWebp(input)) return {bytes: null, reason: 'Already saved with loss. Left as it is.'};
    const src = await raster(input, ext, fallback), px = src;
    const pixels = px.width * px.height;
    if (pixels > cap(o)) return {bytes: null, reason: `Too large to convert on this device (${Math.round(pixels / 1e6)} MP).`};
    const look = o.mode === 'auto' ? classify(eight(px), px.width, px.height).look : o.mode;
    const effort = o.effort ?? 7;
    const exact = () => encode(src as never, {fidelity: 'exact', effort} as never);
    let r;
    // A picture is coded at a look only where its look can be checked: 8-bit sRGB or Display P3. More bits, or another
    // color, is kept exactly instead. An 8-bit picture with no profile is sRGB, which the check always covers.
    if (look === 'photo' && !(src.data instanceof Uint16Array)) {
      r = await encode(src as never, {fidelity: {quality: o.quality}, effort} as never);
      if (r.bytes && r.kept === 'lossy' && src.icc) {
        const m = await measure(src, r, cap(o));
        if (!m.ok && m.unavailable) r = await exact();
        else if (!m.ok) return {bytes: null, reason: LOOK_MISSED};
      }
    } else r = await exact();
    if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
    if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
    return {bytes: r.bytes, kept: r.kept, look, record: r};
  } catch (e) {
    return {bytes: null, reason: message(e)};
  }
}

/** The pixels of a JPEG XL file. */
export async function pixelsOf(jxl: Uint8Array, maxPixels?: number): Promise<Raster & {frames: number}> {
  const d = await decode(jxl, maxPixels ? {maxPixels} : undefined);
  const icc = d.rgbaICC ?? undefined;
  const s = d.data as Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
  const data = s instanceof Uint16Array ? s
    : s instanceof Float32Array ? Uint16Array.from(s, v => Math.round(Math.min(1, Math.max(0, v)) * 65535))
    : new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
  return {data, width: d.width, height: d.height, icc, frames: d.frames?.length ?? 1};
}

/** Convert back to PNG: the decoded samples, so a file written as exact comes back sample for sample. A file records no
 * more than that, so a picture saved at a look comes back as it looked. */
export async function toPng(jxl: Uint8Array): Promise<{bytes: Uint8Array}> {
  return {bytes: await encodePng(await pixelsOf(jxl))};
}

export function canRestoreJpeg(jxl: Uint8Array): boolean {
  return !!(header(jxl) as {reconstruction?: boolean}).reconstruction;
}

export async function toJpeg(jxl: Uint8Array): Promise<Uint8Array> {
  const r = await restore(jxl);
  if (!r.bytes) throw new Error(r.reason?.message ?? 'This file holds no JPEG.');
  return r.bytes;
}

/** The original of a conversion made again from its JPEG XL file, where that is exact: a JPEG byte for byte, a PNG sample for
 * sample when the picture was kept exactly. A picture saved with loss has no exact original to make. */
export async function remake(ext: string, jxl: Uint8Array, kept?: string): Promise<Uint8Array | null> {
  ext = ext.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return canRestoreJpeg(jxl) ? toJpeg(jxl) : null;
  if (ext === 'png' && kept === 'pixels') return (await toPng(jxl)).bytes;
  return null;
}

export function size(jxl: Uint8Array): {width: number; height: number} {
  const h = header(jxl) as {width: number; height: number};
  return {width: h.width, height: h.height};
}

export async function analyze(input: Uint8Array, ext: string, fallback: BrowserRaster = browserRaster): Promise<{look: Look; width: number; height: number; kind: 'jpeg' | 'gif' | 'still' | 'lossy-webp' | 'animated'}> {
  if (isAnimated(input)) return {look: 'photo', width: 0, height: 0, kind: 'animated'};
  if (isLossyWebp(input)) return {look: 'photo', width: 0, height: 0, kind: 'lossy-webp'};
  if (isJpeg(input)) return {look: 'photo', width: 0, height: 0, kind: 'jpeg'};
  if (isGif(input)) return {look: 'screenshot', width: 0, height: 0, kind: 'gif'};
  const px = await raster(input, ext, fallback);
  return {look: classify(eight(px), px.width, px.height).look, width: px.width, height: px.height, kind: 'still'};
}

/** A JPEG XL file as a PNG, for showing where the app cannot decode it. */
export async function display(jxl: Uint8Array, maxPixels?: number): Promise<{png: Uint8Array; width: number; height: number; frames: number}> {
  const px = await pixelsOf(jxl, maxPixels);
  return {png: await encodePng(px), width: px.width, height: px.height, frames: px.frames};
}

const same = (a: Uint8Array | Uint16Array, b: Uint8Array | Uint16Array): boolean => {
  if (a.length !== b.length || a.BYTES_PER_ELEMENT !== b.BYTES_PER_ELEMENT) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export type Check = {ok: true} | {ok: false; reason: string};

/** Reads a converted file back and compares it with the source, as the kind of conversion promises: a JPEG byte for byte,
 * exact samples at the original's own depth and color, or the look at the quality asked, measured by rapier-jxl on the
 * decoded file. A check that cannot run is a failure: the file is not kept and the original stays. */
export async function verifyJxl(source: Uint8Array, ext: string, jxl: Uint8Array, kept: Kept, record?: JxlRecord, fallback: BrowserRaster = browserRaster): Promise<Check> {
  try {
    if (kept === 'jpeg-bytes') {
      return same(await toJpeg(jxl), source) ? {ok: true} : {ok: false, reason: 'The JPEG did not come back the same.'};
    }
    if (isAnimated(source)) return {ok: false, reason: ANIMATED};
    const gif = isGif(source);
    const fail: Check = {ok: false, reason: gif ? 'The animation did not read back.' : kept === 'lossy' ? LOOK_MISSED : 'The pixels did not read back the same.'};
    if (!record || record.kept !== kept) return fail;
    const o = gif ? new Blob([source as BlobPart], {type: 'image/gif'}) : await raster(source, ext, fallback);
    const m = await measure(o, {...record, bytes: jxl} as JxlRecord, MAX_PIXELS);
    return m.ok ? {ok: true} : fail;
  } catch (e) {
    return {ok: false, reason: message(e)};
  }
}

export async function verifyPng(jxl: Uint8Array, png: Uint8Array): Promise<Check> {
  try {
    const back = await decodePng(png);
    const px = await pixelsOf(jxl);
    return back && back.width === px.width && back.height === px.height && same(back.data, px.data) ? {ok: true} : {ok: false, reason: 'The PNG did not read back the same.'};
  } catch (e) { return {ok: false, reason: message(e)}; }
}

/** An original made again by Undo, as read back from the vault: a JPEG equal to the one the file restores, a PNG
 * whose samples equal the file's. */
export async function checkRemade(ext: string, jxl: Uint8Array, made: Uint8Array): Promise<boolean> {
  ext = ext.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return verifyJpeg(made).ok && same(await toJpeg(jxl), made);
  if (ext === 'png') return (await verifyPng(jxl, made)).ok;
  return false;
}

export function verifyJpeg(jpeg: Uint8Array): Check {
  return isJpeg(jpeg) && jpeg[jpeg.length - 2] === 0xff && jpeg[jpeg.length - 1] === 0xd9 ? {ok: true} : {ok: false, reason: 'The JPEG is not whole.'};
}

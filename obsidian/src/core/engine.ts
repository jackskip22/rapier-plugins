// Runs inside the worker (and in Node tests). No Obsidian code here.
import {encode} from 'rapier-jxl/animation';
import {recompress, restore} from 'rapier-jxl/jpeg';
import {decode} from 'rapier-jxl/decode';
import {header} from 'rapier-jxl/metadata';
import {classify, type Look} from './classify.js';
import {decodePng, encodePng, isPng, type Raster} from './png.js';

export type Mode = 'auto' | 'screenshot' | 'photo';
export interface ConvertOptions {mode: Mode; quality: number; effort?: number; maxPixels?: number}
export type Kept = 'jpeg-bytes' | 'pixels' | 'lossy';
export interface Converted {
  bytes: Uint8Array | null;
  kept?: Kept;
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
/** A WebP made with loss: it holds a 'VP8 ' chunk, not 'VP8L'. Coding its pixels again is never smaller and can take very long. */
export const isLossyWebp = (b: Uint8Array): boolean => {
  if (b.length < 16 || String.fromCharCode(b[8], b[9], b[10], b[11]) !== 'WEBP') return false;
  const head = String.fromCharCode(...b.subarray(12, Math.min(b.length, 64)));
  return !head.includes('VP8L');
};

/** Browser path for WebP, GIF and PNGs the reader declines. Not used in Node tests. */
export const browserRaster: BrowserRaster = async (bytes, ext) => {
  const blob = new Blob([bytes as BlobPart], {type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`});
  const bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {data: new Uint8Array(img.data.buffer), width: img.width, height: img.height};
};

async function raster(bytes: Uint8Array, ext: string, fallback: BrowserRaster): Promise<Raster> {
  if (isPng(bytes)) {
    const r = await decodePng(bytes);
    if (r) return r;
  }
  return fallback(bytes, ext);
}

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
      return {bytes: r.bytes, kept: 'jpeg-bytes', look: 'photo'};
    }
    if (isGif(input)) {
      const r = await encode(new Blob([input as BlobPart], {type: 'image/gif'}), {fidelity: 'exact', effort: o.effort ?? 3} as never);
      if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
      if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
      return {bytes: r.bytes, kept: 'pixels', look: 'screenshot', animated: true};
    }
    if (isLossyWebp(input)) return {bytes: null, reason: 'Already saved with loss. Left as it is.'};
    const px = await raster(input, ext, fallback);
    const pixels = px.width * px.height;
    if (pixels > cap(o)) return {bytes: null, reason: `Too large to convert on this device (${Math.round(pixels / 1e6)} MP).`};
    const look = o.mode === 'auto' ? classify(px.data, px.width, px.height).look : o.mode;
    const image: Record<string, unknown> = {data: px.data, width: px.width, height: px.height};
    if (px.icc) image.icc = px.icc;
    const options = {fidelity: look === 'photo' ? {quality: o.quality} : 'exact', effort: o.effort ?? 7};
    const r = await encode(image as never, options as never);
    if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
    if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
    return {bytes: r.bytes, kept: r.kept, look};
  } catch (e) {
    return {bytes: null, reason: message(e)};
  }
}

/** The pixels of a JPEG XL file. */
export async function pixelsOf(jxl: Uint8Array, maxPixels?: number): Promise<Raster & {frames: number}> {
  const d = await decode(jxl, maxPixels ? {maxPixels} : undefined);
  const icc = d.rgbaICC ?? undefined;
  return {data: new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength), width: d.width, height: d.height, icc, frames: d.frames?.length ?? 1};
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

export async function analyze(input: Uint8Array, ext: string, fallback: BrowserRaster = browserRaster): Promise<{look: Look; width: number; height: number; kind: 'jpeg' | 'gif' | 'still' | 'lossy-webp'}> {
  if (isLossyWebp(input)) return {look: 'photo', width: 0, height: 0, kind: 'lossy-webp'};
  if (isJpeg(input)) return {look: 'photo', width: 0, height: 0, kind: 'jpeg'};
  if (isGif(input)) return {look: 'screenshot', width: 0, height: 0, kind: 'gif'};
  const px = await raster(input, ext, fallback);
  return {look: classify(px.data, px.width, px.height).look, width: px.width, height: px.height, kind: 'still'};
}

/** A JPEG XL file as a PNG, for showing where the app cannot decode it. */
export async function display(jxl: Uint8Array, maxPixels?: number): Promise<{png: Uint8Array; width: number; height: number; frames: number}> {
  const px = await pixelsOf(jxl, maxPixels);
  return {png: await encodePng(px), width: px.width, height: px.height, frames: px.frames};
}

const same = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export type Check = {ok: true} | {ok: false; reason: string};

/** Reads a converted file back and compares it with the source, as the kind of conversion promises. */
export async function verifyJxl(source: Uint8Array, ext: string, jxl: Uint8Array, kept: Kept, fallback: BrowserRaster = browserRaster): Promise<Check> {
  try {
    if (kept === 'jpeg-bytes') {
      return same(await toJpeg(jxl), source) ? {ok: true} : {ok: false, reason: 'The JPEG did not come back the same.'};
    }
    if (isGif(source)) {
      const px = await pixelsOf(jxl);
      const w = source[6] | (source[7] << 8), h = source[8] | (source[9] << 8);
      return px.width === w && px.height === h && px.frames > 1 ? {ok: true} : {ok: false, reason: 'The animation did not read back.'};
    }
    const src = await raster(source, ext, fallback);
    const px = await pixelsOf(jxl);
    if (px.width !== src.width || px.height !== src.height) return {ok: false, reason: 'The size did not read back.'};
    if (kept === 'lossy') return {ok: true};
    return same(px.data, src.data) ? {ok: true} : {ok: false, reason: 'The pixels did not read back the same.'};
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

export function verifyJpeg(jpeg: Uint8Array): Check {
  return isJpeg(jpeg) && jpeg[jpeg.length - 2] === 0xff && jpeg[jpeg.length - 1] === 0xd9 ? {ok: true} : {ok: false, reason: 'The JPEG is not whole.'};
}

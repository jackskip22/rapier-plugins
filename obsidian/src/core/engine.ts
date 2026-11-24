// Runs inside the worker (and in Node tests). No Obsidian code here.
import {encode} from 'jpegxl/animation';
import {recompress, restore} from 'jpegxl/jpeg';
import {decode} from 'jpegxl/decode';
import {header} from 'jpegxl/metadata';
import {classify, type Look} from './classify.js';
import {ApngBuilder, ApngWriter, decodeApng, type AnimatedFrame, decodePng, encodePng, hasActl, isApng, isPng, type Animated, type Raster} from './png.js';

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
const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const isWebp = (b: Uint8Array) => b.length >= 16 && fourcc(b, 0) === 'RIFF' && fourcc(b, 8) === 'WEBP';
/** Whether a WebP is an animation: its extended header says so. */
export const isAnimatedWebp = (b: Uint8Array): boolean => isWebp(b) && fourcc(b, 12) === 'VP8X' && b.length > 20 && (b[20] & 2) !== 0;
/** A WebP made with loss: a picture or an animation frame holds a 'VP8 ' chunk, not 'VP8L'. Coding its pixels again is never smaller and can take very long. */
export const isLossyWebp = (b: Uint8Array): boolean => {
  if (!isWebp(b)) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let lossless = false;
  const walk = (from: number, to: number): boolean => {
    for (let pos = from; pos + 8 <= to;) {
      const name = fourcc(b, pos), len = view.getUint32(pos + 4, true);
      if (name === 'VP8 ') return true;
      if (name === 'VP8L') lossless = true;
      if (name === 'ANMF' && walk(pos + 8 + 16, Math.min(to, pos + 8 + len))) return true;
      pos += 8 + len + (len & 1);
    }
    return false;
  };
  return walk(12, b.length) || !lossless;
};

/** The frames of an animated WebP or PNG, each the whole picture as shown, with its time and the loop count. */
export type AnimatedFrames = (bytes: Uint8Array, ext: string) => Promise<Animated | null>;

/** The embedded color profile of a WebP (its ICCP chunk), which the browser's reader does not return. */
export function webpIcc(b: Uint8Array): Uint8Array | undefined {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let pos = 12; pos + 8 <= b.length;) {
    const len = view.getUint32(pos + 4, true);
    if (fourcc(b, pos) === 'ICCP') return b.slice(pos + 8, pos + 8 + len);
    pos += 8 + len + (len & 1);
  }
  return undefined;
}

/** The frames of an animation with the profile its container carries: a WebP's samples are in the space its ICCP names. */
async function readFrames(frames: AnimatedFrames, bytes: Uint8Array, ext: string): Promise<Animated | null> {
  const a = await frames(bytes, ext);
  if (a && !a.icc && isAnimatedWebp(bytes)) { const icc = webpIcc(bytes); if (icc) return {...a, icc}; }
  return a;
}

/** WebCodecs counts repeats after the first play (checked in Chromium: file loop 3 reads 2, loop 1 reads 0, forever reads Infinity); files and JPEG XL count plays, 0 forever. */
export const playsOf = (repeats: number): number => Number.isFinite(repeats) ? Math.max(0, repeats) + 1 : 0;

/** Browser path for an animated WebP: the platform's ImageDecoder, one frame at a time. Null where there is none. */
export const browserFrames: AnimatedFrames = async (bytes) => {
  if (isApng(bytes)) {
    // Frames are composed as the encoder takes them, so the animation's length never decides what a device can convert.
    return decodeApng(bytes, true);
  }
  if (typeof ImageDecoder === 'undefined' || !(await ImageDecoder.isTypeSupported('image/webp'))) return null;
  const decoder = new ImageDecoder({data: bytes, type: 'image/webp', colorSpaceConversion: 'none', premultiplyAlpha: 'none'} as never);
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack!;
    const n = track.frameCount;
    const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1, h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    if (n < 2) { decoder.close(); return null; }
    // One frame at a time as the encoder takes it, then the decoder closes.
    async function* each(): AsyncGenerator<AnimatedFrame> {
      try {
        for (let i = 0; i < n; i++) {
          const {image} = await decoder.decode({frameIndex: i, completeFramesOnly: true});
          try {
            const data = new Uint8Array(w * h * 4);
            await image.copyTo(data, {format: 'RGBA'} as never);
            yield {data, duration: (image.duration ?? 0) / 1000};
          } finally { image.close(); }
        }
      } finally { decoder.close(); }
    }
    return {width: w, height: h, loops: playsOf(track.repetitionCount), frames: each()};
  } catch (error) { decoder.close(); throw error; }
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
export async function convert(input: Uint8Array, ext: string, o: ConvertOptions, fallback: BrowserRaster = browserRaster, frames: AnimatedFrames = browserFrames): Promise<Converted> {
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
    // One frame may sit beside a separate default picture: this reader holds only whole animations, so the file stays.
    if (hasActl(input) && !isApng(input)) return {bytes: null, reason: 'An animation with a separate first picture. Left as it is.'};
    if (isLossyWebp(input)) return {bytes: null, reason: 'Already saved with loss. Left as it is.'};
    if (isApng(input) || isAnimatedWebp(input)) {
      // Every frame with its time and the loop count, exact, read as the encoder takes them.
      const a = await readFrames(frames, input, ext);
      if (!a) return {bytes: null, reason: 'An animation this device cannot read here. Left as it is.'};
      // A default picture that is not a frame has nowhere to go in the new file: the original stays.
      if (a.hiddenDefault) return {bytes: null, reason: 'An animation with a separate first picture. Left as it is.'};
      const r = await encode({width: a.width, height: a.height, loops: a.loops, ...(a.icc ? {icc: a.icc} : {}), frames: a.frames} as never, {fidelity: 'exact', effort: Math.min(o.effort ?? 3, 9)} as never);
      if (!r.bytes) return {bytes: null, reason: r.reason?.message ?? 'Not converted.'};
      if (r.bytes.length >= input.length) return {bytes: null, reason: 'No smaller.'};
      return {bytes: r.bytes, kept: 'pixels', look: 'screenshot', animated: true};
    }
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
  // An animation goes back as an animated PNG: every frame, its time and the loop count.
  if (isAnimated(jxl)) { const a = await animationPng(jxl, ANIMATION_BAND_BYTES); if (a) return {bytes: a.png}; }
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

export async function analyze(input: Uint8Array, ext: string, fallback: BrowserRaster = browserRaster): Promise<{look: Look; width: number; height: number; kind: 'jpeg' | 'gif' | 'animation' | 'still' | 'lossy-webp'}> {
  if (isLossyWebp(input)) return {look: 'photo', width: 0, height: 0, kind: 'lossy-webp'};
  if (isApng(input) || isAnimatedWebp(input)) return {look: 'screenshot', width: 0, height: 0, kind: 'animation'};
  if (isJpeg(input)) return {look: 'photo', width: 0, height: 0, kind: 'jpeg'};
  if (isGif(input)) return {look: 'screenshot', width: 0, height: 0, kind: 'gif'};
  const px = await raster(input, ext, fallback);
  return {look: classify(px.data, px.width, px.height).look, width: px.width, height: px.height, kind: 'still'};
}

/** Decoded rows held at once while an animation is written: every frame's rows for one band. A phone holds less. */
export const ANIMATION_BAND_BYTES = 96 * 1024 * 1024;
export const ANIMATION_BAND_BYTES_MOBILE = 48 * 1024 * 1024;
/** What one animation may keep as a finished animated PNG. A longer one plays frame by frame, each loop decoded again. */
export const ANIMATION_KEEP_BYTES = 64 * 1024 * 1024;
export const ANIMATION_KEEP_BYTES_MOBILE = 32 * 1024 * 1024;

/** Whether a JPEG XL file holds an animation. */
export function isAnimated(jxl: Uint8Array): boolean {
  try { return !!(header(jxl) as {animation?: unknown}).animation; } catch { return false; }
}

const bytesOf = (f: {data: ArrayBufferView}) => new Uint8Array(f.data.buffer, f.data.byteOffset, f.data.byteLength);

/** An animation as an animated PNG, every frame, whatever its length. The file is read in bands of rows (a group row where
 * the budget allows, so no work repeats) and each band's rows go straight into every frame's compressed stream: the peak is
 * one band of every frame plus the compressed frames, never the raw animation. Null when the file holds one frame. */
async function animationPngBands(jxl: Uint8Array, bandBytes: number): Promise<{png: Uint8Array; width: number; height: number; frames: number} | null> {
  const probe = await decode(jxl, {region: {x: 0, y: 0, width: 1, height: 1}});
  const n = probe.frames.length;
  if (n < 2 || !probe.animation) return null;
  const h0 = header(jxl) as {width: number; height: number; orientation?: number; extraChannels?: {type: number}[]};
  const turned = (h0.orientation ?? 1) > 4; // the decoder applies orientation, so the picture is that way round
  const width = turned ? h0.height : h0.width, height = turned ? h0.width : h0.height;
  const alpha = !!h0.extraChannels?.some(c => c.type === 0);
  let rows = Math.max(1, Math.min(height, Math.floor(bandBytes / (n * width * 4))));
  if (rows >= 256 && rows < height) rows -= rows % 256; // JPEG XL groups are 256 rows: whole group rows decode once
  const writer = new ApngWriter(width, height, probe.frames.map(f => f.durationSeconds * 1000), probe.animation.loops, alpha, probe.rgbaICC ?? undefined);
  for (let y = 0; y < height; y += rows) {
    const h = Math.min(rows, height - y);
    const band = await decode(jxl, {region: {x: 0, y, width, height: h}});
    for (let k = 0; k < n; k++) await writer.rows(k, bytesOf(band.frames[k]), h);
  }
  return {png: await writer.finish(), width, height, frames: n};
}

/** One frame of an animation shown at once: a plain PNG, and how long it plays. */
export interface Part {index: number; delayMs: number; png: Uint8Array; width: number; height: number; loops: number}

/** An animation as an animated PNG, every frame, whatever its length. The decoder hands out frames one at a time (its onFrame):
 * each is compressed, passed to `emit` as a plain PNG so it can show at once, and dropped before the next is rendered, so the
 * peak is a frame or two plus the compressed frames. A decoder without onFrame reads the file in bands instead. Null when the
 * file holds one frame. */
export async function animationPng(jxl: Uint8Array, bandBytes: number, emit?: (part: Part) => unknown, keepBytes: number = Infinity): Promise<{png: Uint8Array; width: number; height: number; frames: number; streamed?: true} | null> {
  const h0 = header(jxl) as {extraChannels?: {type: number}[]; animation?: {loops: number}};
  const alpha = !!h0.extraChannels?.some(c => c.type === 0);
  let builder: ApngBuilder | null = null, width = 0, height = 0, streamed = false, count = 0;
  const onFrame = async (frame: {data: ArrayBufferView; width: number; height: number; durationSeconds: number; rgbaICC?: Uint8Array | null}, index: number) => {
    if (index === 0) { width = frame.width; height = frame.height; builder = new ApngBuilder(width, height, h0.animation?.loops ?? 0, alpha, frame.rgbaICC ?? undefined); }
    const delayMs = frame.durationSeconds * 1000;
    count++;
    // Over its budget the animation is no longer kept: each frame is shown and let go, and the next waits for the take.
    if (!streamed && builder!.size > keepBytes) { streamed = true; builder = null; }
    const png = await (builder ?? new ApngBuilder(width, height, 0, alpha, frame.rgbaICC ?? undefined)).frame(bytesOf(frame), delayMs);
    await emit?.({index, delayMs, png, width, height, loops: h0.animation?.loops ?? 0});
    // The first frame decides: a budget that holds not even one is over at once.
    if (!streamed && builder!.size > keepBytes) { streamed = true; builder = null; }
  };
  try { await decode(jxl, {onFrame}); }
  catch (e) {
    // A decoder from before onFrame refuses the option: read in bands.
    if (builder === null && /onFrame/.test(message(e))) return animationPngBands(jxl, bandBytes);
    throw e;
  }
  if (streamed) return count < 2 ? null : {png: new Uint8Array(0), width, height, frames: count, streamed: true};
  const done = builder as ApngBuilder | null;
  if (!done || done.count < 2) return null;
  return {png: await done.finish(), width, height, frames: done.count};
}

/** A JPEG XL file as a PNG, for showing where the app cannot decode it. An animation comes back as an animated PNG with its
 * own frame times and loop count, which an image element plays like a GIF. */
export async function display(jxl: Uint8Array, maxPixels?: number, bandBytes: number = ANIMATION_BAND_BYTES, emit?: (part: Part) => unknown, keepBytes?: number): Promise<{png: Uint8Array; width: number; height: number; frames: number; animated: boolean; streamed?: true}> {
  if (isAnimated(jxl)) {
    const a = await animationPng(jxl, bandBytes, emit, keepBytes);
    if (a) return {...a, animated: true};
  }
  const d = await decode(jxl, maxPixels ? {maxPixels} : undefined);
  const px: Raster = {data: bytesOf(d), width: d.width, height: d.height, icc: d.rgbaICC ?? undefined};
  return {png: await encodePng(px), width: d.width, height: d.height, frames: d.frames?.length ?? 1, animated: false};
}

const same = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export type Check = {ok: true} | {ok: false; reason: string};

/** Reads a converted file back and compares it with the source, as the kind of conversion promises. */
export async function verifyJxl(source: Uint8Array, ext: string, jxl: Uint8Array, kept: Kept, fallback: BrowserRaster = browserRaster, frames: AnimatedFrames = browserFrames): Promise<Check> {
  try {
    if (kept === 'jpeg-bytes') {
      return same(await toJpeg(jxl), source) ? {ok: true} : {ok: false, reason: 'The JPEG did not come back the same.'};
    }
    if (isGif(source)) {
      const px = await pixelsOf(jxl);
      const w = source[6] | (source[7] << 8), h = source[8] | (source[9] << 8);
      return px.width === w && px.height === h && px.frames > 1 ? {ok: true} : {ok: false, reason: 'The animation did not read back.'};
    }
    if (hasActl(source) && !isApng(source)) return {ok: false, reason: 'The animation has a separate first picture.'};
    if (isApng(source) || isAnimatedWebp(source)) return verifyAnimation(source, ext, jxl, frames);
    const src = await raster(source, ext, fallback);
    const px = await pixelsOf(jxl);
    if (px.width !== src.width || px.height !== src.height) return {ok: false, reason: 'The size did not read back.'};
    if (kept === 'lossy') return {ok: true};
    return same(px.data, src.data) ? {ok: true} : {ok: false, reason: 'The pixels did not read back the same.'};
  } catch (e) {
    return {ok: false, reason: message(e)};
  }
}

/** An animated PNG or WebP read back: every frame the same samples and the same time, and the loop count. */
async function verifyAnimation(source: Uint8Array, ext: string, jxl: Uint8Array, frames: AnimatedFrames): Promise<Check> {
  const a = await readFrames(frames, source, ext);
  const fail = (reason = 'The animation did not read back.'): Check => ({ok: false, reason});
  if (!a) return fail();
  // The source frames are read one at a time beside the decoded ones: neither side is held whole.
  const list = a.frames as Iterable<AnimatedFrame> & AsyncIterable<AnimatedFrame>;
  const iter = ((list as AsyncIterable<AnimatedFrame>)[Symbol.asyncIterator]?.() ?? (list as Iterable<AnimatedFrame>)[Symbol.iterator]()) as AsyncIterator<AnimatedFrame> | Iterator<AnimatedFrame>;
  let bad: string | null = null, backIcc: Uint8Array | null | undefined;
  const compare = async (frame: {data: ArrayBufferView; width?: number; height?: number; durationSeconds: number}) => {
    if (bad) return;
    const next = await iter.next();
    if (next.done) { bad = 'The animation did not read back.'; return; }
    if ((frame.width !== undefined && frame.width !== a.width) || (frame.height !== undefined && frame.height !== a.height)) bad = 'The animation did not read back.';
    else if (!same(bytesOf(frame), next.value.data) || Math.abs(frame.durationSeconds * 1000 - next.value.duration) > 1) bad = 'The animation did not read back the same.';
  };
  try {
    try {
      let first = true;
      const result = await decode(jxl, {onFrame: (frame: {rgbaICC?: Uint8Array | null}) => { if (first) { first = false; backIcc = frame.rgbaICC; } return compare(frame as never); }});
      backIcc ??= (result as {rgbaICC?: Uint8Array | null}).rgbaICC;
    } catch (e) {
      // A decoder from before onFrame refuses the option: read it whole.
      if (!/onFrame/.test(message(e))) throw e;
      const d = await decode(jxl);
      for (const f of d.frames) await compare(f);
      backIcc = d.rgbaICC;
    }
    if (!bad && !(await iter.next()).done) bad = 'The animation did not read back.';
  } catch (e) { return fail(message(e)); }
  finally { await iter.return?.(); }
  if (bad) return fail(bad);
  // The same play count, and the same color meaning: the profile the source carried comes back with the file.
  const loops = (header(jxl) as {animation?: {loops: number}}).animation?.loops ?? 0;
  if (loops !== a.loops) return {ok: false, reason: 'The animation did not read back with the same repeats.'};
  if (a.hiddenDefault) return {ok: false, reason: 'The animation has a separate first picture.'};
  if (a.icc && !(backIcc && same(backIcc, a.icc))) return {ok: false, reason: 'The animation did not read back with its colors.'};
  return {ok: true};
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

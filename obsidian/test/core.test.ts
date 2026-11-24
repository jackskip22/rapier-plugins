import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playsOf} from '../src/core/engine.js';
import {hasActl} from '../src/core/png.js';
import {header} from 'jpegxl/metadata';
import {decode} from 'jpegxl/decode';
import {convert, toPng, toJpeg, canRestoreJpeg, pixelsOf, analyze, remake, maxPixelsFor, MAX_PIXELS, display, animationPng, isAnimated, type Part} from '../src/core/engine.js';
import {embedSizeInNote, embedSizeNow, embedsInText, embedSizeOf} from '../src/core/text.js';
import {decodePng, encodePng, type Raster} from '../src/core/png.js';
import {classify} from '../src/core/classify.js';

const fx = (n: string) => new Uint8Array(readFileSync('test/fixtures/' + n));
const noBrowser = async () => { throw new Error('no browser decoder in tests'); };

// A screen of text-like pixels: few colors, repeated, with antialiased edges.
function screenshot(w = 300, h = 160): Raster {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ink = ((x >> 2) + (y >> 3)) % 5 === 0 && y % 16 < 9;
    const soft = ink && x % 4 === 0;
    const v = ink ? (soft ? 140 : 20) : 250;
    data[i] = v; data[i + 1] = v; data[i + 2] = ink ? v : 246; data[i + 3] = 255;
  }
  return {data, width: w, height: h};
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

test('PNG writer and reader keep every sample, alpha and profile', async () => {
  const r = screenshot(40, 30);
  for (let i = 3; i < r.data.length; i += 4) r.data[i] = i % 7 === 3 ? 0 : 255 - (i % 200);
  const icc = new Uint8Array(200).map((_, i) => i);
  const back = await decodePng(await encodePng({...r, icc}));
  assert.ok(back);
  assert.ok(same(back.data, r.data));
  assert.ok(same(back.icc!, icc));
});

test('PNG reader declines what it does not handle', async () => {
  assert.equal(await decodePng(new Uint8Array([1, 2, 3])), null);
});

test('screenshots are told from photographs', async () => {
  assert.equal(classify(screenshot().data, 300, 160).look, 'screenshot');
  const photo = (await decodePng(fx('photo.png')))!;
  assert.equal(classify(photo.data, photo.width, photo.height).look, 'photo');
});

test('a screenshot becomes JPEG XL with every sample kept, and is smaller than its PNG', async () => {
  const r = screenshot();
  const png = await encodePng(r);
  const out = await convert(png, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(out.bytes);
  assert.equal(out.kept, 'pixels');
  assert.equal(out.look, 'screenshot');
  assert.ok(out.bytes.length < png.length);
  const px = await pixelsOf(out.bytes);
  assert.ok(same(px.data, r.data));
  const back = await toPng(out.bytes);
  const decoded = (await decodePng(back.bytes))!;
  assert.ok(same(decoded.data, r.data));
});

test('a photograph in a PNG is coded at a look, smaller than the PNG', async () => {
  const png = fx('photo.png');
  const out = await convert(png, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.kept, 'lossy');
  assert.equal(out.look, 'photo');
  assert.ok(out.bytes!.length < png.length / 2);
});

test('the override codes a photograph exactly', async () => {
  const out = await convert(fx('photo.png'), 'png', {mode: 'screenshot', quality: 90}, noBrowser);
  assert.equal(out.kept, 'pixels');
  const px = await pixelsOf(out.bytes!);
  assert.ok(same(px.data, (await decodePng(fx('photo.png')))!.data));
});

test('a JPEG is recompressed losslessly and restored byte for byte', async () => {
  const jpeg = fx('photo.jpg');
  const out = await convert(jpeg, 'jpg', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.kept, 'jpeg-bytes');
  assert.ok(out.bytes!.length < jpeg.length);
  assert.equal(canRestoreJpeg(out.bytes!), true);
  assert.ok(same(await toJpeg(out.bytes!), jpeg));
});

test('an animated GIF becomes an animated JPEG XL', async () => {
  const gif = fx('anim.gif');
  const out = await convert(gif, 'gif', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(out.bytes, out.reason);
  assert.equal(out.animated, true);
  const px = await pixelsOf(out.bytes!);
  assert.equal(px.frames, 4);
});

test('a picture that would not shrink is left alone', async () => {
  const noise = new Uint8Array(24 * 24 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 2654435761 >>> 24) & 255));
  const png = await encodePng({data: noise, width: 24, height: 24});
  const out = await convert(png, 'png', {mode: 'screenshot', quality: 90}, noBrowser);
  assert.ok(out.bytes === null || out.bytes.length < png.length);
});

test('analyze reports the kind', async () => {
  assert.equal((await analyze(fx('photo.jpg'), 'jpg', noBrowser)).kind, 'jpeg');
  assert.equal((await analyze(fx('photo.png'), 'png', noBrowser)).look, 'photo');
});

test('a WebP saved with loss is left alone', async () => {
  const lossy = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 0, 0, 0, 0]);
  const out = await convert(lossy, 'webp', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.bytes, null);
  assert.match(out.reason!, /Left as it is/);
});

test('a JPEG converts with the limit the plug-in passes on a computer, and comes back byte for byte', async () => {
  const jpeg = fx('photo.jpg');
  const out = await convert(jpeg, 'jpg', {mode: 'auto', quality: 90, maxPixels: maxPixelsFor(false)}, noBrowser);
  assert.ok(out.bytes, out.reason);
  assert.ok(same(await toJpeg(out.bytes!), jpeg));
  assert.ok(maxPixelsFor(false) <= MAX_PIXELS && maxPixelsFor(true) <= MAX_PIXELS);
});

test('embed sizes come from alt, from width and height, or from the note\'s own link cache', () => {
  assert.deepEqual(embedSizeOf({alt: '200'}), {width: 200, height: undefined});
  assert.deepEqual(embedSizeOf({alt: 'kodim23.jxl|200x100'}), {width: 200, height: 100});
  assert.deepEqual(embedSizeOf({alt: 'kodim23.jxl', width: '200'}), {width: 200, height: undefined});
  assert.deepEqual(embedSizeOf({alt: 'kodim23.jxl'}), {});
  const embeds = [{link: 'kodim23.jxl', original: '![[kodim23.jxl|200]]'}, {link: 'other.png', original: '![[other.png|50]]'}];
  assert.deepEqual(embedSizeInNote(embeds, l => l === 'kodim23.jxl'), {width: 200, height: undefined});
  assert.deepEqual(embedSizeInNote([...embeds, {link: 'kodim23.jxl', original: '![[kodim23.jxl]]'}], l => l === 'kodim23.jxl'), {});
});

test('remake: a JPEG exactly, a PNG only when kept exactly, never one saved with loss', async () => {
  const jpeg = fx('photo.jpg');
  const j = await convert(jpeg, 'jpg', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(same((await remake('jpg', j.bytes!, j.kept))!, jpeg));
  const photo = fx('photo.png');
  const lossy = await convert(photo, 'png', {mode: 'photo', quality: 90}, noBrowser);
  assert.equal(lossy.kept, 'lossy');
  assert.equal(await remake('png', lossy.bytes!, lossy.kept), null);
  const exact = await convert(photo, 'png', {mode: 'screenshot', quality: 90}, noBrowser);
  assert.equal(exact.kept, 'pixels');
  const back = await decodePng((await remake('png', exact.bytes!, exact.kept))!);
  assert.ok(back && same(back.data, (await decodePng(photo))!.data));
});

test('embed size follows the attribute that changed, in either order, and can be removed', () => {
  const a = (alt: string | null, width: string | null = null, height: string | null = null) => ({alt, width, height});
  // alt unchanged, width changed (Obsidian updated only the attributes): the stale alt must not win.
  assert.deepEqual(embedSizeNow(a('200x100'), a('200x100', '300', '150')), {width: 300, height: 150});
  // width unchanged, alt changed.
  assert.deepEqual(embedSizeNow(a('200', '200'), a('350', '200')), {width: 350, height: undefined});
  // 200x100 edited to 200: the old height must go.
  assert.deepEqual(embedSizeNow(a('x.jxl|200x100'), a('x.jxl|200')), {width: 200, height: undefined});
  // The size taken out of the note.
  assert.deepEqual(embedSizeNow(a('200', '200'), a(null, null, null)), {});
  assert.deepEqual(embedSizeNow(null, a('200')), {width: 200, height: undefined});
  // A second look with nothing changed keeps the first look's choice, not the stale alt.
  const now = a('200x100', '300', '150');
  const first = embedSizeNow(a('200x100'), now);
  assert.deepEqual(first, {width: 300, height: 150});
  assert.deepEqual(embedSizeNow(now, now, first), first);
});

test('embeds in a note are read from its text, in order', () => {
  const t = 'a ![[x.jxl|200]] b ![[dir/y.JXL|200x100]] c ![[z.png|50]] d ![[x.jxl#h]] ![[x.jxl|abc]]';
  assert.deepEqual(embedsInText(t).map(e => [e.target, e.size.width, e.size.height]), [['x.jxl', 200, undefined], ['dir/y.JXL', 200, 100], ['x.jxl', undefined, undefined], ['x.jxl', undefined, undefined]]);
});

test('an animated JPEG XL shows as an animated PNG with its frames, times and loop', async () => {
  const gif = fx('anim.gif');
  const out = await convert(gif, 'gif', {mode: 'auto', quality: 90}, noBrowser);
  const jxl = fx('anim.jxl');
  assert.equal(isAnimated(out.bytes!), true);
  assert.equal(isAnimated(jxl), true);
  const shown = await display(jxl, 40_000_000);
  assert.equal(shown.animated, true);
  assert.equal(shown.frames, 4);
  const chunks = pngChunks(shown.png);
  const actl = chunks.find(c => c.name === 'acTL')!;
  const dv = new DataView(actl.body.buffer, actl.body.byteOffset);
  assert.equal(dv.getUint32(0), 4); // frames
  assert.equal(dv.getUint32(4), 0); // loops forever
  const fctl = chunks.filter(c => c.name === 'fcTL');
  assert.equal(fctl.length, 4);
  for (const f of fctl) {
    const d = new DataView(f.body.buffer, f.body.byteOffset);
    assert.equal(Math.round(d.getUint16(20) * 1000 / d.getUint16(22)), 100);
  }
  assert.equal(chunks.filter(c => c.name === 'IDAT').length >= 1, true);
  assert.equal(chunks.filter(c => c.name === 'fdAT').length, 3);
});

test('an animated JPEG XL converts back to an animated PNG, not its first frame', async () => {
  const back = await toPng(fx('anim.jxl'));
  const chunks = pngChunks(back.bytes);
  assert.equal(chunks.filter(c => c.name === 'fcTL').length, 4);
  const first = await decodePng(back.bytes);
  assert.equal(first!.width, 96);
});

test('a still JPEG XL still shows as a plain PNG', async () => {
  const png = fx('photo.png');
  const out = await convert(png, 'png', {mode: 'auto', quality: 90}, noBrowser);
  const shown = await display(out.bytes!, 40_000_000);
  assert.equal(shown.animated, false);
  assert.equal(pngChunks(shown.png).some(c => c.name === 'acTL'), false);
});

test('a band of one row at a time gives the same frames as the whole decode, every one of them', async () => {
  const jxl = fx('anim.jxl');
  const banded = await animationPng(jxl, 1); // one row per band
  assert.equal(banded!.frames, 4);
  const chunks = pngChunks(banded!.png);
  assert.equal(chunks.filter(c => c.name === 'fcTL').length, 4);
  const whole = await pixelsOf(jxl);
  assert.ok(same((await decodePng(banded!.png))!.data, whole.data));
  assert.equal((await display(jxl, 40_000_000, 1)).frames, 4);
});

test('a one-frame file is not an animation', async () => {
  const out = await convert(fx('photo.png'), 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(await animationPng(out.bytes!, 1_000_000), null);
});

function pngChunks(b: Uint8Array): {name: string; body: Uint8Array}[] {
  const out: {name: string; body: Uint8Array}[] = [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let pos = 8; pos + 8 <= b.length;) {
    const len = v.getUint32(pos);
    out.push({name: String.fromCharCode(...b.subarray(pos + 4, pos + 8)), body: b.subarray(pos + 8, pos + 8 + len)});
    pos += 12 + len;
  }
  return out;
}

test('a decoder with onFrame hands the frames one at a time, each shown at once and all kept in the animated PNG', {skip: !process.env.JXL_LOCAL_DECODE && 'needs a decoder with onFrame (JXL_LOCAL_DECODE)'}, async () => {
  const jxl = fx('anim.jxl');
  const parts: Part[] = [];
  const out = await animationPng(jxl, 1_000_000, p => parts.push(p));
  assert.equal(out!.frames, 4);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.map(p => p.index), [0, 1, 2, 3]);
  assert.ok(parts.every(p => Math.round(p.delayMs) === 100 && p.width === 96 && p.loops === 0));
  const whole = await pixelsOf(jxl);
  assert.ok(same((await decodePng(parts[0].png))!.data, whole.data), 'a part is a plain PNG of its frame');
  assert.equal(pngChunks(out!.png).filter(c => c.name === 'fcTL').length, 4);
  assert.ok(same((await decodePng(out!.png))!.data, whole.data));
});

// ---- a long animation: played frame by frame, never held ----
test('over its budget an animation streams: every frame once, the next waits for the one before it, and no animated PNG is built', {skip: !process.env.JXL_LOCAL_DECODE && 'needs a decoder with onFrame (JXL_LOCAL_DECODE)'}, async () => {
  const jxl = fx('anim.jxl');
  let inFlight = 0, peak = 0; const parts: Part[] = [];
  const shown = await display(jxl, 40_000_000, 1_000_000, async p => {
    inFlight++; peak = Math.max(peak, inFlight); parts.push(p);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
  }, 1); // a budget of one byte: nothing fits
  assert.equal(shown.streamed, true); assert.equal(shown.animated, true); assert.equal(shown.png.length, 0);
  assert.equal(shown.frames, 4); assert.deepEqual(parts.map(p => p.index), [0, 1, 2, 3]);
  assert.equal(peak, 1, 'a frame is handed over only after the one before it was taken');
  const whole = await pixelsOf(jxl);
  assert.ok(same((await decodePng(parts[0].png))!.data, whole.data), 'the same pixels as decode');
});

test('inside its budget an animation is still one animated PNG', {skip: !process.env.JXL_LOCAL_DECODE && 'needs a decoder with onFrame (JXL_LOCAL_DECODE)'}, async () => {
  const shown = await display(fx('anim.jxl'), 40_000_000, 1_000_000, undefined, 64 * 1024 * 1024);
  assert.equal(shown.streamed, undefined); assert.equal(pngChunks(shown.png).filter(c => c.name === 'fcTL').length, 4);
});

// ---- animated PNG and WebP ----
import {deflateSync} from 'node:zlib';
import {ApngBuilder, decodeApng, isApng} from '../src/core/png.js';
import {isAnimatedWebp, isLossyWebp, verifyJxl, browserFrames, type AnimatedFrames} from '../src/core/engine.js';

const crcT = Uint32Array.from({length: 256}, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
const crc = (b: Uint8Array) => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ c >>> 8; return ~c >>> 0; };
const chunkOf = (name: string, body: Uint8Array) => {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length); out.write(name, 4, 'latin1'); Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
};
const rgbaRows = (w: number, h: number, px: number[]) => deflateSync(Uint8Array.from({length: h * (1 + w * 4)}, (_, i) => { const c = i % (1 + w * 4); return c === 0 ? 0 : px[(c - 1) % 4]; }));
const fctl = (seq: number, w: number, h: number, x: number, y: number, ms: number, dispose: number, blend: number) => {
  const b = Buffer.alloc(26);
  b.writeUInt32BE(seq); b.writeUInt32BE(w, 4); b.writeUInt32BE(h, 8); b.writeUInt32BE(x, 12); b.writeUInt32BE(y, 16); b.writeUInt16BE(ms, 20); b.writeUInt16BE(1000, 22); b[24] = dispose; b[25] = blend;
  return b;
};
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr4 = () => { const b = Buffer.alloc(13); b.writeUInt32BE(4); b.writeUInt32BE(4, 4); b[8] = 8; b[9] = 6; return b; };

test('an animated PNG is read as the picture shown at each time: offsets, dispose and blend', async () => {
  // Frame 0: red 4x4. Frame 1: green 2x2 at (1,1), disposed to background. Frame 2: half-transparent blue 4x4, blended over.
  const apng = new Uint8Array(Buffer.concat([sig, chunkOf('IHDR', ihdr4()), chunkOf('acTL', Buffer.from([0, 0, 0, 3, 0, 0, 0, 2])),
    chunkOf('fcTL', fctl(0, 4, 4, 0, 0, 100, 0, 0)), chunkOf('IDAT', rgbaRows(4, 4, [255, 0, 0, 255])),
    chunkOf('fcTL', fctl(1, 2, 2, 1, 1, 200, 1, 0)), chunkOf('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 2]), rgbaRows(2, 2, [0, 255, 0, 255])])),
    chunkOf('fcTL', fctl(3, 4, 4, 0, 0, 300, 0, 1)), chunkOf('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 4]), rgbaRows(4, 4, [0, 0, 255, 128])])),
    chunkOf('IEND', Buffer.alloc(0))]));
  assert.ok(isApng(apng));
  const a = (await decodeApng(apng))!;
  assert.equal(a.frames.length, 3);
  assert.equal(a.loops, 2);
  assert.deepEqual(a.frames.map(f => f.duration), [100, 200, 300]);
  const at = (f: number, x: number, y: number) => [...a.frames[f].data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  assert.deepEqual(at(0, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(at(1, 1, 1), [0, 255, 0, 255]);
  assert.deepEqual(at(1, 0, 0), [255, 0, 0, 255]);
  // Frame 1's square was disposed to transparent, so blue shows there at half alpha; elsewhere it blends over red.
  assert.deepEqual(at(2, 1, 1), [0, 0, 255, 128]);
  assert.deepEqual(at(2, 0, 0), [127, 0, 128, 255]);
});

test('an animated PNG becomes an animated JPEG XL with every frame, time and loop, and verifies', async () => {
  const photo = (await decodePng(fx('photo.png')))!;
  const w = 96, h = 64, b = new ApngBuilder(w, h, 3, false);
  for (let k = 0; k < 4; k++) {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) d.set(photo.data.subarray(((y + k * 8) * photo.width + k * 10) * 4, ((y + k * 8) * photo.width + k * 10 + w) * 4), y * w * 4);
    await b.frame(d, 80 + k * 20);
  }
  const apng = await b.finish();
  assert.ok(isApng(apng));
  const out = await convert(apng, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(out.bytes, out.reason);
  assert.equal(out.animated, true);
  assert.equal((await pixelsOf(out.bytes!)).frames, 4);
  assert.deepEqual(await verifyJxl(apng, 'png', out.bytes!, out.kept!, noBrowser), {ok: true});
  assert.equal((await analyze(apng, 'png', noBrowser)).kind, 'animation');
});

test('a long animated PNG is read as the encoder takes its frames, never held whole', async () => {
  const w = 96, h = 64, n = 400;
  const b = new ApngBuilder(w, h, 0, false);
  for (let k = 0; k < n; k++) { const d = new Uint8Array(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = (i + k * 3) & 255; d[i + 1] = k; d[i + 2] = (i >> 6) & 255; d[i + 3] = 255; } await b.frame(d, 40); }
  const apng = await b.finish();
  let held = 0, peak = 0;
  const counted: AnimatedFrames = async (bytes, ext) => {
    const a = await browserFrames(bytes, ext);
    if (!a) return a;
    const each = a.frames as AsyncIterable<{data: Uint8Array; duration: number}>;
    assert.ok(Symbol.asyncIterator in Object(each), 'frames come one at a time');
    return {...a, frames: (async function* () { for await (const f of each) { held++; peak = Math.max(peak, held); yield f; held--; } })()};
  };
  const out = await convert(apng, 'png', {mode: 'auto', quality: 90}, noBrowser, counted);
  assert.ok(out.bytes, out.reason);
  assert.equal((await pixelsOf(out.bytes!)).frames, n);
  assert.ok(peak <= 2, 'at most the frame being coded is held: ' + peak);
  assert.deepEqual(await verifyJxl(apng, 'png', out.bytes!, out.kept!, noBrowser, counted), {ok: true});
});

// A WebP's chunks, enough for the readers: 'VP8X' flags, then frames holding VP8L (lossless) or 'VP8 ' (lossy).
const riff = (...chunks: Buffer[]) => { const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]); const h = Buffer.alloc(8); h.write('RIFF'); h.writeUInt32LE(body.length, 4); return new Uint8Array(Buffer.concat([h, body])); };
const wchunk = (name: string, body: Buffer) => { const h = Buffer.alloc(8); h.write(name); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body, body.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
const vp8x = (flags: number) => { const b = Buffer.alloc(10); b[0] = flags; b.writeUIntLE(3, 4, 3); b.writeUIntLE(3, 7, 3); return wchunk('VP8X', b); };
const anmf = (inner: string) => wchunk('ANMF', Buffer.concat([Buffer.alloc(16), wchunk(inner, Buffer.alloc(10))]));

test('animated WebP is told from still, and lossy from lossless, through its frame chunks', () => {
  const lossless = riff(vp8x(2), wchunk('ANIM', Buffer.alloc(6)), anmf('VP8L'), anmf('VP8L'));
  const lossy = riff(vp8x(2), wchunk('ANIM', Buffer.alloc(6)), anmf('VP8 '), anmf('VP8 '));
  assert.ok(isAnimatedWebp(lossless) && isAnimatedWebp(lossy));
  assert.equal(isLossyWebp(lossless), false);
  assert.equal(isLossyWebp(lossy), true);
  assert.equal(isLossyWebp(riff(vp8x(0), wchunk('VP8L', Buffer.alloc(10)))), false);
  assert.equal(isLossyWebp(riff(wchunk('VP8 ', Buffer.alloc(10)))), true);
});

test('a lossless animated WebP becomes an animated JPEG XL through the platform\'s frames; one that is lossy is left', async () => {
  const lossless = riff(vp8x(2), wchunk('ANIM', Buffer.alloc(6)), anmf('VP8L'), anmf('VP8L'));
  const photo = (await decodePng(fx('photo.png')))!;
  const w = 64, h = 48;
  const frames: AnimatedFrames = async () => ({width: w, height: h, loops: 0, frames: [0, 1, 2].map(k => {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) d.set(photo.data.subarray(((y + k * 4) * photo.width) * 4, ((y + k * 4) * photo.width + w) * 4), y * w * 4);
    return {data: d, duration: 40 + k * 10};
  })});
  // The stand-in WebP is a few bytes, so the JPEG XL is no smaller: the rule "only if smaller" holds even for an animation.
  const same1 = await convert(lossless, 'webp', {mode: 'auto', quality: 90}, noBrowser, frames);
  assert.equal(same1.bytes, null);
  assert.equal(same1.reason, 'No smaller.');
  const lossy = riff(vp8x(2), wchunk('ANIM', Buffer.alloc(6)), anmf('VP8 '), anmf('VP8 '));
  const kept = await convert(lossy, 'webp', {mode: 'auto', quality: 90}, noBrowser, frames);
  assert.match(kept.reason ?? '', /Left as it is/);
  // A bigger stand-in file: pad the WebP so the animation is smaller than it.
  const big = riff(vp8x(2), wchunk('ANIM', Buffer.alloc(6)), wchunk('ANMF', Buffer.concat([Buffer.alloc(16), wchunk('VP8L', Buffer.alloc(60000))])), anmf('VP8L'));
  const out = await convert(big, 'webp', {mode: 'auto', quality: 90}, noBrowser, frames);
  assert.ok(out.bytes, out.reason);
  assert.equal(out.animated, true);
  assert.deepEqual(await verifyJxl(big, 'webp', out.bytes!, out.kept!, noBrowser, frames), {ok: true});
  const px = await pixelsOf(out.bytes!);
  assert.equal(px.frames, 3);
});

// ---- Animation custody: loops, colors and a separate first picture are kept, or the original stays. ----
import {encode} from 'jpegxl/animation';
import {deflateSync as zdeflate} from 'node:zlib';

const frameData = (w: number, h: number, k: number) => { const d = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) { d[i * 4] = (i * 7 + k * 40) & 255; d[i * 4 + 1] = (i * 3) & 255; d[i * 4 + 2] = k * 60; d[i * 4 + 3] = 255; } return d; };
const buildApng = async (loops: number, icc?: Uint8Array) => {
  const b = new ApngBuilder(32, 32, loops, false, icc);
  for (let k = 0; k < 3; k++) await b.frame(frameData(32, 32, k), 90);
  return b.finish();
};
const loopsOf = (jxl: Uint8Array) => (header(jxl) as {animation?: {loops: number}}).animation?.loops ?? 0;

test('a finite and an infinite animated PNG keep their play count, and the check reads it', async () => {
  for (const loops of [0, 1, 4]) {
    const apng = await buildApng(loops);
    const out = await convert(apng, 'png', {mode: 'auto', quality: 90}, noBrowser);
    assert.ok(out.bytes, out.reason);
    assert.equal(loopsOf(out.bytes!), loops);
    assert.deepEqual(await verifyJxl(apng, 'png', out.bytes!, out.kept!, noBrowser), {ok: true});
  }
});

test('a file that differs only in its loop count fails the check', async () => {
  const apng = await buildApng(3);
  const a = (await decodeApng(apng))!;
  const other = await encode({width: a.width, height: a.height, loops: 5, frames: a.frames.map(f => ({data: f.data, duration: f.duration}))} as never, {fidelity: 'exact', effort: 3} as never);
  assert.ok(other.bytes);
  assert.equal(loopsOf(other.bytes!), 5);
  const check = await verifyJxl(apng, 'png', other.bytes!, 'pixels', noBrowser);
  assert.equal(check.ok, false);
});

test('an animated WebP stub keeps a finite loop count and a different one fails', async () => {
  const frames: AnimatedFrames = async () => ({width: 32, height: 32, loops: 2, frames: [0, 1, 2].map(k => ({data: frameData(32, 32, k), duration: 90}))});
  const webp = riff(vp8x(0x12), wchunk('ANIM', Buffer.alloc(6)), wchunk('ANMF', Buffer.concat([Buffer.alloc(16), wchunk('VP8L', Buffer.from([0x2f, 0, 0, 0, 0]))])));
  const a = (await frames(webp, 'webp'))!;
  const good = await encode({...a} as never, {fidelity: 'exact', effort: 3} as never);
  assert.deepEqual(await verifyJxl(webp, 'webp', good.bytes!, 'pixels', noBrowser, frames), {ok: true});
  const bad = await encode({...a, loops: 3} as never, {fidelity: 'exact', effort: 3} as never);
  assert.equal((await verifyJxl(webp, 'webp', bad.bytes!, 'pixels', noBrowser, frames)).ok, false);
});

test('an animated PNG with a Display P3 profile keeps the profile and verifies by it', async () => {
  const icc = fx('display-p3.icc');
  const apng = await buildApng(0, icc);
  assert.deepEqual((await decodeApng(apng))!.icc, icc);
  const out = await convert(apng, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(out.bytes, out.reason);
  assert.deepEqual(await verifyJxl(apng, 'png', out.bytes!, out.kept!, noBrowser), {ok: true});
  const d = await decode(out.bytes!);
  assert.ok(d.rgbaICC && same(d.rgbaICC, icc));
  // The same frames written without the profile do not pass for it.
  const a = (await decodeApng(apng))!;
  const plain = await encode({width: a.width, height: a.height, loops: 0, frames: a.frames.map(f => ({data: f.data, duration: f.duration}))} as never, {fidelity: 'exact', effort: 3} as never);
  assert.equal((await verifyJxl(apng, 'png', plain.bytes!, 'pixels', noBrowser)).ok, false);
});

test('a profile the encoder cannot keep leaves the original, never an exact claim', async () => {
  const icc = new Uint8Array(400).map((_, i) => (i * 13) & 255);
  const out = await convert(await buildApng(0, icc), 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.bytes, null);
  assert.ok(out.reason);
});

test('an animated PNG whose default picture is not a frame is left as it is', async () => {
  const idat = (n: number) => rgbaRows(4, 4, [n, n, n, 255]);
  const apng = new Uint8Array(Buffer.concat([sig, chunkOf('IHDR', ihdr4()), chunkOf('acTL', Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])),
    chunkOf('IDAT', idat(9)), // the default picture, before any fcTL
    chunkOf('fcTL', fctl(0, 4, 4, 0, 0, 100, 0, 0)), chunkOf('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 1]), idat(100)])),
    chunkOf('fcTL', fctl(2, 4, 4, 0, 0, 100, 0, 0)), chunkOf('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 3]), idat(200)])),
    chunkOf('IEND', new Uint8Array(0))]));
  assert.equal((await decodeApng(apng))!.hiddenDefault, true);
  const out = await convert(apng, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.bytes, null);
  const normal = (await decodeApng(await buildApng(0)))!;
  assert.equal(!!normal.hiddenDefault, false);
});

test('WebCodecs repeats become plays: loop 3 reads 2 repeats, loop 1 reads 0, forever reads Infinity', () => {
  assert.equal(playsOf(2), 3); assert.equal(playsOf(0), 1); assert.equal(playsOf(Infinity), 0);
});

// ---- Barry's one-frame APNG with a separate default image: red IDAT, green frame, two plays. ----
const ONE_FRAME = Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000086163544c00000001000000025a23888c00000010494441547801010500faff00ff0000ff050001fffa5c88d10000001a6663544c0000000000000001000000010000000000000000006403e80000b37e63cd0000001466644154000000017801010500faff0000ff00ff040101ffc6d71c510000000049454e44ae426082', 'hex'));
test('a one-frame animated PNG with a separate default picture is left as it is', async () => {
  assert.equal(isApng(ONE_FRAME), false);
  assert.equal(hasActl(ONE_FRAME), true);
  const out = await convert(ONE_FRAME, 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.equal(out.bytes, null);
  assert.match(out.reason!, /Left as it is/);
  assert.equal((await verifyJxl(ONE_FRAME, 'png', new Uint8Array([1]), 'pixels', noBrowser)).ok, false);
});
test('an ordinary PNG and a two-frame animated PNG still convert', async () => {
  assert.equal(hasActl(fx('photo.png')), false);
  assert.equal(hasActl(await buildApng(0)), true);
  const out = await convert(await buildApng(2), 'png', {mode: 'auto', quality: 90}, noBrowser);
  assert.ok(out.bytes, out.reason);
});

// ---- A lossless animated WebP with a Display P3 profile: the browser reader gives samples, the container gives the profile. ----
import {webpIcc} from '../src/core/engine.js';
test('an animated WebP profile is read from its container and kept, and the check reads it back', async () => {
  const webp = fx('p3-anim.webp'), icc = fx('display-p3.icc');
  assert.ok(isAnimatedWebp(webp));
  assert.deepEqual(webpIcc(webp), icc);
  // Samples as the browser reader returns them (checked in Chromium and against Pillow: pure green, red, blue, copied raw).
  const frames: AnimatedFrames = async () => ({width: 16, height: 16, loops: 3, frames: [[0, 255, 0], [255, 0, 0], [0, 0, 255]].map(c => ({data: Uint8Array.from({length: 1024}, (_, i) => i % 4 === 3 ? 255 : c[i % 4]), duration: 100}))});
  const pad = new Uint8Array(webp.length + 4000); pad.set(webp); // so the new file is smaller than the source
  const a = (await frames(webp, 'webp'))!;
  const withIcc = await encode({...a, icc} as never, {fidelity: 'exact', effort: 3} as never);
  assert.deepEqual(await verifyJxl(webp, 'webp', withIcc.bytes!, 'pixels', noBrowser, frames), {ok: true});
  const without = await encode({...a} as never, {fidelity: 'exact', effort: 3} as never);
  assert.equal((await verifyJxl(webp, 'webp', without.bytes!, 'pixels', noBrowser, frames)).ok, false);
  const big = new Uint8Array(webp.length + 4000); big.set(webp); // trailing bytes keep the RIFF walk valid for the first chunks
  const out = await convert(big, 'webp', {mode: 'auto', quality: 90}, noBrowser, frames);
  assert.ok(out.bytes, out.reason);
  const back = await decode(out.bytes!);
  assert.ok(back.rgbaICC && same(back.rgbaICC, icc));
});

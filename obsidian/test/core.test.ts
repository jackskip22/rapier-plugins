import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convert, toPng, toJpeg, canRestoreJpeg, pixelsOf, analyze, remake, maxPixelsFor, MAX_PIXELS} from '../src/core/engine.js';
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

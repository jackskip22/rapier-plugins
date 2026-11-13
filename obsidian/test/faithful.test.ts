// A converted file holds the original's own numbers, at their full depth and in their own color, or it is not written.
// Inputs: test/fixtures/README.md. The "canvas" fallback below is what 1.0.1's browserRaster gave a PNG it declined: 8-bit
// numbers and no profile. Every PNG is now read by the plug-in itself, so it is never called for one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {decode} from 'rapier-jxl/decode';
import {encode} from 'rapier-jxl/animation';
import {convert, verifyJxl, isLossyWebp, isAnimated, analyze, remake, toPng, checkRemade, type Converted} from '../src/core/engine.js';
import {decodePng, type Raster} from '../src/core/png.js';
import {plan, runBatch, journalOf, undoRun, type Job} from '../src/core/batch.js';
import {FakeVault} from './fake.js';

const fx = (n: string) => new Uint8Array(readFileSync('test/fixtures/' + n));
const P3 = new Uint8Array(readFileSync('test/fixtures/display-p3.icc'));
const never = new AbortController().signal;
const checked = (v: FakeVault) => async (e: {src: string; dest: string}, made: Uint8Array) => checkRemade(e.src.split('.').pop()!, v.files.get(e.dest)!.bytes, made);
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v: number, i: number) => v === b[i]);

/** An independent reader for the fixtures' 16-bit RGB PNGs (filter 0, as written): RGBA samples, 16 bits each. */
function png16(b: Uint8Array): {data: Uint16Array; width: number; height: number} {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const width = v.getUint32(16), height = v.getUint32(20);
  assert.equal(b[24], 16);
  const parts: Uint8Array[] = [];
  for (let p = 8; p < b.length;) {
    const len = v.getUint32(p), name = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (name === 'IDAT') parts.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const data = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = y * (width * 6 + 1) + 1 + x * 6, o = (y * width + x) * 4;
    data[o] = raw[s] << 8 | raw[s + 1]; data[o + 1] = raw[s + 2] << 8 | raw[s + 3]; data[o + 2] = raw[s + 4] << 8 | raw[s + 5]; data[o + 3] = 65535;
  }
  return {data, width, height};
}
const canvas = async (b: Uint8Array): Promise<Raster> => {
  const p = png16(b);
  return {data: Uint8Array.from(p.data, s => s >> 8), width: p.width, height: p.height};
};
const decoded = async (jxl: Uint8Array) => decode(jxl);

// 1 and 2: a 16-bit picture keeps every sample at 16 bits, and its profile.
for (const name of ['p3-16bit.png', 'srgb-16bit.png']) {
  test(`${name} kept as a screenshot: every 16-bit sample, and its own profile`, async () => {
    const input = fx(name), want = png16(input);
    const out = await convert(input, 'png', {mode: 'screenshot', quality: 90, effort: 3}, canvas);
    assert.ok(out.bytes, out.reason);
    assert.equal(out.kept, 'pixels');
    const d = await decoded(out.bytes);
    assert.ok(d.data instanceof Uint16Array, 'written at 16 bits');
    assert.ok(same(d.data, want.data), 'every 16-bit sample');
    if (name.startsWith('p3')) assert.ok(d.rgbaICC && same(d.rgbaICC, P3), 'the Display P3 profile');
    assert.deepEqual(await verifyJxl(input, 'png', out.bytes, 'pixels', out.record), {ok: true});
  });
}

test('a 16-bit photograph is not coded with loss when the look check cannot measure it: it is kept exactly', async () => {
  const input = fx('p3-16bit.png');
  const out = await convert(input, 'png', {mode: 'photo', quality: 90, effort: 3}, canvas);
  assert.ok(out.bytes, out.reason);
  assert.equal(out.kept, 'pixels');
  assert.ok(same((await decoded(out.bytes)).data, png16(input).data));
  assert.deepEqual(await verifyJxl(input, 'png', out.bytes, 'pixels', out.record), {ok: true});
});

test('the check compares a 16-bit original at 16 bits: an 8-bit copy of it fails', async () => {
  const input = fx('srgb-16bit.png');
  const eight = await canvas(input);
  const r = await encode({data: eight.data, width: eight.width, height: eight.height} as never, {fidelity: 'exact', effort: 3} as never);
  const out = await convert(input, 'png', {mode: 'screenshot', quality: 90, effort: 3}, canvas);
  const check = await verifyJxl(input, 'png', r.bytes!, 'pixels', out.record);
  assert.equal(check.ok, false);
});

test('Remove originals: a 16-bit original goes to the trash only once it is kept at 16 bits, and Undo makes it again sample for sample', async () => {
  const v = new FakeVault();
  v.add('pics/a.png', fx('srgb-16bit.png'));
  v.notes.set('n.md', '![[a.png]]');
  const job: Job = {
    destExt: 'jxl', removeOriginals: true,
    transform: async (b, ext) => { const r: Converted = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}, canvas); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
    verify: (src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never),
  };
  const s = v.stat('pics/a.png')!;
  const res = await runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never);
  assert.equal(res[0].status, 'done', JSON.stringify(res[0]));
  assert.ok(same((await decoded(v.files.get('pics/a.jxl')!.bytes)).data, png16(fx('srgb-16bit.png')).data));
  assert.ok(!v.files.has('pics/a.png'));
  const out = await undoRun(v, journalOf(res), async e => remake('png', v.files.get(e.dest)!.bytes, e.kept), checked(v));
  assert.equal(out.undone, 1, JSON.stringify(out.left));
  const back = (await decodePng(v.files.get('pics/a.png')!.bytes))!;
  assert.ok(back.data instanceof Uint16Array && same(back.data, png16(fx('srgb-16bit.png')).data), 'made again at 16 bits');
});

test('back to PNG keeps 16 bits and the profile', async () => {
  const out = await convert(fx('p3-16bit.png'), 'png', {mode: 'screenshot', quality: 90, effort: 3}, canvas);
  const png = (await decodePng((await toPng(out.bytes!)).bytes))!;
  assert.ok(same(png.data, png16(fx('p3-16bit.png')).data));
  assert.ok(png.icc && same(png.icc, P3));
});

test('the reader reads every PNG kind exactly: interlaced, 16-bit, palette and gray at low depth', async () => {
  for (const [a, b] of [['p3-16bit-interlaced.png', 'p3-16bit.png'], ['alpha-interlaced.png', 'alpha.png'], ['pal4.png', 'pal8.png'], ['gray2.png', 'gray8.png']]) {
    const x = await decodePng(fx(a)), y = await decodePng(fx(b));
    assert.ok(x && y, a);
    assert.ok(x.width === y.width && x.height === y.height && x.data.BYTES_PER_ELEMENT === y.data.BYTES_PER_ELEMENT && same(x.data, y.data), a);
    assert.ok((x.icc && y.icc && same(x.icc, y.icc)) || (!x.icc && !y.icc), a);
  }
  assert.ok(same((await decodePng(fx('p3-16bit.png')))!.data, png16(fx('p3-16bit.png')).data));
});

// 3: WebP kinds, by their chunks.
const le = (n: number) => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24];
const ch = (tag: string, body: number[]) => [...tag].map(c => c.charCodeAt(0)).concat(le(body.length), body, body.length & 1 ? [0] : []);
const riff = (...chunks: number[][]) => { const body = [...'WEBP'].map(c => c.charCodeAt(0)).concat(...chunks); return new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat(le(body.length), body)); };
const vp8x = (flags: number) => ch('VP8X', [flags, 0, 0, 0, 9, 0, 0, 9, 0, 0]);
const frame = (inner: number[]) => ch('ANMF', [...new Array(16).fill(0), ...inner]);
const kinds: [string, Uint8Array, boolean][] = [
  ['VP8L', riff(ch('VP8L', new Array(40).fill(1))), false],
  ['VP8', riff(ch('VP8 ', new Array(40).fill(1))), true],
  ['VP8X, ICCP, VP8L', riff(vp8x(0x20), ch('ICCP', new Array(601).fill(7)), ch('VP8L', new Array(40).fill(1))), false],
  ['VP8X, EXIF, VP8L', riff(vp8x(0x08), ch('EXIF', new Array(120).fill(7)), ch('VP8L', new Array(40).fill(1))), false],
  ['VP8X, ALPH, VP8', riff(vp8x(0x10), ch('ALPH', new Array(60).fill(3)), ch('VP8 ', new Array(40).fill(1))), true],
  ['VP8X, ANIM, ANMF(VP8L)', riff(vp8x(0x02), ch('ANIM', [0, 0, 0, 0, 0, 0]), frame(ch('VP8L', new Array(40).fill(1))), frame(ch('VP8L', new Array(40).fill(1)))), false],
  ['VP8X, ANIM, ANMF(VP8L), ANMF(ALPH, VP8)', riff(vp8x(0x12), ch('ANIM', [0, 0, 0, 0, 0, 0]), frame(ch('VP8L', new Array(40).fill(1))), frame([...ch('ALPH', [1, 2, 3]), ...ch('VP8 ', new Array(40).fill(1))])), true],
  ['p3-lossless.webp', fx('p3-lossless.webp'), false],
  ['exif-lossless.webp', fx('exif-lossless.webp'), false],
  ['p3-lossy.webp', fx('p3-lossy.webp'), true],
];
for (const [name, bytes, lossy] of kinds) {
  test(`WebP ${name}: ${lossy ? 'saved with loss' : 'lossless'}`, async () => {
    assert.equal(isLossyWebp(bytes), lossy);
  });
}
test('a lossless WebP with a profile is converted, not refused as saved with loss', async () => {
  const sized = async () => ({data: new Uint8Array(128 * 96 * 4), width: 128, height: 96});
  assert.notEqual((await analyze(fx('p3-lossless.webp'), 'webp', sized)).kind, 'lossy-webp');
  const out = await convert(fx('p3-lossless.webp'), 'webp', {mode: 'screenshot', quality: 90, effort: 3}, sized);
  assert.notEqual(out.reason, 'Already saved with loss. Left as it is.');
});

// 4: a picture saved at a look is checked against the original's look, not only its size.
test('the lossy check measures the look: the right file passes, another picture of the same size fails', async () => {
  const input = fx('photo.png');
  const out = await convert(input, 'png', {mode: 'photo', quality: 90}, canvas);
  assert.equal(out.kept, 'lossy');
  assert.deepEqual(await verifyJxl(input, 'png', out.bytes!, 'lossy', out.record), {ok: true});
  const px = (await decodePng(input))!;
  const other = Uint8Array.from(px.data, (s, i) => (i & 3) === 3 ? s : 255 - s);
  const wrong = await encode({data: other, width: px.width, height: px.height} as never, {fidelity: {quality: 90}, effort: 3} as never);
  const check = await verifyJxl(input, 'png', wrong.bytes!, 'lossy', out.record);
  assert.equal(check.ok, false);
});

// Barry's faults at d4d97daa8b. Undo: a recreated original is read back and checked before any link or the new file
// changes. A vault whose create succeeds but stores other bytes, stores a short file, or throws.
class Faulty extends FakeVault {
  fault: 'corrupt' | 'short' | 'throw' | null = null;
  async create(p: string, b: Uint8Array) {
    if (this.fault && p.includes('.png')) {
      if (this.fault === 'throw') throw new Error('disk');
      return super.create(p, this.fault === 'corrupt' ? new Uint8Array([0]) : b.subarray(0, b.length >> 1));
    }
    return super.create(p, b);
  }
}
async function removedScreenshot() {
  const v = new Faulty();
  v.add('pics/a.png', fx('srgb-16bit.png'));
  v.notes.set('n.md', '![[a.png]]');
  const job: Job = {
    destExt: 'jxl', removeOriginals: true,
    transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
    verify: (src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never),
  };
  const s = v.stat('pics/a.png')!;
  const res = await runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never);
  assert.equal(res[0].status, 'done');
  assert.ok(!v.files.has('pics/a.png') && v.notes.get('n.md')!.includes('a.jxl'));
  return {v, journal: journalOf(res)};
}
for (const fault of ['corrupt', 'short', 'throw'] as const) {
  test(`Undo with a ${fault} write of the original keeps the JPEG XL file and every link`, async () => {
    const {v, journal} = await removedScreenshot();
    const jxl = v.files.get('pics/a.jxl')!.bytes;
    v.fault = fault;
    const out = await undoRun(v, journal, async e => remake('png', v.files.get(e.dest)!.bytes, e.kept), checked(v));
    assert.equal(out.undone, 0);
    assert.equal(out.left.length, 1);
    assert.ok(v.files.has('pics/a.jxl') && same(v.files.get('pics/a.jxl')!.bytes, jxl), 'the JPEG XL file stays');
    assert.ok(v.notes.get('n.md')!.includes('a.jxl') && !v.notes.get('n.md')!.includes('a.png'), 'the links stay');
    assert.ok(!v.files.has('pics/a.png'), 'no broken original is left where the original was');
  });
}
test('Undo refuses a recreated original that reads back the same but does not match the file', async () => {
  const {v, journal} = await removedScreenshot();
  const out = await undoRun(v, journal, async () => fx('srgb-16bit.png').slice(0, 100), checked(v));
  assert.equal(out.undone, 0);
  assert.ok(v.files.has('pics/a.jxl') && v.notes.get('n.md')!.includes('a.jxl'));
});
test('a short write of the new file: nothing is relinked and the original is not removed', async () => {
  const v = new FakeVault();
  v.add('pics/a.png', fx('srgb-16bit.png'));
  v.notes.set('n.md', '![[a.png]]');
  const create = v.create.bind(v);
  v.create = async (p, b) => create(p, p.includes('.jxl') ? b.subarray(0, b.length - 1) : b);
  const job: Job = {
    destExt: 'jxl', removeOriginals: true,
    transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
    verify: (src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never),
  };
  const s = v.stat('pics/a.png')!;
  const res = await runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.ok(same(v.files.get('pics/a.png')!.bytes, fx('srgb-16bit.png')));
  assert.equal(v.notes.get('n.md'), '![[a.png]]');
});

// An animated WebP or PNG is left as it is: read as one picture it would become a still.
for (const name of ['anim-lossless.webp', 'anim.png']) {
  test(`${name} is left as it is, even with Remove originals on`, async () => {
    const input = fx(name), ext = name.split('.').pop()!;
    assert.equal(isAnimated(input), true);
    assert.equal((await analyze(input, ext, canvas)).kind, 'animated');
    const still = async () => ({data: new Uint8Array(64 * 48 * 4).fill(200), width: 64, height: 48});
    assert.equal((await convert(input, ext, {mode: 'screenshot', quality: 90}, still)).reason, 'It is animated.');
    const v = new FakeVault();
    v.add('pics/a.' + ext, input);
    v.notes.set('n.md', '![[a.' + ext + ']]');
    const job: Job = {
      destExt: 'jxl', removeOriginals: true,
      transform: async (b, e) => { const r = await convert(b, e, {mode: 'screenshot', quality: 90}, still); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
      verify: (src, e, out, kept, record) => verifyJxl(src, e, out, kept as never, record as never, still),
    };
    const s = v.stat('pics/a.' + ext)!;
    const res = await runBatch(v, job, plan(v, [{path: 'pics/a.' + ext, size: s.size, mtime: s.mtime}], 'jxl'), never);
    assert.equal(res[0].status, 'skipped');
    assert.ok(same(v.files.get('pics/a.' + ext)!.bytes, input) && !v.files.has('pics/a.jxl'));
  });
}
test('a still WebP or PNG is not taken for animated', async () => {
  for (const name of ['p3-lossless.webp', 'exif-lossless.webp', 'alpha.webp', 'photo.png', 'p3-16bit.png']) assert.equal(isAnimated(fx(name)), false, name);
});

// The cleanup after a failed Undo or a failed write trashes only the file this run wrote. A file another writer (a sync,
// the person) puts at that path between the write and the cleanup survives.
test('Undo: a file swapped in where the bad copy was written survives the cleanup', async () => {
  const {v, journal} = await removedScreenshot();
  v.fault = 'corrupt';
  const trashedBefore = v.trashed.length;
  const theirs = fx('photo.png');
  let swapped = false;
  let part = '';
  v.hooks.afterRead = p => { if (p.endsWith('.png.part') && !swapped) { swapped = true; part = p; v.touch(p, theirs); } };
  const out = await undoRun(v, journal, async e => remake('png', v.files.get(e.dest)!.bytes, e.kept), checked(v));
  assert.ok(swapped);
  assert.equal(out.undone, 0);
  assert.ok(v.files.has(part) && same(v.files.get(part)!.bytes, theirs), 'the swapped file survives');
  assert.ok(!v.files.has('pics/a.png'));
  assert.equal(v.trashed.length, trashedBefore, 'nothing more goes to the trash');
  assert.ok(v.files.has('pics/a.jxl') && v.notes.get('n.md')!.includes('a.jxl'));
});
test('a failed write: a file swapped in where the new file was written survives the cleanup', async () => {
  const v = new FakeVault();
  v.add('pics/a.png', fx('srgb-16bit.png'));
  v.notes.set('n.md', '![[a.png]]');
  const create = v.create.bind(v);
  v.create = async (p, b) => create(p, p.includes('.jxl') ? b.subarray(0, b.length - 1) : b);
  const theirs = fx('photo.jpg');
  let swapped = false, part = '';
  v.hooks.afterRead = p => { if (p.endsWith('.jxl.part') && !swapped) { swapped = true; part = p; v.touch(p, theirs); } };
  const job: Job = {
    destExt: 'jxl', removeOriginals: true,
    transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
    verify: (src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never),
  };
  const s = v.stat('pics/a.png')!;
  const res = await runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never);
  assert.ok(swapped);
  assert.equal(res[0].status, 'skipped');
  assert.ok(same(v.files.get(part)!.bytes, theirs) && !v.trashed.includes(part) && !v.files.has('pics/a.jxl'), 'the swapped file survives');
  assert.ok(same(v.files.get('pics/a.png')!.bytes, fx('srgb-16bit.png')) && v.notes.get('n.md') === '![[a.png]]');
});

// Barry at 1db8345800: a file that replaces the new one while the cleanup reads it, or just after, is never trashed.
for (const when of ['during the read', 'after the read']) {
  test(`a failed check: a file that replaces the new one ${when} survives the cleanup`, async () => {
    const v = new FakeVault();
    v.add('pics/a.png', fx('srgb-16bit.png'));
    v.notes.set('n.md', '![[a.png]]');
    const theirs = fx('photo.jpg');
    let reads = 0, swapped = false, part = '';
    const swap = () => { swapped = true; v.touch(part, theirs); };
    v.hooks.afterRead = p => {
      if (!p.endsWith('.jxl.part') || ++reads !== 2) return;
      part = p;
      if (when === 'during the read') swap(); else setImmediate(swap);
    };
    const job: Job = {
      destExt: 'jxl', removeOriginals: true,
      transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
      verify: async () => ({ok: false, reason: 'checked and refused'}),
    };
    const s = v.stat('pics/a.png')!;
    const res = await runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never);
    await new Promise(r => setImmediate(r));
    assert.ok(swapped);
    assert.equal(res[0].status, 'skipped');
    assert.ok(v.files.has(part) && same(v.files.get(part)!.bytes, theirs), 'their file is where it was');
    // During the read their file is seen and nothing is trashed; after it, only this run's own file went first.
    assert.equal(v.trashed.filter(p => p === part).length, when === 'during the read' ? 0 : 1);
    assert.ok(!v.files.has('pics/a.jxl'));
    assert.ok(same(v.files.get('pics/a.png')!.bytes, fx('srgb-16bit.png')) && v.notes.get('n.md') === '![[a.png]]');
  });
}

// Barry at c72b8067d3: no stat, read and trash order is atomic, so cleanup never touches a shared name. Each candidate is
// written as "<name>.<12 hex>.<ext>.part", checked there and moved to its name only while that is free.
const exactJob = (verify?: Job['verify']): Job => ({
  destExt: 'jxl', removeOriginals: true,
  transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'screenshot', quality: 90, effort: 3}); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
  verify: verify ?? ((src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never)),
});
const vaultWith = () => {
  const v = new FakeVault();
  v.add('pics/a.png', fx('srgb-16bit.png'));
  v.notes.set('n.md', '![[a.png]]');
  return v;
};
const runOne = (v: FakeVault, job: Job) => { const s = v.stat('pics/a.png')!; return runBatch(v, job, plan(v, [{path: 'pics/a.png', size: s.size, mtime: s.mtime}], 'jxl'), never); };

test('a file at the final name with the same size and time as the new one, put there during the check, survives', async () => {
  const v = vaultWith();
  let theirs: Uint8Array | null = null;
  const res = await runOne(v, exactJob(async (_s, _e, out) => {
    // Their file: other bytes, the same size, and the time the new file was written at.
    const part = [...v.files.keys()].find(p => p.endsWith('.jxl.part'))!;
    theirs = Uint8Array.from(out, b => b ^ 0xff);
    v.files.set('pics/a.jxl', {bytes: theirs, mtime: v.files.get(part)!.mtime});
    return {ok: false, reason: 'checked and refused'};
  }));
  assert.equal(res[0].status, 'skipped');
  assert.ok(same(v.files.get('pics/a.jxl')!.bytes, theirs!) && !v.trashed.includes('pics/a.jxl'), 'their file survives');
  assert.ok(v.trashed.every(p => p.endsWith('.jxl.part')) && v.trashed.length === 1, 'only the .part file goes');
  assert.ok(same(v.files.get('pics/a.png')!.bytes, fx('srgb-16bit.png')) && v.notes.get('n.md') === '![[a.png]]');
});

test('a leftover .part with the name drawn first is never touched: another name is drawn', async () => {
  const v = vaultWith();
  const leftover = 'pics/a.000000000000.jxl.part', old = new Uint8Array([9, 9, 9]);
  v.add(leftover, old);
  const real = crypto.getRandomValues.bind(crypto);
  let first = true;
  const stub = <T extends ArrayBufferView | null>(a: T): T => { if (first && a instanceof Uint8Array) { first = false; a.fill(0); return a; } return real(a as never) as T; };
  Object.defineProperty(crypto, 'getRandomValues', {value: stub, configurable: true, writable: true});
  try {
    const res = await runOne(v, exactJob());
    assert.equal(first, false, 'the first name drawn was the leftover');
    assert.equal(res[0].status, 'done', JSON.stringify(res[0]));
  } finally { Object.defineProperty(crypto, 'getRandomValues', {value: real, configurable: true, writable: true}); }
  assert.ok(same(v.files.get(leftover)!.bytes, old) && !v.trashed.includes(leftover));
  assert.ok(v.files.has('pics/a.jxl') && ![...v.files.keys()].some(p => p.endsWith('.part') && p !== leftover));
});

test('the move refuses a taken name: a file put at the final name just before the move survives, and nothing is relinked', async () => {
  const v = vaultWith();
  const theirs = new Uint8Array([5, 5, 5]);
  v.hooksRename = (_from, to) => { if (to === 'pics/a.jxl') v.add(to, theirs); };
  const res = await runOne(v, exactJob());
  assert.equal(res[0].status, 'skipped');
  assert.match((res[0] as {reason: string}).reason, /appeared/);
  assert.ok(same(v.files.get('pics/a.jxl')!.bytes, theirs) && !v.trashed.includes('pics/a.jxl'));
  assert.ok(same(v.files.get('pics/a.png')!.bytes, fx('srgb-16bit.png')) && v.notes.get('n.md') === '![[a.png]]');
});

test('Undo: a file put where the original goes just before the move survives, with the JPEG XL file and every link', async () => {
  const {v, journal} = await removedScreenshot();
  const theirs = new Uint8Array([6, 6, 6]);
  v.hooksRename = (_from, to) => { if (to === 'pics/a.png') v.add(to, theirs); };
  const out = await undoRun(v, journal, async e => remake('png', v.files.get(e.dest)!.bytes, e.kept), checked(v));
  assert.equal(out.undone, 0);
  assert.equal(out.left[0].reason, 'A file is now where the original was.');
  assert.ok(same(v.files.get('pics/a.png')!.bytes, theirs));
  assert.ok(v.files.has('pics/a.jxl') && v.notes.get('n.md')!.includes('a.jxl'));
});

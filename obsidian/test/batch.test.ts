import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convert, verifyJxl, toJpeg, toPng, remake, checkRemade, type Check} from '../src/core/engine.js';
import {encodePng} from '../src/core/png.js';
import {pending, plan, runBatch, journalOf, undoRun, type Job} from '../src/core/batch.js';
import {rewriteLinks, countLinks} from '../src/core/links.js';
import {FakeVault} from './fake.js';

const fx = (n: string) => new Uint8Array(readFileSync('test/fixtures/' + n));
const noBrowser = async () => { throw new Error('no browser decoder in tests'); };
const never = new AbortController().signal;
const checked = (v: FakeVault) => async (e: {src: string; dest: string}, made: Uint8Array) => checkRemade(e.src.split('.').pop()!, v.files.get(e.dest)!.bytes, made);

const job = (removeOriginals = false, verify?: Job['verify']): Job => ({
  destExt: 'jxl', removeOriginals,
  transform: async (b, ext) => { const r = await convert(b, ext, {mode: 'auto', quality: 90}, noBrowser); return r.bytes ? {bytes: r.bytes, kept: r.kept, record: r.record} : {bytes: null, reason: r.reason ?? 'no'}; },
  verify: verify ?? (async (src, ext, out, kept, record) => verifyJxl(src, ext, out, kept as never, record as never)),
});
async function screenshot(w = 200, h = 120) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const ink = ((i % w) >> 3) % 4 === 0; data.set([ink ? 20 : 250, ink ? 20 : 250, ink ? 20 : 246, 255], i * 4); }
  return encodePng({data, width: w, height: h});
}
const PART = /^pics\/a\.[0-9a-f]{12}\.jxl\.part$/;
const onlyPart = (xs: string[]) => xs.length === 1 && PART.test(xs[0]);
const cand = (v: FakeVault, path: string) => { const s = v.stat(path)!; return {path, size: s.size, mtime: s.mtime}; };

async function setup() {
  const v = new FakeVault();
  v.add('pics/a.png', await screenshot());
  v.add('pics/b.jpg', fx('photo.jpg'));
  v.notes.set('n.md', 'one ![[a.png|300]] two ![x](pics/a.png) three ![[b.jpg]]');
  return v;
}

test('plan: one stem, two formats, never one destination', async () => {
  const v = new FakeVault();
  v.add('shot.png', new Uint8Array([1])); v.add('shot.jpg', new Uint8Array([2])); v.add('Shot.gif', new Uint8Array([3]));
  const items = plan(v, ['shot.png', 'shot.jpg', 'Shot.gif', 'shot.png'].map(p => cand(v, p)), 'jxl');
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map(i => i.dest.toLowerCase())).size, 3);
});

test('plan: an existing file is never a destination', async () => {
  const v = new FakeVault();
  v.add('a.png', new Uint8Array([1])); v.add('a.jxl', new Uint8Array([9]));
  assert.equal(plan(v, [cand(v, 'a.png')], 'jxl')[0].dest, 'a 1.jxl');
});

test('a batch converts, rewrites links, and keeps the originals by default', async () => {
  const v = await setup();
  const items = plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl');
  const res = await runBatch(v, job(false), items, never);
  assert.deepEqual(res.map(r => r.status), ['done', 'done']);
  assert.equal(v.notes.get('n.md'), 'one ![[a.jxl|300]] two ![x](pics/a.jxl) three ![[b.jxl]]');
  assert.ok(v.files.has('pics/a.png') && v.files.has('pics/b.jpg'));
  assert.deepEqual(v.trashed, []);
});

test('removing originals sends them to the trash only after the links are proved', async () => {
  const v = await setup();
  const order: string[] = [];
  const t = v.trash.bind(v); v.trash = async p => { order.push('trash ' + p + ' notes=' + v.notes.get('n.md')!.includes('a.png')); await t(p); };
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'done');
  assert.deepEqual(order, ['trash pics/a.png notes=false']);
  assert.equal((res[0] as {removed: boolean}).removed, true);
});

test('a file that appears at the destination fails that one picture and is not overwritten', async () => {
  const v = await setup();
  v.hooks.beforeCreate = p => { if (PART.test(p)) v.add('pics/a.jxl', new Uint8Array([7, 7, 7])); };
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.match((res[0] as {reason: string}).reason, /appeared/);
  assert.deepEqual([...v.files.get('pics/a.jxl')!.bytes], [7, 7, 7]);
  assert.ok(v.files.has('pics/a.png'));
  assert.ok(onlyPart(v.trashed), 'only this run\'s own .part file is trashed');
});

test('an original changed during conversion stays, and the new file is trashed', async () => {
  const v = await setup();
  v.hooks.beforeCreate = () => v.touch('pics/a.png', new Uint8Array([1, 2, 3]));
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.deepEqual([...v.files.get('pics/a.png')!.bytes], [1, 2, 3]);
  assert.ok(onlyPart(v.trashed));
  assert.ok(v.notes.get('n.md')!.includes('a.png'));
});

test('an original that changed after listing is skipped', async () => {
  const v = await setup();
  const items = plan(v, [cand(v, 'pics/a.png')], 'jxl');
  v.touch('pics/a.png', await screenshot(210, 100));
  const res = await runBatch(v, job(true), items, never);
  assert.equal(res[0].status, 'skipped');
  assert.deepEqual(v.trashed, []);
});

test('a failed read-back check keeps the original and trashes the new file', async () => {
  const v = await setup();
  const bad: Check = {ok: false, reason: 'The pixels did not read back the same.'};
  const res = await runBatch(v, job(true, async () => bad), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.ok(v.files.has('pics/a.png'));
  assert.ok(onlyPart(v.trashed));
});

test('a note edited during the run keeps the edit, and every link is rewritten', async () => {
  const v = await setup();
  v.hooks.beforeProcess = n => { v.hooks.beforeProcess = undefined; v.notes.set(n, v.notes.get(n)! + '\nadded ![[a.png]] while open'); };
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  const text = v.notes.get('n.md')!;
  assert.ok(text.includes('added ![[a.jxl]] while open'));
  assert.equal(countLinks(text, t => t.endsWith('a.png')), 0);
  assert.equal((res[0] as {removed: boolean}).removed, true);
});

test('when a note cannot be written the original stays', async () => {
  const v = await setup();
  v.failProcess = true;
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'done');
  assert.equal((res[0] as {removed: boolean}).removed, false);
  assert.ok(v.files.has('pics/a.png'));
});

test('a canvas or other file that uses the picture keeps the original', async () => {
  const v = await setup();
  v.others.set('pics/a.png', ['board.canvas']);
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal((res[0] as {removed: boolean}).removed, false);
  assert.ok(v.files.has('pics/a.png'));
});

test('a JPEG original is removed only when the restored bytes equal the source', async () => {
  const v = await setup();
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/b.jpg')], 'jxl'), never);
  assert.equal((res[0] as {removed: boolean}).removed, true);
  assert.ok(Buffer.from(await toJpeg(v.files.get('pics/b.jxl')!.bytes)).equals(Buffer.from(fx('photo.jpg'))));
});

test('cancel stops before the next picture', async () => {
  const v = await setup();
  const c = new AbortController();
  const res = await runBatch(v, job(false), plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl'), c.signal, i => { if (i === 1) c.abort(); });
  assert.equal(res.length, 1);
});

test('undo puts links back, and remakes a removed JPEG exactly', async () => {
  const v = await setup();
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl'), never);
  const journal = journalOf(res);
  const out = await undoRun(v, journal, async e => (e.src.endsWith('.jpg') ? toJpeg(v.files.get(e.dest)!.bytes) : null), checked(v));
  assert.equal(out.undone, 1);
  assert.deepEqual(out.left.map(l => l.path), ['pics/a.png']);
  assert.ok(Buffer.from(v.files.get('pics/b.jpg')!.bytes).equals(Buffer.from(fx('photo.jpg'))));
  assert.ok(v.notes.get('n.md')!.includes('![[b.jpg]]'));
});

test('link rewriting keeps aliases, sizes, headings and titles, and leaves code alone', () => {
  const refers = (t: string) => t === 'a.png' || t === 'pics/a.png';
  const text = '![[a.png|300]] [[pics/a.png#h|alias]] ![t](pics/a.png "title") ![](<pics/a.png>)\n`![[a.png]]`\n```\n![[a.png]]\n```\n![[other.png]] ![u](https://x/a.png)';
  const r = rewriteLinks(text, {refersTo: refers, destName: 'a 1.jxl', destPath: 'pics/a 1.jxl', nameIsUnique: true});
  assert.equal(r.count, 4);
  assert.equal(r.text, '![[a 1.jxl|300]] [[pics/a 1.jxl#h|alias]] ![t](pics/a%201.jxl "title") ![](<pics/a 1.jxl>)\n`![[a.png]]`\n```\n![[a.png]]\n```\n![[other.png]] ![u](https://x/a.png)');
});

test('a bare name that is not unique is written as a full path', () => {
  const r = rewriteLinks('![[a.png]]', {refersTo: t => t === 'a.png', destName: 'a.jxl', destPath: 'pics/a.jxl', nameIsUnique: false});
  assert.equal(r.text, '![[pics/a.jxl]]');
});

async function converted(removeOriginals = false) {
  const v = await setup();
  const res = await runBatch(v, job(removeOriginals), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'done');
  return {v, journal: journalOf(res)};
}
const nothing = async () => null;

test('undo: a destination changed since is left and reported', async () => {
  const {v, journal} = await converted();
  v.touch('pics/a.jxl', new Uint8Array([5, 5, 5]));
  const out = await undoRun(v, journal, nothing, checked(v));
  assert.equal(out.undone, 0);
  assert.match(out.left[0].reason, /changed/);
  assert.ok(v.files.has('pics/a.jxl') && v.notes.get('n.md')!.includes('a.jxl'));
  assert.deepEqual(v.trashed, []);
});

test('undo: an original replaced since is left and reported, links stay', async () => {
  const {v, journal} = await converted();
  v.touch('pics/a.png', new Uint8Array([9, 9, 9, 9]));
  const out = await undoRun(v, journal, nothing, checked(v));
  assert.equal(out.undone, 0);
  assert.match(out.left[0].reason, /original/i);
  assert.ok(v.notes.get('n.md')!.includes('a.jxl'));
  assert.deepEqual([...v.files.get('pics/a.png')!.bytes], [9, 9, 9, 9]);
});

test('undo: a Canvas or base that now uses the new file keeps it', async () => {
  const {v, journal} = await converted();
  v.others.set('pics/a.jxl', ['board.canvas']);
  const out = await undoRun(v, journal, nothing, checked(v));
  assert.equal(out.undone, 0);
  assert.match(out.left[0].reason, /board\.canvas/);
  assert.ok(v.files.has('pics/a.jxl'));
});

test('undo: a failed trash is not counted as undone', async () => {
  const {v, journal} = await converted();
  v.failTrash = true;
  const out = await undoRun(v, journal, nothing, checked(v));
  assert.equal(out.undone, 0);
  assert.match(out.left[0].reason, /trash/);
});

test('undo: a removed original comes back only from an exact remake', async () => {
  const {v, journal} = await converted(true);
  assert.ok(!v.files.has('pics/a.png'));
  const out = await undoRun(v, journal, nothing, checked(v));
  assert.equal(out.undone, 0);
  assert.ok(v.files.has('pics/a.jxl') && v.notes.get('n.md')!.includes('a.jxl'));
});

test('a destination changed by another writer is not trashed by cleanup', async () => {
  const v = await setup();
  const bad: Check = {ok: false, reason: 'The pixels did not read back the same.'};
  const bumped = job(true, async () => { v.touch([...v.files.keys()].find(p => PART.test(p))!, new Uint8Array([4, 4])); return bad; });
  const res = await runBatch(v, bumped, plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.match((res[0] as {reason: string}).reason, /left/);
  assert.deepEqual(v.trashed, []);
  assert.ok(v.files.has('pics/a.png'));
});

test('a conversion whose read-back fails leaves the note, the original and the vault as they were', async () => {
  const v = await setup();
  const before = {note: v.notes.get('n.md'), files: [...v.files.keys()].sort(), bytes: [...v.files.get('pics/a.png')!.bytes]};
  const res = await runBatch(v, job(true, async () => ({ok: false, reason: 'The pixels did not read back the same.'})), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  assert.equal(res[0].status, 'skipped');
  assert.match((res[0] as {reason: string}).reason, /did not read back/);
  assert.equal(v.notes.get('n.md'), before.note);
  assert.deepEqual([...v.files.get('pics/a.png')!.bytes], before.bytes);
  assert.deepEqual([...v.files.keys()].sort(), before.files);
  assert.ok(onlyPart(v.trashed));
});

test('undo through the plug-in\'s own remake: a removed JPEG comes back exactly, a photograph PNG says it was saved with loss', async () => {
  const v = await setup();
  const res = await runBatch(v, job(true), plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl'), never);
  const journal = journalOf(res);
  assert.ok(!v.files.has('pics/a.png') && !v.files.has('pics/b.jpg'));
  const out = await undoRun(v, journal, async e => remake(e.src.split('.').pop()!, v.files.get(e.dest)!.bytes, e.kept), checked(v));
  // The screenshot was kept exactly: sample for sample. The JPEG: byte for byte.
  assert.equal(out.undone, 2, JSON.stringify(out.left));
  assert.ok(Buffer.from(v.files.get('pics/b.jpg')!.bytes).equals(Buffer.from(fx('photo.jpg'))));
  assert.ok(v.files.has('pics/a.png'));
});

test('a second run over the vault does not write "a 1.jxl" beside "a.jxl"', async () => {
  const v = await setup();
  await runBatch(v, job(false), plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl'), never);
  const {todo, done} = pending(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl');
  assert.equal(todo.length, 0);
  assert.equal(done, 2);
});

test('converting back to PNG leaves the JPEG XL file, so Undo can put the links back', async () => {
  const v = await setup();
  await runBatch(v, job(false), plan(v, [cand(v, 'pics/a.png')], 'jxl'), never);
  v.files.delete('pics/a.png');
  const back: Job = {destExt: 'png', removeOriginals: false, transform: async b => ({bytes: (await toPng(b)).bytes}), verify: async () => ({ok: true})};
  const res = await runBatch(v, back, plan(v, [cand(v, 'pics/a.jxl')], 'png'), never);
  assert.equal(res[0].status, 'done');
  assert.ok(v.files.has('pics/a.jxl') && v.files.has('pics/a.png'));
  const out = await undoRun(v, journalOf(res), async () => null, checked(v));
  assert.equal(out.undone, 1, JSON.stringify(out.left));
  assert.ok(v.notes.get('n.md')!.includes('a.jxl'));
});

test('cancel: honored before anything is written, the canceled picture is not reported, and nothing is left behind', async () => {
  const v = await setup();
  const ctl = new AbortController();
  const base = job(false);
  // Cancel arrives while the first picture is being encoded: the encoder returns, the batch must not write it.
  const slow: Job = {...base, transform: async (b, e, s) => { const r = await base.transform(b, e, s); ctl.abort(); return r; }};
  const items = plan(v, [cand(v, 'pics/a.png'), cand(v, 'pics/b.jpg')], 'jxl');
  const res = await runBatch(v, slow, items, ctl.signal);
  assert.equal(res.length, 0);
  assert.equal(v.exists('pics/a.jxl'), false);
  assert.equal(v.exists('pics/b.jxl'), false);
  assert.equal(v.notes.get('n.md'), 'one ![[a.png|300]] two ![x](pics/a.png) three ![[b.jpg]]');
});

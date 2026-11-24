// LiveFrames (src/live.ts): the frames of an animation shown as they arrive, each at its place in time. A streamed one (too long to
// keep as an animated PNG) holds at most a few frames, waits while the tab is hidden and ends when nothing shows it any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveFrames} from '../src/live.js';
import type {Part} from '../src/core/engine.js';

const g = globalThis as unknown as Record<string, unknown>;
const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const part = (index: number, delayMs = 20, loops = 0): Part => ({index, delayMs, png: new Uint8Array([index]), width: 1, height: 1, loops});
function stage(hidden = false) {
  const doc = {hidden, listeners: new Set<() => void>(), addEventListener(_: string, f: () => void) { this.listeners.add(f); }, removeEventListener(_: string, f: () => void) { this.listeners.delete(f); }};
  g.window = {setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis)};
  g.document = doc;
  return {doc, show(on: boolean) { doc.hidden = !on; for (const f of [...doc.listeners]) f(); }};
}
const make = (shown: string[], streaming = true, active = () => true) => new LiveFrames(u => { shown.push(u); return true; }, active, streaming);

test('a streamed animation holds at most three frames: add() waits until the queue is down', async () => {
  stage(); const shown: string[] = [], live = make(shown); let added = 0;
  const feeding = (async () => { for (let i = 0; i < 12; i++) { await live.add(part(i)); added = i + 1; } })();
  await tick(10);
  assert.ok(added <= 4, 'added ' + added + ' before any frame had its time'); // three queued, one on its way out
  await feeding; assert.equal(added, 12); live.stop();
});

test('a streamed animation that plays once still shows its frames; a kept one leaves them to the whole animation', async () => {
  stage(); const a: string[] = [], b: string[] = [];
  const streamed = make(a, true), kept = make(b, false);
  await streamed.add(part(0, 5, 1)); await kept.add(part(0, 5, 1));
  await tick(40); assert.equal(a.length, 1); assert.equal(b.length, 0); streamed.stop(); kept.stop();
});

test('a hidden tab shows nothing until it is shown again', async () => {
  const st = stage(true); const shown: string[] = [], live = make(shown);
  void live.add(part(0, 5)); await tick(40); assert.equal(shown.length, 0);
  st.show(true); await tick(40); assert.equal(shown.length, 1); live.stop();
});

test('stop() ends a waiting add() and lets every queued frame go', async () => {
  stage(); const shown: string[] = [], live = make(shown);
  const revoked: string[] = [], real = URL.revokeObjectURL; URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  try {
    const adds = [0, 1, 2, 3, 4, 5].map(i => live.add(part(i, 1000)));
    await tick(30); live.stop(); await Promise.all(adds);
    assert.ok(revoked.length >= 3, 'revoked ' + revoked.length);
  } finally { URL.revokeObjectURL = real; }
});

test('when nothing shows the picture any more the animation ends and add() stops waiting', async () => {
  stage(); let on = true; const live = new LiveFrames(() => on, () => true, true);
  await live.add(part(0, 5)); on = false; await tick(30);
  await Promise.race([live.add(part(1, 5)), tick(200).then(() => { throw new Error('add() still waiting'); })]);
});

// The whole path of a long animation: the engine streams each loop, LiveFrames shows it, and memory holds a few frames.
import {readFileSync} from 'node:fs';
import {display} from '../src/core/engine.js';
test('two loops of a streamed animation show every frame twice with at most three waiting', {skip: !process.env.JXL_LOCAL_DECODE && 'needs a decoder with onFrame (JXL_LOCAL_DECODE)'}, async () => {
  stage(); const jxl = new Uint8Array(readFileSync(new URL('../test/fixtures/anim.jxl', import.meta.url)));
  let shown = 0, queuedPeak = 0, queued = 0;
  const live = new LiveFrames(() => { shown++; queued--; return true; }, () => true, true);
  for (let pass = 0; pass < 2; pass++) {
    await display(jxl, 40_000_000, 1_000_000, p => { queued++; queuedPeak = Math.max(queuedPeak, queued); return live.add({...p, delayMs: 5}); }, 0);
  }
  await live.finish();
  assert.equal(shown, 8); assert.ok(queuedPeak <= 4, 'peak ' + queuedPeak); live.stop();
});

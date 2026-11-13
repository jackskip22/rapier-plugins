// Converts pictures in a vault without ever losing one. No Obsidian import: the host gives a BatchPort.
import {countLinks, rewriteLinks} from './links.js';
import {join, planBatch, split, type Candidate, type Planned} from './plan.js';
import type {Check} from './engine.js';
import {sha256} from './hash.js';

export interface Stat {size: number; mtime: number}

export interface BatchPort {
  exists(path: string): boolean;
  stat(path: string): Stat | null;
  read(path: string): Promise<Uint8Array>;
  /** Creates a new file. Fails if one is already there; never replaces. */
  create(path: string, bytes: Uint8Array): Promise<void>;
  /** Notes (markdown files) that link to the file. */
  noteReferrers(path: string): string[];
  /** Every other kind of file that uses it (canvases, bases): links there are not rewritten. */
  otherReferrers(path: string): string[];
  /** Reads, changes and writes a note as one step, so an edit made at the same time is not lost. */
  processNote(path: string, change: (text: string) => string): Promise<void>;
  readNote(path: string): Promise<string>;
  /** Does this link target, written in this note, name this file? */
  refersTo(note: string, target: string, file: string): boolean;
  nameIsUnique(name: string): boolean;
  /** Obsidian's trash, by the person's own setting. Never a permanent delete. */
  trash(path: string): Promise<void>;
  /** Moves a file to a new path. Fails if a file is already there; never replaces. */
  rename(from: string, to: string): Promise<void>;
}

/** `record` is the converter's own record of the file, which the check is given back. */
export type Transformed = {bytes: Uint8Array; kept?: string; record?: unknown} | {bytes: null; reason: string};
export interface Job {
  destExt: string;
  transform(bytes: Uint8Array, ext: string, signal?: AbortSignal): Promise<Transformed>;
  verify(source: Uint8Array, ext: string, output: Uint8Array, kept?: string, record?: unknown): Promise<Check>;
  removeOriginals: boolean;
}

/** What a conversion did, bound to the identity (size and SHA-256) of the source it read and the file it made. */
export interface JournalEntry {src: string; dest: string; kept?: string; notes: string[]; removed: boolean; srcSize: number; srcSha: string; destSize: number; destSha: string}
export type Outcome =
  | {status: 'done'; src: string; dest: string; before: number; after: number; removed: boolean; notes: string[]; kept?: string; srcSha: string; destSha: string}
  | {status: 'skipped'; src: string; reason: string};

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const unchanged = (a: Stat | null, b: Stat | null) => !!a && !!b && a.size === b.size && a.mtime === b.mtime;

export function plan(port: Pick<BatchPort, 'exists'>, candidates: Candidate[], destExt: string): Planned[] {
  return planBatch(candidates, destExt, p => port.exists(p));
}

/** For a run over many pictures: those whose own name already has a converted file beside them are left out, so a second run
 * does not write `a 1.jxl` next to `a.jxl`. */
export function pending(port: Pick<BatchPort, 'exists'>, candidates: Candidate[], destExt: string): {todo: Candidate[]; done: number} {
  const todo = candidates.filter(c => { const {dir, base} = split(c.path); return !port.exists(join(dir, base, destExt)); });
  return {todo, done: candidates.length - todo.length};
}

async function relink(port: BatchPort, notes: string[], from: string, to: string): Promise<{ok: boolean; touched: string[]}> {
  const {base, ext} = split(to);
  const destName = base + '.' + ext;
  const touched: string[] = [];
  let ok = true;
  for (const note of notes) {
    const refers = (t: string) => port.refersTo(note, t, from);
    try {
      let count = 0;
      await port.processNote(note, text => {
        const r = rewriteLinks(text, {refersTo: refers, destName, destPath: to, nameIsUnique: port.nameIsUnique(destName)});
        count = r.count;
        return r.text;
      });
      // Read it back: no link may still name the old file.
      if (countLinks(await port.readNote(note), refers) > 0) ok = false;
      if (count > 0) touched.push(note);
    } catch { ok = false; }
  }
  return {ok, touched};
}

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

/**
 * Writes bytes under a name only this run makes, beside `path`: "<name>.<12 random hex>.<ext>.part". Returns its path and
 * the size and time it was written with, or null when it could not be written.
 *
 * Why: the vault has no "trash only if unchanged" and no atomic compare-and-move, so no order of stat, read and trash
 * can prove that a file at a shared name is still the one this run wrote. A name no one else knows makes a collision
 * practically impossible (2^48 names per picture). What remains: a sync or a person that writes to that same .part
 * name, and the moment between the last check and the trash or the move. A failure leaves the .part file rather than
 * guess: a leftover .part is safe; a trashed file of the person's is not.
 */
async function writePart(port: BatchPort, path: string, bytes: Uint8Array): Promise<{path: string; stat: Stat} | null> {
  const {dir, base, ext} = split(path);
  for (let tries = 0; tries < 3; tries++) {
    const part = join(dir, `${base}.${hex(6)}.${ext}`, 'part');
    if (port.exists(part)) continue;
    try { await port.create(part, bytes); } catch { continue; }
    const stat = port.stat(part);
    return stat ? {path: part, stat} : null;
  }
  return null;
}

/** Trashes a .part file this run wrote, only while it keeps the size, time and bytes it was written with; the last
 * await before the trash is the read. Returns true when it left the file because it could not tell. */
async function dropPart(port: BatchPort, part: {path: string; stat: Stat}, bytes: Uint8Array): Promise<boolean> {
  if (!port.exists(part.path)) return false;
  const now = await port.read(part.path).catch(() => null);
  if (!now || !same(now, bytes) || !unchanged(part.stat, port.stat(part.path))) return true;
  try { await port.trash(part.path); } catch { return true; }
  return false;
}

/** One picture, start to finish. The original is touched last, and only when everything before it is proved. */
async function convertOne(port: BatchPort, job: Job, item: Planned, signal?: AbortSignal): Promise<Outcome> {
  const {src, dest} = item;
  const skip = (reason: string): Outcome => ({status: 'skipped', src: src.path, reason});
  if (signal?.aborted) return skip('Canceled.');
  const before = port.stat(src.path);
  if (!before) return skip('The picture is gone.');
  if (before.size !== src.size || before.mtime !== src.mtime) return skip('The picture changed after it was listed.');
  const input = await port.read(src.path);
  const srcSha = await sha256(input);
  if (!unchanged(before, port.stat(src.path))) return skip('The picture changed while it was read.');
  const out = await job.transform(input, split(src.path).ext, signal);
  if (!out.bytes) return skip(out.reason);
  // Cancel is honored up to here, before anything is written. From the write on, this picture is finished (or undone) first.
  if (signal?.aborted) return skip('Canceled.');
  // A new file, never a replacement. It is written under a name only this run makes, read back and checked there, and
  // moved to its own name only if that name is still free.
  if (port.exists(dest)) return skip('A file appeared where the new picture goes.');
  const made = await writePart(port, dest, out.bytes);
  if (!made) return skip('A file appeared where the new picture goes.');
  const destSha = await sha256(out.bytes);
  const fail = async (reason: string): Promise<Outcome> => {
    const left = await dropPart(port, made, out.bytes);
    return skip(left ? `${reason} The new file was changed by something else and was left.` : reason);
  };
  // Read it back from the vault and check it against the source.
  const back = await port.read(made.path).catch(() => null);
  if (!back || !same(back, out.bytes)) return fail('The new file did not read back the same.');
  const check = await job.verify(input, split(src.path).ext, back, out.kept, out.record);
  if (!check.ok) return fail(check.reason);
  if (!unchanged(before, port.stat(src.path))) return fail('The picture changed while it was converted.');
  if (port.exists(dest)) return fail('A file appeared where the new picture goes.');
  try { await port.rename(made.path, dest); } catch { return fail('A file appeared where the new picture goes.'); }
  // Links, then proof that none are left.
  const notes = port.noteReferrers(src.path);
  const linked = await relink(port, notes, src.path, dest);
  const others = port.otherReferrers(src.path);
  // The original may leave only now, if the person asked, nothing else uses it, and it has not moved on.
  let removed = false;
  if (job.removeOriginals && linked.ok && others.length === 0 && unchanged(before, port.stat(src.path))) {
    const again = await port.read(src.path).catch(() => null);
    if (again && await sha256(again) === srcSha) {
      try { await port.trash(src.path); removed = true; } catch { /* stays */ }
    }
  }
  return {status: 'done', src: src.path, dest, before: src.size, after: out.bytes.length, removed, notes: linked.touched, kept: out.kept, srcSha, destSha};
}

export async function runBatch(port: BatchPort, job: Job, items: Planned[], signal: AbortSignal, onStep: (i: number, path: string) => void = () => undefined): Promise<Outcome[]> {
  const results: Outcome[] = [];
  for (let i = 0; i < items.length; i++) {
    if (signal.aborted) break;
    onStep(i, items[i].src.path);
    if (signal.aborted) break;
    try {
      const r = await convertOne(port, job, items[i], signal);
      if (signal.aborted && r.status === 'skipped' && r.reason === 'Canceled.') break;
      results.push(r);
    }
    catch (e) { if (signal.aborted) break; results.push({status: 'skipped', src: items[i].src.path, reason: e instanceof Error ? e.message : String(e)}); }
  }
  return results;
}

export const journalOf = (results: Outcome[]): JournalEntry[] =>
  results.flatMap(r => (r.status === 'done' ? [{src: r.src, dest: r.dest, kept: r.kept, notes: r.notes, removed: r.removed, srcSize: r.before, srcSha: r.srcSha, destSize: r.after, destSha: r.destSha}] : []));

export interface Left {path: string; reason: string}

/**
 * Undo a run from what it did, entry by entry, only where nothing has changed since: the new file must still be the
 * file this run made (size and SHA-256), the original, if it is there, must still be the one it read, and no
 * Canvas, base or other non-Markdown file may now use the new file. Anything else is left and reported.
 * Links go back first; the new file then goes to the trash, and a trash that fails is not an undo.
 * An original that was moved to the trash is made again from the new file when that is exact (`recreate`), under a name
 * only this undo makes (`writePart`). It is read back, byte for byte, and checked against the new file (`check`), then
 * moved to its own name only if that is free, before any link changes or the new file leaves. Otherwise the new file
 * and every link stay.
 */
export async function undoRun(port: BatchPort, journal: JournalEntry[], recreate: (entry: JournalEntry) => Promise<Uint8Array | null>,
  check: (entry: JournalEntry, made: Uint8Array) => Promise<boolean>): Promise<{undone: number; left: Left[]}> {
  let undone = 0;
  const left: Left[] = [];
  for (const e of [...journal].reverse()) {
    const hold = (path: string, reason: string) => { left.push({path, reason}); };
    const dest = port.exists(e.dest) ? await port.read(e.dest).catch(() => null) : null;
    if (!dest) { hold(e.dest, 'The new file is gone.'); continue; }
    if (dest.length !== e.destSize || await sha256(dest) !== e.destSha) { hold(e.dest, 'The new file was changed since it was made.'); continue; }
    if (port.otherReferrers(e.dest).length) { hold(e.dest, `Used by ${port.otherReferrers(e.dest)[0]}, which this plugin does not edit.`); continue; }
    if (port.exists(e.src)) {
      const src = await port.read(e.src).catch(() => null);
      if (!src || src.length !== e.srcSize || await sha256(src) !== e.srcSha) { hold(e.src, 'The original was changed or replaced since.'); continue; }
    } else {
      const bytes = await recreate(e).catch(() => null);
      if (!bytes) { hold(e.src, e.kept === 'lossy' ? 'The original was saved with loss, so it cannot be made again. It is in the trash.' : 'The original cannot be made again. It is in the trash.'); continue; }
      // Made again under a name only this undo makes, read back and checked there, then moved into place if still free.
      const made = await writePart(port, e.src, bytes);
      if (!made) { hold(e.src, 'A file is now where the original was.'); continue; }
      const back = await port.read(made.path).catch(() => null);
      const good = !!back && same(back, bytes) && await check(e, back).catch(() => false);
      if (!good || port.exists(e.src)) {
        await dropPart(port, made, bytes);
        hold(e.src, good ? 'A file is now where the original was.' : 'The original cannot be made again. It is in the trash.');
        continue;
      }
      try { await port.rename(made.path, e.src); } catch { await dropPart(port, made, bytes); hold(e.src, 'A file is now where the original was.'); continue; }
    }
    const notes = [...new Set([...port.noteReferrers(e.dest), ...e.notes])];
    const r = await relink(port, notes, e.dest, e.src);
    if (!r.ok) { hold(e.dest, 'A link could not be put back.'); continue; }
    try { await port.trash(e.dest); } catch { hold(e.dest, 'The new file could not be moved to the trash.'); continue; }
    undone++;
  }
  return {undone, left};
}

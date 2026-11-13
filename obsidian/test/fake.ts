import type {BatchPort, Stat} from '../src/core/batch.js';

/** A vault in memory. Hooks let a test change the world at the moments a real vault can change under the plug-in. */
export class FakeVault implements BatchPort {
  files = new Map<string, {bytes: Uint8Array; mtime: number}>();
  notes = new Map<string, string>();
  others = new Map<string, string[]>(); // file path -> non-note referrers
  trashed: string[] = [];
  clock = 1;
  hooks: {beforeCreate?: (p: string) => void; beforeProcess?: (note: string) => void; afterRead?: (p: string) => void} = {};
  failProcess = false;
  failTrash = false;

  add(path: string, bytes: Uint8Array) { this.files.set(path, {bytes, mtime: this.clock++}); }
  touch(path: string, bytes: Uint8Array) { this.files.set(path, {bytes, mtime: this.clock++}); }
  exists(p: string) { return this.files.has(p) || this.notes.has(p); }
  stat(p: string): Stat | null { const f = this.files.get(p); return f ? {size: f.bytes.length, mtime: f.mtime} : null; }
  async read(p: string) { const f = this.files.get(p); if (!f) throw new Error('missing ' + p); const b = f.bytes; this.hooks.afterRead?.(p); return b; }
  async create(p: string, b: Uint8Array) { this.hooks.beforeCreate?.(p); if (this.exists(p)) throw new Error('exists'); this.add(p, b); }
  noteReferrers(p: string) { const name = p.split('/').pop()!; return [...this.notes].filter(([, t]) => t.includes(name)).map(([k]) => k); }
  otherReferrers(p: string) { return this.others.get(p) ?? []; }
  async processNote(n: string, change: (t: string) => string) {
    this.hooks.beforeProcess?.(n);
    if (this.failProcess) throw new Error('could not write');
    this.notes.set(n, change(this.notes.get(n)!));
  }
  async readNote(n: string) { return this.notes.get(n)!; }
  refersTo(_note: string, target: string, file: string) { return target === file || target === file.split('/').pop(); }
  nameIsUnique(name: string) { return [...this.files.keys()].filter(k => k.split('/').pop() === name).length <= 1; }
  hooksRename?: (from: string, to: string) => void;
  async rename(from: string, to: string) {
    this.hooksRename?.(from, to);
    const f = this.files.get(from);
    if (!f) throw new Error('missing ' + from);
    if (this.exists(to)) throw new Error('exists');
    this.files.delete(from); this.files.set(to, f);
  }
  async trash(p: string) { if (this.failTrash) throw new Error('trash failed'); this.files.delete(p); this.trashed.push(p); }
}

export interface Candidate {path: string; size: number; mtime: number}
export interface Planned {src: Candidate; dest: string}

export const split = (path: string) => {
  const slash = path.lastIndexOf('/');
  const dir = slash < 0 ? '' : path.slice(0, slash);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return {dir, base: dot < 0 ? file : file.slice(0, dot), ext: dot < 0 ? '' : file.slice(dot + 1)};
};
export const join = (dir: string, base: string, ext: string) => (dir ? dir + '/' : '') + base + (ext ? '.' + ext : '');

/**
 * Plans a whole batch before any work: every input gets its own destination. A path listed twice is
 * planned once. A destination that exists, or that an earlier input takes, gets a number
 * (`shot.png` and `shot.jpg` become `shot.jxl` and `shot 1.jxl`). Names are compared without case
 * because some file systems do not tell them apart. Nothing is ever planned onto an existing file.
 */
export function planBatch(candidates: Candidate[], destExt: string, exists: (path: string) => boolean): Planned[] {
  const taken = new Set<string>();
  const seen = new Set<string>();
  const items: Planned[] = [];
  const free = (p: string) => !exists(p) && !taken.has(p.toLowerCase());
  for (const src of [...candidates].sort((a, b) => a.path.localeCompare(b.path))) {
    if (seen.has(src.path)) continue;
    seen.add(src.path);
    const {dir, base} = split(src.path);
    let dest = join(dir, base, destExt);
    for (let n = 1; !free(dest); n++) dest = join(dir, `${base} ${n}`, destExt);
    taken.add(dest.toLowerCase());
    items.push({src, dest});
  }
  return items;
}

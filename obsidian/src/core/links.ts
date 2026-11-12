// Finds and rewrites the links to one file inside a note's text. Pure functions over strings.
const WIKI = /(!?)\[\[([^\]\n|#^]*)([#^][^\]\n|]*)?(\|[^\]\n]*)?\]\]/g;
const MD = /(!?)\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)(\s+"[^"\n]*")?\)/g;

/** Ranges of fenced and inline code, where link-shaped text is not a link. */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let pos = 0, open = -1, fence = '';
  for (const line of text.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (open < 0 && m) { open = pos; fence = m[1][0]; }
    else if (open >= 0 && m && m[1][0] === fence) { ranges.push([open, pos + line.length]); open = -1; }
    pos += line.length + 1;
  }
  if (open >= 0) ranges.push([open, text.length]);
  const inline = /`[^`\n]+`/g;
  for (let m = inline.exec(text); m; m = inline.exec(text)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const isUrl = (s: string) => /^[a-z][a-z0-9+.-]*:/i.test(s);
const lastSegment = (path: string, name: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) + name : name);

export interface Rewrite {
  /** True when this link target (as written, decoded) names the file being replaced. */
  refersTo: (target: string) => boolean;
  /** The new file's name and vault path. */
  destName: string;
  destPath: string;
  /** True when no other file in the vault has the new file's name, so a bare name still finds it. */
  nameIsUnique: boolean;
}

/** Rewrites every link to the file. Keeps aliases, sizes, headings and titles. Returns the new text and how many links changed. */
export function rewriteLinks(text: string, r: Rewrite): {text: string; count: number} {
  const code = codeRanges(text);
  const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
  let count = 0;
  const target = (old: string) => (old.includes('/') ? lastSegment(old, r.destName) : r.nameIsUnique ? r.destName : r.destPath);
  let out = text.replace(WIKI, (all, bang: string, t: string, sub: string | undefined, alias: string | undefined, at: number) => {
    if (inCode(at) || !r.refersTo(t.trim())) return all;
    count++;
    return `${bang}[[${target(t.trim())}${sub ?? ''}${alias ?? ''}]]`;
  });
  // Positions in `out` differ from `text` only after a change; recompute code ranges for the second pass.
  const code2 = codeRanges(out);
  const inCode2 = (i: number) => code2.some(([a, b]) => i >= a && i < b);
  out = out.replace(MD, (all, bang: string, alt: string, raw: string, title: string | undefined, at: number) => {
    if (inCode2(at)) return all;
    const angle = raw.startsWith('<');
    const inner = decode(angle ? raw.slice(1, -1) : raw);
    const hash = inner.indexOf('#');
    const path = hash < 0 ? inner : inner.slice(0, hash);
    if (isUrl(path) || !r.refersTo(path)) return all;
    count++;
    const next = target(path) + (hash < 0 ? '' : inner.slice(hash));
    const written = angle ? `<${next}>` : encodeURI(next).replace(/\(/g, '%28').replace(/\)/g, '%29');
    return `${bang}[${alt}](${written}${title ?? ''})`;
  });
  return {text: out, count};
}

/** How many links in the text still name the file. */
export function countLinks(text: string, refersTo: (target: string) => boolean): number {
  let n = 0;
  rewriteLinks(text, {refersTo: t => { const hit = refersTo(t); if (hit) n++; return false; }, destName: '', destPath: '', nameIsUnique: true});
  return n;
}

/** Width and height from an embed's text: `300` or `300x200`. */
export function embedSize(alt: string | null): {width?: number; height?: number} {
  const m = /(?:^|\|)\s*(\d+)(?:x(\d+))?\s*$/.exec(alt ?? '');
  return m ? {width: Number(m[1]), height: m[2] ? Number(m[2]) : undefined} : {};
}

/** The size an embed was written with, from what Obsidian gives: `alt` first, then `width` and `height`. */
export function embedSizeOf(attrs: {alt?: string | null; width?: string | null; height?: string | null}): {width?: number; height?: number} {
  const fromAlt = embedSize(attrs.alt ?? null);
  if (fromAlt.width) return fromAlt;
  const w = Number(attrs.width), h = Number(attrs.height);
  return Number.isInteger(w) && w > 0 ? {width: w, height: Number.isInteger(h) && h > 0 ? h : undefined} : {};
}

/** The size written in a note's embeds of one file, from the link cache (`![[x.jxl|200]]`). Only when they all agree. */
export function embedSizeInNote(embeds: {link: string; original?: string; displayText?: string}[] | undefined, names: (link: string) => boolean): {width?: number; height?: number} {
  const sizes = new Map<string, {width?: number; height?: number}>();
  for (const e of embeds ?? []) {
    if (!names(e.link)) continue;
    const text = e.original ? e.original.replace(/^!\[\[/, '').replace(/\]\]$/, '') : e.displayText;
    const s = embedSize(text ?? null);
    sizes.set(`${s.width}x${s.height}`, s);
  }
  return sizes.size === 1 ? [...sizes.values()][0] : {};
}

export type Size = {width?: number; height?: number};
export interface EmbedAttrs {alt: string | null; width: string | null; height: string | null}

/**
 * The size an embed shows now. Obsidian reuses an embed's element when the note's text changes, and may update `alt` or
 * `width`/`height` but not both, so the one that changed since the last look wins. First look: `alt`, then the attributes.
 */
export function embedSizeNow(prev: EmbedAttrs | null, now: EmbedAttrs, last?: Size): Size {
  if (prev) {
    // Nothing changed since the last look: keep what that look chose (a stale `alt` must not win on the second look).
    if (last && prev.alt === now.alt && prev.width === now.width && prev.height === now.height) return last;
    if (prev.alt !== now.alt) { const s = embedSize(now.alt); if (s.width) return s; }
    if (prev.width !== now.width || prev.height !== now.height) { const s = embedSizeOf({width: now.width, height: now.height}); if (s.width) return s; }
    if (prev.alt !== now.alt || prev.width !== now.width || prev.height !== now.height) return {};
  }
  return embedSizeOf(now);
}

/** The `![[x.jxl|200]]` embeds of a note's text, in order: the file named and the size written. */
export function embedsInText(text: string): {target: string; size: Size}[] {
  const out: {target: string; size: Size}[] = [];
  for (const m of text.matchAll(/!\[\[([^\]|#]*\.jxl)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/gi)) out.push({target: m[1].trim(), size: embedSize(m[2] ?? null)});
  return out;
}

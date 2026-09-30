# The conformance kit

Thirteen small documents, each covering one placement fact from [the Markdown
standard](../../docs/markdown-standard.md): inline (no layout comment), width/x/align, `wrap=around`
with a real alpha silhouette, `wrap=box`, `behind`, `front`, `rotate=` on a plain raster, a foreign
SVG "drawing" already turned in its own bytes, a ring drawing whose unfilled interior takes a line of
text, both-sides wrapping around a centred picture, the neighbour search skipping a second, unrelated
picture, the neighbour search stopping at a heading, and RTL (Arabic) text.

## What each document's JSON carries

`<NN>-<name>.expected.json`, committed beside `<NN>-<name>.md`:

- `measurer` — the anchor paragraph's own resolved `font` (canvas-shaped: style/weight/size/family),
  `letterSpacing`, `lineHeight`, `direction` and `columnWidth` — the facts an implementer needs to
  reproduce the same lines with the same measurer.
- `anchorText` / `anchorFlowed` — which paragraph is the anchor, and whether a picture obstacle
  reached it at all (a plain, `behind`, or `front` document has none).
- `picture` — the picture's own natural size, its layout comment, and (when `anchorFlowed`) its
  reserved rectangle *relative to the anchor paragraph's own content box* — the same coordinate frame
  `pictureSlices`/`flowLines` expect.
- `profileHint` — which of the kit's calls reconstructs the obstacle's shape: `{kind: "bands",
  descriptor}` for `parseProfile`, `{kind: "polygon", corners}` for `polygonProfile`, `{kind:
  "rasterTilt", width, height, radiusDeg}` for `rasterTiltProfile`, or `null` for the plain
  conservative-rectangle fallback (`pictureSlices(null, …)`) — an opaque raster's own alpha profile
  is `null` too (`alphaProfile` refuses a fully opaque image on purpose; `wrap=box` with no drawing
  recipe and no rotation is the same fallback). The `bands`/`polygon` fixtures' hints are the exact
  alpha shape of the fixture's own picture, computed independently in Node from how the picture was
  built (see the generation notes at the foot of this file) — not read back from Rapier — since these
  are plain rasters/foreign SVGs and Rapier's export only serializes `data-rapier-occupancy` for its
  own drawing recipes (`docs/architecture.md`, "Layout and images").
- `lines` — the anchor's own line boxes (`left`/`top`/`right`/`bottom`), relative to its own content
  box, read from Rapier's styled export: from the reflow script's own `<span>` boxes when the
  paragraph is flowed (their `right` is the reserved *slot*'s edge, `x + width` — the script sizes
  each span to its slot and left-aligns ragged text inside it, so that is the honest thing to compare,
  not a text-measurement guess), or from `Range.getClientRects()` on the plain text otherwise (which
  *is* the glyphs' own tight extent).
- `glyphWidths` — every character the anchor's text uses, with its own measured width in that exact
  font, from this browser's `measureText`, called in isolation on one character at a time. Always
  present; the fallback `measurer.mjs` (R77) reaches for when a query is not in `measurements` below.
- `measurements` (R77) — every `(font, text)` pair Pretext's own `getMeasureContext()` was actually
  asked to measure while *this fixture's own export* ran its real reflow script, each with the exact
  width the browser gave it — captured from the exported page's own reflow as it ran.
  This is Rapier's own measurement, not a stand-in: a caller replaying the same font and text later
  gets back the *same* number, kerning and shaping included, because it is looked up, not re-derived.
  **Which fixtures carry a real trace:** only one whose picture actually pushes a flow obstacle into
  the anchor paragraph — `layout/interchange.js`'s own `prepare()` calls Pretext exclusively for a
  paragraph an obstacle reaches, so `01-inline` and `02-width-x-align` (no `wrap`, no obstacle at
  all) and `05-behind`/`06-front` (`behind`/`front` are out-of-flow by design and never push one
  either) never run Pretext during export and so have an empty `measurements` — every other fixture
  (`wrap=around`/`box`) does. `measurer.mjs`'s own `createMeasurer` merges every document's
  `measurements` and `glyphWidths` into one process-wide lookup, matching `run.mjs`'s pre-existing
  merge-once-upfront discipline (Pretext's `getMeasureContext()` memoizes its context once per
  process, so installing a fresh measurer per document would silently keep serving the first
  document's data to every later one).

## The expectations

`<name>.expected.json` is compared against the exported page's own reflow within 1.5 px; a missing one is a failure. `profileHint` is hand-computed from how each fixture's picture bytes were built ("Generation notes" below) and is restored by hand if a file is regenerated.

## Running the comparison

```sh
node run.mjs                                   # the kit itself, driven by measurer.mjs (R77)
node run.mjs --impl path/to/other-kit/index.mjs --tolerance 4
```

Prints two separate tables (preservation and presentation are different claims):

- **Preservation** — does each fixture's own layout comment round-trip exactly through
  `parseLayout`/`formatLayout`. No measurer, no font: either exactly right, or a real bug. 12/12.
- **Presentation** — does the planned line count and each line's left/right agree with the recorded
  fact, within `--tolerance` pixels (default 2). This depends entirely on the measurer supplied;
  `run.mjs`'s own default (`measurer.mjs`, R77) replays Rapier's real Pretext trace wherever one was
  captured, falling back to the character-glyph sum only where none exists. Current result: **4/13
  AGREE outright** (`04-wrap-box`, `07-rotate-raster`, `10-both-sides`, `12-heading-barrier` — every
  one a case where the compared edge is pure obstacle-slot geometry, unaffected by text fidelity
  either way), **9 CLOSE, 0 DIFFERS**, each CLOSE row's cause named rather than left as "close
  enough": `01-inline`/`02-width-x-align`/`05-behind`/`06-front` have no real trace at all (see
  `measurements` above) so still rest on the character-sum fallback; `03-wrap-around-silhouette`,
  `11-neighbour-skips-image` and `13-rtl-text` run Pretext for real during export (`13-rtl-text` at
  100% — every query of its own answered from the real trace) yet still carry a small, constant
  left-edge delta (5.18px) that is a picture-obstacle *geometry* fact, not a text one: their
  `profileHint` is a hand-computed, quantized alpha-band descriptor for a picture Rapier's own export
  never serializes an occupancy descriptor for, and that descriptor's own precision — not the
  measurer — is the residual gap. `09-drawing-ring-interior` plans the recorded 14 lines, but one row
  differs by a whole slot (115.08px left, 292.09px right): its recorded trace, taken before a word
  that must break inside itself was given the widest slot of its row, cuts "ordinary" into "ordinar"
  and "y" in the ring's narrow left slot, where the planner now leaves that slot empty and sets the
  word whole in the wide one (`layout/line-plan.mjs`). Its `expected.json` still holds the earlier cut;
  it is regenerated from a browser export, not by hand. Before this
  measurer existed (a per-character glyph-sum with no real trace at all), the same run reported 4
  AGREE / 8 CLOSE / 1 DIFFERS — `13-rtl-text` disagreed by a whole line (7 expected, 8 planned): real
  Arabic shaping (ligatures, diacritic combination) changes a run's total measured width in a way an
  isolated-character sum cannot reproduce, and that was enough to move one word to the next line. The
  real trace above fixes exactly that: `13-rtl-text` now plans the correct 7 lines.

## Generation notes (how the pictures were built)

`opaque.png` (60×40, fully opaque blue) and `diamond.png` (64×64, a Manhattan-diamond alpha mask) are
hand-built PNGs (no canvas library — a raw RGBA buffer through `zlib.deflateSync`, wrapped in
IHDR/IDAT/IEND chunks). `ring.svg` (a 200×200 stroked circle, `fill="none"`, leaving a real transparent
hole) and `rotated.svg` (a 140×100 rectangle already rotated 20° in its own `transform`) are hand-written
SVG. None of this is shipped; it only explains where each fixture's bytes and `profileHint` came from.

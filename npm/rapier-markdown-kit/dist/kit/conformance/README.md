# The conformance kit

Thirteen small documents, each covering one placement fact from [the Markdown
standard](https://github.com/jackskip22/rapier/blob/main/docs/markdown-standard.md): inline (no layout comment), width/x/align, `wrap=around`
with a real alpha silhouette, `wrap=box`, `behind`, `front`, `rotate=` on a plain raster, a foreign
SVG "drawing" already turned in its own bytes, a ring drawing whose unfilled interior takes a line of
text, both-sides wrapping around a centred picture, the neighbour search skipping a second, unrelated
picture, a rule after a picture (a barrier, so the paragraph before it anchors), and RTL (Arabic) text.

The fixtures were captured at a 30.8 px line (`measurer.lineHeight`, 1.75 × the 17.6 px body); the reference
scale's line is now 28 px at M. The line height is an input to the comparison, so the recorded lines stay
self-consistent. In `01-inline` and `12-rule-barrier` the sentence "another image paragraph, or a heading" is
measured anchor text and stays as recorded; headings do anchor pictures.

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
  own drawing recipes.
- `lines` — the anchor's own line boxes (`left`/`top`/`right`/`bottom`), relative to its own content
  box, read from Rapier's styled export: from the reflow script's own `<span>` boxes when the
  paragraph is flowed (their `right` is the reserved *slot*'s edge, `x + width` — the script sizes
  each span to its slot and left-aligns ragged text inside it, so that is the honest thing to compare,
  not a text-measurement guess), or from `Range.getClientRects()` on the plain text otherwise (which
  *is* the glyphs' own tight extent).
- `glyphWidths` — every character the anchor's text uses, with its own measured width in that exact
  font, from this browser's `measureText`, called in isolation on one character at a time. Always
  present; the fallback `measurer.mjs` reaches for when a query is not in `measurements` below.
- `measurements` — every `(font, text)` pair Pretext's own `getMeasureContext()` was actually
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

`<name>.expected.json` is compared against the exported page's own reflow within 1.5 px; a missing one is a failure.
Rows 5–13 of `09-drawing-ring-interior` come from the kit's own planner with the recorded measurer: the word-deferral
rule moves "ordinary" whole into the ring's wide slot, and the exported page wraps with a native `shape-outside` float,
which exposes no per-slot line boxes to record. `profileHint` is hand-computed from how each fixture's picture bytes were built ("Generation notes" below) and is restored by hand if a file is regenerated.

## Running the comparison

```sh
node run.mjs                                   # the kit itself, driven by measurer.mjs
node run.mjs --impl path/to/other-kit/index.mjs --tolerance 4
```

Prints two separate tables (preservation and presentation are different claims):

- **Preservation** — does each fixture's own layout comment round-trip exactly through
  `parseLayout`/`formatLayout`. No measurer, no font: either exactly right, or a real bug. 12/12.
- **Presentation** — does the planned line count, each flowed line's row (its top) and each line's left/right
  agree with the recorded fact, within `--tolerance` pixels (default 2). A wrong row is DIFFERS. This depends entirely on the measurer supplied;
  `run.mjs`'s own default (`measurer.mjs`) replays Rapier's real Pretext trace wherever one was
  captured, falling back to the character-glyph sum only where none exists. Result: **3/13
AGREE outright** (`04-wrap-box`, `10-both-sides`, `12-rule-barrier`, each a case where the compared edge is
pure obstacle-slot geometry), **10 CLOSE, 0 DIFFERS**. `01-inline`, `02-width-x-align`, `05-behind` and `06-front`
have no real trace (see `measurements` above) and rest on the character-sum fallback. `03-wrap-around-silhouette`,
`11-neighbour-skips-image` and `13-rtl-text` run Pretext for real yet carry a constant 9.64px left-edge delta, a
picture-obstacle geometry fact: their `profileHint` is a hand-computed, quantized alpha-band descriptor. `09` carries
7.8px of the same kind. `07-rotate-raster` and `08-drawing-rotation` have right-edge geometry deltas of 4.48px and
5.31px, with no measurer calls.

## Generation notes (how the pictures were built)

`opaque.png` (60×40, fully opaque blue) and `diamond.png` (64×64, a Manhattan-diamond alpha mask) are
hand-built PNGs (no canvas library — a raw RGBA buffer through `zlib.deflateSync`, wrapped in
IHDR/IDAT/IEND chunks). `ring.svg` (a 200×200 stroked circle, `fill="none"`, leaving a real transparent
hole) and `rotated.svg` (a 140×100 rectangle already rotated 20° in its own `transform`) are hand-written
SVG. None of this is shipped; it only explains where each fixture's bytes and `profileHint` came from.

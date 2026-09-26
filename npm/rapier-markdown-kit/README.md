# rapier-markdown-kit

Read and write Rapier Markdown without the editor: picture layout, text marks, the line planner, Will
markers and the picture appendix. MIT, no dependencies, Node 22 or newer.

```sh
npm install rapier-markdown-kit
```

```js
import {parseLayout} from 'rapier-markdown-kit/layout';   // the md-layout comment a picture carries
import {scanColorMarkers, formatPageBreak} from 'rapier-markdown-kit/marks';   // colour runs and page breaks
import {flowLines} from 'rapier-markdown-kit/model';      // the line planner: text around pictures
import {parseWill} from 'rapier-markdown-kit/will';       // Will/1 markers: keep, append, edit
import {parseAssets} from 'rapier-markdown-kit/assets';   // the picture appendix
```

**What it does**
- Parses, validates and writes back the `md-layout:v1` comment that places a picture: width, wrap,
  position.
- Lays text out around a picture's shape exactly as Rapier does, given the host's font metrics.
- Reads and writes colour and page-break marks.
- Reads Will/1 markers (a separate, optional standard) and says what a region's law allows.
- Reads the picture appendix, the reference definitions a document's pictures live in, without decoding
  a picture.

**What it is not**
- Not the editor, not Draw, not the image decoders. Every convention is plain Markdown or an HTML
  comment other readers ignore. The text layout engine it uses, Pretext, is vendored with its own MIT
  licence.

## What it gives you

| Import | What it is |
| --- | --- |
| `rapier-markdown-kit/layout` | The `md-layout:v1` comment a picture carries: parse it, validate it, write it back. |
| `rapier-markdown-kit/marks` | Text colour and page-break markers. |
| `rapier-markdown-kit/model` | Occupancy profiles and the line planner: the wrapping itself. |
| `rapier-markdown-kit/will` | The Will/1 grammar (a separate, optional standard): the markers around an agent's intent regions. |
| `rapier-markdown-kit/assets` | The picture appendix: the reference definitions a document's pictures live in. It never decodes a picture. |
| `rapier-markdown-kit` | All five in one import. |

Every convention here is plain Markdown or an HTML comment that other readers ignore. Laying lines
out exactly as Rapier does also takes the same font metrics, which the host supplies (below).

## Example

Save this as `example.mjs` in the folder you installed into and run `node example.mjs`. It prints
`lines: 4 height: 80`.

```js
import {parseLayout} from 'rapier-markdown-kit/layout';
import {parseProfile, pictureSlices, prepareRun, flowLines, prepareRichInline} from 'rapier-markdown-kit/model';
const {loadDocuments, installMeasurer} = await import(new URL(
  './dist/kit/conformance/measurer.mjs', import.meta.resolve('rapier-markdown-kit/package.json')));

// Text metrics: the widths the conformance documents recorded in Rapier's own browser, standing in
// for a font shaper so the example runs anywhere (see "What the host supplies").
installMeasurer(loadDocuments());

// 1. Parse the layout comment a picture carries.
const layout = parseLayout('<!--md-layout:v1 width=40% wrap=around x=25%-->');
// => {width: 40, wrap: 'around', x: 25}

// 2. The picture's shape: the occupancy descriptor Rapier's exports carry beside a picture
// (`data-rapier-occupancy`, one left-right pair per horizontal band), placed as obstacles.
const profile = parseProfile('0.1-0.9|0.2-0.8|0.3-0.7');
const obstacles = pictureSlices(profile, /* x */ 0, /* y */ 0, /* width */ 120, /* height */ 90);

// 3. Plan the lines of a paragraph around those obstacles.
const text = 'This anchor paragraph carries enough ordinary prose', font = 'normal 400 17.6px Geist, system-ui, sans-serif';
const run = prepareRun(text, font);
const flow = prepareRichInline([{text: run.raw, font, letterSpacing: 0}]);
const plan = flowLines(flow, /* column width */ 300, /* top */ 0, obstacles, /* line height */ 20, /* min slot */ 40);
// Each line carries its own x, y and width, and the text fragments laid into it.
console.log('lines:', plan.lines.length, 'height:', plan.height); // lines: 4 height: 80
```

## What the host supplies

`prepareRun` and `prepareRichInline` measure text the way a browser does: they need a global
`OffscreenCanvas` (or a DOM `document`) whose `getContext('2d')` has a settable `font` and a
`measureText(text)` returning `{width}`. A browser has one already; in Node, put those two members
in front of whatever shaper you have. The example replays recorded measurements instead, and a
query they never recorded falls back to summing single characters, without kerning or shaping.

`alphaProfile(image)` samples a decoded `<img>` through a canvas, so it needs a browser. Without
one, read the saved descriptor with `parseProfile`, or sample the picture with your own image
library. `polygonProfile` and `rasterTiltProfile` are plain geometry.

The appendix parser takes a markdown-it-compatible parser factory from the caller
(`parseAssets(source, factory)`, or once through `configureParser`); no parser is bundled.

## Conformance

```sh
node node_modules/rapier-markdown-kit/dist/kit/conformance/run.mjs
```

Thirteen small documents, each with the line boxes Rapier's own export produced for it. The runner
reports two things separately. **Preservation**: every layout comment round-trips exactly (12 of
the 12 documents that carry one). **Presentation**: how closely the planned lines match (4 agree
within 2px, 9 are close, none differ); each close row has a named cause, given in the runner's
output and in `dist/kit/conformance/README.md`. `--impl path/to/module.mjs` runs another
implementation against the same documents; `--tolerance 2` sets the pixel tolerance.

## Licence

MIT, the full text in `LICENSE`; every module keeps its own MIT line. Pretext's licence, notice and
pinned source inventory are in `dist/agent/vendor/pretext/`. The Rapier editor is AGPL-3.0-only and
none of it is in this package. The kit's version is its own and does not follow the editor's.

## Where the modules live

Each module of the standard has one home in the Rapier source (`spec/`, `layout/`, `agent/`), where Rapier itself reads it; `dist/` is that closure copied byte for byte, so an installed copy needs nothing beside it.

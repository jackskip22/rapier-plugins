# rapier-markdown-kit

Read, write and style Self-contained Markdown without the editor: the universal style pack, picture layout,
text marks, the line planner, Will markers and the picture appendix. MIT, no dependencies, Node 22 or newer.

To hand a person the whole editor around their document as one offline file, run `npx rapier-html notes.md`.
The same command accepts a drawing or an SVG.

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

## What it gives you

| Import | What it is |
| --- | --- |
| `rapier-markdown-kit/layout` | The `md-layout:v1` comment a picture carries: parse it, validate it, write it back. |
| `rapier-markdown-kit/marks` | Text colour and page-break markers. |
| `rapier-markdown-kit/model` | Occupancy profiles and the line planner: the wrapping itself. |
| `rapier-markdown-kit/will` | The Will/1 grammar (a separate, optional standard): the markers around an agent's intent regions. |
| `rapier-markdown-kit/assets` | The picture appendix: the reference definitions a document's pictures live in. It never decodes a picture. |
| `rapier-markdown-kit/style.css` | The reference style: type, lists, tables, tasks, pictures and the document's other markup, scoped to `.md-render`. |
| `rapier-markdown-kit` | All five in one import. |

Every convention is plain Markdown or an HTML comment other readers ignore. Laying lines out as Rapier does takes
the host's font metrics (below).

## Render with the reference style

Import `rapier-markdown-kit/style.css` in a CSS-aware bundler, or copy that file beside your HTML and
link it with `<link rel="stylesheet" href="style.css">`. Put rendered content inside
`<main class="md-render">`. The sheet follows the system theme; `data-md-theme="light"` or `"dark"`
on that root chooses one. Its `--md-*` properties are defined by the sheet itself. Geist and Geist Mono
are named font families with system fallbacks; no font or external asset is fetched by the sheet.

The example below renders trusted Markdown with `markdown-it` and the kit's readers: run
`npm install rapier-markdown-kit markdown-it@15`, save it as `render.mjs`, run `node render.mjs` and open
`styled.html`, which uses only `style.css`. It shows core Markdown, GFM tables, an aligned paragraph, a sized
picture, a named colour and a page break; tasks, footnotes and diagrams are the caller's plugins. The full markup
contract is [Reference style](https://github.com/jackskip22/rapier/blob/main/docs/markdown-standard.md#reference-style).

<!-- reference-style-example -->
```js
import MarkdownIt from 'markdown-it';
import {parseLayout, formatLayout, imageStyle} from 'rapier-markdown-kit/layout';
import {TEXT_COLOR_NAMES, formatColorRun, formatPageBreak, parseColorOpen, isColorClose, isPageBreakBlock} from 'rapier-markdown-kit/marks';
import {installMarkdownImages} from 'rapier-markdown-kit/assets';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const md = installMarkdownImages(new MarkdownIt({html: true, linkify: true}));
md.renderer.rules.table_open = (tokens, index, options, env, renderer) =>
  '<div class="table-scroll-wrap">\n' + renderer.renderToken(tokens, index, options);
md.renderer.rules.table_close = (tokens, index, options, env, renderer) =>
  renderer.renderToken(tokens, index, options) + '</div>\n';
md.core.ruler.after('inline', 'reference-layout', state => {
  for (let i = 1; i < state.tokens.length; i++) {
    const inline = state.tokens[i], owner = state.tokens[i - 1];
    if (inline.type !== 'inline' || !['paragraph_open', 'heading_open'].includes(owner.type)) continue;
    const children = inline.children, marker = children.at(-1);
    const layout = marker?.type === 'html_inline' ? parseLayout(marker.content) : null;
    if (!layout) continue;
    children.pop();
    if (layout.align) owner.attrSet('data-md-align', layout.align);
    const visible = children.filter(token => token.type !== 'text' || token.content.trim());
    if (visible.length === 1 && visible[0].type === 'image' && layout.width) {
      visible[0].attrSet('style', imageStyle(layout));
      visible[0].attrSet('data-md-image-width', String(layout.width));
    }
  }
});
md.core.ruler.after('inline', 'reference-colour', state => {
  for (const inline of state.tokens) {
    if (inline.type !== 'inline') continue;
    let open = null, depth = 0;
    for (const token of inline.children) {
      if (token.type !== 'html_inline') {
        depth += token.nesting;
        if (open && depth < open.depth) open = null;
        continue;
      }
      if (isColorClose(token.content) && open && depth === open.depth) {
        Object.assign(open.token, {type: 'reference_colour_open', tag: 'span', nesting: 1, content: ''});
        open.token.attrSet('data-md-color', open.hex);
        open.token.attrSet('style', '--md-color:' + open.hex);
        Object.assign(token, {type: 'reference_colour_close', tag: 'span', nesting: -1, content: ''});
        open = null;
      } else {
        const hex = parseColorOpen(token.content);
        if (hex && !open) open = {token, hex, depth};
      }
    }
  }
});
const htmlBlock = md.renderer.rules.html_block;
md.renderer.rules.html_block = (tokens, index, options, env, renderer) =>
  isPageBreakBlock(tokens[index].content)
    ? '<div class="rapier-page-break" data-md-break="page" role="separator" aria-label="Page break"></div>\n'
    : htmlBlock(tokens, index, options, env, renderer);

export function renderReferenceDocument(source) {
  return md.render(source);
}

export const exampleSource = [
  '# A document everywhere',
  '',
  'One paragraph with **weight**, *emphasis*, `inline code` and a [link](https://example.com).',
  '',
  '## Lists and tables',
  '',
  '1. First numbered item',
  '2. Second numbered item',
  '   - A nested bullet',
  '   - Another nested bullet',
  '',
  '| Subject | Detail |',
  '| --- | --- |',
  '| Style | Shared by editor and page |',
  '',
  '> A quoted paragraph.',
  '',
  '### A little code',
  '',
  '~~~text',
  'plain code',
  '~~~',
  '',
  'A centred paragraph.' + formatLayout({align: 'center'}),
  '',
  'A ' + formatColorRun(TEXT_COLOR_NAMES.blue, 'blue phrase') + ' keeps its named colour.',
  '',
  '![A square](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDAkAAAAASUVORK5CYII=)' + formatLayout({width: 45, align: 'center'}),
  '',
  '<details open><summary>Details</summary><p>A little more to read.</p></details>',
  '',
  formatPageBreak(),
  '',
  'The next printed page.',
].join('\n');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile('style.css', await readFile(new URL(import.meta.resolve('rapier-markdown-kit/style.css'))));
  await writeFile('styled.html', '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared style</title>' +
    '<link rel="stylesheet" href="style.css"><main class="md-render">' +
    renderReferenceDocument(exampleSource) + '</main></html>');
  console.log('Wrote styled.html and style.css');
}
```

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

A heading, which the style pack balances, takes its font size as an eighth argument
(`flowLines(flow, width, top, obstacles, lineHeight, minSlot, direction, fontSize)`): its lines come out as
Chromium lays `text-wrap: balance`, and greedy wherever an obstacle narrows a line.

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

Thirteen small documents, each with the line boxes Rapier's own export produced for it. **Preservation**: every
layout comment round-trips exactly (12 of 12 that carry one). **Presentation**: how closely the planned lines match
(3 agree within 2px, 10 are close with a named cause, none differ; `dist/kit/conformance/README.md`).
`--impl path/to/module.mjs` runs another implementation against the same documents; `--tolerance 2` sets the pixel
tolerance.

## Licence

MIT, the full text in `LICENSE`; every module and the stylesheet keep their own MIT line. Pretext's licence, notice and
pinned source inventory are in `dist/agent/vendor/pretext/`. The Rapier editor is AGPL-3.0-only and
none of it is in this package. The kit carries Rapier's release number, written from the one
value the editor's release reads.

## Where the modules live

Each module has one home in the Rapier source (`spec/`, `layout/`, `agent/`), where Rapier itself reads it; `dist/`
is that closure copied byte for byte, and `style.css` is the same `spec/markdown-style.css` Rapier bundles.

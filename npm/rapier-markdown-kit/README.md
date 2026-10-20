# rapier-markdown-kit

Read, render and write Self-contained Markdown in browsers and Node: one `.md` file with pictures, editable SVG
drawings, layout and precise inline typography. Build portable documents for people and agents. Will/1 regions mark what an agent
may edit, append to or preserve. MIT, no dependencies.

- Typography uses ordinary inline HTML spans with validated size, color and family. Comments and references
  carry other optional facts; each reader chooses its HTML, style, extension and resource support.
- One stylesheet renders the document as the editor and its exported page do.
- The line planner flows text around a picture's real shape; a conformance suite of thirteen documents runs
  any implementation against it.
- Will/1 markers say which regions an agent may edit, only add to, or must keep.
- MIT, no dependencies, Node 22 or newer.

To show documents in your app without writing a renderer, frame the read-only reader with
`npm install rapier-embed` (`build: 'reader'`). To hand a person the whole editor around their document as one
offline file, run `npx rapier-html notes.md`.

In the editor, an agent edits live beside the person or while they are away. Rapier shows its presence and changes;
the person taps a change to see what was there before and undoes anything. `show {target:"comparison"}` lets the agent
deliberately show a diff. The kit supplies the portable source and history those tools use.

```sh
npm install rapier-markdown-kit
```

Render a document with [markdown-it](https://github.com/markdown-it/markdown-it), then style it with
`rapier-markdown-kit/style.css` inside `<main class="md-render">`:

```js
import MarkdownIt from 'markdown-it';
import {rapierMarkdown} from 'rapier-markdown-kit/markdown-it';

const html = new MarkdownIt({html: true}).use(rapierMarkdown).render('# Plan\n\nShips **Friday**.\n');
```

Keep a document's history with authorship, and merge two offline copies:

```js
import {openLedger, replaceLedgerText, merge, authorship} from 'rapier-markdown-kit/rapier-ledger';

const base = openLedger('Draft\n');
const edited = replaceLedgerText(base, 'Draft, revised\n', {actor: {kind: 'human', id: 'ana'}});
console.log(merge(edited, base).text, authorship(edited).runs);
```

TypeScript declarations ship for `markdown-it`, `will`, `rapier-ledger`, `ledger/carried` and `pdf`.

```js
import {parseLayout} from 'rapier-markdown-kit/layout';   // the md-layout comment a picture carries
import {typography, formatPageBreak} from 'rapier-markdown-kit/marks';   // inline typography and page breaks
import {flowLines} from 'rapier-markdown-kit/model';      // the line planner: text around pictures
import {parseWill} from 'rapier-markdown-kit/will';       // Will/1 markers: keep, append, edit
import {parseAssets} from 'rapier-markdown-kit/assets';   // the picture appendix
```

## Choose a Rapier workflow

Rapier is a phone-first Markdown editor for notes, diagrams, drawing and watercolor painting. It runs offline
as one HTML file on Android, Web and Windows.

1. **Work together live.** Connect to `https://mcp.rapier.website/mcp`, then call `open` to share one document with the person.
2. **Deliver an offline editor.** Run `npx rapier-html notes.md` to put the document and editor in one HTML file ([rapier-html](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-html)).
3. **Embed in your app.** Install [rapier-embed](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-embed); mount the editor or reader, with your app's agent over WebMCP in the editor.
4. **Keep portable Markdown.** Use [rapier-markdown-kit](https://github.com/jackskip22/rapier-plugins/tree/main/npm/rapier-markdown-kit) for pictures, editable SVG drawings and layout in one `.md` file. Respect [Will/1](https://github.com/jackskip22/will) `keep`, `append` and `edit` regions.
5. **Encode JPEG XL.** Install [rapier-jxl](https://github.com/jackskip22/rapier-jxl) to encode pixels, photographs and existing JPEGs in JavaScript.
6. **Host the door.** Run [rapier-server](https://github.com/jackskip22/rapier/tree/main/server) over your own folder or S3-compatible bucket.

## The shared renderer

To render Markdown in your own app, use `rapier-markdown-kit/markdown-it` (above). The render factories below are the
editor's own seam: each needs a `host` that supplies its DOM, Markdown, picture, style and font ports.

`rapier-markdown-kit/render` exports `createRenderer`, `createMarkdownRenderer`,
`createRenderStyles`, `createRenderSanitizer` and `createPrintRenderer`, plus the explicit font helpers
`exportFontCss`, `requireDocumentFonts`, `fontRequests`, `waitForFonts` and `waitForFontRequests`. These are the
functions used by the editor and exported pages. Each factory takes explicit host dependencies
in its first argument. `style.css` is the
MIT `spec/markdown-style.css`, including the numbered-list, checkbox, callout, table,
footnote and picture-layout treatment.

```js
import {createRenderer} from 'rapier-markdown-kit/render';

// host binds the DOM, Markdown, image, style and font capabilities described below.
// Preparation returns a detached semantic root; source comes from this captured request.
const writer = createRenderer(host);
const {html, filename} = await writer.render(source, {filename: 'report.md'});
```

`createMarkdownRenderer(host).render(source, metadata)` returns the semantic HTML.
`createMarkdownRenderer(host).renderWithMathML(source, metadata)` returns
`{html, equations}` using the ready host math provider's `renderWithMathML` operation.
The provider must also support the existing `renderToString` operation.
Each equation is parsed once for its SVG and MathML. The HTML stays identical to
ordinary SVG rendering; `equations` follows render order and carries `source`
(the admitted token spelling, including its delimiters), `tex`, `displayMode`, `semantics`, and SVG
`errors`. Pass `{docKind: 'markdown'}` as metadata for Markdown documents.
The existing Markdown grammar may normalize display-block indentation; the original
document remains the source of untouched document bytes.
Inspect both `errors` and `semantics.status`: a rendered SVG can have refused or
partial semantic output. The method throws if the combined provider is unavailable
or fails, rather than returning an empty semantic success. It does not return an AST.

This explicit method makes structured output available to consuming applications;
Rapier's live editor and ordinary HTML/DOCX/print exports still use the current
engine's Latin Modern SVG path. They do not insert hidden MathML, synthesize speech,
or claim screen-reader qualification. A consumer that inserts MathML must preserve
its namespace and semantics/annotation elements, name enclosing links meaningfully,
and qualify its own accessibility presentation. The current ordinary document
sanitizer is not a MathML composition API.

The page writer's `render` returns `{html, filename}` asynchronously and preserves the
original source, including BOM and line endings, in the SHA-256-verified source carrier.
Every existing lower-level method is also returned for hosts that compose the stages.
Create a new bound instance when its parser or host state changes; do not share mutable
DOM objects between document realms.

This **DOM-hosted library** requires a DOM and sanitizer, the Rapier grammar,
portable image preparation, style access and the named codec/layout ports it uses.
Those dependencies keep their own licenses: the MIT grant here does not relicense a
separately supplied host or vendor. The [editor host binding](https://github.com/jackskip22/rapier/blob/main/src/editor/render-host.js)
lists the renderer's dependencies. [rapier-server](https://github.com/jackskip22/rapier/blob/main/server/README.md)
provides a complete local host with a pinned Chromium process. Its Word exporter and filesystem service are AGPL,
not part of this MIT package.

Serialization tests preserve source bytes through HTML export and recovery. Server integration
tests also check the exported HTTP response through a browser DOM.

### Fonts in exported HTML

Settings HTML and Share pages use the same offline font policy. The writer reads custom font
definitions from the captured Markdown and carries their exact bytes and face metadata. A used
custom family must have valid embedded data; otherwise export stops without changing the document.
Font preparation and binary validation are explicit host capabilities:

| Host port | Contract |
| --- | --- |
| `materializeDocumentFonts(source, {parser})` | Optional at `render()` entry; returns the prepared Markdown string or a promise for it. Without this port, the caller supplies already portable, captured Markdown. Materialization must preserve explicit font authority and return source for this request. |
| `validateFont(bytes, {family, format})` | Validates a `Uint8Array` and returns exactly `true`, synchronously or asynchronously, only on admission. Required used custom fonts refuse with `export_font_unavailable` if the port is absent and `export_font_invalid` if it returns another value. Host errors and cancellation propagate. |

Browser hosts additionally check the exact captured container with an uninstalled `FontFace`.
Without `FontFace`, only the host validator's admission is established; it does not establish
browser container support. The HTML font helpers do not bundle the application's font importer,
container codecs or subsetter. Rapier binds its existing materializer and shared importer at `editor/render-host.js` through
`editor/export-fonts.mjs`; those implementations retain their application license.
An embedded family named Geist or Geist Mono remains custom data and takes precedence over the
factory family. Custom fonts have no optional factory size limit.

Factory typography may add a genuine subset of Geist Sans for the page's actual text, using the
host's subsetter. `exportFontCss` accepts `subset` and `validateFont` ports; with `portableFactory:true`,
missing or unsuccessful validation omits this optional CSS. The complete set of used factory faces must fit both 8 KiB of font payload and
12 KiB of emitted font CSS, including base64. If subsetting is unavailable, unsafe, unchanged or too
large, the page uses the existing local/system fallback. HTML never carries factory Geist Mono;
code and native diagram labels retain their existing monospace fallbacks. No font is downloaded
when the saved file is opened, and optional factory fonts never enter the carried Markdown.

Publishing HTML remains a fragment: it carries only its custom font declarations and local
body, heading, code and inline choices, without a page wrapper or a factory bundle. The host must
permit inline styles and data fonts. Two fragments with different custom faces under the same
family name share the host's font namespace. Print retains its existing factory font policy.

## What it gives you

| Import | What it is |
| --- | --- |
| `rapier-markdown-kit/markdown-it` | `md.use(rapierMarkdown)`: the reference style's markup in markdown-it, in one line. |
| `rapier-markdown-kit/layout` | The `md-layout:v1` comment a picture carries: parse it, validate it, write it back. |
| `rapier-markdown-kit/marks` | Unified typography values, span writer and parser installer; preserved color/font comments, ink and page breaks. |
| `rapier-markdown-kit/model` | Occupancy profiles and the line planner: the wrapping itself. |
| `rapier-markdown-kit/typography` | Source-preserving paragraph refinement through `createTypography()`. |
| `rapier-markdown-kit/will` | The Will/1 grammar (a separate, optional standard): the markers around an agent's intent regions. |
| `rapier-markdown-kit/assets` | The picture appendix: the reference definitions a document's pictures live in. It never decodes a picture. |
| `rapier-markdown-kit/style.css` | The reference style: type, lists, tables, tasks, pictures and the document's other markup, scoped to `.md-render`. |
| `rapier-markdown-kit/rapier-ledger` | The MIT edit ledger: `openLedger`, replay, authorship, selective Undo, offline `merge`, three-way `mergeText`, and the carried parts. |
| `rapier-markdown-kit/pdf` | `attachPdfSource`: attach the exact source to a PDF without rewriting its pages; `readPdfPageCount`. |
| `rapier-markdown-kit/ledger/carried` | Checked optional parts for pages and saved Markdown. |
| `rapier-markdown-kit` | Named exports from the layout, marks, model, typography, Will, assets and render modules, plus the `ledger` namespace. |

The canonical inline form is ordinary HTML inside Markdown. CSS support varies; the host's font metrics still
determine line layout (below).

## Refined paragraphs

The existing comment expresses the paragraph's intent without storing font-dependent line breaks:

```md
Words stay in their original source. <!--md-layout:v1 align=justify hyphens=auto hanging=on-->
```

`align=justify` alone keeps native justification. With `hyphens=auto`, the browser adapter chooses a paragraph-wide
plan using the same pinned Pretext analysis, shaping and actual-font authority as picture wrapping. It prefers
whole words, bounds ordinary spaces to 60–180% of their natural advance, permits at most two consecutive
discretionary endings, and starts the final line with a whole word. A short final line costs more; the final line
is never stretched. Authored compound hyphens are ordinary break opportunities, distinct from discretionary ones.
In very narrow measures, bounded spaces can leave some ragged edges. There is no paragraph-length switch.

Automatic cuts keep at least three graphemes on each side, with at most one automatic split per word. ASCII words
under `en` and `en-US` use the included Kuiken/Plain TeX pattern data and exceptions. Other English regions,
non-ASCII words and other admitted languages ask the browser's offline hyphenator for legal positions. That path
requires native `hyphenate-limit-chars` support; otherwise the paragraph stays native. Available dictionaries and
their divisions depend on the host. The included American patterns are a deliberate alternative to native data,
not a promise of identical opportunities in every browser. No language or font data is downloaded.

The projection displays a hyphen-minus from the affected text face, measured by Pretext as part of the whole
prefix. It never adds a source hyphen. Explicit authored `hyphenate-character` stays native. With `hanging=on`,
measured punctuation extends only into available unclipped margins, by at most half an em. Refinement adds no
letter tracking; authored supported letter spacing remains part of its shaping contract.

```js
import {createTypography} from 'rapier-markdown-kit/typography';

const refinement = createTypography();
await document.fonts.ready;
function update() {
  if (refinement.apply(root).pending) requestAnimationFrame(update);
}
update();
for (const event of ['copy', 'cut']) document.addEventListener(event, () => {
  if (refinement.clearSelection(root)) requestAnimationFrame(update);
}, true);
// On a width change, call update() again. Source/style/font changes are revalidated.
// Before native editing or consuming this disposable DOM projection:
refinement.clear(root);
// When retiring the root:
refinement.retire(root);
```

`apply()` works on visible paragraphs and yields at completed preparation phases or word batches after an 8 ms
allowance. A single native shaping call can exceed that allowance; it is not a hard execution deadline. Pending
paragraphs remain native and readable. Each continuation revalidates source, style and font authority, and chooses
lines at the current width only after all required metrics finish. `{all:true}` performs the same complete work
synchronously for explicit capture or a print host with an established content width. Width changes reuse current measured geometry, and unchanged break
topology reuses projection nodes. Bind font loading, completion and failure to `invalidateFonts(document)` and
schedule `apply()`; a changed font generation removes stale projections before new preparation.

The adapter retains original text, semantic elements and listeners, backward selections, hard breaks, protected
code/nowrap atoms, NBSP, SHY and Unicode source coordinates. `clearSelection()` restores selected inline trees
before native clipboard capture; schedule refinement afterward as above. The editor and complete exported pages
bind this lifecycle themselves. Active editing/composition stays native. Unsupported
scripts, direction, shaping controls, initials and picture-flow paragraphs also stay native. The current adapter
admits horizontal LTR Latin, Greek, Cyrillic and common/inherited characters on Chrome/Chromium; native font
coverage and language support still apply. A font-family name is never a substitute for a loaded actual face.

Complete exported pages carry the same single module graph, CSP nonce, offline language data and font lifecycle.
Their readiness promise completes after the visible refinement queue; scrolling refines newly visible paragraphs.
Before print, an authored paper size supplies the fixed content width and all paragraphs finish synchronously.
Automatic-paper browser printing clears the projection and uses native CSS: `beforeprint` may still report the
screen viewport rather than the selected paper. Scoped fragments and `scripts:false` output also retain native CSS. The American data's separate permissive notice and exact provenance accompany the kit;
Pretext retains its own complete notices. These vendor notices are not replaced by the kit's MIT grant.

## One inline typography form

```md
Plain prose needs no typography markup.

A <span style="font-size:13.5pt;color:#175dc4">precise **phrase**</span>.

## <span style="font-size:9.25pt;font-family:serif">Still a semantic H2</span>

<span style="font-size:18px;color:#175dc4;font-family:&quot;Coastal Text&quot;">An offline custom run</span>

[font:Coastal Text]: data:font/woff2;base64,<font-bytes> '{"family":"Coastal Text","sourceId":"f0123456789abcdef01234567"}'
```

The font bytes and identity in that last example are placeholders; a host derives identity from admitted bytes.
A family name alone is not a portable font. Default prose needs no font reference. Custom faces keep the existing
font-data authority, including a name that collides with a factory face.

`typography.normalize({size, color, family})` validates a style. `typography.wrap(style, inlineMarkdown)` writes one
inline span; split block selections and keep their `#`, list markers and separators outside. `typography.parseStyle`
returns only admitted facts. `typography.install(md)` installs that interpretation on the caller's markdown-it
parser, and `typographySourceRanges(source, md)` reports original UTF-16 wrapper ranges through that parser.
These calls neither mutate the source nor load resources. The installer also reads already-authored color and
font comments into the same facts; an ordinary open/save must preserve their bytes, not rewrite them as spans.

Sizes accept positive decimal `pt`/`px`, at most 12 fractional digits, up to 1638pt/2184px; 96px = 72pt. New values
use lowercase units and omit insignificant zeros. Colors become lowercase six-digit RGB hex; opaque integer
RGB CSSOM values are also read. Families are one validated name, an unquoted CSS generic, or an existing preset
stack. `sans`, `serif`, `mono`, `system`, `hand` are reserved choice aliases, not quoted custom identities. Styles
are bounded to 4096 characters, 32 declarations and 64 paired levels. Invalid declarations and unknown properties
are ignored; invalid/unclosed style strings admit no facts. Inner spans override individual properties. An editor
clearing a selection removes that property's overrides and preserves the surrounding words' styles.

Keep each opener with its first words and each closer with its last words. Soft/hard breaks may stay inside one paragraph; blank lines cannot. An opener alone on a line can become a raw HTML block.
With inline HTML enabled, the new form preserves words, emphasis,
links and heading rank; GitHub strips the styles, and HTML-disabled readers may show the tags. Rapier's **Copy
markdown without typography** removes recognized wrappers while retaining semantic Markdown and literal code.
Its separate Pandoc/Quarto copy option writes bracketed spans deliberately; Pandoc HTML carries the CSS, but
ordinary LaTeX and native DOCX styling do not follow automatically.

Rapier's own Word adapter writes native run properties, rounding to the nearest half-point with positive ties up
and refusing results outside 1–3276 half-points. The unchanged DOCX source carrier keeps original decimals and units;
native import reports represented direct-run/character-style sizes without repeating document or paragraph defaults
as inline marks. It does not reproduce an arbitrary Word style sheet. HTML and print/PDF retain the same admitted facts at the default reference
unit, independent of editor zoom. No mapping claims identical glyphs or line breaks across applications.

See the original [typography guidance](https://github.com/jackskip22/rapier/blob/main/docs/markdown-standard.md#inline-typography),
[CommonMark raw HTML](https://spec.commonmark.org/0.31.2/#raw-html), [CSS absolute units](https://www.w3.org/TR/css-values-4/#absolute-lengths),
[Pandoc spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) and [Quarto spans](https://quarto.org/docs/authoring/markdown-basics.html#divs-and-spans).
Those specifications retain their own licenses.

## Render with the reference style

Import `rapier-markdown-kit/style.css` in a CSS-aware bundler, or copy that file beside your HTML and
link it with `<link rel="stylesheet" href="style.css">`. Put rendered content inside
`<main class="md-render">`. The sheet follows the system theme; `data-md-theme="light"` or `"dark"`
on that root chooses one. Its `--md-*` properties are defined by the sheet itself. Geist and Geist Mono
are named font families with system fallbacks; no font or external asset is fetched by the sheet.

The example below renders trusted Markdown with `markdown-it` and the kit's readers: run
`npm install rapier-markdown-kit markdown-it@15`, save it as `render.mjs`, run `node render.mjs` and open
`styled.html`, which uses only `style.css`. It shows core Markdown, GFM tables, an aligned paragraph, a sized
picture, a precise combined run, a semantic heading and a page break; tasks, footnotes and diagrams are the caller's plugins. The full markup
contract is [Reference style](https://github.com/jackskip22/rapier/blob/main/docs/markdown-standard.md#reference-style).

<!-- reference-style-example -->
```js
import MarkdownIt from 'markdown-it';
import {rapierMarkdown} from 'rapier-markdown-kit/markdown-it';
import {formatLayout} from 'rapier-markdown-kit/layout';
import {TEXT_COLOR_NAMES, typography, formatColorRun, formatPageBreak} from 'rapier-markdown-kit/marks';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const md = new MarkdownIt({html: true, linkify: true}).use(rapierMarkdown);

export function renderReferenceDocument(source) {
  return md.render(source);
}

export const exampleSource = [
  '# A document everywhere',
  '',
  'One paragraph with **weight**, *emphasis*, `inline code` and a [link](https://example.com).',
  '',
  '## ' + typography.wrap({size: '21.5pt', family: 'serif'}, 'Lists and tables'),
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
  'A centered paragraph.' + formatLayout({align: 'center'}),
  '',
  'A ' + formatColorRun(TEXT_COLOR_NAMES.blue, 'blue phrase') + ' keeps its color.',
  '',
  'And ' + typography.wrap({size: '13.5pt', color: '#175dc4', family: 'serif'}, '**precise words**') + ' keep their emphasis.',
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

Save this as `example.mjs` in the folder you installed into and run `node example.mjs`. It validates
the fragments' source custody and prints the resulting line count and height for its supplied measurements.

```js
import {parseLayout} from 'rapier-markdown-kit/layout';
import {parseProfile, pictureSlices, createPreparationScope, flowLines, mapFragment} from 'rapier-markdown-kit/model';
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
const preparation = createPreparationScope(), paragraph = {};
const flow = preparation.prepare(paragraph, [{text, font, letterSpacing: 0}], {language: 'en'});
if (!flow) throw new Error('The host could not prepare this paragraph');
const plan = flowLines(flow, /* column width */ 300, /* top */ 0, obstacles, /* line height */ 20, /* min slot */ 40);
// Each line carries its own x, y and width, and the text fragments laid into it.
if (!plan || !preparation.current(flow)) throw new Error('No current plan');
let end = 0;
for (const line of plan.lines) for (const fragment of line.fragments) {
  const mapped = mapFragment(text, fragment);
  if (!mapped || mapped.start < end || text.slice(end, mapped.start).trim()) throw new Error('Unmapped source');
  end = mapped.end;
}
if (text.slice(end).trim()) throw new Error('Unmapped source tail');
console.log('lines:', plan.lines.length, 'height:', plan.height);
```

The block's `text-align` is the ninth argument (`'start'` by default). Native balanced headings retain native
wrapping: the current rich line-range API does not identify every legal balancing candidate. A picture moves a
block's words only where its outline meets them: when no line of the
block, laid and aligned in the whole column as with no picture, meets an obstacle, the plan is that layout (`x` 0, the
column's width); otherwise every line flows around the obstacles.

## What the host supplies

Rich preparation measures text through one pinned Pretext graph. It needs a global
`OffscreenCanvas` (or a DOM `document`) whose `getContext('2d')` has a settable `font` and a
`measureText(text)` returning `{width}`. A browser has one already; in Node, put those two members
in front of the host's actual shaper and admit its fonts before preparation. The example replays historical
measurements instead; an unrecorded query falls back to summing single characters. That fallback demonstrates API
execution only and does not qualify kerning, ligatures, complex scripts or actual browser line selection.

Create one `createPreparationScope(document)` for a host document in the same measurement realm. Call
`scope.prepare(owner, items, {whiteSpace, wordBreak, language})` with a stable paragraph owner and original rich
items; omitted document support is available for declared Node measurement hosts. Text items accept
`{text, font, letterSpacing?, break?: 'normal' | 'never', extraWidth?}`; box items accept `{width}`. Paragraph
`whiteSpace` is `normal` or `pre-wrap`, and `wordBreak` is `normal` or `keep-all`. `language` is the content language,
not the interface locale. Mixed run languages require native fallback. The scope retains owners weakly and reuses
preparation across widths. Changes to exact text, item shaping settings or language require a new preparation.

The returned handle is opaque. Pass it to `flowLines`, or retain the original ranges from
`layoutNextRichInlineLineRange` for `materializeRichInlineLineRange`. Materialized fragments give `itemIndex`,
`sourceStart` and `sourceEnd` in UTF-16 offsets of that item's **original** text; `mapFragment(originalText, fragment)`
provides the shared display-to-source mapping. `gapItemIndex` names the source style for a collapsed gap. Never decode
range cursors as old segment/grapheme fields, resegment text to interpret them, JSON-serialize or deep-freeze the
handle. Storage segments and emergency overflow advances are not a list of legal breaks.

`scope.current(handle)` checks the shared actual-font authority before projection. Bind font loading, completion and
failure to `scope.invalidateFonts()` and schedule reflow. Actual face identity, descriptors and status detect
same-name replacement and invalidate the vendor's metric cache as well as prepared handles. Width changes do
neither. Call `scope.forget(owner)` when a block stops participating. One imported graph owns the realm's vendor
metrics; another bundle or copied vendor tree cannot share that authority. Call `scope.retire()` when replacing or
retiring a projection scope, so both its handles and the shared vendor metrics are retired. This retains the
document's known custom-family history, allowing a missing previously declared face to be refused instead of
silently measured through a fallback. Only the owner replacing the whole document calls
`scope.retire({documentChanged: true})`, which also resets that document's expected-family history.

The browser adapter calls `supportsRichStyle(style, language)` and refuses settings the pinned API cannot represent.
The API has no independent controls for kerning, OpenType features, variation settings, optical sizing, word spacing
or mixed item language; a matching font-family string alone is not proof of matching actual font data. Unsupported
settings, unavailable or failed faces, complex objects, authored `br`, preserved-whitespace DOM paragraphs and
balanced headings keep selectable native DOM. Direct prepared-text hosts can use `pre-wrap` with original CRLF and
hard breaks. The reference combines browser-derived break tables and Canvas metrics with JavaScript flow. The DOM
adapter admits Chrome/Chromium profiles; Firefox, WebKit and Chrome on iOS retain native DOM. It does not invoke live
DOM line selection or promise identical pixels in other engines.
Editor soft-break source tokens and generated-content shells stay native. The semantic export resolves verified
soft-break tokens to ordinary rendered spaces through its existing owner before wrapping; its source carrier keeps
the original Markdown unchanged.
Ordinary picture flow keeps its greedy policy instead of the reference sheet's generic `pretty` preference;
explicit authored inline `text-wrap:pretty` retains native wrapping. No native pretty optimization is claimed.
A lone Latin, Greek or Cyrillic word prefix, including an authored no-break-space group, may defer to a later
wider picture-side slot on the same row when the public engine output fits the entire group there. Decorated
atoms, mixed-item words, punctuation, discretionary breaks and next-row placement retain the engine policy.

`md-layout:v1` remains semantic and engine-independent. No plan or font-dependent pixel carrier is saved. Offline
complete pages load their admitted embedded faces before enhanced wrapping; fragments and `scripts:false` pages
retain native wrapping. Fonts and codecs remain explicit host capabilities as described above.

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
layout comment round-trips exactly (12 of 12 that carry one). **Presentation** compares the plan with historical
measurements and reports real-trace hits separately from character-sum misses (`dist/kit/conformance/README.md`).
Its historical line counts are not a current-engine or font-shaping acceptance gate.
`--impl path/to/module.mjs` runs another implementation against the same documents; `--tolerance 2` sets the pixel
tolerance.

## License

MIT, the full text in `LICENSE`; Rapier-owned modules and the stylesheet keep their MIT line. Pretext's complete license,
notice and pinned source inventory are in `dist/agent/vendor/pretext/`. The selected upstream is unreleased main
`bac1774c0f8b7a92e44b9da43b6d5443d55d0d9b`, despite its package version `0.0.9`. Its upstream license includes
Chromium/WebKit BSD, Unicode and ICU notices for derived code and generated data; those notices travel with the kit
and the exported wrapping runtime. The history projection uses the MIT diff core;
its full grant is in `dist/packages/rapier-diff/LICENSE`. The Rapier editor is AGPL-3.0-only and
none of it is in this package. The kit carries Rapier's release number, written from the one
value the editor's release reads.

## Where the modules live

Each module has one home in the Rapier source (`spec/`, `layout/`, `agent/`, `kit/`), where Rapier itself reads it; `dist/`
is that closure copied byte for byte, and `style.css` is the same `spec/markdown-style.css` Rapier bundles.


## rapier-ledger

The edit ledger and its carried parts. MIT, no dependencies; part of
`rapier-markdown-kit`. The editor and this module use the **same** record validator,
splice replayer, root transition and interval transport. This is not a second history store.

```js
import {exportLedger, readLedger, authorship, merge} from 'rapier-markdown-kit/rapier-ledger';
import {writeDocument, readDocument} from 'rapier-markdown-kit/ledger/carried';

const ledger = exportLedger({
  text: 'Hello', metadata: {filename: 'Hello.md', docKind: 'markdown'}, records: [], documentAuthority: 'example-document', complete: true,
});
const saved = writeDocument('Hello', {ledger});
const reopened = readDocument(saved);
const verified = readLedger(reopened.ledger, reopened.text);
console.assert(verified.text === 'Hello');
const clean = writeDocument(verified.text, {authorship: authorship(ledger)});
console.assert(readDocument(clean).ledger === null);
const together = merge(ledger, reopened.ledger);
console.assert(together.text === 'Hello');
```

## The format

`rapier-ledger/2` is a plain JSON object:

```
{format, documentAuthority, start: {text, revision, root, sha256, metadata}, records,
 head: {revision, root, sha256, metadata}, complete, sha256}
records[]: {transaction, splices: [{pos, removed, inserted}], beforeHash, afterHash, metadata?, authored?}
transaction: {id, documentAuthority, baseRevision, revision, actor: {kind, id},
 transport, operation, requestId, sourceTransactionId, affectedBlockIds,
 parent, reverts, reapplies, createdAt}
```

`format` is `rapier-ledger/2`. `start.text` is the exact text before the first
retained record. Every outgoing record carries its own splices, including Undo and
Redo. Offsets and ranges count UTF-16 code units; no boundary may cut a surrogate
pair. Splices execute in their recorded order. UTF-8 checksums preserve CRLF, tabs,
NUL and non-ASCII text. The canonical text limit is 64 MiB; each record has at most
64 splices. Metadata is {filename, docKind}; a record may carry filename or docKind pairs {before, after}. Metadata-only acts keep equal source roots and an empty splice list. Inverses reference retained act IDs, so later metadata choices survive selective Undo. File handles and save permissions are never portable. The existing record validator remains authoritative for field bounds.

An optional `authored: {basis, source, splices}` preserves an act's original placement
when concurrent transport changes its physical `record.splices`. `basis` is the sorted,
minimal frontier of canonical act IDs observed at authoring; its causal closure is
reconstructed from these same records, including metadata-only acts and inverse
dependencies. `source` is the SHA-256 of the exact UTF-8 source before the original
sequential `splices`. An ordinary untransported record omits this field; its retained
prefix supplies the same evidence. Transport preserves the evidence and the original
act ID, author, time, turn, label, metadata choices and inverse targets. It neither
copies the growing prefix into each record nor creates another journal.

Use `readLedger` or `exportLedger` to validate retained history and `merge` or
`transposeAuthored` to transport it. Validation proves the causal closure, source
hash and exact original-to-physical placement; field shape or equal final text alone
is insufficient. Do not attach new authored evidence to an arbitrary physical copy.
Selective Undo uses this evidence to preserve concurrent insertions at their original
gaps, even when a replacement split into several physical splices.

`start.sha256` and `head.sha256` hash UTF-8 text. The envelope `sha256` hashes
canonical JSON of every other envelope field: recursively sorted object keys,
array order preserved, JSON string/number spelling. Plain finite scalar data only:
no accessors, sparse arrays, cycles, undefined, negative zero or unpaired surrogates.
Readers reject unknown envelope/start/head fields, bad checksums, invalid records,
invalid source boundaries, a replay/root mismatch, or a head different from the
actual document. `historyEnvelope` additionally proves the editor's Undo/Redo branch.
Its optional third and fourth arguments are the expected text and metadata, as in
`readLedger`; installing history can prove both source and navigation in one pass.

**Roots are path-dependent.** `textRoot(text)` mints the existing
`chars:fnv-base36:adler-base36` initial root. Each splice advances it with
`rootAfter(priorRoot, splice)`, matching the source store. A later root is **not**
a fresh hash of the whole current text. SHA-256 of the exact checkpoint text is
separate. A nonzero start names a retained checkpoint; it does not
claim to reconstruct discarded events. `complete: false` also permits a stated
revision gap in a partial ledger; each retained splice must still replay exactly. An incomplete ledger never
claims to reconstruct events it does not contain.

`actor.kind` is `human`, `agent` or `system`. Canonical doors mint an opaque provenance
`actor.id` independent of the private principal and retain a supplied display name
separately as `actor.name` (host names at most 96 characters). The private principal-to-author
mapping stays in the existing private owner; neither raw nor hashed access credentials
belong in portable authorship. The name is a **host-supplied claim**, not a verified identity. Timestamps are supplied record times, not independently attested.
Checksums detect inconsistency/corruption, **not forgery**: anyone able to rewrite a
file can rewrite its checksums and labels. Importing a label never grants a live
principal's read handles or authenticated document access.

## Optional carried parts

The default is **neither part**. In a self-contained page these inert scripts stand
beside the document's existing carried source:

| Element | Type and contents | Choice |
| --- | --- | --- |
| `#rapier-authorship` | `application/json`, `rapier-authorship/1` | Who wrote what |
| `#rapier-ledger` | `application/json`, `rapier-ledger/2` | The whole history |

Each body uses the same reversible `encodeCarried`/`decodeCarried` escape as the
page's source. `writeParts`, `readParts` and `takeParts` implement it. Duplicate,
executable, malformed or wrong-document parts are refused. If both are present,
the authorship projection recomputed from the ledger must agree exactly.

`rapier-authorship/1` is `{format, sha256, runs}`. `sha256` hashes the **current**
text. Runs are `[start, end, actorKind, actorId, at]`, in order, nonoverlapping and
covering every current character. A start without earlier authorship is attributed
to `system/unattributed`, time zero. Insertions take the inserting record's actor
and time, except text an Undo or Redo puts back: a splice inserting exactly the text
that a splice of the referenced act removed keeps the runs that text had. Deleted
runs disappear. Thus the projection contains **no removed text**.
An authorship-only import becomes a clearly incomplete insertion ledger; future
attribution is again derived from that one ledger, never a mutable blame database.

A Markdown file carries the same optional JSON at EOF, outside its exact source:

```


<!-- rapier-carried/1
{"ledger":...,"authorship":...}
-->

```

The writer escapes `<` and `>` in that JSON. This versioned EOF marker is reserved;
an unfinished marker is refused, not silently imported as prose. The reader strips
only that exact suffix, validates it against the remaining exact text, and treats a
leading BOM as file metadata. Other Markdown readers ignore the comment. Plain
saves without a choice are unchanged byte for byte. For executable code, use a web
page to carry metadata rather than appending a Markdown comment to program source.

The comparison page's `#rapier-base` is independent: `text/markdown`, with
`data-name`, `data-revision`, `data-sha256`, `data-by` and `data-at`, carries an exact
display reference. It is not reconstructed from the optional ledger and never
replaces current source. `rapier-html --compare original.md revised.md` packages both texts.

A comparison may also carry `data-fonts`, an HTML-attribute-escaped JSON string of
canonical embedded `[font:]` reference definitions. The admitted base record exposes
this as `fonts`. These resources belong to the exact comparison, outside its text,
digest and revision; they never become a source edit or ledger record. Font preparation
validates their actual bytes and reads font usage only from the original comparison.
Existing source-owned assets remain authoritative. A missing personal-library font is
embedded here when available, otherwise export refuses. Reopening and resaving need
no library or network, and never substitute the current device's default font.

## Merging copies without a server

`merge(first, second)` locates a common checkpoint with the same root **and exact
text**, then transports the second copy's record splices over the first's through
the shared interval transport. It preserves the first's ancestry and incoming
actors/times, minting local revision/root links. Both the public reader and the
editor's restore reader can replay the result. Both merge orders yield the same
text for independently edited nonoverlapping ranges; their ordered ledgers need
not be identical. Full and conflict receipts make repeated imports idempotent.

An identical replacement converges with both original acts retained and one physical
splice. The format identifier stays `rapier-ledger/2`. That unchanged identifier is not
backward compatibility with an older reader. There is no `rapier-ledger/3`, no
compatibility reader, and no migration. An older reader rejects the empty physical
witness with `ledger_invalid` and does not mutate the ledger. Mixed-version sync throws
`notes_history_unavailable` (`the note and its canonical history cannot be proved`).
The older participant's store snapshot and remote object count stay unchanged. That
throw is not a per-note `held` or `caughtUp` result. The same format string is not
interoperability, and the ledger is not rewritten into the older shape. Reactivating
any author of that replacement checks the shared text again; undoing that author
withdraws it once no author remains. A different overlap returns `text_overlap_unpreserved` and the caller's exact
ledger, including the text merge's alternatives for review, and does not mint a synthetic
act. Different Will `keep` regions require conflict review even when one copy was
unchanged. `review.required` names an unresolved result; a UI must not auto-accept
it. Rapier offers carried-copy imports from Compare through its existing review,
checks the live document again at commit, and installs the proven ledger before
publishing its receipt or opening the durable-save barrier. A rejected or stale
copy import mutates nothing. A failed install rolls the source and undo window back.
Copies without a proven common checkpoint are refused by this API.

## Host integration and retention

The embed helper accepts `agentName`; the checked `rapier-connect` message carries
`agent: {name}`. WebMCP uses the registration owner's supplied client name. Modern
MCP uses the request's client metadata, outside tool arguments; a request without a supplied name stays unnamed. MCP editor snapshots include the
server's retained journal only in editor metadata, not in model-facing tool results.
The browser proves a replay suffix before preserving remote writers under local
revision links; missing remote events never become an invented complete history.

Rapier's live history supports before previews and Undo for individual acts or turns, preserving later edits.
A carried ledger preserves the history included in that file and explicitly identifies an incomplete start.
Full history includes removed text and can be much larger than the current document; choose it separately for
each outgoing file. Authorship is also optional. Neither part verifies identities or synchronizes copies.

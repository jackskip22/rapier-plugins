# rapier-markdown-kit

Read, write and style Self-contained Markdown in your own code: one `.md` file that carries its pictures, layout
and colour.

- Everything past CommonMark and GFM is an HTML comment other readers ignore or an ordinary reference
  definition, so every Markdown app still reads the file.
- One stylesheet renders the document as the editor and its exported page do.
- The line planner flows text around a picture's real shape; a conformance suite of thirteen documents runs
  any implementation against it.
- Will/1 markers say which regions an agent may edit, only add to, or must keep.
- MIT, no dependencies, Node 22 or newer.

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

## The shared renderer

`rapier-markdown-kit/render` exports `createRenderer`, `createMarkdownRenderer`,
`createRenderStyles`, `createRenderSanitizer` and `createPrintRenderer`. These are the
actual editor/Share owners, not a second Markdown dialect or a lookalike stylesheet.
Their host dependencies are explicit named properties in each factory's first argument;
no factory reaches into an editor session to find its document. `style.css` is the exact
MIT `spec/markdown-style.css`, including the numbered-list, checkbox, callout, table,
footnote and picture-layout treatment.

```js
import {createRenderer} from 'rapier-markdown-kit/render';

// host is your bound DOM/codec/Markdown/image/style environment. Its named ports are
// declared at the top of createRenderer; preparation returns a detached semantic root.
const writer = createRenderer(host);
const {html, filename} = await writer.render(source, {filename: 'proposal.md'});
```

`createMarkdownRenderer(host).render(source, metadata)` returns the semantic HTML.
The page writer's `render` returns `{html, filename}` asynchronously and preserves the
original source, including BOM and line endings, in the SHA-256-verified source carrier.
Every existing lower-level method is also returned for hosts that compose the stages.
Create a new bound instance when its parser or host state changes; do not share mutable
DOM objects between document realms.

This is a **DOM-hosted library**, not a bundled headless browser, DOM shim, parser or
image decoder. Supplying only `{source}` or running it in bare Node without those ports
is not supported. A host must provide a real DOM and sanitizer, the Rapier grammar,
portable image preparation, style access and the named codec/layout ports it uses.
Those dependencies keep their own licences: the MIT grant here does not relicense a
separately supplied host or vendor. The repository's `editor/render-host.js` binds the
editor; `server/` provides a complete local host with a pinned Chromium process. Its
Word exporter and filesystem service are AGPL, not part of this MIT package.

The extraction receipt in the existing `html-export-corpus` row fixes all 226 baseline
writer pages byte for byte. That corpus supplies a clean DOM and named style/sanitizer
adapters: it proves serialization and source recovery, not browser appearance or
sanitizer security. The server's integration cells additionally use a real DOM and
round-trip the actual HTTP output.

## What it gives you

| Import | What it is |
| --- | --- |
| `rapier-markdown-kit/layout` | The `md-layout:v1` comment a picture carries: parse it, validate it, write it back. |
| `rapier-markdown-kit/marks` | Text colour and page-break markers. |
| `rapier-markdown-kit/model` | Occupancy profiles and the line planner: the wrapping itself. |
| `rapier-markdown-kit/will` | The Will/1 grammar (a separate, optional standard): the markers around an agent's intent regions. |
| `rapier-markdown-kit/assets` | The picture appendix: the reference definitions a document's pictures live in. It never decodes a picture. |
| `rapier-markdown-kit/style.css` | The reference style: type, lists, tables, tasks, pictures and the document's other markup, scoped to `.md-render`. |
| `rapier-markdown-kit/rapier-ledger` | The MIT edit-ledger format, replay, authorship projection and offline merge. |
| `rapier-markdown-kit/ledger/carried` | Checked optional parts for pages and saved Markdown. |
| `rapier-markdown-kit` | The modules above as named namespaces. |

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


## rapier-ledger

The edit ledger and its carried parts. MIT, no dependencies; part of
`rapier-markdown-kit`. The editor and this module use the **same** record validator,
splice replayer, root transition and interval transport. This is not a second history store.

```js
import {exportLedger, readLedger, authorship, merge} from 'rapier-markdown-kit/rapier-ledger';
import {writeDocument, readDocument} from 'rapier-markdown-kit/ledger/carried';

const ledger = exportLedger({
  text: 'Hello', records: [], documentAuthority: 'example-document', complete: true,
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

## The format at launch

`rapier-ledger/1` is a plain JSON object:

```
{format, documentAuthority, start: {text, revision, root, sha256}, records,
 head: {revision, root, sha256}, complete, sha256}
records[]: {transaction, splices: [{pos, removed, inserted}], beforeHash, afterHash}
transaction: {id, documentAuthority, baseRevision, revision, actor: {kind, id},
 transport, operation, requestId, sourceTransactionId, affectedBlockIds,
 parent, reverts, reapplies, createdAt}
```

`format` is `rapier-ledger/1`. `start.text` is the exact text before the first
retained record. Every outgoing record carries its own splices, including Undo and
Redo. Offsets and ranges count UTF-16 code units; no boundary may cut a surrogate
pair. Splices execute in their recorded order. UTF-8 checksums preserve CRLF, tabs,
NUL and non-ASCII text. The canonical text limit is 25 MiB; each record has at most
64 splices. The existing record validator remains authoritative for field bounds.

`start.sha256` and `head.sha256` hash UTF-8 text. The envelope `sha256` hashes
canonical JSON of every other envelope field: recursively sorted object keys,
array order preserved, JSON string/number spelling. Plain finite scalar data only:
no accessors, sparse arrays, cycles, undefined, negative zero or unpaired surrogates.
Readers reject unknown envelope/start/head fields, bad checksums, invalid records,
invalid source boundaries, a replay/root mismatch, or a head different from the
actual document. `historyEnvelope` additionally proves the editor's Undo/Redo branch.

**Roots are path-dependent.** `textRoot(text)` mints the existing
`chars:fnv-base36:adler-base36` initial root. Each splice advances it with
`rootAfter(priorRoot, splice)`, matching the source store. A later root is **not**
a fresh hash of the whole current text. SHA-256 of the exact checkpoint text is
separate. This distinction preserves the editor's actual format rather than the
earlier design shorthand. A nonzero start names a retained checkpoint; it does not
claim to reconstruct discarded events. `complete: false` also permits a stated
revision gap from the editor's pruning of cancelling navigation pairs; each
remaining splice must still replay exactly. It is never a claim about missing edits.

`actor.kind` is `human`, `agent` or `system`. A named agent's `actor.id` is
`<door>/<host-given name>` (name at most 96 characters, combined id at most 160).
Without a name, the door stands alone. The name is a **host-supplied claim**, not a
verified identity. Timestamps are supplied record times, not independently attested.
Checksums detect inconsistency/corruption, **not forgery**: anyone able to rewrite a
file can rewrite its checksums and labels. Importing a label never grants a live
principal's read handles, review authority or undo permissions.

## Optional carried parts

The default is **neither part**. In a self-contained page these inert scripts stand
beside the document's existing carried source:

| Element | Type and contents | Choice |
| --- | --- | --- |
| `#rapier-authorship` | `application/json`, `rapier-authorship/1` | Who wrote what |
| `#rapier-ledger` | `application/json`, `rapier-ledger/1` | The whole history |

Each body uses the same reversible `encodeCarried`/`decodeCarried` escape as the
page's source. `writeParts`, `readParts` and `takeParts` implement it. Duplicate,
executable, malformed or wrong-document parts are refused. If both are present,
the authorship projection recomputed from the ledger must agree exactly.

`rapier-authorship/1` is `{format, sha256, runs}`. `sha256` hashes the **current**
text. Runs are `[start, end, actorKind, actorId, at]`, in order, nonoverlapping and
covering every current character. A start without earlier authorship is attributed
to `system/unattributed`, time zero. Insertions take the inserting record's actor
and time; deleted runs disappear. Thus the projection contains **no removed text**.
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

The existing proposal page's `#rapier-base` is independent: `text/markdown`, with
`data-revision`, `data-sha256`, `data-by` and `data-at`, carries the proposal's
baseline. It is **not** reconstructed from an optional ledger, and this module does
not implement the separate proposal-tool/CLI workflow.

## Merging copies without a server

`merge(first, second)` locates a common checkpoint with the same root **and exact
text**, then transports the second copy's record splices over the first's through
the shared interval transport. It preserves the first's ancestry and incoming
actors/times, minting local revision/root links. Both the public reader and the
editor's restore reader can replay the result. Both merge orders yield the same
text for independently edited nonoverlapping ranges; their ordered ledgers need
not be identical. Full and conflict receipts make repeated imports idempotent.

Overlaps fall back to the existing text three-way merge. Unresolved alternatives
are carried in the existing `note-conflict:v1` envelope, never silently selected.
Different Will `keep` regions require conflict review even when one copy was
unchanged. `review.required` names an unresolved result; a UI must not auto-accept
it. Rapier offers carried-copy imports from Compare through its existing review,
checks the live document again at commit, and installs the proven ledger before
publishing its receipt or opening the durable-save barrier. A rejected or stale
proposal mutates nothing. A failed install rolls the source and undo window back.
Copies without a proven common checkpoint are refused by this API.

## Host integration and retention

The embed helper accepts `agentName`; the checked `rapier-connect` message carries
`agent: {name}`. WebMCP uses the registration owner's supplied client name. Modern
MCP uses the request's client metadata, outside tool arguments; a legacy stateless
request without a supplied name stays unnamed. MCP editor snapshots include the
server's retained journal only in editor metadata, not in model-facing tool results.
The browser proves a replay suffix before preserving remote writers under local
revision links; missing remote events never become an invented complete history.

Rapier retains its existing 500-record / 4-MiB in-memory window. A carried file can
outlive that window; reopening may trim it again. The module preserves an explicitly
incomplete start. Full history includes removed text and can be much larger than
the current document; it is opt-in for each outgoing file, never a persistent
preference. Authorship is also opt-in. Neither option implies signatures, identity
verification, infinite retention, a relay server or automatic synchronization.

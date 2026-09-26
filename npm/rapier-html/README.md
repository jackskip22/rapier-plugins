# rapier-html

Rapier, the offline Markdown editor, as one HTML page with your document inside it. No account, no
install, nothing fetched to open, edit or save. Node 22 or newer.

```sh
npx -- rapier-html notes.md                          # the editor, notes.md inside it, written beside the file
npx -- rapier-html notes.md --view draw              # opens on Draw: sketch and paint, the document behind it
npx -- rapier-html notes.md --view notes             # opens on Notes: the document as cards
npx -- rapier-html notes.md --drawing sketch.svg     # carries a drawing, opened on Draw over the document
npx -- rapier-html proposal.md --base original.md    # opens on the diff of a proposed change
npx -- rapier-html notes.md out.html                 # a named output
npm install rapier-html                              # as a library: wrap, unwrap
```

The first `--` is for npm, so `--help` reaches the command. It never overwrites a file.

## What the page can do

**Write**
- Markdown the way it reads: headings, lists, checklists, tables, code, quotes, footnotes, pictures placed
  around text.
- Find and replace, Undo, a source view of the exact bytes.
- Math and diagrams on demand, fetched once from a pinned address only when a document asks.

**Draw and paint**
- Shapes, lines, arrows, text on a canvas that goes into the document as a picture.
- Paint with real brushes: pencil, pen, ink, watercolour that runs and dries, oil that mixes, a smudge
  finger; dip the brush for more paint or more water.
- Your own brush files, a dropper, paint laid over the drawing as a layer of its own.

**Notes**
- The document as cards: sections, drag to reorder, search across every note.
- Voice recordings, reminders, a recycle bin that keeps seven days.
- Import from Keep, Notion, Evernote, Joplin, Bear, Simplenote, OneNote, Obsidian and more.

**Review a change**
- Open on the diff of a proposal against the original; keep or drop each change; nothing applies until
  the person says so.
- Will markers in the Markdown say what an agent may change: `keep`, `append`, `edit`.

**Keep it**
- Save to the device, share the page on, open it again anywhere a browser is; offline throughout.
- Export the document as Markdown or as a web page; print it.

**For agents**
- Hand a person a document, a sketch or a change as one file that opens with one click.
- What they save comes back byte for byte through `unwrap`.

## As a library

Save this as `example.mjs` in the folder you installed into and run `node example.mjs`:

```js
import {readFile, writeFile} from 'node:fs/promises';
import {wrap, unwrap} from 'rapier-html';

const rapier = await readFile(new URL('./rapier.html', import.meta.resolve('rapier-html')), 'utf8');
const words = '# Hello\r\n\r\nA note about </script> and C:\\Users\\me.\n';
const page = wrap(rapier, words, 'hello.md', {view: 'draw'});   // opens on Draw, the note behind it
console.log('words back exactly:', unwrap(page).text === words);
await writeFile('hello.rapier.html', page, {flag: 'wx'});        // 'wx': never over an existing file
```

`wrap(rapierHtml, text, name, {view, drawing, drawingName, base, baseName})` and `unwrap(pageHtml)`,
which returns `{html, text, name, view, drawing, drawingName, base, baseName}` with `null` for what a
page does not carry. Also exported: `encodeCarried`, `decodeCarried`, `main`.

## How the page carries the document

One `<script type="text/markdown" id="rapier-document">` block at the top of the body, never executed,
read once at boot. A drawing rides in `id="rapier-drawing"`, the text a change was proposed against in
`id="rapier-base"`, the view to open on in the document block's `data-view`. The block holds no `<`
before `/` or `!`, no carriage return and no NUL: `\\`, `\/`, `\!`, `\r` and `\0` stand for them, one
reversible pass each way, so a note about HTML is as safe as any other. A byte-order mark is kept as a
fact of the file and written back on Save.

## Safety

- It never overwrites: an output that exists, the document itself included, is refused. Unknown options,
  a `--view` that is not `draw` or `notes`, a `--drawing` or `--base` with no file and a third filename are
  refused too.
- Nothing reports on the page's use. It reaches the network only when the document or the person asks:
  a picture or video the document links to, or the math, diagram and PDF-import helpers on first use.

## Licence

AGPL-3.0-only (`LICENSE`): the page is the Rapier editor with the notices of the libraries it carries.
The Markdown standard without the editor is `rapier-markdown-kit` (MIT). Rapier is https://rapier.website.
`BUILD.json` records the page's size, SHA-256, build time and Node version.

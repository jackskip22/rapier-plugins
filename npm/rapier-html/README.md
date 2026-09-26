# rapier-html

Rapier with your document inside it. One command turns a Markdown file into a single HTML page
that is the whole Rapier editor, carrying the document's exact text: it opens anywhere a browser
is, offline, with no account. Read it, edit it, save it to the device, share it on. Agents hand
people documents this way; people hand them back the same way.

Nothing is fetched to open, edit or save the page, and nothing reports on its use. It goes to the
network only when the document or the person asks: a picture or video the document links to on the
web, or the math, diagram and PDF-import helpers, fetched once from a pinned CDN when first needed.

## Use it

Node 22 or newer:

```sh
npx -- rapier-html notes.md                       # writes notes.rapier.html beside it
npx -- rapier-html notes.md out.html              # a named output
npx -- rapier-html notes.md --drawing sketch.svg  # carries a drawing, opened on Draw as the page boots
npx -- rapier-html --help
```

The first `--` is for npm: without it `npx` keeps `--help`, and a later `--`, for itself.

**It never overwrites a file.** An output that already exists -- the document itself included, or a
link to it -- is refused and nothing is written; name a new one. An option it does not know, a
`--drawing` with no file and a third filename are refused as well, so a typo cannot quietly make a
different page. `--` makes everything after it a filename: `npx -- rapier-html -- --draft.md`.

## As a library

Save this as `example.mjs` in the folder you installed into (`npm install rapier-html`) and run
`node example.mjs`:

```js
import {readFile, writeFile} from 'node:fs/promises';
import {wrap, unwrap} from 'rapier-html';

// The page inside the installed package.
const rapier = await readFile(new URL('./rapier.html', import.meta.resolve('rapier-html')), 'utf8');

const words = '# Hello\r\n\r\nA note about </script> and C:\\Users\\me.\n';
const page = wrap(rapier, words, 'hello.md');              // Rapier carrying the document
// A drawing rides along, opened on Draw right after the document lands (Done places it in).
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6"/></svg>';
const both = wrap(rapier, words, 'hello.md', {drawing: svg, drawingName: 'sketch.svg'});

console.log('words back exactly:', unwrap(page).text === words, '| drawing back exactly:', unwrap(both).drawing === svg);
await writeFile('hello.rapier.html', page, {flag: 'wx'});   // 'wx': never over an existing file
```

It prints `words back exactly: true | drawing back exactly: true` and writes `hello.rapier.html`.
The package exports `wrap`, `unwrap`, `encodeCarried`, `decodeCarried` and the command's `main`;
`unwrap` returns `{html, text, name, drawing, drawingName}`, with `null` for what a page does not
carry.

## What the page carries

The page carries the document as one `<script type="text/markdown" id="rapier-document">` block
at the top of the body; the browser never executes it and Rapier reads it once at boot in place
of the Welcome. A second, optional `<script type="text/plain" id="rapier-drawing">` block carries
a drawing Rapier made (its SVG carries the drawing's recipe in its own metadata); Rapier opens Draw
on that recipe once the document is up, the document behind it. Wrapping is a byte insertion, not
a build: a second wrap replaces the blocks it is given.

**Your words come back byte for byte, whatever is in them.** A script element's text is not inert
to an HTML parser: `<!--` followed by `<script` puts it in a state where the block's own
`</script>` stops closing it and the rest of the page is swallowed, CRLF and a lone carriage
return are rewritten to a newline, and NUL becomes U+FFFD. A note *about* HTML is enough to hit
the first. So a carried block holds no `<` before `/` or `!`, no carriage return and no NUL: a
backslash is written `\\`, `</` is `\/`, `<!` is `\!`, a carriage return is `\r`, a NUL is
`\0`, and nothing else changes. One pass each way, exactly reversible, and the same size as your
words except where they already held a backslash. A byte-order mark is kept as a fact of the file
and written back on Save, not folded into the text.

`unwrap` reverses exactly what `wrap` wrote, and the editor inside the page reads by the same law,
so a page always reads its own bytes correctly. The command reads the document as UTF-8 text.

## Licence

AGPL-3.0-only, the full text in `LICENSE`: the page is the Rapier editor, with the notices of the
libraries it carries. For the Markdown standard without the editor there is `rapier-markdown-kit`
(MIT). Rapier is https://rapier.website.

## The page inside

Its version is the version of the Rapier inside it. `BUILD.json` records the page's size, SHA-256, build time and Node version.

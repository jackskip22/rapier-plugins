---
name: rapier-html
description: Turns a Markdown document into one offline HTML file that is the whole Rapier editor with the document inside it, for a person to open, edit, save and send back with no account. Use when handing a person a document to read or work on, or when reading one they sent back.
---

# rapier-html

One command, one file. The page opens in any browser, offline, and carries the document's exact
text; the person edits it there, saves it to the device, and shares it on. Read the text back out of
a returned page with the same package.

## Make a page

Node 22 or newer:

```sh
npx -- rapier-html notes.md                       # writes notes.rapier.html beside it
npx -- rapier-html notes.md out.html              # a named output
npx -- rapier-html notes.md --drawing sketch.svg  # opens on Draw with the drawing
```

It never overwrites: an output that exists is refused, so name a new one. The first `--` keeps npm
from taking `--help` for itself.

## As a library

```js
import {wrap, unwrap} from 'rapier-html';
const page = wrap(rapierHtml, markdownText, 'notes.md');   // rapierHtml: the bytes of rapier.html
const {text, name} = unwrap(pageBytes);                    // the document a person sent back
```

`wrap` places the text in `<script type="text/markdown" id="rapier-document">` with a reversible
escape; `unwrap` reads it back byte-exact. A drawing rides in `<script type="text/plain"
id="rapier-drawing">`.

## When to use which file

- **A page to open anywhere and print:** the person's Rapier makes it from the Share sheet (web page).
  It carries the document and reopens in Rapier for editing.
- **A page that carries the editor:** this package. For a document an agent writes for a person who
  may not have Rapier: proposals, reports, drafts to review.

Write the Markdown to the Rapier standard first (`skills/rapier-markdown`), so pictures, marks and
the Will travel inside the page.

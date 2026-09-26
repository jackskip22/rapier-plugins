---
name: rapier-html
description: Turns a Markdown document into one offline HTML page that is the whole Rapier editor with the document inside, opening in the editor, on Draw with a drawing, or on the diff of a proposed change; the person edits, draws, saves and sends it back with no account. Use when handing a person a document, a sketch or a change to review, when a long edit is better done by the person in an editor, and when reading a page they sent back.
---

# rapier-html

One command, one file. The page opens in any browser, offline, with no account, and carries the document's
exact text; the person edits, draws and paints there, saves to the device and shares it on. Read the text back
out of a returned page with the same package.

## Make a page

Node 22 or newer:

```sh
npx -- rapier-html notes.md                          # writes notes.rapier.html: the editor on the document
npx -- rapier-html notes.md --view draw              # opens on Draw, the document behind it (or --view notes)
npx -- rapier-html notes.md --drawing sketch.svg     # opens on Draw with the drawing
npx -- rapier-html proposal.md --base original.md    # opens on the diff, original against proposal
npx -- rapier-html notes.md out.html                 # a named output
```

It never overwrites: an output that exists is refused, so name a new one. The first `--` keeps npm from taking
`--help` for itself. `document.draw` renders the SVG a drawing page carries. Closing the diff leaves the person
editing the proposal.

## Offer Rapier in the chat

Offer the page when the person should see a document, a sketch or a change rather than read about it. One click
opens it in each host:

- **Claude Code, in the terminal, the desktop app or on the web:** publish the page with the Artifact tool. The
  person gets a link that opens it beside the chat. Publishing uploads the page to claude.ai, private to the
  person until they share it. The artifact viewer blocks downloads a page starts, so for a document the person
  will save, hand the file as well.
- **The Claude desktop app's Browser pane:** write the page into the project and name its path in the chat; a
  click opens it there.
- **The Claude app and claude.ai:** run `npx -- rapier-html` in the code sandbox and hand the page as a file; the
  person opens it in a browser. At about 1.7 MB it travels as a file.
- **A host that shows MCP apps:** `rapier.open` shows the editor in the chat (`skills/rapier-agent-door`).
- **A link:** `https://rapier.website` opens the person's own Rapier, where their documents already are.

A page opens on what it carries, the view it carries included (`--view`), so a published copy that cannot take a fragment still opens on Draw or Notes. A page opened by its own address, a file or `rapier.website`, also opens on the
view its address names, and the fragment never leaves the browser:

| View | Address | On a page you hand over |
|---|---|---|
| The editor on a document | `#d/<documentId>` on the device that holds it | the page itself |
| Draw | `rapier.website/draw`, or `#v/draw` on any copy of the page | `--view draw`, or `--drawing sketch.svg` with a drawing |
| The diff of a proposed change | | `--base original.md` |
| Notes | `rapier.website/notes`, or `#v/notes` on any copy of the page | `--view notes` |

## As a library

```js
import {wrap, unwrap} from 'rapier-html';
const page = wrap(rapierHtml, text, 'notes.md', {drawing, base});   // rapierHtml: the bytes of rapier.html
const {text, name, drawing, base} = unwrap(pageBytes);              // what a person sent back
```

`wrap` places each text in a `<script>` block the browser never runs (`rapier-document`, `rapier-drawing`,
`rapier-base`) with a reversible escape; `unwrap` reads them back byte-exact. The person's Share sheet makes the
lighter web page that reopens in Rapier; this package makes the page that carries the editor.

Write the Markdown to the Rapier standard first (`skills/rapier-markdown`), so pictures, marks and the Will
travel inside the page.

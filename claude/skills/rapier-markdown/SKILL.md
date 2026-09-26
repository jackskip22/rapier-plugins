---
name: rapier-markdown
description: Writes and edits Markdown that Rapier renders exactly, with pictures placed by a layout comment, colour and page-break marks, and honours Will/1 markers, a separate optional standard. Use when producing or editing a document a person opens in Rapier.
---

# Rapier Markdown

Plain CommonMark with four conventions carried in HTML comments, so any other reader shows the same
words and ignores the comments. The standard is `docs/markdown-standard.md`; the MIT implementation
is `rapier-markdown-kit` (`npm install rapier-markdown-kit`).

## Pictures

A picture is an ordinary reference image whose definition holds the bytes as a data URL, appended at
the end of the file after a blank line, one definition per line. Its layout is one trailing comment on
the occurrence:

```md
![System diagram][diagram] <!--md-layout:v1 width=47% align=center-->

[diagram]: data:image/png;base64,<payload>
```

Layouts: `width` with `align=left|center|right` or `x=<percent>`; `wrap=around` or `wrap=box` with
`x`, `y` (em) for text flowing beside; `wrap=behind` or `wrap=front` for a picture under or over the
words; `rotate=15deg` for a turned raster. Moving, resizing or describing a picture never touches its
bytes. Reuse one definition for repeated bytes. A paragraph or heading takes `align` the same way:
`A centred line. <!--md-layout:v1 align=center-->`.

## Marks

Colour a run: `Buy <!--c green-->mushrooms<!--/c--> today` (a CSS colour name or hex). Break a page:
`<!--md-break:v1 page-->` on its own line with blank lines around it.

## Will, a separate standard

Will/1 is optional and its own standard (`docs/will.md` in the Rapier repository), separate from Rapier
Markdown: a person marks a region with a law, `keep`, `append` or `edit`, as HTML comment lines
(`<!-- will/1 keep -->` ... `<!-- /will -->`). Unmarked text is `edit`. Honour any marker you find: never
change a `keep` region, add to an `append` region only at its end, never move or rewrite a marker line.
Words after the law are the person's intent and grant nothing.

## Writing discipline

Write the document as the person would read it: headings, short paragraphs, lists, tables, fenced
code. Put each new picture's definition at the end. Keep the person's own bytes as they are outside
the region being changed; Rapier's Compare shows every byte that moved.

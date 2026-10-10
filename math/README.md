# Rapier math

Rapier's TeX-to-SVG typesetter supports fractions, roots, scripts, limits, matrices, aligned equations, accents,
operators, Greek, mathematical symbols, text, color, size and spacing commands. SVG paths carry the required glyphs;
formulas need no font installation or external resource. Every formula retains its TeX as a text alternative.

Rapier downloads this optional plugin when a document needs maths, verifies its length and SHA-384, and keeps it
locally. The agent editor resource carries the same payload. Unsupported commands produce explicit diagnostics.

File: `rapier-math-1.0.0.js` (806260 bytes; 497752 bytes gzip).
SHA-384: `nvSdsuI3c2Vb+bio3Y/txLjXbKRbjOL5aYhzM6PLa67c3wFOXZhXsZCGws742vkB`.

To serve it from your own origin, put it beside `rapier-document.html` or `rapier.html`, or in the reader's
`plugins` directory (`npx rapier-embed plugins <directory>`).

## Render and fit

Load the payload as a classic script. `RapierMath.render(tex, {displayMode: true, maxWidth: 20})` returns
`svg`, em-based `width`, `height` and `depth`, `lines`, `fitted`, and `errors`.
`maxWidth` is optional and measured in mathematical ems. Long rows break before relations or binary operators;
aligned derivations share their relation column. An indivisible oversized group scales uniformly to fit.
`renderToString(tex, options)` returns only the SVG. Both calls are synchronous and need no DOM.

The SVG's font size matches Latin Modern's x-height to Geist using the fonts' own metrics. Returned dimensions
remain mathematical ems. For a known screen, pass `screen: {fontSize: 16, pixelRatio: 2, dark: false}`.
`fontSize` is the surrounding text size in CSS pixels; `pixelRatio` is the device pixel ratio. Both must be
positive finite numbers, and `dark` must be a boolean. Values that cannot produce a finite device scale return
an `invalid-screen` diagnostic. This applies screen ink and script compensation without a DOM.
Omit `screen` for resolution-independent output.

After inserting the SVG, `RapierMath.observe(container)` fits equations to their column and refreshes them on
column, font and document-theme changes. It returns a cleanup function. `RapierMath.fit(container)` performs one
synchronous refresh, including before print. Browser fitting snaps marked rules to the device-pixel grid and
applies optical ink compensation at small screen sizes and on dark paper. Forced colors and increased contrast retain full ink.
The SVG inherits the document's `currentColor`; explicit TeX colors keep their authored ink.

The root SVG keeps the exact TeX in `aria-label` and `title`. Unsupported or bounded-out input has a visible
diagnostic and an `errors` entry; malformed XML characters also retain their original UTF-16 code units in
`data-tex-utf16`. Check `errors` before treating output as a successfully typeset formula.

## Rebuild

Use Node 22. The complete source is in `src/`; no package installation is required:

```sh
node verify.mjs
cd src
node tools/build-math.mjs
```

`verify.mjs` checks the payload, source digests and complete licenses, then rebuilds the exact payload.
The resulting `src/shell/vendor/rapier-math-1.0.0.js` has the same bytes as the payload beside this file.
`src/shell/math-resources.json` records every source digest and the pinned font source. For font regeneration,
follow the Python and FontTools setup in `src/math/FONT-SOURCE.md`, then run `python src/math/build-font.py` from
the package root, or `python math/build-font.py` from `src/`. That source note uses `repo/` paths for the full
Rapier checkout; this standalone package uses `src/` instead.

## Licenses

The renderer is MIT; the complete terms are in `LICENSE-MIT` and `math-LICENSE.txt`.
Latin Modern Math 1.959 outlines and mathematical metrics use the GUST Font License, an instance of the LaTeX
Project Public License. The exact copyright, GUST grant and LPPL 1.3c terms are retained in
`math-font-LICENSE.txt` and the payload header. `math-components.json` records the renderer and font as
SPDX 2.3 components and carries the complete font grant as `LicenseRef-GUST-Font-License`.

# Rapier math

MathJax 4.1.3 and mhchemparser 4.2.1, built as one SVG renderer with every permitted TeX package and glyph range available without further downloads.
Rapier downloads this optional plug-in when requested and verifies its length and SHA-384 before retaining or executing it. The editor resource served by Rapier's agent door carries the same payload inside it.

File: `mathjax-4.1.3.offline-svg.js` (11948066 bytes). SHA-384: `wDGx1UhqWHiww1a2D8xGpGfoo5DNg2fGlytVMPYeyL2w9kz5HfO+i6h6IxNBnrB+`. To serve it from your own origin, put it
beside `rapier-document.html` or `rapier.html`, or in the reader's `plugins` directory (`npx rapier-embed plugins <directory>`).

The upstream safe handler filters equation links, styles and attributes. External extension and font loading is disabled. Authored TeX remains exact and editable.

## Rebuild

Use Node 22. The source recipe and exact package versions are in `src/`:

```sh
cd src
npm install
node tools/vendor-math.mjs node_modules
```

The resulting `src/shell/vendor/mathjax-4.1.3.offline-svg.js` has the same bytes as the payload beside this file. `src/shell/math-resources.json` records the package archive integrity, source hashes, font ranges and font permissions. The adapter is MIT; the recipe is AGPL-3.0-only.

## Licences

`math-NOTICE.txt` carries the complete package and font notices. `math-build-NOTICE.txt` covers the build tool. `math-components.json` is the SPDX 2.3 component record, including the extracted font permissions and the separate build dependency.
The adapter's complete MIT licence is in `math-adapter-LICENSE.txt`, also carried as `LICENSE-MIT` and `src/LICENSE-MIT`.

# Reader plug-in source

This directory contains the source and build tools for Rapier's generated flowchart, Word-reader and PDF-reader
plug-ins. It is a source offer for those three files, not a complete Rapier application or website release.
The source manifest identifies every supplied file and the exact expected outputs of this snapshot.

## Build offline

Install the Node version named by `tools/toolchain.json` (22.23.3 for this snapshot). Node is the only external
build tool. No npm install, browser, application checkout, network access or previous build cache is needed.
The shipped parser and minifier are part of the source offer.

From this directory, with a new output directory outside it:

```sh
node tools/reader-plugin-build.mjs --manifest tools/reader-plugin-source.json --out ../reader-plugin-output
node --test tools/reader-plugin-build.test.mjs
```

The first command verifies the declared source identities, compiles the three plug-ins through the same generator
used by the normal reader build, and checks every expected output's length, SHA-256, SHA-384 and Git blob identity.
Only then does it create the output directory, containing the three JavaScript files and `BUILD.json`.
Existing destinations, changed or missing sources, changed output identities, noncanonical Node and unminified
or development modes are refused. A failed run is not a release. Never give different bytes an existing release filename.

Generation runs with the build cache disabled and a boundary that rejects undeclared file reads, network access,
subprocesses and filesystem writes. This boundary catches accidental build dependencies; it is not a sandbox for
untrusted source code. The receipt records the actual source reads and the source manifest's SHA-256. The manifest
itself is excluded from its file list to avoid a circular hash. `reader-build.mjs` is supplied to show and test the
normal reader's shared-generator call; building the complete reader requires the full application's additional sources.

The generator uses `version.mjs`. The frozen expectations belong only to this snapshot's manifest. Future releases
can use the same generator with a new version and independently reviewed source/output manifest.

## Licenses and preferred sources

Rapier's source and generated plug-ins are AGPL-3.0-only; see `LICENSE` and the source headers. The generated Word and
PDF files retain Turndown and collapse-whitespace notices from `editor/engine.js`. Additional notices and provenance
are supplied in `agent/vendor/NOTICE.txt`, `agent/vendor/pretext/`, `agent/vendor/hyphen-en-us/`,
`shell/vendor/PROVENANCE.json`, `shell/fonts/PROVENANCE.json`, and `tools/vendor/terser/`.
`editor/ui.html` preserves the font and other component license text. The original and instanced font inputs,
`shell/fonts/docx-fonts.mjs`, `tools/build-docx-fonts.py`, the hyphenation source text and `tools/compile-hyphens.mjs`
are included as preferred sources and derivation tools. Rebuilding those vendored inputs is separate from reproducing
these plug-in payloads; their provenance files record the upstream versions and derivation requirements.

The PDF reader's separately fetched pdf.js assets and the other optional Rapier resources are not produced here.
Their source, licenses and pinned distributions remain separate from these three generated files.

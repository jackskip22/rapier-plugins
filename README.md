# Rapier plugins and packages

Agent plugins, npm packages and plug-in files for [Rapier](https://rapier.website), a free Markdown editor that
people and agents edit together, in one offline HTML file with no account.

## Agent plugins

- `claude/`: the Claude plugin: four skills and the MCP door.
  `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package: the same four skills and remote MCP endpoint.
- The door, `https://mcp.rapier.website/mcp`, is in the [MCP registry](https://registry.modelcontextprotocol.io) as
  `io.github.jackskip22/rapier` (`server.json`). Any MCP client connects to it with no account or key.

## npm packages

- `npm/rapier-html/`: `npx rapier-html@1.1.90 notes.md` writes one offline HTML file: the editor with the document inside.
- `npm/rapier-embed/`: `npm install rapier-embed@1.1.90` puts the read-only reader or the document editor in your
  site or app, saving to your own storage (MIT).
- `npm/rapier-markdown-kit/`: read, write and render Self-contained Markdown, one `.md` file with its pictures and
  layout, without the editor (MIT).
- The JPEG XL encoder inside Rapier is `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).

## Plug-in files

Rapier pages download these the first time a document needs them, through
`https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@main/<directory>/<file>`, and verify each by length and SHA-384.
To keep the reader's plug-ins in your own app, run `npx rapier-embed@1.1.90 plugins <directory>`; see
[Plug-ins](npm/rapier-embed/README.md#plug-ins).

- `math/`: TeX maths and chemistry as SVG, with its complete notices and reproducible source recipe.
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0).
- `flowchart/`, `docx/`, `pdf/`: the reader's own plug-ins, a file each: the flowchart renderer, the Word reader and the PDF reader's page reading.

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

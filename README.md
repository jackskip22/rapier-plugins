# Rapier plugins and packages

Plugins, npm packages and plug-in files for [Rapier](https://rapier.website), a fast Markdown editor for notes,
diagrams, drawing and watercolor painting in one HTML file. Android, Web and Windows. Phone-first and offline,
with MCP and WebMCP for live work with agents. Optional encrypted sync uses your own Cloudflare account.

## Start

1. **Work live with a person.** Connect an MCP client to `https://mcp.rapier.website/mcp` over streamable HTTP, then
   call `rapier.open`. Open the returned `editor_url` for the person. Call `rapier.guide` for editing, drawing,
   painting, comments, review and export. No account or key is required.
2. **Hand over an offline document.** `npx rapier-html notes.md` writes `notes.rapier.html`: the editor and its
   document in one file. [Package](npm/rapier-html/README.md).
3. **Put Rapier in your app.** `npm install rapier-embed` embeds the editor or the lightweight reader. Enable
   `agent: true` on the editor for your app's own agent over WebMCP. Your app owns storage; the reader is read-only.
   [Embedding](npm/rapier-embed/README.md).
4. **Keep rich documents in Markdown.** `npm install rapier-markdown-kit` reads and writes pictures, editable
   drawings and layout in one `.md` file. Respect [Will/1](https://github.com/jackskip22/will) regions: `edit`,
   `append` and `keep`. [Self-contained Markdown](npm/rapier-markdown-kit/README.md).
5. **Encode JPEG XL in JavaScript.** `npm install rapier-jxl` adds the encoder that Rapier uses, in browsers,
   Node.js and other JavaScript runtimes. [Encoder](https://github.com/jackskip22/rapier-jxl).
6. **Run your own door.** [rapier-server](https://github.com/jackskip22/rapier/blob/main/server/README.md) serves
   Markdown from your folder or S3-compatible bucket through the same MCP tools. Supply Node.js and Chromium;
   start with `rapier-server serve <folder>` and the documented browser settings.

The agent edits live, beside the person or while they are away. Rapier shows its presence and changes; the person
taps a change to see what was there before and undoes anything, keeping later edits. Use `comparison.present`
to deliberately show a diff. Read exact source before editing, and preserve the person's typing and Will.
The [agent guide](https://rapier.website/agents) lists the tools and their inputs.

## Agent plugins

- `claude/`: the Claude plugin: four skills and the MCP door.
  `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package: the same four skills and remote MCP endpoint.
- The door, `https://mcp.rapier.website/mcp`, is in the [MCP registry](https://registry.modelcontextprotocol.io) as
  `io.github.jackskip22/rapier` (`server.json`). Any MCP client connects to it with no account or key.

## npm packages

- `npm/rapier-html/`: `npx rapier-html@1.1.93 notes.md` writes one offline HTML file: the editor with the document inside.
- `npm/rapier-embed/`: `npm install rapier-embed@1.1.93` puts the read-only reader or the document editor in your
  site or app, saving to your own storage (MIT).
- `npm/rapier-markdown-kit/`: read, write and render Self-contained Markdown, one `.md` file with its pictures and
  layout, without the editor (MIT).
- The JPEG XL encoder inside Rapier is `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).

## Plug-in files

Rapier pages download these the first time a document needs them, through
`https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@main/<directory>/<file>`, and verify each by length and SHA-384.
To keep the reader's plug-ins in your own app, run `npx rapier-embed@1.1.93 plugins <directory>`; see
[Plug-ins](npm/rapier-embed/README.md#plug-ins).

- `math/`: TeX maths and chemistry as SVG, with its complete notices and reproducible source recipe.
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0).
- `flowchart/`, `docx/`, `pdf/`: the reader's own plug-ins, a file each: the flowchart renderer, the Word reader and the PDF reader's page reading.

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

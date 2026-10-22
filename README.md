# Rapier - Markdown Editor & Art: plugins and packages

Plugins, npm packages and plug-in files for [Rapier - Markdown Editor & Art](https://rapier.website).
Markdown editor for writing, notes, editable diagrams, drawing and painting with your AI assistant.
Work together through a supported host, deliver an editable offline file, or embed the editor or reader in your app.

## Start

1. **Work live with a person.** Connect an MCP client to `https://mcp.rapier.website/door/mcp` over streamable HTTP, then
   call `open`. Open the returned `editor_url` for the person. Read `rapier://guide` for editing, drawing,
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
taps a change to see what was there before and undoes anything, keeping later edits. Use `show {target:"comparison"}`
to deliberately show a diff. Read exact source before editing, and preserve the person's typing and Will.
The [agent guide](https://rapier.website/agents) lists the tools and their inputs.

## Agent plugins

- The repository root is an [Agent Plugins](https://agent-plugins.org) package: `plugin.json`, `mcp.json` and
  `skills/` supply four skills and the MCP door. Install this root with a client that supports Agent Plugins 1.0.
  Antigravity reads the same root and `mcp_config.json`: `agy plugin install https://github.com/jackskip22/rapier-plugins`
- The four skills alone, for any agent the [skills](https://skills.sh) command supports:
  `npx skills add jackskip22/rapier-plugins`
- `cursor/`: the Cursor plugin adds a rule for writing, diagrams, comparisons and paintings in an editable document.
  The Cursor marketplace at `.cursor-plugin/marketplace.json` points to it. [Local installation](cursor/README.md).
  Install one Rapier package in each client.
- `claude/`: the Claude plugin: four skills and the MCP door.
  `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package: its separately retained skills and remote MCP endpoint.
- The door, `https://mcp.rapier.website/door/mcp`, is in the [MCP Registry](https://registry.modelcontextprotocol.io) and the [GitHub MCP Registry](https://github.com/mcp) as
  `io.github.jackskip22/rapier` (`server.json`). Any MCP client connects to it with no account or key.

## npm packages

- `npm/rapier-html/`: `npx rapier-html@1.2.24 notes.md` writes one offline HTML file: the editor with the document inside.
- `npm/rapier-embed/`: `npm install rapier-embed@1.2.24` puts the read-only reader or the document editor in your
  site or app, saving to your own storage (MIT).
- `npm/rapier-markdown-kit/`: read, write and render Self-contained Markdown, one `.md` file with its pictures and
  layout, without the editor (MIT).
- The JPEG XL encoder inside Rapier is `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).

## Plug-in files

Rapier pages download these the first time a document needs them, through
`https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.24/<directory>/<file>` (each release's own tag), and verify each by length and SHA-384.
To keep the reader's plug-ins in your own app, run `npx rapier-embed@1.2.24 plugins <directory>`; see
[Plug-ins](npm/rapier-embed/README.md#plug-ins).

- `math/`: The pinned app Math renderer, its complete notices and original input identities.
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0).
- `templates/` and `elements/`: Starters' page borders and the Elements sheet's ornaments, traced from the ornament book (CC0), a file each.
- `flowchart/`, `docx/`, `pdf/`: the reader's own plug-ins, a file each: the flowchart renderer, the Word reader and the PDF reader's page reading.
- `sources/reader-1.2.24/`: the source of those three plug-ins, which builds them offline (its `README.reader-plugins.md`).

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

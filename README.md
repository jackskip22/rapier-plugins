# Rapier - Markdown Editor & Art: plugins and packages

Agent plugins, npm packages and plug-in files for [Rapier](https://rapier.website), the Markdown editor you write, draw and paint in with your AI assistant.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/write-1280-dark.png">
  <img src="assets/write-1280-light.png" alt="The Rapier editor on a computer: a launch plan with an agent's change marked" width="960">
</picture>

## Connect an agent

MCP door: `https://mcp.rapier.website/door/mcp` (streamable HTTP, no account or key). Call `open`, give the person the returned `editor_url`, and read `rapier://guide`. The [agent guide](https://rapier.website/agents) lists every tool.

| Client | Install |
| --- | --- |
| Claude | `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier` |
| Antigravity | `agy plugin install https://github.com/jackskip22/rapier-plugins` |
| Cursor | [`cursor/`](cursor/README.md), listed in `.cursor-plugin/marketplace.json` |
| OpenAI | `openai/`: its own skills and the remote MCP endpoint |
| Any Agent Plugins 1.0 client | This repository's root: `plugin.json`, `mcp.json`, `skills/` |
| Skills only | `npx skills add jackskip22/rapier-plugins` |

Install one Rapier package per client. The door is `io.github.jackskip22/rapier` in the [MCP Registry](https://registry.modelcontextprotocol.io) and the [GitHub MCP Registry](https://github.com/mcp).

The agent edits live, with the person there or away. The person sees each change, taps it to see what was there, and can undo it while keeping later edits. Agents read the exact source before editing and keep the person's typing and [Will](https://github.com/jackskip22/will) regions.

## npm packages

| Package | |
| --- | --- |
| [rapier-html](npm/rapier-html/README.md) | `npx rapier-html@1.2.52 notes.md` writes `notes.rapier.html`: the editor and the document in one offline file. |
| [rapier-embed](npm/rapier-embed/README.md) | `npm install rapier-embed@1.2.52`: the editor or the read-only reader in your app, saving to your storage. `agent: true` connects your app's own agent over WebMCP. MIT. |
| [rapier-markdown-kit](npm/rapier-markdown-kit/README.md) | Read, write and render Self-contained Markdown, one `.md` file with its pictures, editable drawings and layout, without the editor. MIT. |
| [rapier-jxl](https://github.com/jackskip22/rapier-jxl) | The JPEG XL encoder Rapier uses, for any JavaScript runtime. |

To serve documents from your own folder or S3-compatible bucket through the same tools, run [rapier-server](https://github.com/jackskip22/rapier/blob/main/server/README.md).

## Plug-in files

Rapier loads these the first time a document needs one, from `https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@cdn-v1.2.52/<directory>/<file>`, and checks each by length and SHA-384. `npx rapier-embed@1.2.52 plugins <directory>` copies the reader's into your app ([Plug-ins](npm/rapier-embed/README.md#plug-ins)).

| Directory | Contents |
| --- | --- |
| `math/` | The Math renderer, with its notices and input identities |
| `letters/` | Draw's letter sets: ornamental capitals traced from British Library scans (CC0) |
| `templates/`, `elements/` | Page borders and ornaments traced from the ornament book (CC0) |
| `flowchart/`, `docx/`, `pdf/` | The reader's flowchart, Word and PDF plug-ins |
| `sources/reader-1.2.52/` | Their source, which builds them offline (`README.reader-plugins.md`) |

Source: [jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

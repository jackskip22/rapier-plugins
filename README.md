# Rapier plugins and packages

The agent plugins and npm packages of [Rapier](https://rapier.website), the document editor in one offline HTML
file, for an agent that works on a document beside a person or hands them one to keep.

- `claude/`: the Claude plugin, agent and person on one editable page. `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package, the same four skills and remote MCP endpoint. Its README gives the With MCP submission path and snapshot identity.
- `npm/rapier-html/`: `npx rapier-html@1.1.78 notes.md` writes one offline HTML page that is the editor with the document inside.
- The JPEG XL encoder inside Rapier is its own package, `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).
- `npm/rapier-markdown-kit/`: read, write and style Self-contained Markdown, one `.md` file with its pictures and layout (MIT).
- `npm/rapier-embed/`: `npm install rapier-embed@1.1.78` puts the editor in your own site, saving to your own storage (MIT).
- The door, `https://mcp.rapier.website/mcp`, is listed in the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.jackskip22/rapier` (`server.json`).
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0); Rapier downloads one when you choose it.

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

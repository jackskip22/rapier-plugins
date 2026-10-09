# Rapier plugins and packages

Plugins and packages for [Rapier](https://rapier.website), a Markdown editor for writing, drawing and painting.
Work with an assistant in a shared document or keep the editor and document in one offline HTML file.

- `claude/`: the Claude plugin for a shared editable document. `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package, the same four skills and remote MCP endpoint. Its README gives the With MCP submission path and snapshot identity.
- `npm/rapier-html/`: `npx rapier-html@1.1.87 notes.md` creates one offline HTML file containing the editor and document.
- The JPEG XL encoder inside Rapier is its own package, `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).
- `npm/rapier-markdown-kit/`: read, write and style Self-contained Markdown, one `.md` file with its pictures and layout (MIT).
- `npm/rapier-embed/`: `npm install rapier-embed@1.1.87` puts the editor in your own site, saving to your own storage (MIT).
- The door, `https://mcp.rapier.website/mcp`, is listed in the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.jackskip22/rapier` (`server.json`).
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0); Rapier downloads one when you choose it.
- `math/`: the verified math and chemistry SVG plug-in, its complete notices and reproducible source recipe.

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

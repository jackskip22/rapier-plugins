# Rapier plugins and packages

[Rapier](https://rapier.website), the offline Markdown editor.

- `claude/`: the Claude plugin. `claude plugin marketplace add jackskip22/rapier-plugins && claude plugin install rapier@rapier`
- `openai/`: the OpenAI package, the same four skills and remote MCP endpoint. Its README gives the With MCP submission path and snapshot identity.
- `npm/rapier-html/`: `npx rapier-html@1.1.47 notes.md` writes one offline HTML page that is the editor with the document inside.
- The JPEG XL encoder inside Rapier is its own package, `rapier-jxl`, published from [jackskip22/rapier-jxl](https://github.com/jackskip22/rapier-jxl).
- `npm/rapier-markdown-kit/`: the Rapier Markdown standard's layout grammar and line planner (MIT).
- `npm/rapier-embed/`: `npm install rapier-embed@1.1.47` puts the editor in your own site, saving to your own storage (MIT).
- `letters/`: Draw's letter sets, ornamental capitals traced from the British Library's book scans (CC0); Rapier downloads one when you choose it.

Source: [github.com/jackskip22/rapier](https://github.com/jackskip22/rapier). [Privacy and terms](PRIVACY.md).

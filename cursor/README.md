# Rapier - Markdown Editor & Art: Cursor plugin

Rapier is a Markdown editor for writing, drawing and painting with your AI assistant. Edit the page yourself, add editable diagrams and illustrations, and keep your work as portable Markdown.

Work together on plans, notes, drafts and visual explanations. Read exact source, make focused revision-checked edits, compare proposed text and undo recorded work while keeping later independent edits. Download Markdown or plain text, or create an editable offline HTML file through supported export tools or the included local helpers. Running local helpers requires Node and npm; an MCP connection alone does not provide a shell.

Painting needs an open full editor. Water requires WebGPU. Word, PDF and rendered-page exports depend on the available editor or renderer. A successful tool call does not by itself prove that the inline editor appeared. Connected Notes require a configured store.

Rapier accesses only the document or configured store you share. It cannot search unshared device files, send email or make purchases. Hosted workspaces expire after 30 idle days; download an independent copy to keep it. The four skills include the published offline helper packages.

Version 1.2.8. MCP server: `https://mcp.rapier.website/door/mcp`. No Rapier account, key or sign-in is needed.

## What it includes

| Component | Purpose |
|---|---|
| MCP server `rapier` | Six tools: `open`, `read`, `edit`, `undo`, `show`, `export` |
| Rule `rapier.mdc` | The short workflow, selected when you ask for a Rapier document, drawing or painting |
| Skill `rapier-agent-door` | Work together live: documents, Notes, diagrams, drawing, painting, Water, pairing |
| Skill `rapier-html` | An editable offline HTML file, or a page that shows a deliberate comparison |
| Skill `rapier-markdown` | Portable Markdown that keeps pictures, drawings and layout in one `.md` file |
| Skill `embed-rapier` | Put the Rapier reader or editor inside your own site or app |

## Install

From the marketplace: open **Cursor Settings → Plugins**, search for **Rapier** and choose **Install**.

To test a local copy, copy this folder into Cursor's local plugin directory, then run **Developer: Reload Window**:

```sh
mkdir -p ~/.cursor/plugins/local/rapier
cp -R cursor/. ~/.cursor/plugins/local/rapier/
```

Local plugin imports must be enabled. Copy the files: Cursor skips symlinks to a folder outside its local plugin
directory. An installed marketplace copy with the same name takes precedence. Nothing needs configuring.

## Try it

- Document: "Create a project plan in Rapier with a diagram whose boxes I can move."
- Revise: "Fix only the typos in section 2 and show me exactly what changed." Then: "Undo that."
- Notes: "Find my Note about the garden and add today's list." (Needs your own Notes store; see below.)
- Draw: "Turn this signup flow into a diagram: enter email, verify, create profile, welcome."
- Paint: "Paint a small watercolor sunset over the sea in Rapier and leave room for me to add a boat."
- Keep: "Give me this document as one offline HTML file I can keep editing."

Open the editor link the agent returns and keep it visible while it paints. Painting is finished only when the
agent reports it committed; then pick up the brush yourself.

## Requirements and limits

- Live work needs an internet connection and a browser; downloaded files stay editable offline.
- Painting needs the editor open. Water needs WebGPU; without it the agent offers regular
  brushes or an editable diagram.
- Notes use the store you configured on your own device. The hosted workspace cannot read encrypted Notes and
  reports them as locked or unavailable, not empty. Sync runs only when you ask and can replace files.
- Word, PDF and rendered-page exports need an available editor or renderer. Hosted workspaces expire after 30 idle days; export links last
  up to 24 hours. Download your work to keep it.

## Pair another browser

If the editor link shows a four-letter code, tell the agent the code within a minute. It calls `show` with
`target: "pair"` and the code; then press **Allow** in that browser. Each code works once.

## Other hosts

In a host that accepts a custom MCP server, add one named rapier at
https://mcp.rapier.website/door/mcp. A custom server supplies the six tools and the server's instructions, not these skills or
the rule. Other Agent Plugins clients use the repository root's `plugin.json`, `mcp.json` and `skills/`.
Install one Rapier package in each client.

## Troubleshooting

- Rapier tools missing: check **Customize** lists the `rapier` MCP server and that it is enabled, then start a new chat.
- `editor_not_present`: open the editor link and keep it visible; to pair a browser, use its code as above.
- `OPEN_ARGUMENTS_CONFLICT` on `open` with `title`: name ordinary documents with `filename`; `title` is for a new Note.

## Privacy, terms and support

The agent sends only the document you share to the hosted workspace. No analytics or advertising.
Read [Privacy and terms](PRIVACY.md) (also at https://rapier.website/privacy). License: AGPL-3.0-only.
Questions and problems: https://github.com/jackskip22/rapier-plugins/issues or hello@rapier.website. More for agents: [agent guide](https://rapier.website/agents).

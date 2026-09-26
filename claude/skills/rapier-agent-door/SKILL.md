---
name: rapier-agent-door
description: Edits a document open in Rapier through sixteen tools that read by structure and change exactly the inspected passage, about 1.5 KB of context an edit whatever the document's length, under the person's Will and review. Use when an agent works on a live Rapier document in-page, over WebMCP or over MCP, and for any long document an agent would otherwise read and rewrite whole.
---

# The agent door

Rapier gives an agent sixteen tools, fourteen `document.*` and two `notes.*`. They read by structure
and edit by inspected handle, so an edit costs about 1.5 KB of context (some 370 tokens) whatever the
document's length: measured over thirty edits, 83% less than reading a 100-page document into context first
and two orders of magnitude less than rewriting it (`docs/briefs/token-saving.md`). The catalog with every schema is `AGENT-TOOLS.json`; the same tools are reached three ways:

| Door | Reach it | Authority |
|---|---|---|
| In-page | `window.RapierAgentBrowser.invoke(name, input)` | The page's script |
| WebMCP | `document.modelContext` registered tools | The browser's permission; in a hosted embed the host's `agent` grant |
| MCP | `POST /mcp` on a deployed worker; `rapier.open` first | The opaque document capability it returns |

## The loop

1. `document.get_context`: where the person is, the revision, the Will, any pending review.
2. `document.get_outline`, `document.find` or `document.read_context`: the passage, by heading,
   search or ref. Each read returns a handle that authorises exactly the bytes disclosed.
3. `document.apply_edits` with those handles (FREE posture), or `document.propose_edits` when the
   person reviews first (ASK). All edits in one call settle together against the revision read.
4. `document.show_changes`, `document.undo_agent_change`: show or reverse this agent's own change
   while keeping the person's later work.
5. `document.save`: through the destination the person already chose; the receipt says verified or
   unacknowledged.

`rapier.open` shows the editor in a host that renders MCP apps; elsewhere the person opens the document as a
page (`skills/rapier-html`). `document.compare` opens a whole alternative text for the person to keep or drop by
change.
`document.draw` makes or edits a picture from figures or a recipe. `document.reveal` and
`document.wait_for_user` show a passage and wait for the person's selection or reply where the
editor supports it. `notes.list` and `notes.read` read the person's notes when Notes is present.

## What holds

- A handle is bound to the revision it was read at; a later change relocates it, a lost target
  refuses. Read again rather than guessing.
- The Will (`skills/rapier-markdown`) binds every edit: `keep` regions stay, `append` regions grow
  at the end, marker lines are never moved.
- The person's own typing wins; an edit that crosses it is refused and can be retried after a read.
- Over MCP, every call carries an `operation_id` of the agent's own making; resending it retries
  without acting twice.
- A refusal names its cause in its result. Act on the name: read again, ask the person, or choose
  another tool. The same call unchanged gets the same refusal.

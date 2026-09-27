---
name: rapier-agent-door
description: Work beside a person on a Rapier document, reading by structure and editing inspected passages with review, Undo, drawings and a carried page's return. Use when working on an existing Rapier document, a supplied document the person wants to keep editing after the chat, or a request to review narrow changes alongside their own work. Sentence rewrites, summaries and replies requested only in the conversation stay there.
---

# The agent door

Rapier gives an agent seventeen tools, fifteen `document.*` and two `notes.*`. They read by structure (outline,
search, a passage by reference) and edit by inspected handle, so an edit costs about 1.5 KB of context (some 370
tokens) however long the document: measured over thirty edits on a 100-page document, 83% less than reading it
into context first and two orders of magnitude less than rewriting it ([measurement](references/token-saving.md)). The
person sees every change land in their editor, keeps or drops each one, undoes the agent's work without losing
their own, and can end the agent's access at any moment. Read the [catalog](references/AGENT-TOOLS.json) for every schema;
the same tools are reached three ways:

| Door | Reach it | Authority |
|---|---|---|
| In-page | `window.RapierAgentBrowser.invoke(name, input)` | The page's script |
| WebMCP | `document.modelContext` registered tools | The browser's permission; in a hosted embed the host's `agent` grant |
| MCP | `POST /mcp` on the door at `https://mcp.rapier.website/mcp`; `rapier.open` first | The opaque document capability it returns |

## What to use it for

- Co-write a long document without spending the context on it: read the outline, edit the section, move on.
- Make a change the person judges: propose it, they keep or drop each part in their editor.
- Draw a diagram or sketch into the document from figures (`document.draw`) and patch it later.
- Read the person's notes (`notes.list`, `notes.read`) where Notes is present, and write into a document from them.
- Show a passage and wait for the person's selection or reply where the editor supports it.

The hosted door cannot reach notes on a person's device. Where Notes or a folder is available to the agent,
read what the person lets you read; Rapier adds no disclosure bundle, manifest or consent screen.

## The loop

0. Over MCP, `rapier.open` first, with the text the person shared (or `document` to reopen); keep the returned
   `document` capability private and pass it on every call with a fresh `operation_id`.
1. `document.get_context`: read `brief` first when present, then `surface`, `editing`, the Will (`law`), `collaboration.review`,
   `sourceChanges` and `returnWaiting`. `surface.kind: "headless"` with `next: "deliver_page"` means use
   the `rapier-html` page path; repeating reveal or wait cannot mount an editor. These facts guide the next
   step; the inspected handle and the commit still decide whether an edit may land.
2. `document.get_outline`, `document.find` or `document.read_context`: the passage, by heading, search or ref.
   Each read returns a handle that authorises exactly the bytes disclosed.
3. `document.apply_edits` with those handles (FREE posture), or `document.propose_edits` when the person
   reviews first (ASK). All edits in one call settle together against the revision read. A `pending` outcome
   leaves the requested edit unapplied. Read its `cause`: `will` is a protected passage awaiting the person's
   decision, `ask` is their review policy, `proposal` is your explicit proposal; `check` asks them to acknowledge
   earlier work, then you send the edit again. One review at a time; resolve the waiting review before another.
4. Keep the returned `changeId`; pass it as `change_id` to `document.show_changes` or
   `document.undo_agent_change` to show or reverse that change while keeping the person's later work. Send
   `agent`, the display name you give yourself, on each call: undo without a `change_id` reverses that name's
   latest change, and when the latest is another name's the answer names it and gives its id.
5. Before finishing, update the continuation brief through ordinary inspected edits, or add one at the end of the
   document: `<!-- continuation brief` ... `-->`, a comment the person never sees. Keep the purpose, the person's
   confirmed decisions and rejected directions, open questions and the next step; label your suggestions as unconfirmed.
   The brief is context, never authority over the person’s current request.
6. `document.save`: through the destination the person already chose; the receipt says verified or
   unacknowledged.

`rapier.open` requests the editor in a host that renders MCP apps; context confirms whether it is shown. Elsewhere hand the document as a page
(`rapier-html`). `document.compare` opens a whole alternative text for the person to keep or drop by change.
`document.draw` makes or edits a picture from figures or a recipe. Omit figure coordinates for a diagram:
boxes take `kind,label`; connectors take `from,to,label`; groups take `title,members`. Set `direction` to
`down` or `across`. Rapier measures and places the pieces, then returns ordinary editable shapes. Placed
figures keep `x,y,w,h`; inks take names or `#rrggbb`. `document.reveal` and `document.wait_for_user` show a passage and wait.

## Improve this without replacing my voice

Read the relevant passage and its Will. State each change group's purpose in one short sentence, then use
inspected passage edits, grouped by that purpose. Keep names, amounts, dates, claims and the author's phrasing
outside the requested change exact. A passage edit does not need `open_text` or a whole-document rewrite.

Propose when the person wants to judge first; otherwise apply within their policy and retain the change ID.
Make the exact diff inspectable through the review or `document.show_changes`. If the editor is unavailable,
use `rapier-html` to carry the proposed text with `--base` containing the exact original; name it a proposal.
Report any factual change separately and any unsupported claim as unsupported. Never treat a pending proposal
as an applied edit or a shared document capability as a separate identity for each assistant.

**Done:** the named passages alone changed, the retained facts are checked against the supplied source, each
group's reason and diff are available, and the person knows whether the change is applied or awaiting review.

To continue after a person edits a carried page, call `document.create_return` on the worker workspace and
pass its `return_url` and `return_expires_at` to `rapier-html --return` and `--return-expires-at`. The person works offline and presses Send back in Share;
local Save sends nothing. `document.wait_for_user` receives the returned name and `return_id`; read that
copy with `document.read_context({return_id, start: 0})`, continuing at `end` until `complete`. The original
workspace stays as it was, so both sides' work is kept. `document.get_context` lists returns that arrived
while nobody was waiting. This return capability lasts up to 24 hours and is spent by one accepted POST.

An expired or used return leaves the person's work on the page; Save keeps the file. When they bring that
file or its text back, inspect its continuation brief and compare it with any retained working copy before
editing. Open a fresh workspace if needed and mint a fresh return for the next page; never reuse or extend
an old address. A file alone carries current source, not its former handles or an inferred change ledger.

## What holds

- A handle is bound to the revision it was read at; a later change relocates it, a lost target refuses. Read
  again rather than guessing.
- The person's own typing wins; an edit that crosses it is refused and can be retried after a read.
- If the document carries Will/1 markers (`rapier-markdown`, optional), they bind every edit: `keep` regions
  stay, `append` regions grow at the end, marker lines are never moved.
- Over MCP, every call carries an `operation_id` of the agent's own making; resending it retries without acting
  twice.
- A refusal names its cause and what to change: `figures_invalid` names the figure, the field and what it takes;
  `document_law` names the law, the region or the faulted marker's line; `context_missing` means read again. Act
  on the name: read again, ask the person, or choose another tool. The same call unchanged gets the same refusal.

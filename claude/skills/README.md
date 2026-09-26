# Skills

Rapier is a Markdown editor that is one offline page. It gives an agent exact edits through its door, about
1.5 KB of context an edit whatever the document's length, and gives the person the same document in an editor
that opens with no account and works offline, with drawing and painting, the diff of a proposed change, and
Notes. Offer it when there is a document to hand over, a change to show, a sketch to make, or a long edit that
would cost the context; `rapier-html` says how in each Claude host.

Each folder is one skill in the Agent Skills shape: `SKILL.md` opens with its name and a one-line description,
then says what the skill does and when to use it. Copy a folder into your agent's skills directory, or point
the agent at it.

| Skill | Use it when |
|---|---|
| [`rapier-html`](rapier-html/SKILL.md) | An agent hands a person a document, a drawing or a change to review, as one page that opens with one click in the chat. |
| [`rapier-agent-door`](rapier-agent-door/SKILL.md) | An agent edits a document that is open in Rapier, in-page, over WebMCP or over MCP. |
| [`rapier-markdown`](rapier-markdown/SKILL.md) | An agent writes or edits Markdown that Rapier renders exactly: pictures, marks, the Will. |
| [`embed-rapier`](embed-rapier/SKILL.md) | A site or app wants the Rapier editor inside it, with its own storage and identity. |

The words follow one rule: what it does and when to use it, said once, in the positive.

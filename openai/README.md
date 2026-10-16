# Rapier for ChatGPT

Replacement candidate for review. The endpoint update, hosted guidance and inline-editor checks are pending. This directory does not establish approval or publication of this version.

This package uses https://mcp.rapier.website/openai/mcp with 21 focused tools backed by Rapier's shared core.
It includes four complete skills and the published offline helper versions recorded in SKILLS.json.

Open a shared document, read exact source, edit at its revision, compare when requested and export an independent file.
Check editor presence and actual delivery receipts. Painting needs a visible full editor; Water also needs WebGPU.
Notes require a configured store. This connector does not expose pairing, preferences, device file picking or playback.

The server's shared authoring guides may describe browser tools. The packaged skills map those examples to this
connection's schemas. The offline/embed helper references retain their own API and are not additional MCP tools.

Read PRIVACY.md for data handling. Hosted workspaces expire after 30 idle days.

Package validation is separate from server deployment, portal endpoint-update acceptance and host interaction tests.
The existing demo recording shows the earlier release; it does not verify this update.

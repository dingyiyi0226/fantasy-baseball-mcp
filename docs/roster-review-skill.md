# Install the roster review skill

We provide a **Fantasy Roster Review** skill for a more structured roster review
workflow. The skill only drives the Yahoo tools from this MCP server, so it's a
**separate install from the server**. Register the server first from the main
[README](../README.md), then add the skill for your client below. Once both are
in place, ask for `fantasy roster review`.

## Claude Desktop

The `.mcpb` extension carries the tools but **not** the skill. Upload the skill manually:

1. **Download** `fantasy-roster-review-skill.zip` from the **[Releases page](../../releases/latest)**.
2. In Claude Desktop, turn on **code execution** under **Settings → Capabilities** (skills require it).
3. Go to **Customize → Skills**, click **+ → Create skill → Upload a skill**, and select the ZIP.


## Claude Code, Codex & other CLI agents

Install the skill with one command. It detects your installed agents and drops
the skill into each one's skills folder:

```bash
npx skills add dingyiyi0226/fantasy-baseball-mcp
```

Then restart your client.

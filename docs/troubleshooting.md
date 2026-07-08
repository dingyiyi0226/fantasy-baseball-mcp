# FAQ and troubleshooting

## FAQ

**Is my data safe?** Your Yahoo keys are stored only on your computer (`~/.yahoo-fantasy-mcp/config.json`) and in your OS keychain. Nothing is sent anywhere but Yahoo's API.

**Why do I need my own Yahoo app?** Yahoo requires each person to use their own keys — no shared secrets.

**Rate limit errors?** Yahoo limits heavy use. Wait an hour and try again.

## Network allowlist for `analyze`

If `analyze` commands fail with a connection error, your AI client may need
explicit permission to reach the stats APIs.

On **Claude Desktop / Claude.ai**, go to **Settings → Capabilities**
(Team/Enterprise: **Organization settings → Capabilities**) and add these under
**Additional allowed domains**:

| Domain | Used for |
| --- | --- |
| `statsapi.mlb.com` | MLB Stats API |
| `baseballsavant.mlb.com` | Statcast / expected stats |
| `www.fangraphs.com` | FanGraphs WAR/wRC+ |

On **Codex** or other clients, check your client's network or domain allowlist
settings.

# FAQ and troubleshooting

## FAQ

**Is my data safe?** Your Yahoo credentials are stored locally in
`~/.fantasy-baseball-mcp/config.json`, with permissions restricted to your user
(`0600`); they are not stored in your OS keychain. Yahoo requests go to Yahoo's
API. `analyze` requests also use the public MLB Stats API, Baseball Savant, and
FanGraphs for baseball statistics.

**Why do I need my own Yahoo app?** Yahoo requires each person to use their own keys — no shared secrets.

**Rate limit errors?** Yahoo limits heavy use. Wait an hour and try again.

## Network allowlist for `analyze`

If `analyze` commands fail with a connection error, your AI client may need
explicit permission to reach the stats APIs.

On **Claude Desktop**, go to **Settings → Capabilities**
(Team/Enterprise: **Organization settings → Capabilities**) and add these under
**Additional allowed domains**:

| Domain | Used for |
| --- | --- |
| `statsapi.mlb.com` | MLB Stats API |
| `baseballsavant.mlb.com` | Statcast / expected stats |
| `www.fangraphs.com` | FanGraphs WAR/wRC+ |

In the **Codex desktop app**, check its network or domain allowlist settings.

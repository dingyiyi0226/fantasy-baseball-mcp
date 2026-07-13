# Test fixtures

Captured Yahoo Fantasy API and public baseball-data responses used to develop and
regression-test the response mappers in [`src/yahoo/`](../src/yahoo/) and
[`src/analysis/`](../src/analysis/).

```
test/
  fetch-fixtures.mjs   # regenerate fixtures from live APIs (Yahoo needs credentials)
  run.mjs              # offline regression test (no network)
  fixtures/
    raw/<tool>.json    # sanitized upstream response or normalized source bundle
    mapped/<tool>.json # the exact public response after its mapper runs
```

## Privacy

The fixtures are committed to a public repo, so `fetch-fixtures.mjs` **sanitizes
all personal data** before writing:

- game key/id → `123`, league name → `Demo League`, league id → `12345`
- team names → `Team <id>`, manager nicknames → `Manager <id>`
- image / logo / profile URLs, chat ids, and guids → placeholders

Real MLB player names are kept — they are public data, not personal data. Long
lists (teams, players, matchups, transactions) are trimmed to a few items so the
fixtures stay small and readable.

The analysis fixtures contain only public MLB, Baseball Savant, and FanGraphs data.
`analyze_player_stats`, `analyze_roster_stats`, and `list_probable_starters` can be
refreshed without Yahoo credentials. The probable-starter mapped fixture uses the public compact
`starters.columns` / `starters.rows` response contract.

Whenever an MCP tool is added, add raw and mapped fixtures named after that tool and register it
in both `fetch-fixtures.mjs` and `run.mjs`, even when the tool reuses an existing mapper. This keeps
an example response discoverable by tool name and protects the tool's exact endpoint shape.

## Running the regression test

```sh
npm test          # builds, then runs mapper and tool/workflow contract tests
```

`run.mjs` re-runs each mapper on its `raw/` fixture and asserts the output equals
the committed `mapped/` fixture. The roster/player tool tests verify focused request and
response contracts, `skill-contracts.mjs` checks workflow assumptions, and `config.mjs`
verifies that the current config path is preferred and the legacy path is still readable.
None needs credentials.

## Regenerating fixtures

Only needed when an upstream response shape changes or you intentionally change a
mapper's field selection. Yahoo fixtures require a configured
`~/.fantasy-baseball-mcp/config.json` (run the auth flow once); analysis fixtures
use public data and do not.

```sh
npm run build
node test/fetch-fixtures.mjs get_roster
node test/fetch-fixtures.mjs analyze_player_stats
```

The fixture name is required; the script updates only that fixture's raw and
mapped JSON files. Then re-run `npm test` and review the diff before committing.

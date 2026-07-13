# Contract verification and fixtures

Captured Yahoo Fantasy API and public baseball-data responses used to develop and
document the real MCP response contracts in [`src/yahoo/`](../src/yahoo/) and
[`src/analysis/`](../src/analysis/). The offline checks guard those examples and
other cross-file contracts against accidental drift; they are not unit tests.

```
test/
  README.md
  run.mjs                     # run every offline contract check
  contracts/
    response-fixtures.mjs     # compare real mappers with committed examples
    roster-tools.mjs          # focused roster request/response contracts
    player-tools.mjs          # focused player request/response contracts
    config.mjs                # current and legacy config-path behavior
    skill-workflows.mjs       # workflow assumptions shipped in skill docs
  fixtures/
    raw/<tool>.json           # sanitized upstream response or normalized source bundle
    mapped/<tool>.json        # exact public response after its mapper runs

scripts/
  fetch-fixtures.mjs          # refresh one fixture from live APIs
```

## Privacy

The fixtures are committed to a public repo, so
[`scripts/fetch-fixtures.mjs`](../scripts/fetch-fixtures.mjs) **sanitizes all
personal data** before writing:

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

Whenever an MCP tool is added, add raw and mapped fixtures named after that tool
and register it in both `scripts/fetch-fixtures.mjs` and
`test/contracts/response-fixtures.mjs`, even when the tool reuses an existing
mapper. This keeps an example response discoverable by tool name and protects
the tool's exact endpoint shape.

## Running the offline verification

```sh
npm test # builds, then runs every offline contract and regression check
```

`test/run.mjs` executes the contract modules sequentially and stops on the first
failure. `response-fixtures.mjs` re-runs each mapper on its `raw/` fixture and
asserts that the output equals the committed `mapped/` example. The roster and
player modules verify focused tool contracts, `skill-workflows.mjs` checks
workflow assumptions, and `config.mjs` verifies current and legacy config-path
behavior. None needs credentials or network access.

## Regenerating fixtures

Only needed when an upstream response shape changes or you intentionally change a
mapper's field selection. Yahoo fixtures require a configured
`~/.fantasy-baseball-mcp/config.json` (run the auth flow once); analysis fixtures
use public data and do not.

```sh
npm run fixtures:refresh -- get_roster
npm run fixtures:refresh -- analyze_player_stats
```

The fixture name is required. The command builds the project, then updates only
that fixture's raw and mapped JSON files. Re-run `npm test` and review the diff
before committing.

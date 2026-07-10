# Test fixtures

Captured Yahoo Fantasy API responses used to develop and regression-test the
response mappers in [`src/tools/mappers.ts`](../src/tools/mappers.ts).

```
test/
  fetch-fixtures.mjs   # regenerate fixtures from the live API (needs credentials)
  run.mjs              # offline regression test (no network)
  fixtures/
    raw/<tool>.json    # sanitized Yahoo response, as received
    mapped/<tool>.json # the same response after its mapper runs
```

## Privacy

The fixtures are committed to a public repo, so `fetch-fixtures.mjs` **sanitizes
all personal data** before writing:

- league name → `Demo League`, league id → `12345`
- team names → `Team <id>`, manager nicknames → `Manager <id>`
- image / logo / profile URLs, chat ids, and guids → placeholders

Real MLB player names are kept — they are public data, not personal data. Long
lists (teams, players, matchups, transactions) are trimmed to a few items so the
fixtures stay small and readable.

## Running the regression test

```sh
npm test          # builds, then runs test/run.mjs
```

`run.mjs` re-runs each mapper on its `raw/` fixture and asserts the output equals
the committed `mapped/` fixture. It needs no credentials.

## Regenerating fixtures

Only needed when a Yahoo response shape changes or you intentionally change a
mapper's field selection. Requires a configured `~/.yahoo-fantasy-mcp/config.json`
(run the auth flow once).

```sh
npm run build
node test/fetch-fixtures.mjs get_roster
```

The fixture name is required; the script updates only that fixture's raw and
mapped JSON files. Then re-run `npm test` and review the diff before committing.

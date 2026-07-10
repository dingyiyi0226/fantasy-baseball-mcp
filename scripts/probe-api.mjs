/**
 * Ad-hoc API explorer for manual investigation of the Yahoo Fantasy and MLB
 * Stats APIs. Handy when designing a new tool: hit a raw endpoint and eyeball
 * the JSON before committing to a mapper/shape. Not part of the test suite.
 *
 * Auth reuses the saved session (~/.fantasy-baseball-mcp/config.json) and the real
 * compiled YahooClient, so the OAuth token is refreshed transparently.
 *
 * Usage:
 *   npm run build                       # the dist/ client must be compiled first
 *
 *   # Raw Yahoo GET — pass the resource path after /fantasy/v2 (literal semicolons,
 *   # do NOT url-encode the sub-resource separators):
 *   node scripts/probe-api.mjs yahoo "/league/{lk}/players;position=SP;count=5;out=ownership"
 *     ({lk} / {tk} are substituted with your configured default league / team keys)
 *
 *   # Raw MLB Stats API GET — pass the path + query after /api/v1:
 *   node scripts/probe-api.mjs mlb "schedule?sportId=1&date=2026-07-01&hydrate=probablePitcher,team"
 *
 *   # Convenience: probable starters for a date, optionally + Yahoo ownership:
 *   node scripts/probe-api.mjs starters 2026-07-01 [--fantasy]
 *
 * Output is pretty-printed JSON on stdout; progress notes go to stderr.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const dist = (m) => join(HERE, "..", "dist", m);

const { loadConfig, resolveCredentials } = await import(dist("app/config.js"));
const { TokenManager } = await import(dist("yahoo/oauth.js"));
const { YahooClient } = await import(dist("yahoo/client.js"));
const { fetchProbableStarters } = await import(dist("analysis/statsClient.js"));

const MLB_API = "https://statsapi.mlb.com/api/v1";

const cfg = await loadConfig();
const lk = cfg?.defaultLeagueKey;
const tk = cfg?.defaultTeamKey;

/** Build a YahooClient from the saved session, or exit with a hint. */
function yahooClient() {
  const creds = resolveCredentials(cfg);
  if (!creds || !cfg?.refreshToken) {
    console.error("No Yahoo session found. Run the auth flow first (node dist/cli.js auth).");
    process.exit(1);
  }
  return new YahooClient(new TokenManager(creds, cfg.refreshToken, async () => {}));
}

const print = (v) => console.log(JSON.stringify(v, null, 2));
const asArr = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const [cmd, arg, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "yahoo": {
    if (!arg) throw new Error('Usage: probe-api.mjs yahoo "/resource/path"');
    const resource = arg.replace(/\{lk\}/g, lk ?? "").replace(/\{tk\}/g, tk ?? "");
    console.error("GET", resource);
    print(await yahooClient().get(resource));
    break;
  }

  case "mlb": {
    if (!arg) throw new Error('Usage: probe-api.mjs mlb "schedule?sportId=1&date=..."');
    const url = `${MLB_API}/${arg}`;
    console.error("GET", url);
    print(await (await fetch(url)).json());
    break;
  }

  case "starters": {
    const date = arg ?? new Date().toISOString().slice(0, 10);
    const fantasy = rest.includes("--fantasy");
    const starters = await fetchProbableStarters(date);
    console.error(`${date}: ${starters.length} probable starters`);
    if (!fantasy) {
      print(starters);
      break;
    }
    const c = yahooClient();
    const enriched = [];
    for (const s of starters) {
      let status = "unknown";
      try {
        const d = await c.get(
          `/league/${lk}/players;search=${encodeURIComponent(s.name)};out=ownership;count=5`,
        );
        const players = asArr(d?.league?.players?.player);
        const p =
          players.find(
            (x) => x?.position_type === "P" || /\b(SP|RP|P)\b/.test(String(x?.display_position ?? "")),
          ) ?? players[0];
        const o = p?.ownership ?? {};
        if (o.ownership_type === "team")
          status = o.owner_team_key === tk ? "yourTeam" : `otherTeam:${o.owner_team_name ?? "?"}`;
        else if (o.ownership_type === "freeagents") status = "freeAgent";
        else if (o.ownership_type === "waivers") status = "waivers";
      } catch (e) {
        status = `error:${e.message}`;
      }
      enriched.push({ ...s, fantasyStatus: status });
    }
    print(enriched);
    break;
  }

  default:
    console.error("Commands: yahoo <resource> | mlb <path?query> | starters [date] [--fantasy]");
    process.exit(1);
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolvePlayer,
  playerRole,
  fetchMlbStats,
  fetchMlbRecentStats,
  fetchSavantExpected,
  fetchSavantStatcast,
  fetchFanGraphs,
  fetchProbableStarters,
  guessBrefId,
  type ProbableStarter,
} from "../statsClient.js";
import { jsonResult } from "./context.js";
import type { ToolContext } from "./context.js";
import { asArray } from "../util.js";

const READ_ONLY = { readOnlyHint: true } as const;

function currentSeason(): number {
  return new Date().getFullYear();
}

/** Unwrap a Promise.allSettled result, returning null on rejection. */
function val<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

/** Where a probable starter sits in the league: on your team, a rival's, or available. */
type FantasyOwnership = {
  fantasyStatus: "yourTeam" | "otherTeam" | "freeAgent" | "waivers" | "unknown";
  ownerTeamName?: string;
};

/**
 * Resolve a probable starter (known only by name from the MLB feed) to its Yahoo
 * ownership in the configured league. Yahoo has no MLBAM cross-walk, so we match
 * by name and — since two-way players like Ohtani return both a batter and a
 * pitcher row — prefer the pitcher entry. Best-effort: any miss is "unknown".
 */
async function lookupOwnership(
  ctx: ToolContext,
  leagueKey: string,
  myTeamKey: string | undefined,
  name: string,
): Promise<FantasyOwnership> {
  try {
    const data = await ctx.client.get(
      `/league/${leagueKey}/players;search=${encodeURIComponent(name)};out=ownership;count=5`,
    );
    const players = asArray(data?.league?.players?.player);
    if (players.length === 0) return { fantasyStatus: "unknown" };
    const pitcher =
      players.find(
        (p: any) =>
          p?.position_type === "P" || /\b(SP|RP|P)\b/.test(String(p?.display_position ?? "")),
      ) ?? players[0];
    const o = pitcher?.ownership ?? {};
    switch (o.ownership_type) {
      case "team":
        return myTeamKey && o.owner_team_key === myTeamKey
          ? { fantasyStatus: "yourTeam" }
          : { fantasyStatus: "otherTeam", ownerTeamName: o.owner_team_name };
      case "freeagents":
        return { fantasyStatus: "freeAgent" };
      case "waivers":
        return { fantasyStatus: "waivers" };
      default:
        return { fantasyStatus: "unknown" };
    }
  } catch {
    return { fantasyStatus: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// MLB stat shape helpers — reused for season and recent splits
// ---------------------------------------------------------------------------
function mapBatterMlbStat(mlb: Record<string, unknown>) {
  return {
    games: mlb["gamesPlayed"],
    plateAppearances: mlb["plateAppearances"],
    atBats: mlb["atBats"],
    hits: mlb["hits"],
    doubles: mlb["doubles"],
    triples: mlb["triples"],
    homeRuns: mlb["homeRuns"],
    rbi: mlb["rbi"],
    runs: mlb["runs"],
    stolenBases: mlb["stolenBases"],
    caughtStealing: mlb["caughtStealing"],
    walks: mlb["baseOnBalls"],
    strikeouts: mlb["strikeOuts"],
    avg: mlb["avg"],
    obp: mlb["obp"],
    slg: mlb["slg"],
    ops: mlb["ops"],
    babip: mlb["babip"],
    totalBases: mlb["totalBases"],
  };
}

function mapPitcherMlbStat(mlb: Record<string, unknown>) {
  return {
    games: mlb["gamesPlayed"],
    gamesStarted: mlb["gamesStarted"],
    inningsPitched: mlb["inningsPitched"],
    wins: mlb["wins"],
    losses: mlb["losses"],
    saves: mlb["saves"],
    holds: mlb["holds"],
    saveOpportunities: mlb["saveOpportunities"],
    blownSaves: mlb["blownSaves"],
    era: mlb["era"],
    whip: mlb["whip"],
    strikeouts: mlb["strikeOuts"],
    walks: mlb["baseOnBalls"],
    homeRunsAllowed: mlb["homeRuns"],
    strikeoutsPer9: mlb["strikeoutsPer9Inn"],
    walksPer9: mlb["walksPer9Inn"],
    qualityStarts: mlb["qualityStarts"],
  };
}

/** Fetch and assemble multi-source stats for a single player. */
async function collectPlayerStats(playerName: string, season: number) {
  const identity = await resolvePlayer(playerName);
  if (!identity) return { error: `Player not found: "${playerName}". Try the full name.` };

  const { mlbamId, nameSlug, fullName, primaryPositionCode } = identity;
  const role = playerRole(primaryPositionCode);
  const isPitcher = role === "pitcher";
  const savantType = isPitcher ? "pitcher" : "batter";
  const mlbGroup = isPitcher ? "pitching" : "hitting";

  const [mlbResult, xResult, scResult, fgResult, r14Result, r30Result] =
    await Promise.allSettled([
      fetchMlbStats(mlbamId, season, mlbGroup),
      fetchSavantExpected(mlbamId, season, savantType),
      fetchSavantStatcast(mlbamId, season, savantType),
      fetchFanGraphs(mlbamId, season, role),
      fetchMlbRecentStats(mlbamId, 14, mlbGroup),
      fetchMlbRecentStats(mlbamId, 30, mlbGroup),
    ]);

  const mlb = val(mlbResult);
  const xStats = val(xResult);
  const sc = val(scResult);
  const fg = val(fgResult);
  const r14 = val(r14Result);
  const r30 = val(r30Result);

  const brefId = guessBrefId(fullName);
  const fgId = fg?.["playerid"];
  const fgSlug = fullName.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, "-");

  const noStatsFound = !mlb && !xStats && !sc && !fg;

  const mapStat = isPitcher ? mapPitcherMlbStat : mapBatterMlbStat;
  const standard = mlb ? mapStat(mlb) : null;

  const expectedStats = xStats
    ? isPitcher
      ? {
          xBAAgainst: xStats["est_ba"],
          xSLGAgainst: xStats["est_slg"],
          xwOBAAgainst: xStats["est_woba"],
          xBAminusBAAgainst: xStats["est_ba_minus_ba_diff"],
          xwOBAminuswOBAAgainst: xStats["est_woba_minus_woba_diff"],
        }
      : {
          xBA: xStats["est_ba"],
          xSLG: xStats["est_slg"],
          xwOBA: xStats["est_woba"],
          xBAminusBA: xStats["est_ba_minus_ba_diff"],
          xSLGminusSLG: xStats["est_slg_minus_slg_diff"],
          xwOBAminuswOBA: xStats["est_woba_minus_woba_diff"],
        }
    : null;

  const statcast = sc
    ? isPitcher
      ? {
          avgExitVelocityAgainst: sc["avg_hit_speed"],
          maxExitVelocityAgainst: sc["max_hit_speed"],
          hardHitPctAgainst: sc["ev95percent"],
          barrelPctAgainst: sc["brl_percent"],
          avgLaunchAngleAgainst: sc["avg_hit_angle"],
        }
      : {
          avgExitVelocity: sc["avg_hit_speed"],
          maxExitVelocity: sc["max_hit_speed"],
          ev50: sc["ev50"],
          hardHitPct: sc["ev95percent"],
          barrelPct: sc["brl_percent"],
          barrelPerPA: sc["brl_pa"],
          avgLaunchAngle: sc["avg_hit_angle"],
          sweetSpotPct: sc["anglesweetspotpercent"],
          maxDistance: sc["max_distance"],
          avgDistance: sc["avg_distance"],
        }
    : null;

  const fangraphs = fg
    ? isPitcher
      ? {
          fanGraphsId: fgId,
          war: fg["WAR"],
          era: fg["ERA"],
          fip: fg["FIP"],
          xfip: fg["xFIP"],
          whip: fg["WHIP"],
          kPct: fg["K%"],
          bbPct: fg["BB%"],
          gbPct: fg["GB%"],
          fbPct: fg["FB%"],
          hrPerFb: fg["HR/FB"],
          babip: fg["BABIP"],
          lobPct: fg["LOB%"],
          swStrPct: fg["SwStr%"],
        }
      : {
          fanGraphsId: fgId,
          war: fg["WAR"],
          wRCplus: fg["wRC+"],
          wOBA: fg["wOBA"],
          iso: fg["ISO"],
          babip: fg["BABIP"],
          kPct: fg["K%"],
          bbPct: fg["BB%"],
          swStrPct: fg["SwStr%"],
          avgExitVelo: fg["EV"],
          barrelPct: fg["Barrel%"],
          hardHitPct: fg["HardHit%"],
          gbPct: fg["GB%"],
          fbPct: fg["FB%"],
          hrPerFb: fg["HR/FB"],
          ldPct: fg["LD%"],
        }
    : null;

  const savantView = isPitcher ? "statcast-r-pitching-mlb" : "statcast-r-hitting-mlb";
  const fgTab = isPitcher ? "pitching" : "batting";

  return {
    player: { name: fullName, mlbamId, season, playerType: role },
    ...(noStatsFound && {
      warning: `No ${season} stats found for ${fullName}. The player may be inactive, on the injured list, or not yet in the majors this season. Do not make roster decisions based on this result.`,
    }),
    standard,
    ...(r14 && { recent14d: mapStat(r14) }),
    ...(r30 && { recent30d: mapStat(r30) }),
    expectedStats,
    statcast,
    fangraphs,
    sourceUrls: {
      mlbOfficialPage: `https://www.mlb.com/player/${nameSlug}`,
      baseballSavant: `https://baseballsavant.mlb.com/savant-player/${nameSlug}?stats=${savantView}`,
      baseballReference: `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml`,
      fanGraphs: fgId
        ? `https://www.fangraphs.com/players/${fgSlug}/${fgId}/stats/${fgTab}`
        : null,
    },
  };
}

export function registerAnalysisTools(server: McpServer, ctx: ToolContext): void {
  // -------------------------------------------------------------------
  // Single player analysis
  // -------------------------------------------------------------------
  server.registerTool(
    "analyze_player_stats",
    {
      title: "Analyze advanced player stats",
      description:
        "Fetch and aggregate advanced statistics for a single player from multiple " +
        "authoritative sources: MLB Stats API (standard stats), Baseball Savant " +
        "(Statcast exit velocity / barrel rate / expected stats), " +
        "and FanGraphs (WAR, wRC+, K%, BB%, plate discipline). " +
        "The response includes the league's scoring categories so advice can focus " +
        "on stats that actually count. Use this before making roster add/drop decisions.",
      inputSchema: {
        playerName: z
          .string()
          .describe("Player's full name, e.g. 'Shohei Ohtani' or 'Freddie Freeman'"),
        season: z
          .number()
          .int()
          .optional()
          .describe("Season year, e.g. 2025. Defaults to the current season."),
      },
      annotations: READ_ONLY,
    },
    async ({ playerName, season }) => {
      const yr = season ?? currentSeason();
      const [result, categories] = await Promise.all([
        collectPlayerStats(playerName, yr),
        ctx.getLeagueScoringCategories(),
      ]);
      if (categories.length > 0) {
        const batting = categories.filter(c => c.positionType === "B").map(c => c.displayName);
        const pitching = categories.filter(c => c.positionType === "P").map(c => c.displayName);
        return jsonResult({ ...result, leagueScoringCategories: { batting, pitching } });
      }
      return jsonResult(result);
    },
  );

  // -------------------------------------------------------------------
  // Roster-level analysis: look up advanced stats for every player on
  // the team's current roster in one call.
  // -------------------------------------------------------------------
  server.registerTool(
    "analyze_roster_stats",
    {
      title: "Analyze advanced stats for entire roster",
      description:
        "Fetch advanced stats (Statcast, expected stats, FanGraphs) for a batch of rostered " +
        "players. Accepts at most 10 players per call via playerKeys — callers should first use " +
        "get_roster to retrieve all player keys, split them into batches of up to 10, and " +
        "call this tool once per batch (calls can run in parallel). " +
        "The response includes the league's scoring categories so advice targets " +
        "stats that actually matter in this league (e.g. SB if stolen bases count, " +
        "HLD if holds count). Combine with get_roster to see who is starting or benched.",
      inputSchema: {
        teamKey: z
          .string()
          .optional()
          .describe("Team key, e.g. 431.l.12345.t.2. Defaults to configured team."),
        date: z
          .string()
          .optional()
          .describe("Roster date as YYYY-MM-DD. Defaults to today."),
        season: z
          .number()
          .int()
          .optional()
          .describe("Season year for stat lookup. Defaults to current season."),
        playerKeys: z
          .array(z.string())
          .max(10)
          .optional()
          .describe("Subset of roster to fetch, by Yahoo player key or full player name. Max 10."),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date, season, playerKeys }) => {
      const yr = season ?? currentSeason();
      const tk = ctx.resolveTeamKey(teamKey);
      const d = date ?? new Date().toISOString().slice(0, 10);

      const [rosterData, categories] = await Promise.all([
        ctx.client.get(`/team/${tk}/roster;date=${d}/players;out=stats`),
        ctx.getLeagueScoringCategories(),
      ]);

      const allPlayers = asArray(
        rosterData?.team?.roster?.players?.player ??
        rosterData?.roster?.players?.player,
      );

      if (allPlayers.length === 0) {
        return jsonResult({ error: "Could not read roster. Make sure you are set up (say 'fantasy start')." });
      }

      const players = playerKeys && playerKeys.length > 0
        ? allPlayers.filter((p: any) => {
            const pKey = String(p?.player_key ?? p?.playerKey ?? "");
            const name = String(p?.name?.full ?? p?.full_name ?? p?.name ?? "").toLowerCase();
            return playerKeys.some((k: string) => k === pKey || name === k.toLowerCase());
          })
        : allPlayers;

      const results = await Promise.all(
        players.map(async (p: any) => {
          const name: string = p?.name?.full ?? p?.full_name ?? p?.name ?? String(p);
          try {
            return await collectPlayerStats(name, yr);
          } catch {
            return { player: { name, season: yr }, error: "Stats lookup failed" };
          }
        }),
      );

      const leagueScoringCategories = categories.length > 0
        ? {
            batting: categories.filter(c => c.positionType === "B").map(c => c.displayName),
            pitching: categories.filter(c => c.positionType === "P").map(c => c.displayName),
          }
        : undefined;

      return jsonResult({ season: yr, rosterDate: d, ...(leagueScoringCategories && { leagueScoringCategories }), players: results });
    },
  );

  // -------------------------------------------------------------------
  // Probable starting pitchers for a date (MLB Stats API), optionally
  // annotated with Yahoo ownership for the configured league.
  // -------------------------------------------------------------------
  server.registerTool(
    "list_probable_starters",
    {
      title: "List probable starting pitchers for a date",
      description:
        "List every probable starting pitcher across MLB for a date, with each one's " +
        "opponent, home/away, and game start time (UTC). Sourced from the MLB Stats API " +
        "(no Yahoo auth needed). MLB only posts probables for roughly today through ~2-3 " +
        "days out, so 'tomorrow' returns a full board, the day after is usually partial, " +
        "and dates further out return few or none (not yet announced — not an error). " +
        "Set fantasyContext=true to also label each starter as yourTeam / otherTeam (with " +
        "the owning manager) / freeAgent — useful for spotting streamable free-agent " +
        "starters. Enrichment issues about one Yahoo request per starter (~10-26), so " +
        "leave it off unless you need ownership.",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe("Date as YYYY-MM-DD; defaults to today. Use tomorrow/day-after for planning."),
        fantasyContext: z
          .boolean()
          .optional()
          .default(false)
          .describe("When true, annotate each starter with Yahoo ownership in the configured league."),
      },
      annotations: READ_ONLY,
    },
    async ({ date, fantasyContext }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      const starters = await fetchProbableStarters(d);

      if (starters.length === 0) {
        return jsonResult({
          date: d,
          count: 0,
          starters: [],
          note:
            "No probable starters are posted for this date yet. MLB typically announces " +
            "probables only for today through ~2-3 days out.",
        });
      }

      if (!fantasyContext) {
        return jsonResult({ date: d, count: starters.length, starters });
      }

      // Enrich with Yahoo ownership; degrade to the plain list if Yahoo isn't set up.
      let leagueKey: string;
      try {
        leagueKey = ctx.resolveLeagueKey();
      } catch {
        return jsonResult({
          date: d,
          count: starters.length,
          starters,
          note:
            "Yahoo is not set up, so ownership could not be added. Say `fantasy start` to " +
            "connect a league, or omit fantasyContext.",
        });
      }
      let myTeamKey: string | undefined;
      try {
        myTeamKey = ctx.resolveTeamKey();
      } catch {
        myTeamKey = undefined; // no default team — 'yourTeam' just won't be flagged
      }

      const enriched = await Promise.all(
        starters.map(async (s: ProbableStarter) => ({
          ...s,
          ...(await lookupOwnership(ctx, leagueKey, myTeamKey, s.name)),
        })),
      );
      return jsonResult({ date: d, count: enriched.length, leagueKey, starters: enriched });
    },
  );
}

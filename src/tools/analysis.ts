import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolvePlayer,
  fetchMlbStats,
  fetchSavantExpected,
  fetchSavantStatcast,
  fetchSavantSprintSpeed,
  fetchFanGraphs,
  guessBrefId,
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

/** Fetch and assemble multi-source stats for a single player. */
async function collectPlayerStats(playerName: string, season: number) {
  const identity = await resolvePlayer(playerName);
  if (!identity) return { error: `Player not found: "${playerName}". Try the full name.` };

  const { mlbamId, nameSlug, fullName } = identity;

  const [mlbResult, xResult, scResult, spdResult, fgResult] = await Promise.allSettled([
    fetchMlbStats(mlbamId, season),
    fetchSavantExpected(mlbamId, season),
    fetchSavantStatcast(mlbamId, season),
    fetchSavantSprintSpeed(mlbamId, season),
    fetchFanGraphs(mlbamId, season),
  ]);

  const mlb = val(mlbResult);
  const xStats = val(xResult);
  const sc = val(scResult);
  const spd = val(spdResult);
  const fg = val(fgResult);

  const brefId = guessBrefId(fullName);
  const fgId = fg?.["playerid"];
  const fgSlug = fullName.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, "-");

  return {
    player: { name: fullName, mlbamId, season },
    standard: mlb ? {
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
    } : null,
    expectedStats: xStats ? {
      xBA: xStats["est_ba"],
      xSLG: xStats["est_slg"],
      xwOBA: xStats["est_woba"],
      xBAminusBA: xStats["est_ba_minus_ba_diff"],
      xSLGminusSLG: xStats["est_slg_minus_slg_diff"],
      xwOBAminuswOBA: xStats["est_woba_minus_woba_diff"],
    } : null,
    statcast: sc ? {
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
    } : null,
    sprintSpeed: spd ? {
      sprintSpeed: spd["sprint_speed"],
      bolts: spd["bolts"],
      hp_to_1b: spd["hp_to_1b"],
    } : null,
    fangraphs: fg ? {
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
    } : null,
    sourceUrls: {
      mlbOfficialPage: `https://www.mlb.com/player/${nameSlug}`,
      baseballSavant: `https://baseballsavant.mlb.com/savant-player/${nameSlug}?stats=statcast-r-hitting-mlb`,
      baseballReference: `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml`,
      fanGraphs: fgId
        ? `https://www.fangraphs.com/players/${fgSlug}/${fgId}/stats/batting`
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
        "(Statcast exit velocity / barrel rate / expected stats / sprint speed), " +
        "and FanGraphs (WAR, wRC+, K%, BB%, plate discipline). " +
        "Use this before making roster add/drop decisions.",
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
      const result = await collectPlayerStats(playerName, yr);
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
        "Fetch advanced stats (Statcast, expected stats, FanGraphs) for every " +
        "player currently on the team's roster. Great for daily lineup decisions " +
        "and identifying underperformers vs. their xStats. " +
        "Combine with get_team_roster to see who is starting or benched.",
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
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date, season }) => {
      const yr = season ?? currentSeason();
      const tk = ctx.resolveTeamKey(teamKey);

      // Fetch roster from Yahoo
      const d = date ?? new Date().toISOString().slice(0, 10);
      const rosterData = await ctx.client.get(`/team/${tk}/roster;date=${d}/players;out=stats`);

      // Extract player names from Yahoo's XML-derived structure
      const players = asArray(
        rosterData?.team?.roster?.players?.player ??
        rosterData?.roster?.players?.player,
      );

      if (players.length === 0) {
        return jsonResult({ error: "Could not read roster. Make sure you are set up (say 'fantasy start')." });
      }

      // Fetch advanced stats for each player concurrently
      const results = await Promise.all(
        players.map(async (p: any) => {
          const name: string =
            p?.name?.full ?? p?.full_name ?? p?.name ?? String(p);
          try {
            return await collectPlayerStats(name, yr);
          } catch {
            return { player: { name, season: yr }, error: "Stats lookup failed" };
          }
        }),
      );

      return jsonResult({ season: yr, rosterDate: d, players: results });
    },
  );
}

import axios from "axios";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const SAVANT = "https://baseballsavant.mlb.com";
const FANGRAPHS = "https://www.fangraphs.com";

// ---------------------------------------------------------------------------
// Simple in-process cache (survives across tool calls in the same server run)
// ---------------------------------------------------------------------------
interface CacheEntry { ts: number; data: unknown }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function cached<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data as T;
  const data = await fetch();
  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------
// CSV parser (handles double-quoted fields containing commas)
// ---------------------------------------------------------------------------
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = vals[i]?.trim() ?? ""; });
    return rec;
  });
}

// ---------------------------------------------------------------------------
// Player identity
// ---------------------------------------------------------------------------
export interface PlayerIdentity {
  mlbamId: number;
  /** e.g. "shohei-ohtani-660271" — used in savant / mlb.com URLs */
  nameSlug: string;
  fullName: string;
  /** MLB Stats API primaryPosition.code, e.g. "1" for pitcher, "10" for DH */
  primaryPositionCode: string;
}

/** Map a MLB position code to a fantasy-relevant role. */
export function playerRole(positionCode: string): "pitcher" | "batter" {
  return positionCode === "1" ? "pitcher" : "batter";
}

/**
 * Resolve a player name to MLB/MLBAM identity via the official MLB Stats API.
 * Returns null if the player is not found.
 */
export async function resolvePlayer(name: string): Promise<PlayerIdentity | null> {
  const res = await axios.get(`${MLB_API}/people/search`, {
    params: { names: name, sportId: 1 },
  });
  const people = res.data?.people;
  if (!Array.isArray(people) || people.length === 0) return null;
  const p = people[0];
  return {
    mlbamId: Number(p.id),
    nameSlug: String(p.nameSlug),
    fullName: String(p.fullName),
    primaryPositionCode: String(p.primaryPosition?.code ?? ""),
  };
}

// ---------------------------------------------------------------------------
// MLB Stats API — standard season stats
// ---------------------------------------------------------------------------
export async function fetchMlbStats(
  mlbamId: number,
  season: number,
  group: "hitting" | "pitching" = "hitting",
): Promise<Record<string, unknown> | null> {
  const res = await axios.get(`${MLB_API}/people/${mlbamId}/stats`, {
    params: { stats: "season", season, sportId: 1, group },
  });
  return res.data?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

/** Last-N-days rolling splits from the MLB Stats API.
 *  Tracks real on-field performance regardless of fantasy roster slot. */
export async function fetchMlbRecentStats(
  mlbamId: number,
  lastNDays: number,
  group: "hitting" | "pitching" = "hitting",
): Promise<Record<string, unknown> | null> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - lastNDays);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await axios.get(`${MLB_API}/people/${mlbamId}/stats`, {
    params: { stats: "byDateRange", startDate: fmt(startDate), endDate: fmt(endDate), sportId: 1, group },
  });
  return res.data?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

// ---------------------------------------------------------------------------
// Baseball Savant CSV leaderboards — cached per endpoint+type per season
// ---------------------------------------------------------------------------
async function savantLeaderboard(
  endpoint: string,
  params: Record<string, string | number>,
  season: number,
): Promise<Record<string, string>[]> {
  const type = params["type"] ?? "all";
  return cached(`savant:${endpoint}:${type}:${season}`, async () => {
    const res = await axios.get(`${SAVANT}/leaderboard/${endpoint}`, {
      params: { ...params, csv: "true" },
      responseType: "text",
    });
    return parseCsv(res.data as string);
  });
}

/** xBA, xSLG, xwOBA from the expected statistics leaderboard */
export async function fetchSavantExpected(
  mlbamId: number,
  season: number,
  type: "batter" | "pitcher" = "batter",
): Promise<Record<string, string> | null> {
  const rows = await savantLeaderboard(
    "expected_statistics",
    { type, year: season, position: "", team: "", min: 1 },
    season,
  );
  return rows.find(r => r["player_id"] === String(mlbamId)) ?? null;
}

/** Barrel %, exit velocity, hard-hit % from the Statcast leaderboard */
export async function fetchSavantStatcast(
  mlbamId: number,
  season: number,
  type: "batter" | "pitcher" = "batter",
): Promise<Record<string, string> | null> {
  const rows = await savantLeaderboard(
    "statcast",
    { type, year: season, position: "", team: "", min: 1 },
    season,
  );
  return rows.find(r => r["player_id"] === String(mlbamId)) ?? null;
}

/** Sprint speed from the sprint speed leaderboard */
export async function fetchSavantSprintSpeed(mlbamId: number, season: number): Promise<Record<string, string> | null> {
  const rows = await savantLeaderboard(
    "sprint_speed",
    { year: season, position: "", team: "", min: 1 },
    season,
  );
  return rows.find(r => r["player_id"] === String(mlbamId)) ?? null;
}

// ---------------------------------------------------------------------------
// FanGraphs leaderboard — cached per season
// The response includes both `playerid` (FG-specific) and `xMLBAMID` (MLBAM),
// which is how we cross-reference from our MLBAM ID to a FanGraphs player ID.
// ---------------------------------------------------------------------------
async function fgLeaderboard(stats: "bat" | "pit", season: number): Promise<Record<string, unknown>[]> {
  return cached(`fg:${stats}:${season}`, async () => {
    const res = await axios.get(`${FANGRAPHS}/api/leaders/major-league/data`, {
      params: {
        pos: "all",
        stats,
        lg: "all",
        qual: 0,
        season,
        season1: season,
        pageitems: 3000,
        pagenum: 1,
        team: 0,
        type: 8,          // dashboard (standard + advanced + Statcast)
        month: 0,
      },
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  });
}

/** WAR, wRC+/ERA, K%, BB%, and more from FanGraphs. Returns the raw row. */
export async function fetchFanGraphs(
  mlbamId: number,
  season: number,
  role: "batter" | "pitcher" = "batter",
): Promise<Record<string, unknown> | null> {
  const rows = await fgLeaderboard(role === "pitcher" ? "pit" : "bat", season);
  return (rows.find(r => Number(r["xMLBAMID"]) === mlbamId) as Record<string, unknown>) ?? null;
}

// ---------------------------------------------------------------------------
// Heuristic Baseball Reference player ID
// Pattern: first5(last) + first2(first) + "01", all lowercase alpha only.
// Works for the vast majority of players; edge cases exist for shared names.
// ---------------------------------------------------------------------------
export function guessBrefId(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return clean(last).slice(0, 5) + clean(first).slice(0, 2) + "01";
}

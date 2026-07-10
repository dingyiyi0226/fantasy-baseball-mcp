// Yahoo key formats:
//   league = {game_id}.l.{league_id}   e.g. 431.l.12345
//   team   = {league_key}.t.{n}        e.g. 431.l.12345.t.2
//   player = {game_id}.p.{player_id}   e.g. 431.p.10642

/** Game id is the leading segment of any league or team key. */
export function gameIdFromLeagueKey(leagueKey: string): string {
  return leagueKey.split(".")[0];
}

/** Return the league key for a team key by stripping the trailing team segment. */
export function leagueKeyFromTeamKey(teamKey: string): string {
  return teamKey.replace(/\.t\.\d+$/, "");
}

/** Escape XML special characters in interpolated Yahoo request values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

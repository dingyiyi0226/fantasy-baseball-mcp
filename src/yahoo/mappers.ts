import { asArray } from "../util.js";

function mapManager(m: any) {
  return {
    manager_id: m.manager_id,
    nickname: m.nickname,
    ...(m.is_commissioner ? { is_commissioner: 1 } : {}),
    ...(m.is_current_login ? { is_current_login: 1 } : {}),
    felo_score: m.felo_score,
    felo_tier: m.felo_tier,
  };
}

function mapManagers(managers: any) {
  const mgrs = asArray(managers?.manager).map(mapManager);
  return mgrs.length === 1 ? mgrs[0] : mgrs;
}

/** Fields present on every league envelope. */
export function mapLeagueHeader(league: any) {
  return {
    league_key: league.league_key,
    league_id: league.league_id,
    name: league.name,
    draft_status: league.draft_status,
    num_teams: league.num_teams,
    weekly_deadline: league.weekly_deadline,
    roster_type: league.roster_type,
    scoring_type: league.scoring_type,
    scoring_label: league.scoring_label,
    league_type: league.league_type,
    matchup_week: league.matchup_week,
    current_week: league.current_week,
    start_week: league.start_week,
    end_week: league.end_week,
    start_date: league.start_date,
    end_date: league.end_date,
    current_date: league.current_date,
    season: league.season,
    game_code: league.game_code,
    allow_add_to_dl_extra_pos: league.allow_add_to_dl_extra_pos,
    is_pro_league: league.is_pro_league,
    is_cash_league: league.is_cash_league,
    is_plus_league: league.is_plus_league,
    ...(league.is_finished ? { is_finished: league.is_finished } : {}),
  };
}

/** Strip logos, URLs, and redundant fields from a team entry. */
export function mapTeamSummary(t: any) {
  return {
    team_key: t.team_key,
    team_id: t.team_id,
    name: t.name,
    ...(t.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    number_of_moves: t.number_of_moves,
    number_of_trades: t.number_of_trades,
    roster_adds_this_week: t.roster_adds?.value,
    draft_position: t.draft_position,
    managers: mapManagers(t.managers),
  };
}

/** Strip image and URL noise from a player entry. */
export function mapPlayerProfile(p: any) {
  const eligiblePositions = asArray(p.eligible_positions?.position).filter(Boolean);
  return {
    player_key: p.player_key,
    player_id: p.player_id,
    name: p.name?.full ?? p.name,
    editorial_team_abbr: p.editorial_team_abbr,
    editorial_team_full_name: p.editorial_team_full_name,
    display_position: p.display_position,
    position_type: p.position_type,
    ...(p.primary_position ? { primary_position: p.primary_position } : {}),
    eligible_positions: eligiblePositions.length ? eligiblePositions : undefined,
    ...(p.status ? { status: p.status } : {}),
    ...(p.status_full ? { status_full: p.status_full } : {}),
    ...(p.injury_note ? { injury_note: p.injury_note } : {}),
    ...(p.on_disabled_list ? { on_disabled_list: p.on_disabled_list } : {}),
    is_undroppable: p.is_undroppable,
  };
}

/** Minimal player projection shared by compact roster views. */
export function mapCompactRosterPlayer(p: any) {
  return {
    player_key: p.player_key,
    name: p.name?.full ?? p.name,
    editorial_team_abbr: p.editorial_team_abbr,
    display_position: p.display_position,
    selected_position: p.selected_position?.position,
    status: p.status ?? null,
  };
}

/** Strip noise from a single matchup entry. */
export function mapMatchup(m: any, mapTeam: (team: any) => any) {
  return {
    week: m.week,
    week_start: m.week_start,
    week_end: m.week_end,
    status: m.status,
    is_playoffs: m.is_playoffs,
    is_consolation: m.is_consolation,
    ...(m.is_tied !== undefined ? { is_tied: m.is_tied } : {}),
    ...(m.winner_team_key ? { winner_team_key: m.winner_team_key } : {}),
    ...(m.is_matchup_of_the_week ? { is_matchup_of_the_week: m.is_matchup_of_the_week } : {}),
    stat_winners: m.stat_winners,
    teams: asArray(m.teams?.team).map(mapTeam),
  };
}

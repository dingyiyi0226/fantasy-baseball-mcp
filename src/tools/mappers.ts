import { asArray } from "../util.js";

// ---------------------------------------------------------------------------
// Private helpers — shared across multiple public mappers
// ---------------------------------------------------------------------------

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

/** Fields present on every league envelope (get_league, get_league_scoreboard, rank_players, etc.) */
function mapLeagueHeader(league: any) {
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

/** Strip logos, URL, redundant fields from a team entry. */
function mapTeamSummary(t: any) {
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

/** Strip image/URL noise from a player entry. */
function mapPlayerProfile(p: any) {
  const eligPos = asArray(p.eligible_positions?.position).filter(Boolean);
  return {
    player_key: p.player_key,
    player_id: p.player_id,
    name: p.name?.full ?? p.name,
    editorial_team_abbr: p.editorial_team_abbr,
    editorial_team_full_name: p.editorial_team_full_name,
    display_position: p.display_position,
    position_type: p.position_type,
    ...(p.primary_position ? { primary_position: p.primary_position } : {}),
    eligible_positions: eligPos.length ? eligPos : undefined,
    ...(p.status ? { status: p.status } : {}),
    ...(p.status_full ? { status_full: p.status_full } : {}),
    ...(p.injury_note ? { injury_note: p.injury_note } : {}),
    ...(p.on_disabled_list ? { on_disabled_list: p.on_disabled_list } : {}),
    is_undroppable: p.is_undroppable,
  };
}

/** Minimal player projection shared by the compact roster views. */
function mapCompactRosterPlayer(p: any) {
  return {
    player_key: p.player_key,
    name: p.name?.full ?? p.name,
    editorial_team_abbr: p.editorial_team_abbr,
    display_position: p.display_position,
    selected_position: p.selected_position?.position,
    status: p.status ?? null,
  };
}

/** Team identity for a league-wide scoreboard. */
function mapScoreboardTeam(t: any) {
  return {
    team_key: t.team_key,
    name: t.name,
  };
}

/** Team details for one team's matchup history. */
function mapTeamMatchupTeam(t: any) {
  return {
    team_key: t.team_key,
    name: t.name,
    team_stats: t.team_stats,
  };
}

/** Strip noise from a single matchup entry. */
function mapMatchup(m: any, mapTeam: (team: any) => any) {
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

// ---------------------------------------------------------------------------
// Public mappers — one per tool
// ---------------------------------------------------------------------------

/** get_league */
export function mapLeague(data: any) {
  const league = data?.league;
  if (!league) return data;

  const settings = league.settings
    ? {
        draft_type: league.settings.draft_type,
        is_auction_draft: league.settings.is_auction_draft,
        scoring_type: league.settings.scoring_type,
        uses_playoff: league.settings.uses_playoff,
        playoff_start_week: league.settings.playoff_start_week,
        num_playoff_teams: league.settings.num_playoff_teams,
        uses_playoff_reseeding: league.settings.uses_playoff_reseeding,
        uses_lock_eliminated_teams: league.settings.uses_lock_eliminated_teams,
        num_playoff_consolation_teams: league.settings.num_playoff_consolation_teams,
        has_multiweek_championship: league.settings.has_multiweek_championship,
        waiver_type: league.settings.waiver_type,
        waiver_rule: league.settings.waiver_rule,
        uses_faab: league.settings.uses_faab,
        waiver_time: league.settings.waiver_time,
        max_weekly_adds: league.settings.max_weekly_adds,
        trade_end_date: league.settings.trade_end_date,
        trade_ratify_type: league.settings.trade_ratify_type,
        trade_reject_time: league.settings.trade_reject_time,
        player_pool: league.settings.player_pool,
        cant_cut_list: league.settings.cant_cut_list,
        uses_median_score: league.settings.uses_median_score,
        season_type: league.settings.season_type,
        min_innings_pitched: league.settings.min_innings_pitched,
        post_draft_players: league.settings.post_draft_players,
        roster_positions: asArray(league.settings.roster_positions?.roster_position).map(
          (p: any) => ({
            position: p.position,
            ...(p.position_type ? { position_type: p.position_type } : {}),
            count: p.count,
            is_starting_position: p.is_starting_position,
          }),
        ),
        stat_categories: asArray(league.settings.stat_categories?.stats?.stat).map(
          (s: any) => ({
            stat_id: s.stat_id,
            display_name: s.display_name,
            position_type: s.position_type,
            sort_order: s.sort_order,
            ...(s.is_only_display_stat ? { is_only_display_stat: 1 } : {}),
          }),
        ),
      }
    : undefined;

  return {
    league: {
      ...mapLeagueHeader(league),
      teams: asArray(league.teams?.team).map(mapTeamSummary),
      settings,
      standings: asArray(league.standings?.teams?.team).map((t: any) => ({
        team_key: t.team_key,
        name: t.name,
        team_stats: t.team_stats,
        team_points: t.team_points,
        team_standings: t.team_standings,
      })),
    },
  };
}

/** list_leagues */
export function mapListLeagues(data: any) {
  const games = asArray(data?.users?.user?.games?.game);
  return {
    games: games.map((g: any) => {
      const leagues = asArray(g.leagues?.league).map(mapLeagueHeader);
      const gameWeeks = asArray(g.game_weeks?.game_week).map((w: any) => ({
        week: w.week,
        start: w.start,
        end: w.end,
      }));
      return {
        game_key: g.game_key,
        game_id: g.game_id,
        name: g.name,
        code: g.code,
        season: g.season,
        is_game_over: g.is_game_over,
        is_offseason: g.is_offseason,
        game_weeks: gameWeeks.length ? gameWeeks : undefined,
        leagues: leagues.length ? leagues : undefined,
      };
    }),
  };
}

/** get_league_teams */
export function mapTeams(data: any) {
  return {
    teams: asArray(data?.teams?.team).map((t: any) => ({
      ...mapTeamSummary(t),
      team_stats: t.team_stats,
      team_points: t.team_points,
      team_standings: t.team_standings,
    })),
  };
}

/** get_roster with includeStats=true — compact player fields plus Yahoo stats. */
export function mapRosterCompactWithStats(data: any) {
  const team = data?.team;
  if (!team) return data;
  const roster = team.roster;
  return {
    team: {
      team_key: team.team_key,
      team_id: team.team_id,
      name: team.name,
      ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    },
    roster_date: roster?.date,
    players: asArray(roster?.players?.player).map((p: any) => ({
      ...mapCompactRosterPlayer(p),
      player_stats: p.player_stats,
    })),
  };
}

/** get_team_stats */
export function mapTeamStats(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team_key: team.team_key,
    name: team.name,
    ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    team_stats: team.team_stats,
    team_points: team.team_points,
  };
}

/** get_league_scoreboard */
export function mapMatchups(data: any) {
  const league = data?.league;
  if (!league) return data;
  const sb = league.scoreboard;
  return {
    league: {
      league_key: league.league_key,
      name: league.name,
    },
    scoreboard: {
      week: sb?.week,
      matchups: asArray(sb?.matchups?.matchup).map((m) => mapMatchup(m, mapScoreboardTeam)),
    },
  };
}

/** get_team_matchup_history */
export function mapTeamMatchups(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: {
      team_key: team.team_key,
      name: team.name,
      team_stats: team.team_stats,
    },
    matchups: asArray(team.matchups?.matchup).map((m) => mapMatchup(m, mapTeamMatchupTeam)),
  };
}

/** get_player_stats */
export function mapPlayerStats(data: any) {
  return {
    players: asArray(data?.players?.player).map((p: any) => ({
      ...mapPlayerProfile(p),
      player_stats: p.player_stats,
    })),
  };
}

/** rank_players */
export function mapRankPlayers(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    players: asArray(league.players?.player).map((p: any) => {
      const ownership = p.ownership
        ? {
            ownership_type: p.ownership.ownership_type,
            ...(p.ownership.owner_team_key
              ? { owner_team_key: p.ownership.owner_team_key }
              : {}),
            ...(p.ownership.owner_team_name
              ? { owner_team_name: p.ownership.owner_team_name }
              : {}),
          }
        : undefined;
      return {
        ...mapPlayerProfile(p),
        ...(p.starting_status?.is_starting !== undefined
          ? { is_starting: p.starting_status.is_starting }
          : {}),
        ...(p.batting_order?.order_num !== undefined
          ? { batting_order: p.batting_order.order_num }
          : {}),
        ownership,
        player_stats: p.player_stats,
        player_advanced_stats: p.player_advanced_stats,
      };
    }),
  };
}

/** get_transactions */
export function mapTransactions(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    transactions: asArray(league.transactions?.transaction).map((t: any) => ({
      transaction_key: t.transaction_key,
      transaction_id: t.transaction_id,
      type: t.type,
      status: t.status,
      timestamp: t.timestamp,
      players: asArray(t.players?.player).map((p: any) => ({
        player_key: p.player_key,
        player_id: p.player_id,
        name: p.name?.full ?? p.name,
        editorial_team_abbr: p.editorial_team_abbr,
        display_position: p.display_position,
        position_type: p.position_type,
        transaction_data: p.transaction_data,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Light variants — smaller projections of endpoints whose full mapper above
// carries heavy nested data (matchups / per-player stat blocks). These power
// the get_standings / get_roster / list_players tools.
// ---------------------------------------------------------------------------

/** get_standings — standings table + season category stats, no matchups. */
export function mapStandings(data: any) {
  return {
    teams: asArray(data?.teams?.team).map((t: any) => ({
      team_key: t.team_key,
      team_id: t.team_id,
      name: t.name,
      ...(t.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
      team_standings: t.team_standings,
      team_stats: t.team_stats,
    })),
  };
}

/** get_roster with full=true — standard roster slots and availability, no stats. */
export function mapRosterFull(data: any) {
  const team = data?.team;
  if (!team) return data;
  const roster = team.roster;
  return {
    team: {
      team_key: team.team_key,
      team_id: team.team_id,
      name: team.name,
      ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    },
    roster_date: roster?.date,
    players: asArray(roster?.players?.player).map((p: any) => ({
      ...mapPlayerProfile(p),
      selected_position: p.selected_position?.position,
      is_flex: p.selected_position?.is_flex || undefined,
      is_starting: p.starting_status?.is_starting,
    })),
  };
}

/** get_roster default — compact player identity and roster status. */
export function mapRosterCompact(data: any) {
  const team = data?.team;
  if (!team) return data;
  const roster = team.roster;
  return {
    team: {
      team_key: team.team_key,
      team_id: team.team_id,
      name: team.name,
      ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    },
    roster_date: roster?.date,
    players: asArray(roster?.players?.player).map(mapCompactRosterPlayer),
  };
}

/** list_players — ranked players with ownership, no stat blocks. */
export function mapPlayerList(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    players: asArray(league.players?.player).map((p: any) => ({
      ...mapPlayerProfile(p),
      ownership: p.ownership
        ? {
            ownership_type: p.ownership.ownership_type,
            ...(p.ownership.owner_team_key
              ? { owner_team_key: p.ownership.owner_team_key }
              : {}),
            ...(p.ownership.owner_team_name
              ? { owner_team_name: p.ownership.owner_team_name }
              : {}),
          }
        : undefined,
    })),
  };
}

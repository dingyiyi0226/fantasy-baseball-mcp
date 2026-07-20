# `daily-roster-review`

Use this tool when the user asks for a day-of roster check, fantasy roster review, start/sit help,
lineup moves, add/drop targets, or general matchup-status guidance for one or more Yahoo fantasy
baseball teams.

Read `references/tool-notes.md` before calling any Yahoo tools.

## Strategy

- **Goal:** Win the weekly head-to-head matchup, not the best roster. Every start/sit and add/drop
  decision must improve the chance of winning more categories this week; a strictly "better" player
  who does not move a winnable category — or actively hurts one — is the wrong add.
- **Week stage:** Resolve day type from the active-week matchup's `week_end` in Phase 1A.
  - **Final two days (days 6-7):** Maximize the win aggressively.
    - Build margin in every category the opponent can still flip; chase every close, tied, or
      flippable losing category.
    - Assume the opponent activates all confirmed starters and obvious bench upgrades.
    - Use replaceable roster spots for streams and lineup upgrades that widen vulnerable winning
      categories, convert ties, or remove opponent comeback paths.
    - Prefer extra margin over optional depth when the drop is replaceable and the move targets live
      categories. Accept damage to already-lost categories when it improves the path to more wins.
    - Avoid pitching adds that risk a ratio category only when that ratio is still winnable or being
      protected.
  - **Days 1-5:** Optimize the full week; prioritize adds that bank value.
  - Week stage raises or lowers urgency; it never overrides protecting cornerstones or using only
    replaceable roster spots for streams and lineup upgrades.
- **Category priorities:** Use the matchup scoreboard and opponent's best plausible active roster.
  - **Winning safely:** Protect it; do not make moves that risk it.
  - **Winning but vulnerable:** Build margin. In the final two days, treat slim leads as attack
    targets.
  - **Close / flippable:** Spend roster slots and adds here.
  - **Lost:** Punt it when the margin is wide and it is not flippable this week; redirect roster
    slots and adds toward categories still in play.
  - **Paired/counter categories:** Chasing SV can risk BSV, and ERA, WHIP, and K/BB are fragile.
    Do not over-add at one category's expense of its counterpart.
  - **Ratio-for-counting trade:** If WHIP/ERA are already lost but W or QS is winnable, a risky SP
    can be correct because the innings buy chances at live categories.
  - **Next week's value:** Do not drop a genuine roster cornerstone for a one-week stream; use
    low-value or role-less players for short-term moves.

## Inputs

```text
teams:       discover from Yahoo auth/status, or use team keys explicitly provided by the user
league:      discover from the selected team/matchup, or use a league key explicitly provided by the user
autoStartBench: true  # default - execute lineup adjustments via `adjust-lineup` unless explicitly disabled
autoAddDrop:   false # default - keep add/drop as a checklist unless explicitly enabled
lineupDate:  user-provided date; defaults to the current date
```

## Execution Order

Run teams **sequentially** when the user owns or requests multiple teams to avoid rate-limiting the
Savant/FanGraphs/MLB stat endpoints. Within each team, batch tool calls where possible.

## Phase 0 — Setup

Call `fantasy_status` to confirm auth. Then call `get_league_metadata` for the current week and
season dates, and `get_league_scoring_categories` for the league's scored categories. Do not call
`get_league` during setup: its teams, settings, and standings are not needed for a daily review.

Set `currentWeek` from the league's current week.

After Phase 1A returns the active-week matchup's `week_end`, determine **day type** by comparing it
to `lineupDate`. Apply the matching Strategy bullet during Phase 2A.

Before reviewing any team, call `list_probable_starters` **once per `lineupDate`** with
`date=lineupDate, fantasyContext=false`. Reuse that plain MLB board for every team in this
review. Read each starter row using its matching `starters.columns` positions. Do not request
fantasy ownership enrichment: it performs a Yahoo lookup for every starter and only uses the
configured default league/team, which may not be the team currently under review.

## Phase 1 — Gather

Run steps A-E for the current team before moving to the next.

### A — Matchup

Call `get_team_matchup_history` with `weeks: [currentWeek]` for the active week (and
`get_team_stats` with `period: "week", week: currentWeek` if matchup data is sparse). Use
`get_league_scoreboard` with `week: currentWeek` only when the full league's pairings are also
needed.
Produce the category scoreboard in exactly this form (substitute the current matchup totals):

| R | HR | RBI | SB | HBP | TB | OBP |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 26–28 | 8–7 | 26–23 | 1–1 | 0–4 | 69–85 | .303–.321 |
| L | W | W | T | L | L | L |

| W | SV | ERA | WHIP | K/BB | QS | BSV |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2–1 | 1–2 | 3.64–6.26 | 1.40–1.54 | 3.33–2.31 | 4–1 | 0–1 |
| W | L | W | W | W | W | W |

### B — Roster Snapshot, Capacity, and Role Pools

Call `get_roster` with `teamKey=currentTeamKey, date=lineupDate`. Join its pitchers to the shared
probable-starter board locally by normalized player name and MLB team abbreviation. Build one
normalized roster snapshot before evaluating any start/sit or transaction decision. For each player:
- Flag DTD / IL / NA status.
- Mark whether they are Active or on BN.
- Identify every IL/NA-status player occupying an active or `BN` slot. If configured reserve
  capacity is not already cached for this league, lazily call `get_league` once for the league.
  Read the configured `IL` and `NA` counts from `settings.roster_positions` by matching its
  `columns` to its `rows`, and cache the result for the rest of the review. A failed lookup caches
  an unknown result rather than triggering another league read for a later team.
- Count occupied reserve assignments from this team's `get_roster` rows whose
  `selected_position` is `IL` or `NA`. A matching reserve slot is vacant only when its configured
  count is greater than its occupied assignment count. Never infer configured IL/NA capacity from
  the number of reserve rows returned by `get_roster`; empty reserve slots may be omitted.
- If settings cannot be fetched, record reserve capacity as **unknown**. Do not call the reserve
  full and do not recommend a drop from occupied roster rows alone. Use the Yahoo
  browser/transaction page to confirm whether a drop is required.
- Move an eligible player into a vacant matching reserve slot before ordinary start/bench or
  transaction choices. Treat the freed active/`BN` spot as an available standard roster spot and
  prefer adding a compatible target without a drop. Consider a drop only after no standard spot
  can be freed, or after Yahoo's transaction page confirms that a drop is required.
- Partition the roster into three decision pools:
  - **Batters:** every healthy active hitter plus every credible `BN` hitter who can reach a legal
    active slot directly or through an exact multi-slot rotation.
  - **Starting pitchers:** every pitcher matched to the `lineupDate` probable-starter board. A
    pitcher with SP/RP eligibility belongs here for this review when a start is scheduled.
  - **Relief pitchers:** every remaining pitcher enters a preliminary RP/hybrid pool. Refine that
    pool from recent usage in Phase 1C; do not infer a relief role from the fantasy `RP` label alone.
- Record `is_starting` as raw Yahoo evidence, not as a shared availability rule. Its meaning is
  interpreted separately inside the batter, starting-pitcher, and relief-pitcher branches.

Regression cases for this decision order:

| Case | Configured reserve | Occupied assignments | Candidate | Required result |
|---|---:|---:|---|---|
| Vacant IL | 5 IL | 3 IL | IL10 player on BN | Move BN -> IL, treat the freed standard spot as open, and recommend adding the target without a drop |
| Full IL | 5 IL | 5 IL | IL10 player on BN | No reserve vacancy; consider a drop only if no other standard spot can be freed or Yahoo confirms one is required |
| Vacant NA | 3 NA | 2 NA | NA player on BN | Move BN -> NA, treat the freed standard spot as open, and recommend adding the target without a drop |

### C — Role-Specific Evidence Pass

Reuse the player keys from Phase 1B's roster response; do not call `get_roster` again. Use
`analyze_roster_stats` only for players whose evidence is needed by a role branch, in batches of
**<=10 keys**. Calls may run in parallel when available, but multiple user teams still run
sequentially.

Build the smallest sufficient evidence set:

- **Batters:** every credible `BN` hitter and the active hitters who are their best legal slot
  alternatives. Decode games and plate appearances plus skill and category production from each
  available window.
- **Starting pitchers:** every rostered pitcher scheduled on `lineupDate`.
- **Relief pitchers:** rostered RPs only when saves, blown saves, holds, or fragile ratio categories
  are strategically relevant.

`analyze_roster_stats` can analyze only players on the current roster. For every free-agent SP, RP,
or batter carried forward from Phase 1E, use `analyze_player_stats` instead.

Decode each `mlbStats.standard`, `mlbStats.recent14d`, and `mlbStats.recent30d` array by matching
values to the same player's `mlbStats.columns` indexes. Extract only:

- **Batters:** games, plate appearances, PA/game, wRC+, OBP, HR, SB, TB, barrel%, xwOBA-wOBA gap,
  and the recent 14-/30-day category production when present.
- **Starting pitchers:** games started, innings, W, QS, ERA/xERA, WHIP, K/BB, K%, BB%, and recent
  workload.
- **Relief pitchers:** games, games started, innings, SV, HLD, save opportunities, BSV, ERA, WHIP,
  K/BB, K%, and BB%, with the 14-day window primary and 30-day window as role confirmation.

If a recent window is absent, mark that evidence unavailable. Do not convert missing data into a
negative playing-time, scheduled-start, or bullpen-role signal.

### D — Opponent Roster Pressure

Call `get_roster` for the opponent with `teamKey=opponentTeamKey, date=lineupDate`
before deciding whether your planned management is enough. Join the opponent's pitchers to the
same shared probable-starter board locally by normalized player name and MLB team abbreviation.
Estimate the opponent's best plausible roster with the same three role models, using a lighter pass
than the user's roster unless a close category needs deeper evidence.

For the opponent:
- **Batters:** assume healthy regulars and obvious legal bench upgrades produce the best plausible
  active lineup. Do not depend on Yahoo hitter `is_starting`, which is commonly unavailable during
  the morning review.
- **Starting pitchers:** count probable/confirmed starts from the shared board, including a
  scheduled pitcher currently on `BN` as opponent pressure.
- **Relief pitchers:** count only likely closer or committee arms as material SV pressure; do not
  treat every active RP as an equal save chance.
- Estimate opponent pressure on flippable categories: especially W, QS, SV, K/BB, SB, HR, RBI,
  OBP, and TB.
- Compare your planned moves against that pressure. Explicitly state whether the plan is
  "enough", "barely enough", or "not enough" and why.

### E — Conditional Free-Agent Discovery

Do not run every free-agent search by default. Open a role-specific scout only when the matchup
strategy identifies a live category that the current roster cannot address well enough. Preserve
roster depth when the likely category gain does not justify an add or drop.

#### Starting Pitchers

Use the `list_probable_starters` board first to identify SPs who are actually probable to start on
`lineupDate`. Determine whether a probable SP is a free agent or on waivers from this league's
`rank_players` ownership data; do not infer availability from the shared starter board.

Call `rank_players` with `sortType=lastmonth` then `lastweek`, paginating from offset ~75 until
>=8 free agents are found in the returned `ownership.ownership_type` values. Carry forward only
probable starters who can materially improve a live W, QS, strikeout, or innings path without
unacceptable ERA/WHIP/K/BB risk. Use `analyze_player_stats` for those free-agent finalists.

#### Relief Pitchers

Run an RP search only when SV or another relief-driven category is live, or when a rostered RP has
lost a meaningful role. Use the league's actual scoring-category stat id with `rank_players` and
filter locally for free-agent relief eligibility. Shortlist at most three RPs, then use recent 14-
and 30-day SV, HLD, save opportunities, BSV, games started, and ratio evidence from
`analyze_player_stats` to classify their roles. Do not call a reliever a closer from eligibility,
one save, or one blown save alone.

Note explicitly when no rosterable closer or committee arm has a credible save path.

#### Batters

Call `rank_free_agent_batters` with `period=lastweek`. Use `sort=AR` for the initial board, then
make category-specific calls for at most the three highest-priority flippable batting categories,
using their stat ids from Phase 0. Union and deduplicate the results, then carry at most five
batters into Phase 2.

- The tool already returns only players with Yahoo `status=FA` and `position=B`; do not page
  through owned players or filter pitchers locally.
- Ignore Yahoo's same-day hitter `is_starting` when discovering or shortlisting batters. The normal
  review runs before most MLB batting lineups are posted, so the shortlist must be complete without
  it. A later non-null flag may confirm availability, but `null` is always unknown.
- Use `period=lastmonth` only to break ties or when the last-week sample is too small. The 14-day
  validation comes from `analyze_player_stats` in Phase 2, not from Yahoo ranking.
- Prioritize candidates who contribute to the team's weakest flippable batting categories and can
  legally fill a usable active slot.

After all opened role scouts:

- Before identifying a drop candidate, check the roster assignments after any proposed IL/NA
  placement. If a standard roster slot is empty or will be freed by that placement and can hold the
  target, prefer an add-only recommendation; do not pair the add with a drop merely because a
  replaceable player exists. Recommend an add/drop only when no standard spot can be freed, or
  Yahoo's transaction page confirms that a drop is required. When configured reserve capacity is
  unknown, confirm through Yahoo before requiring a drop.
- For every proposed add (including an add/drop or streamer), decide its **lineup follow-up** for
  `lineupDate`: either **add and start** it in an exact legal slot, naming the player to bench, or
  **add only — leave on BN**, with the reason. Do not leave this implicit just because the target
  can occupy an empty roster spot; an added player may be a same-day lineup upgrade rather than
  bench depth.
- Rank by the team's weakest categories.
- Judge "hot" from `mlbStats.recent14d` / `mlbStats.recent30d` only when those keys are present; if absent,
  use `mlbStats.standard` and do not label the player hot.

## Phase 2 — Deep Evaluation

For every player flagged as a non-obvious start/sit candidate, add/drop target, or streamer SP
in Phase 1, challenge the initial assessment with contextual data before finalizing moves.

### A — Apply Strategy

Before evaluating individual players, apply the relevant Strategy bullets to the Phase 1 scoreboard
and opponent roster pressure.

Write a one-line strategy per team. In the final two days, also answer whether the plan
is enough to prevent a flip after considering the opponent's best plausible active roster.

### B — Batter Decision Branch

Evaluate rostered batters and shortlisted free-agent batters independently of pitcher logic. The
normal review runs before MLB batting lineups are announced, so Yahoo hitter `is_starting` is not an
input to candidate discovery, ranking, or the default start/sit decision. A non-null flag in a later
run may confirm a posted lineup; `null` always means unknown and never means bench.

For every credible `BN` hitter, compare them with the best legal active-slot alternative. Include
all active players required for an exact multi-slot rotation; do not compare unrelated player pairs.
Use this evidence hierarchy:

1. **Health and opportunity:** DTD/IL/NA status and whether the hitter's MLB team plays on
   `lineupDate`.
2. **Recent participation:** use `recent14d` games and plate appearances as the primary window,
   with `recent30d` for stability. Compute PA/game when possible. When an exact team-game count is
   available from reliable schedule context, compare player games with team games; otherwise do not
   invent an appearance rate.
3. **Role quality:** regular playing time around 3.5+ PA/game is stronger evidence than a pinch-hit
   or sparse role. Treat smaller samples as uncertain rather than as confirmed inactivity.
4. **Platoon context:** identify the opposing probable SP and throwing hand, then use
   `analyze_player_stats` or targeted web research for handedness splits when the comparison is
   close. A stable platoon pattern can lower or raise expected playing time before lineups post.
5. **Category contribution:** compare recent R, HR, RBI, SB, TB, and OBP with the live matchup;
   use season wRC+, barrel%, and xwOBA vs. wOBA as the skill check behind recent results.
6. **Arsenal context only when decisive:** research the opposing SP's pitch mix only when a close
   start/sit or add decision could reverse on a documented pitch-type weakness.

Record one result for every credible bench hitter: **start** with the exact legal move, **keep on
BN** with an evidence-backed reason, or an exact multi-slot rotation. Label confidence **high**,
**medium**, or **low**; low-confidence uncertainty must be visible and cannot silently preserve the
current lineup.

For every shortlisted free-agent batter, call `analyze_player_stats` and use `recent14d` as the main
validation window; use `recent30d` only when the 14-day data is absent or clearly too sparse. Do not
reject a candidate solely because Yahoo has not posted the day's starting lineup.

Batter regression cases:

| Case | Evidence | Required result |
|---|---|---|
| All hitter flags are null | Credible bench hitter and legal active alternative | Complete the comparison and emit start, keep on BN, or an exact rotation; never preserve the lineup from null flags |
| Bench regular vs. DTD active hitter | Strong recent participation vs. health uncertainty | Compare them directly and state the exact move or the evidence for keeping the current assignment |
| Likely platoon hitter faces unfavorable hand | Sparse PA/game or documented split | Lower playing-time confidence and keep on BN when the incumbent has the safer role |

### C — Starting-Pitcher Decision Branch

Use the shared `list_probable_starters` board as the primary schedule source. Pitcher
`is_starting` is useful here because rotations are announced earlier than batting lineups, but it is
confirmation or fallback evidence rather than a reason to ignore the shared board.

Assign one schedule state to each SP candidate:

| Probable board | Yahoo `is_starting` | Schedule state |
|---|---:|---|
| Match | 1 | Confirmed start |
| Match | null | Probable start; null is unknown, not a sit signal |
| No match | 1 | Yahoo fallback; verify if practical before a consequential move |
| Match | 0 | Source conflict; verify once rather than automatically benching |
| No match | 0 or null | No scheduled-start evidence |

For every scheduled rostered or free-agent SP:

1. Check the opposing lineup quality, park factor, and outdoor-game weather.
2. Use recent and season peripherals only when the start/sit or streamer decision is non-obvious.
3. Check workload or innings-limit context.
4. Project impact on W, QS, strikeouts/innings, ERA, WHIP, and K/BB using the league's actual
   categories and current margins.
5. Apply the Strategy ratio tradeoff: a risky SP can be correct when ERA/WHIP are already lost and
   the innings buy a realistic W/QS path; protect a live ratio when the projected downside can flip it.

Record **start**, **bench**, **stream and start**, or **avoid**, with the exact P/SP/RP slot impact.
Do not deep-evaluate pitchers who have no scheduled-start evidence unless they belong in the relief
branch.

### D — Relief-Pitcher Decision Branch

Ignore Yahoo `is_starting` for relief pitchers. Infer the current bullpen role from actual usage,
using `recent14d` as the primary window, `recent30d` as stability evidence, and season numbers only
as fallback.

First calculate relief appearances as games minus games started, then classify each relevant RP:

- **Likely closer:** repeated save opportunities with saves and/or blown saves across multiple
  relief appearances.
- **Committee/high leverage:** a meaningful mixture of saves, save opportunities, and holds.
- **Setup/holds:** holds dominate while saves and save opportunities are rare.
- **Middle/bulk relief:** few leverage outcomes, or longer multi-inning relief usage without a
  credible save path.
- **Hybrid/SP:** meaningful recent starts; move to the starting-pitcher branch whenever scheduled on
  the probable board.

A single save or BSV does not establish a closer role: setup pitchers can receive both. Prefer the
combined pattern of save opportunities, saves, blown saves, holds, and relief appearances. For a
finalist, confirm current bullpen competition and recent workload, including back-to-back usage,
with current role evidence when available. If exact game-by-game workload is unavailable, label
today's availability uncertain instead of inventing rest status.

Only chase an RP when their role targets a live scored category. In an SV-only league, a holds-heavy
setup arm is not a closer substitute. Balance the chance of SV against BSV, ERA, WHIP, and K/BB
risk, and do not recommend speculative saves when the likely category gain cannot justify that risk.

Record **start RP**, **keep active**, **bench**, **add for saves**, or **avoid**, with role evidence
and the category reason.

RP regression cases:

| Recent pattern | Required classification |
|---|---|
| Multiple SV/SVOP, few HLD | Likely closer, subject to workload and role confirmation |
| HLD dominate, no meaningful SVOP | Setup/holds; not a closer in an SV-only league |
| Mixed SV, HLD, and BSV | Committee/high leverage; state uncertainty and ratio/BSV risk |
| RP eligibility but recent GS or probable-board match | Hybrid/SP; use the SP branch for a scheduled start |

### E — Merge Decisions and Finalize Actions

First, finalize each legal IL/NA placement identified in Phase 1B. Treat the newly freed standard
slot as available roster capacity when evaluating add targets. Then merge the three branch outputs
against the category plan and opponent pressure.

Resolve conflicts before Phase 3:

- No player may be assigned to multiple destinations, and every move must preserve legal slot
  eligibility.
- Prefer the smallest exact move or rotation that captures the category gain.
- A low-confidence opportunity call may remain a recommendation; missing hitter flags alone cannot
  lower confidence or block an otherwise approved move.
- For each final add/add-drop verdict, compare the target against the player currently occupying the
  best legal active slot for `lineupDate`.
- Record **Add and start:** target slot and the player moving to `BN` (or the exact legal rotation).
- Record **Add only — leave on BN:** why the target is depth, a future stream, blocked by
  eligibility, or not a better same-day play.

Produce one compact verdict table per team:

```markdown
| Player | Branch | Initial call | Key evidence | Confidence | Final call |
|---|---|---|---|---|---|
| Player A | Batter | Start (SS) | Regular role; favorable platoon | High | Start (SS) |
| Player B | SP | Stream | Confirmed start; W/QS live | Medium | Stream and start |
| Player C | RP | Saves add | Holds-heavy, no recent SVOP | High | Avoid |
```

If deeper role evidence reverses an earlier call, prefix it with `Phase 2 reversal`.

## Phase 3 — Execute or Checklist

If `autoStartBench=false` and `autoAddDrop=false`, output a numbered manual checklist in execution order.

If `autoStartBench=true`, hand the approved lineup adjustments to the dedicated `adjust-lineup`
workflow and follow that skill's surface-specific execution steps. If browser-driven write execution
is unavailable, fall back to the manual checklist. After a first browser timeout, follow the single
fresh-tab retry in `browser-control.md`; if it does not save the move, verify with `get_roster` and
fall back to the manual checklist. Do not make another browser recovery attempt during this review.
Execute and verify any approved IL/NA placement before normal start/bench swaps or an add
transaction, so a newly empty standard slot can be used without a drop. Record a successfully saved
browser action for the final report's **Executed** section. If
verification fails or is unavailable, record it for **Recommended** and explain why in the report's
earlier rationale; never treat it as completed.

If `autoAddDrop=true`, hand each exact approved transaction to the dedicated `add-drop-player`
workflow and follow its surface-specific execution and verification steps. If browser-driven write
execution is unavailable, fall back to the manual checklist. The Yahoo write API path is legacy-only
and should not be used in normal execution. Never auto-drop in the final two days without a clear win
reason.

After each verified add/add-drop, perform its recorded lineup follow-up: when the verdict is **add
and start**, refresh the roster state and hand the exact target-to-slot move to `adjust-lineup` if
`autoStartBench=true`; otherwise put that move immediately after the transaction in the manual
checklist. When the verdict is **add only — leave on BN**, report that no lineup adjustment is
needed. Never claim an added player was started until the lineup change is separately saved and
verified.

After executing any roster change, finish by calling `get_roster` (`date=lineupDate`) to verify the
saved state — the browser page can misrepresent what Yahoo saved, so treat `get_roster` as the
source of truth and report any mismatch.

## Phase 4 — Synthesize & Report

Complete Phase 3 before writing this report so every action can be sorted into **Recommended** or
**Executed** from its verified final state, rather than from its original recommendation.

For each team, output these sections in order:

1. **Week Strategy**
2. **Category Scoreboard**
3. **Opponent Pressure Check**
4. **Decision Rationale**
5. **Executed**
6. **Recommended**

Rules:
- Use the exact batting-then-pitching category-scoreboard template in Phase 1A. Use markdown
  tables for compact supporting evidence only. Write lineup and add/drop actions as plain,
  one-line moves so a manager can scan them quickly.
- **Decision Rationale** gives each non-trivial action a brief **Why** and compact **Evidence**;
  use a short action identifier when helpful.
- **Recommended** and **Executed** contain only clean action lines.
- **Recommended** contains only actions that still need to be done. **Executed** contains only
  successfully saved and verified browser-plugin actions. If **Executed** is non-empty, introduce
  it with `Completed via browser plugin and verified with get_roster.` Never repeat that status in
  the individual action lines.
- Follow this format for lineup and add/drop actions. For a three-way-or-larger rotation, do not
  compress it into a single swap; list each player's destination on its own line, in execution
  order:

  ```markdown
  # swap example
  - **Player A** (2B) <-> **Player B** (BN)

  # 3 way example
  - **Player A** (2B) -> **Player B** (BN)
  - **Player B** (BN) -> **Player C** (SS)
  - **Player C** (SS) -> **Player A** (2B)

  # add/drop and start example
  - Add **Player A** (SP); drop **Player B** (BN); then start **Player A** (SP), bench **Player C** (P)

  # add-only example
  - Add **Player A** (SP) into the open roster slot; no lineup adjustment — leave on BN
  ```

  Every add/add-drop action must include one of those explicit lineup outcomes: `then start ...`
  with the exact move, or `no lineup adjustment — leave on BN` with its reason in **Decision
  Rationale**.

- Example rationale:

  ```markdown
  ## Decision Rationale
  **A — Add Player A; drop Player B; then start Player A and bench Player C.** Targets W and QS,
  the week's closest pitching categories.
  Evidence: Player A starts today; Player B has no confirmed role or start.
  ```

- Phase 2 reversals must be called out with the `Phase 2 reversal` prefix.
- If there are no urgent moves, say so explicitly.

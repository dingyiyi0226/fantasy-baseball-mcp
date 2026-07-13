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
review. Do not request fantasy ownership enrichment: it performs a Yahoo lookup for every starter
and only uses the configured default league/team, which may not be the team currently under
review.

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

### B — Your Roster & Availability

Call `get_roster` with `teamKey=currentTeamKey, date=lineupDate`. Join its pitchers to the shared
probable-starter board locally by normalized player name and MLB team abbreviation. For each player:
- Flag DTD / IL / NA status.
- Mark whether they are Active or on BN.
- Identify every IL/NA-status player occupying an active or `BN` slot, the available `IL`/`NA`
  reserve slots, and whether that player can legally move into a vacant matching reserve slot.
  Prioritize that placement before ordinary start/bench choices: it frees a standard roster spot
  without dropping anyone.
- Identify pitchers with a start on `lineupDate` from the `list_probable_starters` result.
- Output: a start/sit candidate list with slot positions and "playing on lineupDate? y/n".

### C — Opponent Roster Pressure

Call `get_roster` for the opponent with `teamKey=opponentTeamKey, date=lineupDate`
before deciding whether your planned management is enough. Join the opponent's pitchers to the
same shared probable-starter board locally by normalized player name and MLB team abbreviation. If
the opponent roster appears unmanaged or has stale bench choices, infer the expected best active
roster from the lineup date's Yahoo start flags and obvious active/bench conflicts.

For the opponent:
- List active hitters with `is_starting=1`, benched hitters with `is_starting=1`, and active
  hitters with `is_starting=0`.
- List active pitchers, probable/confirmed starting pitchers, relievers with save paths, and any
  bench pitchers who appear likely to start on `lineupDate`, using the
  `list_probable_starters` board for probable SPs.
- Estimate opponent pressure on flippable categories: especially W, QS, SV, K/BB, SB, HR, RBI,
  OBP, and TB.
- Compare your planned moves against that pressure. Explicitly state whether the plan is
  "enough", "barely enough", or "not enough" and why.

### D — Stat Cruncher

Reuse the player keys from Phase 1B's roster response; do not call `get_roster` again. Split
them into **batches of <=10 keys**. Call `analyze_roster_stats` once per batch
(batches may run as parallel calls if available; otherwise sequential).

Extract only this compact summary from each player object:
- **Batters**: wRC+, OBP, HR, SB, TB, barrel%, xwOBA-wOBA gap; `recent14d`/`recent30d` when present.
- **Pitchers**: ERA/xERA, WHIP, K/BB, K%, BB%, QS; `recent14d`/`recent30d` when present.

### E — FA Scout

#### Pitchers

Use the `list_probable_starters` board first to identify SPs who are actually probable to start on
`lineupDate`. Determine whether a probable SP is a free agent or on waivers from this league's
`rank_players` ownership data; do not infer availability from the shared starter board.

Call `rank_players` with `sortType=lastmonth` then `lastweek`, paginating from offset ~75 until
>=8 free agents are found in the returned `ownership.ownership_type` values.
- Note if no rosterable closer is available.

#### Batters

Call `rank_free_agent_batters` with `period=lastweek`. Use `sort=AR` for the initial board, then
make category-specific calls for at most the three highest-priority flippable batting categories,
using their stat ids from Phase 0. Union and deduplicate the results, then carry at most five
batters into Phase 2.

- The tool already returns only players with Yahoo `status=FA` and `position=B`; do not page
  through owned players or filter pitchers locally.
- Treat Yahoo's same-day `is_starting` as supporting evidence when present, never as a prerequisite
  for the shortlist. Early in the day that field may be absent.
- Use `period=lastmonth` only to break ties or when the last-week sample is too small. The 14-day
  validation comes from `analyze_player_stats` in Phase 2, not from Yahoo ranking.
- Prioritize candidates who contribute to the team's weakest flippable batting categories and can
  legally fill a usable active slot.

After both scouts:

- Before identifying a drop candidate, check the roster assignments after any proposed IL/NA
  placement. If a standard roster slot is empty, prefer an add-only recommendation; do not pair
  the add with a drop merely because a replaceable player exists. Recommend an add/drop only when
  no empty slot remains, or Yahoo's transaction page confirms that a drop is required.
- Rank by the team's weakest categories.
- Judge "hot" from `recent14d`/`recent30d` only when those keys are present; if absent,
  use the season line and do not label the player hot.

## Phase 2 — Deep Evaluation

For every player flagged as a non-obvious start/sit candidate, add/drop target, or streamer SP
in Phase 1, challenge the initial assessment with contextual data before finalizing moves.

### A — Apply Strategy

Before evaluating individual players, apply the relevant Strategy bullets to the Phase 1 scoreboard
and opponent roster pressure.

Write a one-line strategy per team. In the final two days, also answer whether the plan
is enough to prevent a flip after considering the opponent's best plausible active roster.

### B — Identify Targets

First, finalize each legal IL/NA placement identified in Phase 1B. Treat the newly freed standard
slot as available roster capacity when evaluating add targets.

From Phase 1, select:
- All non-trivial start/sit candidates
- All add/drop candidates
- Up to five shortlisted free-agent batters
- Every SP scheduled to start on `lineupDate` from the probable-starter board
- Any RP flagged as a saves source
- Any batter whose Phase 1 recent data was absent or sparse

### C — FA Batter Form & Playing Time

For every shortlisted free-agent batter:
1. Call `analyze_player_stats` and use `recent14d` as the main validation window;
   use `recent30d` only when the 14-day data is absent or clearly too sparse.
2. Check games, plate appearances, and plate appearances per game. Prefer regular playing time
   around 3.5+ PA/game; label smaller samples as high variance rather than treating a short hot
   streak as a stable role.
3. Compare recent R, HR, RBI, SB, TB, and OBP with the live matchup categories. Use season wRC+,
   barrel%, and xwOBA vs. wOBA as the skill-quality check behind the recent results.
4. Do not reject a candidate solely because Yahoo has not posted the day's starting lineup.

### D — Platoon & Handedness

For each batter target:
1. Use the probable-starter board to identify the `lineupDate` opposing SP hand.
2. Call `analyze_player_stats` or web-search for handedness splits.
3. Flag a mismatch if the batter is materially weaker against that hand.

### E — Pitcher Arsenal / Approach Matchup

For each batter target:
1. Web-search the opposing SP's pitch mix.
2. Check whether the batter has a documented weakness vs that pitch type.
3. Flag an arsenal mismatch if a clear weakness aligns with the SP's primary weapon.

### F — SP Context

For each SP starting on `lineupDate`:
1. Check opposing lineup quality.
2. Check park factor.
3. Check weather for outdoor games.
4. Call `analyze_player_stats` for peripherals if needed.
5. Check for workload or innings-limit context.

Apply the Strategy section's ratio-category guidance: if WHIP/ERA are punted this week, a risky SP
can still be a good add when the move buys W/QS.

### G — Closer Role Confirmation

For each RP flagged as a saves source:
1. Confirm role security and recent save usage.
2. Verify the move does not needlessly risk BSV.

### H — Evaluation Verdicts

Produce one compact table per team:

```markdown
| Player       | Type   | Initial Call     | Key Finding                              | Final Call            |
|--------------|--------|------------------|------------------------------------------|-----------------------|
| J. Turner    | Batter | Start (SS)       | vLHP wRC+ 74; lineupDate SP is LH        | ⚠️ Start w/ caveat    |
| C. Bellinger | Add    | High priority    | Closer role confirmed, 4 SV last 14d     | ✅ Confirmed          |
| K. Hendricks | SP     | Stream           | Coors Field, HR/F 1.42, weak K-BB%       | ❌ Reversed -> Sit    |
```

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
- For an ordinary two-player lineup swap, write the action cleanly:

  ```markdown
  - **Player A** (2B) <-> **Player B** (BN)
  ```

  For a three-way-or-larger rotation, do not compress it into a single swap. List each player's
  destination on its own line, in execution order:

  ```markdown
  - **Player A** (2B) -> **Player B** (BN)
  - **Player B** (BN) -> **Player C** (SS)
  - **Player C** (SS) -> **Player A** (2B)
  ```

- State each add/drop pair as one clean action line:

  ```markdown
  - Add **Player A** (SP); drop **Player B** (BN)
  ```

  When a verified empty standard slot is available, state the preferred add-only action instead:

  ```markdown
  - Add **Player A** (SP) into the open roster slot
  ```

- Example rationale:

  ```markdown
  ## Decision Rationale
  - **A — Add Player A; drop Player B.** Targets W and QS, the week's closest pitching categories.
    - Evidence: Player A starts today; Player B has no confirmed role or start.
  ```

- Phase 2 reversals must be called out with the `Phase 2 reversal` prefix.
- If there are no urgent moves, say so explicitly.

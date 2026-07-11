# `daily-roster-review`

Use this tool when the user asks for a day-of roster check, fantasy roster review, start/sit help,
lineup moves, add/drop targets, or general matchup-status guidance for one or more Yahoo fantasy
baseball teams.

Read `references/tool-notes.md` before calling any Yahoo tools.

## Guiding Principle — Win the Matchup, Not the Roster

**The goal is to win the weekly head-to-head matchup, not to acquire the best players.**
Every start/sit and add/drop decision is judged by one question: *does this move improve our
chance of winning more categories this week?* A strictly "better" player who doesn't move a
winnable category — or who actively hurts one — is the wrong add.

Apply this lens throughout, especially in Phase 2:

- **Punt unwinnable categories.** If a category is already lost by a wide margin and cannot
  realistically be flipped this week, stop spending resources on it. Redirect roster slots and
  add/drops toward categories that are still in play. Losing one category by a lot is the same
  as losing it by a little — concede it and concentrate elsewhere.
- **Watch paired/counter categories.** Some categories trade off against each other. SV and BSV
  are paired: stacking relievers/closers to chase saves also piles up blown-save risk, which can
  hand the opponent the BSV category. Don't over-add at one cat's expense of its counterpart.
  Ratio cats (ERA, WHIP, K/BB) are similarly fragile — a single bad outing can swing them.
- **Trade fragile ratio cats for counting cats when behind.** Late in the week, if WHIP/ERA are
  already lost and W or QS is still winnable, streaming extra starting pitchers is correct even
  though they'll inflate WHIP — because WHIP is already conceded this week. The innings buy
  shots at wins/QS that actually count toward the score.
- **Respect next week's value.** Don't drop a genuinely good rostered player for a one-week
  streaming gain. A strong everyday bat or anchor SP is worth more across the season than a
  marginal category point this week. Prefer dropping low-value/role-less players for short-term
  streams; protect cornerstones.
- **Read the clock.** The day type (resolved from the active-week matchup in Phase 1A) changes the math: early-week moves bank value
  and can be speculative; the last three days switch to margin-building. Do not merely preserve
  the current score; widen any category the opponent can still flip, including categories currently
  being won by a slim margin.
- **Be aggressive late.** In the final three days, the default posture is to win by as many
  categories, and by as much category margin, as practical. If a replaceable move can add buffer in
  a vulnerable winning category, flip a tied/losing category, or block an opponent's realistic path,
  recommend it. Do not stop at "probably enough" until the opponent's active/probable roster has
  been checked and the plan is enough even if the opponent fixes obvious lineup mistakes.

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
to `lineupDate`:
- **Final day** -> maximize the win aggressively: build margin in every category the opponent can
  still flip, chase every close/tied/flippable losing cat, and assume the opponent may activate all
  confirmed starters and obvious bench upgrades. Accept damage to already-lost categories when it
  improves the path to more category wins. Avoid pitching adds that risk a ratio category only when
  that ratio is still winnable or currently being protected.
- **Final three days (days 5-7)** -> shift from "try to win" to "win by as much as possible." Use
  replaceable roster spots for streams/lineup upgrades that widen vulnerable winning cats, convert
  ties, or remove opponent comeback paths. Prefer extra margin over preserving optional depth when
  the drop is replaceable and the move targets live categories.
- **Mid-week / first day** -> optimize the full week; prioritize adds that bank value.

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
Produce a compact category table: your totals vs. opponent totals for IP, W, SV, ERA, WHIP, K/BB, QS, BSV.

### B — Your Roster & Availability

Call `get_roster` with `teamKey=currentTeamKey, date=lineupDate`. Join its pitchers to the shared
probable-starter board locally by normalized player name and MLB team abbreviation. For each player:
- Flag DTD / IL / NA status.
- Mark whether they are Active or on BN.
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

Use the `list_probable_starters` board first to identify SPs who are actually probable to start on
`lineupDate`. Determine whether a probable SP is a free agent or on waivers from this league's
`rank_players` ownership data; do not infer availability from the shared starter board.

Call `rank_players` with `sortType=lastmonth` then `lastweek`, paginating from offset ~75 until
>=8 free agents are found in the returned `ownership.ownership_type` values.
- Rank by the team's weakest categories.
- Judge "hot" from `recent14d`/`recent30d` only when those keys are present; if absent,
  use the season line and do not label the player hot.
- Note if no rosterable closer is available.

## Phase 2 — Deep Evaluation

For every player flagged as a non-obvious start/sit candidate, add/drop target, or streamer SP
in Phase 1, challenge the initial assessment with contextual data before finalizing moves.

### A — Matchup Strategy

Before evaluating individual players, set the week's strategy using the guiding principle. From
the Phase 1 scoreboard, opponent roster pressure, and the Phase 1A day type, classify every category:

- **Winning safely** -> protect; don't make moves that risk it.
- **Winning but vulnerable** -> build margin; in the final three days, treat slim leads as attack targets.
- **Close / flippable** -> this is where to spend roster slots and adds.
- **Lost (wide margin, not flippable this week)** -> **punt it.**

Write a one-line strategy per team. On any of the final three days, also answer whether the plan
is enough to prevent a flip after considering the opponent's best plausible active roster.

### B — Identify Targets

From Phase 1, select:
- All non-trivial start/sit candidates
- All add/drop candidates
- Every SP scheduled to start on `lineupDate` from the probable-starter board
- Any RP flagged as a saves source
- Any batter whose Phase 1 recent data was absent or sparse

### C — Platoon & Handedness

For each batter target:
1. Use the probable-starter board to identify the `lineupDate` opposing SP hand.
2. Call `analyze_player_stats` or web-search for handedness splits.
3. Flag a mismatch if the batter is materially weaker against that hand.

### D — Pitcher Arsenal / Approach Matchup

For each batter target:
1. Web-search the opposing SP's pitch mix.
2. Check whether the batter has a documented weakness vs that pitch type.
3. Flag an arsenal mismatch if a clear weakness aligns with the SP's primary weapon.

### E — SP Context

For each SP starting on `lineupDate`:
1. Check opposing lineup quality.
2. Check park factor.
3. Check weather for outdoor games.
4. Call `analyze_player_stats` for peripherals if needed.
5. Check for workload or innings-limit context.

If WHIP/ERA are punted this week, a risky SP can still be a good add when the move buys W/QS.

### F — Closer Role Confirmation

For each RP flagged as a saves source:
1. Confirm role security and recent save usage.
2. Verify the move does not needlessly risk BSV.

### G — Evaluation Verdicts

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
Record a successfully saved browser action for the final report's **Executed** section. If
verification fails or is unavailable, record it for **Recommended** and explain why in the report's
earlier rationale; never treat it as completed.

If `autoAddDrop=true`, hand each exact approved transaction to the dedicated `add-drop-player`
workflow and follow its surface-specific execution and verification steps. If browser-driven write
execution is unavailable, fall back to the manual checklist. The Yahoo write API path is legacy-only
and should not be used in normal execution. Never auto-drop on the final day without a clear win
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
- Use markdown tables for the category scoreboard and compact supporting evidence only. Write
  lineup and add/drop actions as plain, one-line moves so a manager can scan them quickly.
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

- Example rationale:

  ```markdown
  ## Decision Rationale
  - **A — Add Player A; drop Player B.** Targets W and QS, the week's closest pitching categories.
    - Evidence: Player A starts today; Player B has no confirmed role or start.
  ```

- Phase 2 reversals must be called out with the `Phase 2 reversal` prefix.
- If there are no urgent moves, say so explicitly.

---
name: fantasy-roster-review
description: >
  Fantasy baseball roster review for Yahoo fantasy baseball teams. Produces an actionable report:
  category scoreboard vs. opponent, start/sit lineup moves (with slot positions), and add/drop
  targets. Does NOT auto-execute roster changes unless explicitly asked.

  Use this skill whenever the user asks for: fantasy roster review, daily fantasy review,
  roster review, fantasy check,
  start/sit advice, lineup moves, waiver wire targets, fantasy baseball status, or anything
  resembling "check my fantasy teams." Trigger on phrases like "check my teams", "fantasy review",
  "how are my teams doing", "who should I start", "any add/drops", "daily fantasy", or
  "run the roster review".
---

# Fantasy Roster Review

Produces a daily actionable report for the user's Yahoo Fantasy Baseball team or teams. Report
covers: category scoreboard, start/sit moves, and add/drop targets. Read
`references/tool-notes.md` for tool-specific constraints before calling any Yahoo tools.

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

- **Read the clock.** The day type (from Phase 0) changes the math: early-week moves bank value
  and can be speculative; the last three days switch to margin-building. Do not merely preserve
  the current score; widen any category the opponent can still flip, including categories currently
  being won by a slim margin.

- **Be aggressive late.** In the final three days, the default posture is to win by as many
  categories, and by as much category margin, as practical. If a replaceable move can add buffer in
  a vulnerable winning category, flip a tied/losing category, or block an opponent's realistic path,
  recommend it. Do not stop at "probably enough" until the opponent's active/probable roster has
  been checked and the plan is enough even if the opponent fixes obvious lineup mistakes.

## Inputs

```
teams:       discover from Yahoo auth/status, or use team keys explicitly provided by the user
league:      discover from the selected team/matchup, or use a league key explicitly provided by the user
autoExecute: false   # default - checklist only; set true only if user explicitly asks to make moves
lineupDate:  today
```

## Execution Order

Run teams **sequentially** when the user owns or requests multiple teams to avoid rate-limiting the
Savant/FanGraphs/MLB stat endpoints. Within each team, batch tool calls where possible.

---

## Phase 0 — Setup

Call `fantasy_status` to confirm auth. Then call `get_league_scoring_categories` and
`get_league` (standings, current week, `week_start`, `week_end`).

Determine **day type** by comparing today to `week_end`:
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

---

## Phase 1 — Gather (per team, one team at a time)

Run steps A–E for the current team before moving to the next.

### A — Matchup
Call `get_matchups` (and `get_team_stats_week` if matchup data is sparse).
Produce a compact category table: your totals vs. opponent totals for IP, W, SV, ERA, WHIP, K/BB, QS, BSV.

### B — Your Roster & Availability
Call `list_probable_starters` with `date=lineupDate` and `fantasyContext=true` once, then
reuse that probable-starter board throughout this team's review.

Call `get_roster` with `date=today`. For each player:
- Flag DTD / IL / NA status.
- Mark whether they are Active or on BN.
- Identify pitchers with a start today from the `list_probable_starters` result.
- Output: a start/sit candidate list with slot positions and "playing today? y/n".

### C — Opponent Roster Pressure
Call `get_roster` for the opponent with `date=today` before deciding whether your planned
management is enough. If the opponent roster appears unmanaged or has stale bench choices, infer
the expected best active roster from today's Yahoo start flags and obvious active/bench conflicts.

For the opponent:
- List active hitters with `is_starting=1`, benched hitters with `is_starting=1`, and active
  hitters with `is_starting=0`.
- List active pitchers, probable/confirmed starting pitchers, relievers with save paths, and any
  bench pitchers who appear likely to start today, using the `list_probable_starters` board for
  probable SPs.
- Estimate opponent pressure on flippable categories: especially W, QS, SV, K/BB, SB, HR, RBI,
  OBP, and TB.
- Compare your planned moves against that pressure. Explicitly state whether the plan is
  "enough", "barely enough", or "not enough" and why.

### D — Stat Cruncher
Call `get_roster` first to collect all player keys.
Split into **batches of ≤10 keys**. Call `analyze_roster_stats` once per batch
(batches may run as parallel calls if available; otherwise sequential).

**Critical constraints** (see `references/tool-notes.md`):
- Always pass `playerKeys` — never call without it on a full roster.
- There is **no `compact` flag** — size is controlled by the ≤10 key batching.
- Treat a **missing** `recent14d`/`recent30d` key as "no recent data" — do not label the player hot or cold based on its absence.
- From the full returned objects, extract **only** the compact summary below and discard the rest:
  - **Batters**: wRC+, OBP, HR, SB, TB, barrel%, xwOBA–wOBA gap; `recent14d`/`recent30d` when present.
  - **Pitchers**: ERA/xERA, WHIP, K/BB, K%, BB%, QS; `recent14d`/`recent30d` when present.

### E — FA Scout
Use the `list_probable_starters` board first to identify free-agent or waiver SP streamers who
are actually probable to start on `lineupDate`.

Call `rank_players` with `sortType=lastmonth` then `lastweek`, paginating from offset ~75
until ≥8 free agents are found in the returned `ownership.ownership_type` values.
- Rank by the team's weakest categories.
- Judge "hot" from `recent14d`/`recent30d` only when those keys are present; if absent,
  use the season line and do not label the player hot.
- Note if no rosterable closer is available (saves/BSV are usually the gap cat).

---

## Phase 2 — Deep Evaluation

For every player flagged as a non-obvious start/sit candidate, add/drop target, or streamer SP
in Phase 1, challenge the initial assessment with contextual data before finalizing moves.

### A — Matchup Strategy (do this first)

Before evaluating individual players, set the week's strategy using the **Guiding Principle**
(win the matchup, not the roster). From the Phase 1 scoreboard, opponent roster pressure, and the
Phase 0 day type, classify every category:

- **Winning safely** -> protect; don't make moves that risk it.
- **Winning but vulnerable** -> build margin; in the final three days, treat slim leads as attack
  targets, not as "done."
- **Close / flippable** -> this is where to spend roster slots and adds.
- **Lost (wide margin, not flippable this week)** -> **punt it.** Stop optimizing for it; its
  resources are freed for flippable cats.

Then write a one-line strategy per team, e.g.:
> *Strategy (day 6/7): WHIP & ERA already lost — punt. W is +1 winnable and QS is tied —
> stream 2 SP for innings even though it hurts WHIP. SV is safe, don't add relievers (BSV risk).*

On any of the final three days, also write one sentence answering:
> *Is this enough to prevent a flip? Opponent has 1 confirmed SP, 2 active non-starting SP, and 1
> obvious bench bat upgrade; our 2 confirmed SP are barely enough for W but not enough for QS, so add
> 1 more confirmed SP if a replaceable drop exists.*

Carry this strategy into every verdict below: a move only earns ✅ if it serves the strategy.

### B — Identify Targets

From Phase 1, select:
- All non-trivial start/sit candidates (skip locked-in everyday starters with no injury flags)
- All add/drop candidates
- Every SP scheduled to start today from the Phase 1 probable-starter board (always evaluate context)
- Any RP flagged as a saves source (closer role validation needed)
- Any batter whose Phase 1 recent data was absent or sparse

### C — Platoon & Handedness (batters)

For each batter target:
1. **Opposing SP handedness**: use the Phase 1 probable-starter board to identify today's starter,
   then web-search or check a trusted stats source for that starter's hand (L/R).
2. **Platoon splits**: call `analyze_player_stats` or web-search "[player] vs LHP vs RHP 2025 splits" (Baseball Reference / FanGraphs).
3. Flag a **platoon mismatch** if the batter's wRC+ or OBP against the starter's hand is significantly weaker (>20 wRC+ gap, or OBP drops >0.030 vs that hand).

### D — Pitcher Arsenal / Approach Matchup (batters)

For each batter target:
1. Web-search "[opposing SP] pitch mix 2025" to identify primary pitch type(s) and usage %.
2. Check whether the batter has a documented weakness vs that pitch type
   (e.g., high K% vs high-spin fastball, poor chase discipline on sweepers, weak exit velocity vs sinkers).
   Use `analyze_player_stats` for Statcast contact-type data if not already in Phase 1.
3. Flag an **arsenal mismatch** if a clear weakness aligns with the SP's primary weapon.

### E — SP Context (pitchers starting today)

For each SP (on roster or add target) starting today:
1. **Opposing lineup quality**: web-search or use Phase 1 data for the opposing team's wRC+ vs the SP's handedness.
2. **Park factor**: web-search "2025 park factors HR [ballpark]". Flag starts at known HR parks (Coors, GABP, Chase Field) — hurts ERA/WHIP ceiling, boosts HR for opposing batters.
3. **Weather**: web-search "[city] weather [date]" for outdoor games. Rain delay risk → flag or avoid streaming SP.
4. **Peripherals**: call `analyze_player_stats` for xFIP, K-BB%, last-3-starts ERA trend if not already available.
5. **Workload/limit**: web-search if the SP is on a known innings limit or pitch-count ramp-up.

**Strategy override**: if WHIP/ERA are punted this week (per step A), a high-WHIP-risk SP can
still be a ✅ add when it buys W/QS — the ratio damage doesn't count toward a lost cat.

### F — Closer Role Confirmation (RP add targets)

For each RP flagged as a saves source:
1. Web-search "[player] closer saves role [month] 2025" to confirm:
   - Recent save opportunities and conversion rate
   - Whether the role is contested or recently changed (blown save → shared role?)
   - Manager quotes on bullpen usage if role is ambiguous

**Strategy check**: before adding any reliever for SV, confirm BSV is not a winnable cat you'd
be jeopardizing. If SV is already safe or already lost, an extra closer add is usually wrong.

### G — Evaluation Verdicts

Produce one compact table per team summarizing every evaluated player:

```markdown
| Player       | Type   | Initial Call     | Key Finding                              | Final Call            |
|--------------|--------|------------------|------------------------------------------|-----------------------|
| J. Turner    | Batter | Start (SS)       | vLHP wRC+ 74; today's SP is LH          | ⚠️ Start w/ caveat   |
| C. Bellinger | Add    | High priority    | Closer role confirmed, 4 SV last 14d    | ✅ Confirmed          |
| K. Hendricks | SP     | Stream           | Coors Field, HR/F 1.42, weak K-BB%     | ❌ Reversed → Sit     |
| C. Seager    | Batter | Start (SS)       | vRHP wRC+ 128, SP throws 68% 4-seam    | ✅ Confirmed          |
```

Final call legend:
- ✅ **Confirmed** — data supports the Phase 1 recommendation
- ⚠️ **Caveated** — start/add, but note a specific risk factor
- ❌ **Reversed** — Phase 2 data contradicts Phase 1; override the recommendation
- ➡️ **No change** — player not playing today or no new information found

---

## Phase 3 — Synthesize & Report

Produce the following for each team. Lead with the **week strategy** from Phase 2A, then the
scoreboard and opponent pressure check. Every lineup move and add/drop must include a **Why** and
an **Evidence** table drawn from Phases 1–2, and the Why should tie back to the strategy (which
cats we're chasing/punting). Reversed calls must be flagged prominently.

### 0. Week Strategy

One line stating what we're chasing, what we're punting, and why, e.g.:
> **Strategy**: WHIP/ERA conceded (down big, not flippable) → stream SP for W + QS. SV safe, no reliever adds (protect BSV). Day 6 of 7.

### 1. Category Scoreboard

```markdown
| Cat   | You  | Opp  | Status                  |
|-------|------|------|-------------------------|
| HR    | 8    | 7    | 🟡 close (+1)           |
| K/BB  | 3.45 | 3.50 | 🔴 losing, flippable    |
| WHIP  | 1.14 | 1.26 | 🟢 winning              |
```

Status key: 🟢 safe / 🟡 close / 🔴 losing. Mark "🔒 locked" on the final day for cats that are safe enough to not risk.

### 2. Opponent Pressure Check

Show the opponent's active/probable roster pressure before finalizing moves:

```markdown
| Area | Opponent state | Our response |
|------|----------------|--------------|
| SP starts | 1 confirmed SP; 2 active SP not marked starting | 2 confirmed SP is barely enough; add 1 more if QS must flip |
| SV | 2 active closers | Need one RP only if SV is within 1 |
| Batting | 2 benched hitters are starting | Assume opponent could gain AB/R/RBI/TB if managed |
```

End this section with one sentence:
> **Enough?** Barely enough / not enough / enough, because [specific category math].

### 3. Start/Sit Moves

Always specify the **slot**, write 3-way swaps as an explicit table so the chain is unambiguous.
After the slot table, add **Why** and **Evidence** for each non-trivial move:

```markdown
| Slot  | Out →            | In (from)        |
|-------|------------------|------------------|
| SS    | Bogaerts → BN    | McLain (BN)      |
| Util  | Vargas → BN      | Springer (BN)    |
```

**McLain → SS** (Bogaerts → BN)
- **Why**: McLain has a platoon advantage today (vRHP wRC+ 118 vs Bogaerts' 94 vRHP). Today's opposing SP is RH and throws 65% four-seam fastballs — McLain's best pitch to hit. Bogaerts has a platoon split gap vs RHP and weaker recent 14d form.
- **Evidence**:

  | Stat          | McLain | Bogaerts |
  |---------------|--------|----------|
  | vRHP wRC+     | 118    | 94       |
  | OBP           | .368   | .311     |
  | recent14d HR  | 3      | 0        |
  | Platoon flag  | None   | ⚠️ weak vRHP |

If a Phase 2 reversal applies, flag it inline:
> ⚠️ **Phase 2 reversal**: Originally flagged as start, but Coors Field park factor (HR/F 1.42) and weak K-BB% (8.2%) → downgraded to BN.

For a 3-way swap, list every resulting assignment in order:
`OF → Springer (BN)` · `Util → Carroll (OF)` · `SS → McLain (Util)` · `Bogaerts → BN`

### 4. Add/Drop Targets

For each add/drop, show the move, why, and evidence:

```markdown
**Drop E. Clement → Add C. Bellinger**
- **Why**: Bellinger has held the closer role since [date], recording 4 SV in the last 14 days. Clement has no saves path, weak ERA, and is a low-leverage arm. Team's weakest cat is SV (+2 behind opponent).
- **Evidence**:

  | Stat       | Bellinger | Clement |
  |------------|-----------|---------|
  | SV (14d)   | 4         | 0       |
  | ERA        | 1.80      | 5.40    |
  | Role       | Confirmed closer | Setup/LOOGy |
  | Helps cat  | SV, BSV   | —       |
```

Note the **waiver caveat**: claims may process on delay; 7 adds/week cap applies.

---

## Phase 4 — Execute or Checklist

**If `autoExecute=false`** (default): output a numbered manual checklist of every move in
the order to perform them. Note if the connector is read-only.

**If `autoExecute=true`** and the user has explicitly asked to make moves: call
`set_lineup` / `add_drop_player` with `force=true` as needed, then re-read the roster to confirm.
If Yahoo write access is unavailable or the tool returns the unsupported-write message, switch back
to a manual checklist. **Never auto-drop on the final day without a clear win reason.**

---

## Output Notes

- Use **markdown tables** throughout — they render in chat and copy cleanly.
- Keep the report scannable: scoreboard → moves → add/drops, no long prose paragraphs.
- Every non-trivial move must include a **Why** line and an **Evidence** table (2–4 key stats).
- Phase 2 reversals must be called out with the ⚠️ **Phase 2 reversal** prefix.
- If there are no urgent moves, say so explicitly ("No lineup changes needed today").
- If web search returns no usable data for a player (e.g., splits not found), note "data unavailable" and fall back to Phase 1 assessment.
- Reference details (tool constraints, batching rules) are in `references/tool-notes.md`.

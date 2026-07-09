# `weekly-review`

Use this tool when the user asks for a weekly management review, a post-mortem on roster moves, or
whether they managed the matchup well during the current or just-finished scoring week.

Read `references/tool-notes.md` before calling any Yahoo tools.

## Goal

Judge the **quality of the user's process**, not just the final scoreboard. A good move can fail
because of variance; a bad move can succeed because of luck. Review decisions based on what was
reasonably knowable at the time and whether each move improved the odds of winning categories.

Questions this tool should answer:
- What moves did we make this week?
- Which moves clearly helped?
- Which moves clearly hurt?
- Which no-moves or missed opportunities mattered?
- Was the overall strategy coherent for the matchup and scoring categories?
- What should we repeat or change next week?

## Inputs

```text
teams:       discover from Yahoo auth/status, or use team keys explicitly provided by the user
league:      discover from the selected team/matchup, or use a league key explicitly provided by the user
reviewWeek:  current scoring week by default; use prior week only if the user asks
```

## Core Review Rules

- Evaluate decisions against the league's actual scoring categories.
- Separate **process quality** from **result quality**.
- Do not use hindsight unfairly. Penalize a move only when the decision was weak based on the
  information available at the time.
- Call out missed IL/NA usage, missed daily lineup value, and category misreads before nitpicking
  coin-flip streamer results.
- Treat "no move" as a real decision when a meaningful alternative existed.
- Prefer category impact over generic player rank.

## Execution Order

Run teams sequentially when the user owns multiple teams. Within a team, gather the week's league,
matchup, transaction, and roster evidence before drawing conclusions.

## Phase 0 — Setup

Call `fantasy_status` to confirm auth. Then call:
- `get_league_scoring_categories`
- `get_league`

Resolve the scoring week to review:
- Default: current active scoring week
- If the week is still in progress, label the report as an **in-progress weekly review**
- If the user asks about the finished week, use that explicit week

## Phase 1 — Gather the Week's Record

### A — Matchup Arc

Call:
- `get_matchups`
- `get_team_stats_week`
- `get_team_matchups` if needed for extra context

Capture:
- final or current category score
- closest swing categories
- categories won comfortably
- categories lost comfortably
- categories where one lineup or transaction decision plausibly mattered
- for an in-progress week that is currently trailing: each team's `team_remaining_games`
  (remaining games/IP), needed for the comeback-feasibility check in Phase 2F

### B — Transaction Log

Call `get_transactions` for the league and filter to:
- the user's adds
- the user's drops
- trades involving the user's team
- notable opponent transactions that changed pressure on the matchup

Build a week timeline:
- date
- move
- likely category intent
- immediate roster consequence

### C — Current Roster State

Call `get_roster` for the user's team and inspect:
- IL/NA slot usage
- dead bench spots
- players carried without role or starts
- players added this week who are still rostered
- players dropped this week who would still have helped

If relevant, also call `get_roster` for the opponent to understand whether the opponent exploited
lineup or streamer opportunities more effectively.

### D — Decision Targets

From the timeline and roster evidence, assemble the set of decisions to review:
- lineup activations and benches that likely affected categories
- add/drop moves
- streamer starts or passed-on streamers
- closer/speculative RP moves
- IL/NA management
- meaningful no-move decisions

## Phase 2 — Evaluate Decision Quality

Review every meaningful decision with the information that was reasonably available at the time.

### A — Weekly Strategy Check

First, infer the week's actual strategy:
- ratio protection
- counting-stat aggression
- saves chase
- streamer volume
- patience/hold strategy
- future-value preservation

Then judge whether the actions matched that strategy. A frequent failure mode is mixed signals,
such as punting ratios in one move and protecting ratios in the next.

Write one short diagnosis:
- **Coherent strategy**
- **Mostly coherent with one contradiction**
- **Incoherent / reactive management**

### B — Add/Drop Reviews

For each notable add/drop:
1. State the intended reason for the move.
2. Check whether that reason matched the live category battle.
3. Use `analyze_player_stats` for the added player, dropped player, or both when the decision was non-obvious.
4. Judge the move on process, then on result.

Verdict options:
- ✅ Good process, good result
- 👍 Good process, bad result
- ⚠️ Thin process, lucky result
- ❌ Bad process, bad result

### C — Lineup and Start/Sit Reviews

For each meaningful lineup call:
1. Identify the slot and the alternatives.
2. Judge whether the start/sit choice aligned with category needs.
3. Use `analyze_player_stats` or probable-starter context where it materially changes the review.
4. Judge whether the user left clear same-day value on the bench.

Focus especially on:
- benched active hitters
- unused confirmed SP starts
- unnecessary ratio-risk SP starts
- avoidable empty lineup slots

### D — Missed Opportunities

Explicitly look for:
- IL/NA slot misuse
- unused streaming spots
- missed closer or saves chances
- categories that were close enough to justify one more move
- categories that should have been conceded earlier

Only include missed opportunities that had a realistic path to changing the category score.

### E — Opponent Comparison

Compare the user's management against the opponent:
- who used lineups more cleanly
- who exploited probable starters better
- who used adds more efficiently
- whether the opponent's pressure should have triggered a more aggressive response

### F — Comeback Feasibility (in-progress, currently-losing weeks only)

Only run this when the week is still in progress **and** the user is currently behind on the
matchup score. Skip it entirely for finished weeks or weeks currently ahead/tied.

Classify every category using the current score and each team's remaining games/IP:
- **Already lost** — margin plus remaining games/IP make a flip implausible even with perfect play.
- **Live** — still mathematically flippable given both rosters' remaining games/IP.
- **Already won** — secure; don't risk it chasing a flip elsewhere.

Then answer directly: with realistic best-case management from here on out (full IL/NA usage,
maximum streaming, saves chases, zero wasted active slots) — not miracle individual box-score
lines — how many categories can plausibly flip? State how many category wins are needed to win
or tie the matchup, and whether the "Live" categories can realistically supply that many.

Give one verdict:
- **Live comeback path** — enough live categories to win/tie with realistic best management.
- **Long shot** — a flip needs more live categories than realistically achievable, or depends on
  events outside roster control (e.g. the opponent's stars slumping).
- **Effectively over** — remaining live categories are fewer than the deficit; the math doesn't
  work regardless of management quality.

Anchor this to remaining games/IP, not vibes. Do not call a week "still winnable" just because
the score is close if the categories that are close are already functionally decided (e.g. an ERA
gap too wide to move with the innings left).

## Phase 3 — Scoring the Week

Produce a concise scorecard for each team:

```markdown
| Area                  | Grade | Notes |
|-----------------------|-------|-------|
| Category strategy     | B     | Correctly chased W/QS, but protected WHIP too long |
| Adds/drops            | A-    | Two strong adds, one late missed closer chance |
| Daily lineup handling | C+    | Left active bats on bench twice |
| IL/NA management      | B-    | One slow IL move blocked a streamer slot |
| Overall               | B     | Solid process with a few preventable misses |
```

Grades can be letter grades or plain-language ratings if that reads better in context.

## Phase 4 — Report

For each team, output sections in this order:

1. **Week Verdict**
2. **Category Outcome**
3. **Comeback Feasibility** (in-progress + currently-losing weeks only; omit for finished, tied, or
   leading weeks)
4. **Opponent Management Comparison**
5. **Move Timeline**
6. **What We Did Well**
7. **What Hurt Us**
8. **Missed Opportunities**
9. **Repeat Next Week / Change Next Week**

### 1. Week Verdict

One short paragraph answering:
- Did we manage the week well?
- Was the process better or worse than the final result suggests?

### 2. Category Outcome

Use a compact table:

```markdown
| Cat  | Result | Margin | Management Note |
|------|--------|--------|-----------------|
| W    | Won    | +2     | Streamer plan worked |
| WHIP | Lost   | -0.09  | Ratio protection was abandoned too late |
| SV   | Lost   | -1     | One more RP add had a realistic path |
```

### 3. Comeback Feasibility

Only include this section when the week is in progress and the score is currently a loss. State
the verdict from Phase 2F up front, then back it with a compact table:

```markdown
| Cat  | Status        | Remaining Games/IP (You / Opp) | Realistic Flip? |
|------|---------------|---------------------------------|------------------|
| SV   | Live          | 5 team games / 4 team games      | Yes, if closer holds role |
| ERA  | Already lost  | 12 IP left / 14 IP left          | No — gap too wide to move |
| W    | Live          | 3 SP starts / 2 SP starts        | Yes |
```

End with one sentence: *"X live categories vs. Y needed to win/tie -> Live comeback path / Long
shot / Effectively over."*

### 4. Opponent Management Comparison

Summarize the Phase 2E findings:

```markdown
| Area              | You                          | Opponent                     | Edge      |
|--------------------|-------------------------------|-------------------------------|-----------|
| Lineup cleanliness | One empty slot on Jul 4       | No empty slots                | Opponent  |
| Streamer usage     | Two SP streams, both started  | One SP stream, missed a start | You       |
| Add efficiency     | Added a closer in a save role | No saves-relevant adds        | You       |
```

Close with one line on whether the opponent's pressure should have triggered a more aggressive
response from the user.

### 5. Move Timeline

Show the week's meaningful actions:

```markdown
| Date | Move | Intent | Review |
|------|------|--------|--------|
| Jul 3 | Drop X -> Add Y | Chase QS | 👍 Good process, bad result |
| Jul 4 | Benched A for B | Protect OBP | ❌ Overthought a clear start |
```

### 6. What We Did Well

List the best process decisions with brief evidence.

### 7. What Hurt Us

List the clearest self-inflicted mistakes or contradictions.

### 8. Missed Opportunities

Only include realistic opportunities with category relevance.

### 9. Repeat Next Week / Change Next Week

End with a short playbook:
- what to keep doing
- what to stop doing
- one or two concrete rules for next week

## Output Rules

- Be direct. This tool is evaluative, not purely advisory.
- Do not shame the user for variance-driven losses.
- When evidence is thin, say `unclear` instead of over-claiming.
- Anchor criticism to category math and roster context.
- Keep the report compact and scannable with markdown tables.

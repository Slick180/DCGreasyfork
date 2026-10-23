# Match Night Singles Manager

Compact DartConnect singles match-night manager, delivered as a
Tampermonkey userscript. Designed to work with compatible DartConnect
singles league schedules and validated against multiple leagues:
- South Staffordshire Superleague — SStaffSL/24343
- Daly's Singles League — DalySL/23875

> **Status: V1.1.0 release candidate — dynamic league context, divisions,
> rosters and per-league state; live PLAYING detection; `node
> test/parse-check.cjs` ALL PASS. Not published.**

## Architecture (planned)

- `src/SouthStaffs-MatchNight.user.js` — the userscript (metadata block
  + schedule parser + roster/Not Here state + compact UI + live matcher).
- `references/` — genuine captured DartConnect DOM snapshots used for
  offline parser development. **Never commit invented markup here.**
  - `schedule-normal.html` — normal upcoming schedule
  - `schedule-delayed.html` — postponed/expandable date groups
  - `match-centre-live.html` — live playing rows
  - `match-centre-completed.html` — completed rows (full/surname-first names)
- `docs/REQUIREMENTS.md` — full requirements (source of truth for scope).

## Data flow

```
Schedule page (my.dartconnect.com/league/schedule/<code>/<id>)
  ──discover league/divisions──▶ fixtures + rosters (by player ID)
Match Center (tv.dartconnect.com) ──ID-first match──▶ playing flags
localStorage (match-night-singles:<code>:<id>) ◀▶ division + absent IDs
                                                  ──render──▶ compact Match Night view
```

## Tonight / Delayed classification (COLS-09)

A fixture's EFFECTIVE date is the date DartConnect places it under (the
containing group's date; every item in a group carries the same `sched_date`,
verified against the captured league page, so a rescheduled match simply moves
group). That date is compared with the operator's selected match date:

| effective date | classification | where it appears |
| --- | --- | --- |
| = selected match date | current | TONIGHT |
| < selected match date | delayed backlog | DELAYED |
| > selected match date | future | neither panel (and never scheduled) |

`applyMatchDateClassification` applies this rule once per render and per live
poll, before the panels are split and before the scheduler session is built, so
both read exactly the same flag. DartConnect's own pending/future bucket is kept
per fixture as `bucketDelayed` and is used only as the fallback when there is no
match date to compare (no selection, or a dateless fixture). The Delayed ON/OFF
scheduling option is unchanged: it still controls delayed-game eligibility.

## Delayed panel: live-match awareness (DELAY-LIVE)

- A DELAYED fixture is marked PLAYING by the existing live poll (the same
  ID/pair matching used everywhere else) and is highlighted with the existing
  green PLAYING row style.
- A delayed date group containing a live match is expanded automatically and
  its heading shows a compact `● PLAYING n` count.
- The operator's saved collapse preference is NEVER overwritten: expansion is a
  derived state (`delayedGroupCollapsed`), so the group returns to exactly the
  saved choice when the match finishes.
- A live group is not a collapse toggle while it is live, so polling cannot
  produce a collapse/expand flicker.
- A live delayed match is never automatically given a board or a marker; it
  occupies a physical board factually (board occupancy), which is what bounds
  free capacity. Its players are unavailable for conflicting match or marker
  recommendations.

## Recommendation row layout (COLS-08)

Recommendation and Projected Next rows are one explicit CSS grid with a fixed
cell for every column (sequence | board | player | vs | player | marker |
status). Every cell exists on every row, so columns align between rows and no
control can ever be painted over a player name at 1366x768. The board column is
present in both managed-board modes (it occupies no gutter when boards are
unmanaged); the optional status column is a pane-level decision so all rows
reserve the same width. Names ellipsise safely with the complete name on hover.

## Marker modes and the game table (MARKER-9 / COLS-10)

- Four mutually exclusive marker modes: **OFF | MANUAL | FAIR | LOSER**. OFF
  removes every marker element (control, chip, advice, message) and returns its
  width to the names; MANUAL offers the selector but never recommends or
  preselects; FAIR and LOSER keep their existing algorithms and overrides.
- The marker **dialog lives in the RECOMMENDED pane** — that is where a game is
  allocated to a marker, in every mode. The game table below shows a marker
  control **only** for a game that has actually been allocated one (a pending
  handoff from the board/top allocation, or a confirmed duty), and never
  proposes one on its own.
- A row that holds a marker can be **reallocated** (choose another name — the
  atomic `changeMarkerForGame`) or **removed** (choose `M: —`) in place. Both
  release the duty only: board ownership, PLAYING and the fixture are untouched.
- The candidate list only offers players whose marking leaves the sequence
  playable: nobody playing, nobody already marking, and nobody needed by the
  next N games that can be dispatched (N = free boards) — the same union the
  scheduler's own marker search uses, so list and advice can never disagree.
- Each fixture row is ONE line in three fixed bands — `[board] [game] [marker]`
  — with the bands reserved per COLUMN (52px board, 176px marker), so the `vs`
  sits at the same x on every row and a control can never steal width from a
  name. Labels are abbreviated there (Board = `B`, Marker = `M`, Advise = `A`);
  the control's tooltip still spells each state out in full.
- A live row states PLAYING by fill, an inset accent bar and its tooltip plus
  the delayed group bar's `● PLAYING n` count — no extra line is spent on it.

## Live-night commitment integrity (LIVE-01 / STABLE-01)

A live venue night exposed two linked defects: a marker assigned to a game
vanished when that game started, and the scheduler then recommended the same
people again (marker double-booked, a playing player offered another game, a
marker offered a game to play in). Both came from the same weakness —
**occupancy was derived from what happened to be listed and displayed**, not
from the commitments the night had established.

What the script now guarantees:

- **PLAYING is sticky.** A live response that no longer lists a match is NOT
  completion: DartConnect also drops matches between legs or after a re-key.
  The game stays PLAYING, its two players and its marker stay occupied, and the
  note reports `n unconfirmed` so the uncertainty is visible instead of silent.
- **Only recorded completion releases people.** A schedule item published as
  `C`, or an API record in a completed state, completes the fixture: it leaves
  the panels, its players and marker are released, and its board is freed. No
  other event frees a commitment.
- **Live matches without a fixture row still commit their players.** A match
  that starts can leave the schedule groups it was parsed from. The live feed's
  own records are resolved to roster players (numeric id first, exact full name
  second, ambiguity dropped — never guessed) and projected as active games, so
  those people can never be recommended for another game mid-match. A
  disappeared live record survives two further polls before it is dropped, so a
  momentary feed blip cannot free anyone.
- **Game identity is stable.** The schedule id is the key; id-less rows carry
  the fixture date and pair, so two legs between the same players never
  collapse. Each saved commitment also records its match pair and date, so a
  restore can re-find the match when DartConnect re-publishes it under the
  other key form (an id-less row that gained an id, or the reverse).
- **A duty is never silently dropped.** If a saved marker duty's match cannot
  be found in the fixture list at all, the duty is RETAINED (the marker is
  still standing at that board) and shown at the top of the scheduling area as
  `M: <name> — duty kept — game not in the schedule list`, with one-click ×.
  Releasing it there, or confirming completion, is the only way it ends.
- **A duplicated fixture row, a vanished id, a collapse toggle, a mode change or
  a re-render never ends a commitment.** Board ownership restores through the
  same identity rules, so an occupied board is never quietly freed.

## Not Here panel: adjustable, not a fly-out (MARKER-10)

The right-hand NOT HERE panel is resized by dragging the divider between it and
the fixture columns (or with the arrow keys on it; double-click, Enter or a
click on the rail collapses it to a 54px labelled rail, handing its width to
the DELAYED column). The chosen width is stored in the same per-league night
 state as the zoom and board count, so it survives Refresh and polling, and an
 unrelated save can never drop it.

## Key design decisions

- Player IDs (from schedule links) are the internal identity, not names.
- Not Here filtering is instant and reversible; state persists across refresh.
- Refresh = `location.reload()` for V0.1 (Schedule is the source of truth
  for completion).
- Live detection = abbreviated-pair matching with uniqueness requirement;
  never guess on ambiguity.
- Cross-origin Match Center access to be verified during implementation
  (`GM_xmlhttpRequest` + `@connect` expected).

## Relationship to other scripts

Independent of the existing *DartConnect Landscape TV Scoreboard*
userscript. Do not modify or merge with it.

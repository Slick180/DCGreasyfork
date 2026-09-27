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

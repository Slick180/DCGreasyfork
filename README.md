# South Staffs DartConnect Match Night

Compact match-night management screen for the South Staffordshire
Superleague (Universal + White Eagle divisions), delivered as a
Tampermonkey userscript.

> **Status: V0.1.3 with Light/Dark switch + live engine; `node
> test/parse-check.cjs` ALL PASS. Live behavior not yet verified in
> Tampermonkey; not published.**

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

## Data flow (planned)

```
Schedule page (my.dartconnect.com) ──parse──▶ fixtures + rosters (by player ID)
Match Center (tv.dartconnect.com) ──pair-match──▶ playing flags
localStorage (sssl-match-night:24343) ◀▶ division + absent player IDs
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

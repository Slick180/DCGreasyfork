# South Staffs DartConnect Match Night — Requirements

> **Status: V1.0.0 Match Night release candidate (full-row green PLAYING
> highlight, both themes; live detection proven in the real browser);
> `node test/parse-check.cjs` ALL PASS. Not published.**

## 1. Purpose

A compact match-night management screen for the South Staffordshire
Superleague, used on laptops in two venues by two operators
(Universal division, White Eagle division).

This is a **separate userscript** from the existing
*DartConnect Landscape TV Scoreboard*. Do not modify or merge with it.

## 2. Primary sources (authoritative)

| # | Page | URL | Domain | Authoritative for |
|---|------|-----|--------|-------------------|
| 1 | Schedule / Roster | `https://my.dartconnect.com/league/schedule/SStaffSL/24343` | `my.dartconnect.com` | Outstanding fixtures, postponed/delayed fixtures, dates, division, round, session, full player names, player IDs, division rosters |
| 2 | Match Center / Live | `https://tv.dartconnect.com/league/SStaffSL/matches/24343` | `tv.dartconnect.com` | Games currently being played |

- Do **not** build around an individual player's schedule URL.
- The two sources live on **different domains**: Tampermonkey will likely
  need cross-origin access (`// @connect tv.dartconnect.com` +
  `// @grant GM_xmlhttpRequest`). Ordinary `fetch` must **not** be assumed
  to work cross-origin — verify during implementation.

## 3. Divisions

- Supported: **Universal**, **White Eagle**.
- Operator selects one division; only that division's fixtures/players show.

## 4. Player rosters

- The player list in DartConnect's **Schedule Filter panel** is the
  authoritative roster. Do **not** infer the roster from visible fixtures alone.
- Schedule player links expose a stable numeric DartConnect player ID.
  Use the **player ID internally** (roster state, Not Here filtering,
  fixture identity), not names.
- The live Match Center API exposes numeric player IDs inside the nested
  `league_match` object (`left/right.id`) — prefer these over
  abbreviated-name matching. The live Match Center DOM has **not** yet
  exposed numeric player IDs; do not invent or infer them there.

## 5. Not Here workflow

- Everyone starts present. Side panel lists the complete division roster.
- Operator marks only players who are **NOT HERE**.
- Marking Not Here immediately hides every outstanding fixture involving
  that player. Reverting immediately restores them in correct sorted order
  (supports late arrivals).
- Provide **Clear/Reset Not Here**.
- Persist **selected division + absent player IDs** in `localStorage`,
  namespaced by league/stage (e.g. `sssl-match-night:24343`).
- State must survive browser refresh.

## 6. Fixture display

- Layout: fixture list ~75–80% width; player panel ~20–25% (~220–250px).
- **Show:** date bars, `Player A vs Player B` only.
- Three aligned columns: left player right-aligned, small bold centred
  `vs`, right player left-aligned. No fixture cards, no two-column fixtures.
- **Hide:** venue, More button, Session, Round — but **retain Session and
  Round internally** for sorting.
- Sort: **DATE → ROUND → SESSION**.
- Style like DartConnect's compact Previous Matches table: compact date
  bars, thin rows, alternating subtle backgrounds, ~20–25 games visible
  on a 1080p laptop where practical.

## 7. Delayed / postponed fixtures

- Outstanding delayed/postponed games **must** be included.
- Historical postponed date groups appear as expandable date buttons
  (e.g. `aria-expanded`, `"03 Sep - Thursday"`); expanding reveals normal
  fixture structures; one date may contain both divisions.
- Script must: identify postponed groups → expand when necessary → parse
  fixtures → merge with upcoming → sort date → round → session.
- A small compact DELAYED indicator beside old dates is acceptable.

## 8. Completed games

- Do **not** detect completion independently — Schedule removes completed
  games on refresh.
- Provide a visible **↻ Refresh** control; V0.1 may simply call
  `location.reload()` (localStorage preserves division + Not Here state).

## 9. Live / playing games

- Live source (verified 2026-09-27 by direct probing during a genuine
  active scoring session): `POST
  https://tv.dartconnect.com/api/league/SStaffSL/matches/24343`
  (no auth required; transient HTTP 500s observed — retry).
  `POST .../matches/live/24343` returns `{divisions, teams, matches[]}`.
  A live record carries `league_match_id` (exact schedule fixture id),
  `status: "O"`, `spectator_key` (watch code), `opponent_0/1`
  (`First L` abbrev), `opponent_0/1_players` (surname-first full), and a
  nested `league_match` with numeric `left/right` player ids. The
  official Match Center client polls the live endpoint every 45s.
- Matching priority is therefore: 1) schedule match id
  (`league_match_id`), 2) numeric player-id pair (from nested
  `league_match`), 3) full-name pair (surname-first flipped to schedule
  order), 4) abbreviated pair. Same orientation first, then swapped —
  each level requires exactly one candidate.
- Known unreliabilities: the live record's `division_id` disagreed with
  its `division` name in the verified sample — join via
  `league_match_id`, never via `division_id`. `round_seq` 9 coincided
  with the `M9`-style reference — mapping plausible, not yet confirmed.
- A live fixture **stays** in the outstanding list with its **entire row**
  highlighted green and both player names bold (`● PLAYING` remains at the
  far right). Styling is class-driven from `status === 'playing'`, so the
  row returns to normal automatically when the fixture is no longer live.
  Never remove a fixture for being live.
- Schedule uses full names (`James Harrison`); live Match Center may
  shorten (`James H`); completed rows return surname-first
  (`Harrison, James`). **Never identify a live player from a shortened
  name alone** — Universal has both James Harrison and James Hughes
  (both → `James H`).
- **Pair matching:** generate the live abbreviation per scheduled player
  (`First + LastInitial`: `James Harrison → James H`) and compare **both**
  competitors against the live row. Mark PLAYING only on a **unique**
  outstanding-fixture match; on ambiguity, leave unmarked. Same
  left/right orientation first; reverse-pair matching only if testing
  proves orientation is unreliable.
- Known live DOM: `div[role="link"][aria-label^="Open "]`,
  `[data-testid="left-competitor-column"]` /
  `[data-testid="right-competitor-column"]`,
  `[data-testid="desktop-match-reference"]` /
  `[data-testid="mobile-match-reference"]` (e.g. `M9` — do **not** assume
  it maps to Session/Round until verified),
  `[data-testid="mobile-home-team-score"]` /
  `[data-testid="mobile-away-team-score"]`.

## 10. UI structure (dedicated compact view)

- Top bar: Match Night, selected division, Refresh, Exit/Back if useful.
- Left: compact outstanding fixture list.
- Right: Universal/White Eagle selector, NOT HERE heading, full roster,
  compact clickable rows, absent highlighted, Clear/Reset.
- No large checkboxes/controls — laptop operational screen.

## 11. Internal fixture model

Design with a status such as `waiting` / `playing` so Match Center
integration lands without UI redesign.

## 12. Robustness

- Prefer href patterns, `data-testid`, aria attributes, text/structure,
  player IDs from URLs over generated Tailwind class combinations.
- Deduplicate desktop/mobile representations on extraction.
- Never silently guess player identity.

## 13. V0.1 scope (after review)

1. Schedule parsing 2. both division rosters 3. postponed
   expansion/parsing 4. compact UI 5. division selection 6. Not Here
   filtering 7. localStorage persistence 8. Refresh/reload 9. sorting.
   Match Center live detection follows once V0.1 is stable.

## 14. Open confirmations / verification

- [x] V0.1.4: genuine live-endpoint shape verified by direct probing
  (2026-09-27, live `status:"O"` record with `league_match_id` →
  exact fixture; numeric player ids + surname-first names in nested
  `league_match`; `spectator_key` as ref). Normalizer extended
  (id-first ordering, surname-first flip, matches-as-object);
  `node test/parse-check.cjs` ALL PASS incl. 13 genuine-shape checks.
- [x] Live-endpoint HTTP 500 cause established 2026-09-27 by controlled
  alternating probing: `'{}'/empty body → 500 (3/3)` vs official
  `{"division_id":null,"competitor_id":null} → 200 (3/3)`; Content-Type
  irrelevant. `apiPost` now sends the exact official body to both league
  endpoints (request-construction tests added). No auth/cookies needed.
- [x] V1.1 phase 1: LeagueContext (`leagueCode`/`leagueId`/`scheduleUrl`)
  derived from the schedule page URL; schedule detection, live/API and
  Match Centre URLs dynamic (SStaffSL/24343 reproduced exactly). Official
  POST body, lifecycle, matching and polling unchanged. Divisions, roster
  handling and storage keys remain South Staffs runtime until later phases.
  No generic-league compatibility claimed yet.
- [x] V1.1 phase 2: dynamic division/roster discovery from Inertia data
  (ordered names; no production allowlist; numeric division IDs never used
  for matching). Fixture parsing gated on discovered divisions with
  unknown-division diagnostics; dynamic selector with wrapping; dynamic
  diagnostics maps; saved-division validation against discovered list.
  SStaffSL still discovers Universal/White Eagle (23/23, 511, 32 delayed).
  Filtering, matcher, lifecycle, polling and row layout unchanged.
- [ ] Live behaviour verified end-to-end in Tampermonkey (GM_xmlhttpRequest
  POST reaching the live endpoint; PLAYING flag appearing on a real live
  fixture; 30s polling; transient-500 retry path).
- [ ] `M9`-style match references mapped (or confirmed unmappable).
  Evidence: live `league_match.round_seq` 9 coincided with M9-style refs.
- [ ] Theme switch verified live (both themes readable, preference persists).
- [ ] Live API reachable from Tampermonkey (`GM_xmlhttpRequest` POST, cookies/CSRF as needed).
- [x] DevTools diagnostics reachable via `unsafeWindow.__ssslMatchNight` (`@grant unsafeWindow`).
- [x] Live status line shows Connected/playing/checked-time vs Connection error.
- [x] Live deep diagnostics (endpoint/shape/normalized/rejected-reason) for PLAYING failure analysis.
- [x] Compact live logging (status counts + reason tally replace per-record spam).
- [x] PLAYING detection verified against the genuine live-endpoint shape
  (offline: exact `league_match_id` + numeric pair + flipped full names;
  `node test/parse-check.cjs` ALL PASS). In-Tampermonkey flagging still open.
- [x] PLAYING lifecycle hardened + covered offline: transport failure on all
  sources preserves last-known PLAYING (UNKNOWN, not proof of stop);
  non-authoritative `/matches/` fallback never clears PLAYING on absence
  (positive evidence may add); only a successful live-endpoint response
  clears stale PLAYING. Notes distinguish Connected / schedule-fallback /
  Connection-error(last-known).
- [x] Genuine schedule capture collected (`references/schedule-normal.html`).
- [x] Parser repaired against genuine data (`node test/parse-check.cjs`: 23/23 rosters, 511 fixtures incl. 32 delayed, proven sorted/deduped, away-first orientation proven).
- [ ] Fixtures parsed incl. postponed groups; sorting verified.
- [ ] Match Date selector populated; upper-bound filtering + auto default verified live.
- [ ] Division selection + Not Here filtering + persistence verified across reload.
- [ ] Refresh behaviour verified (completed games disappear).
- [ ] Cross-origin strategy verified (`GM_xmlhttpRequest` vs `fetch`).
- [ ] PLAYING detection verified against live Match Center rows.
- [ ] `M9`-style match references mapped (or confirmed unmappable).
  Evidence 2026-09-27: live `league_match.round_seq` 9 coincided with M9-style refs.
- [ ] Live orientation (same vs reversed pairs) verified in testing.
- [x] Real Match Center player IDs: present in the live endpoint
  (nested `league_match.left/right.id`); matcher prefers IDs over names.
- [ ] Remaining reference captures collected (schedule-normal.html present; delayed/live/completed still empty).
- [ ] GreasyFork publishing authorised (explicit instruction required).

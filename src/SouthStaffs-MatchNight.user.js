// ==UserScript==
// @name         Match Night Singles Manager
// @namespace    https://github.com/south-staffs-superleague
// @version      1.1.0
// @description  Compact DartConnect singles match-night manager: division rosters, Not Here attendance filtering, delayed fixtures, live PLAYING status, scheduler advice and managed physical boards.
// @author       South Staffs Superleague
// @match        https://my.dartconnect.com/league/schedule/*
// @connect      tv.dartconnect.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/* Match Night Singles Manager — V1.1.0.
 *
 * League-independent DartConnect singles match-night manager: league
 * context, divisions, rosters and fixtures are discovered from the
 * schedule page data; per-league attendance state; live PLAYING status;
 * scheduler advice (plan globally, execute locally, re-plan globally);
 * optional managed physical board ownership (factual operator state).
 *
 * Schedule data comes from the page's embedded Inertia data-page JSON
 * (props.sidebar.divisions[].competitors for the roster;
 * props.pending_match_groups / future_match_groups for fixtures).
 * This is deterministic page data, not scraped markup.
 *
 * Pure logic (extract / parse / sort / filter / match / schedule / board
 * ownership / scale steps) is separate from DOM rendering and is
 * unit-tested against the genuine captured HTML in
 * references/schedule-normal.html (see test/parse-check.cjs and
 * test/scheduler-check.cjs). No DartConnect markup is invented anywhere.
 */
(function () {
  'use strict';

  /* ============================== 1. Diagnostics ============================== */

  const VERSION = '1.1.0';
  const TAG = '[SSSL Match Night]';
  const MAX_LOG_LINES = 40;
  let logCount = 0;
  const parseWarnings = [];
  let lastInfo = null;

  function log() {
    if (logCount >= MAX_LOG_LINES) return;
    logCount += 1;
    console.info.apply(console, [TAG].concat([].slice.call(arguments)));
  }

  function warn() {
    if (logCount >= MAX_LOG_LINES) return;
    logCount += 1;
    console.warn.apply(console, [TAG].concat([].slice.call(arguments)));
  }

  function err() {
    console.error.apply(console, [TAG].concat([].slice.call(arguments)));
  }

  function warnOnce(message) {
    if (parseWarnings.indexOf(message) === -1) {
      parseWarnings.push(message);
      warn(message);
    }
  }

  /* ============================== 2. Constants ============================== */

  // Per-league storage (V1.1 phase 3): attendance state is namespaced by
  // detected league so leagues can never contaminate each other.
  const STORE_PREFIX = 'match-night-singles:';
  // Theme is a device/user preference, not league data: one global key.
  const THEME_KEY = 'match-night-singles:theme';
  // UI scale is a presentation preference (Slice 3B): one global key.
  // Deliberately separate from league state, scheduler runtime state and
  // managed-board runtime state (which is never persisted at all).
  const SCALE_KEY = 'match-night-singles:ui-scale';

  // Legacy V1.0 compatibility ONLY (South Staffordshire baseline).
  // This is the single permitted league-specific runtime exception: a
  // one-time, non-destructive copy from the old fixed key (see
  // migrateLegacyState). Never add another league here.
  const LEGACY_SSTAFF_KEY = 'sssl-match-night:24343';
  const LEGACY_SSTAFF_CODE = 'SStaffSL';
  const LEGACY_SSTAFF_ID = '24343';

  /**
   * Pure builder: per-league storage key for a LeagueContext.
   * Returns null for invalid contexts; never throws.
   */
  function storageKeyForLeague(league) {
    if (!league || typeof league.leagueCode !== 'string' || typeof league.leagueId !== 'string') return null;
    if (!/^[^:/]+$/.test(league.leagueCode) || !/^\d+$/.test(league.leagueId)) return null;
    return STORE_PREFIX + league.leagueCode + ':' + league.leagueId;
  }

  // Player schedule links look like: /league/schedule/<code>/<stageId>/<playerId>.
  // Segment-generic so any league schedule page works; the player id is the
  // last numeric segment (division pages carry a non-numeric segment there).
  const PLAYER_HREF_RE = /\/league\/schedule\/[^/]+\/\d+\/(\d+)(?:\/|[?#]|$)/;

  const KNOWN_SELECTORS = {
    postponedToggle: 'button[aria-expanded]',
    liveRow: 'div[role="link"][aria-label^="Open "]',
    liveLeft: '[data-testid="left-competitor-column"]',
    liveRight: '[data-testid="right-competitor-column"]',
    liveRefDesktop: '[data-testid="desktop-match-reference"]',
    liveRefMobile: '[data-testid="mobile-match-reference"]',
  };

  /* ============ 2b. League context (dynamic league identity) ============ */

  // Compatible schedule paths: /league/schedule/<leagueCode>/<numericId>
  // with optional further path components (player/division child pages).
  const SCHEDULE_PATH_RE = /^\/league\/schedule\/([^/]+)\/(\d+)(?:\/|$)/;

  /** Extract the path component from an absolute URL or a raw path. Pure. */
  function schedulePathFromUrl(href) {
    if (typeof href !== 'string' || !href) return '';
    const m = href.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*(\/[^?#]*)/);
    if (m) return m[1];
    if (href.charAt(0) === '/') {
      const q = href.search(/[?#]/);
      return q === -1 ? href : href.slice(0, q);
    }
    return '';
  }

  /**
   * Derive the league context from a schedule URL.
   * Returns { leagueCode, leagueId, scheduleUrl } or null when the URL is
   * not a compatible league schedule page. Pure; no hard-coded leagues.
   */
  function parseLeagueContext(href) {
    const m = schedulePathFromUrl(href).match(SCHEDULE_PATH_RE);
    if (!m) return null;
    return { leagueCode: m[1], leagueId: m[2], scheduleUrl: href };
  }

  /* ============================== 3. Pure helpers ============================== */

  /**
   * Extract the numeric player ID from a schedule player URL. Null when
   * absent. Segment-generic across leagues; division URLs (which carry a
   * non-numeric segment after the stage id) never match. When `league` is
   * supplied, the URL must additionally belong to that league's schedule
   * path, so foreign-league URLs cannot leak IDs in.
   */
  function parsePlayerIdFromHref(href, league) {
    if (typeof href !== 'string') return null;
    if (league && (typeof league.leagueCode !== 'string' || typeof league.leagueId !== 'string')) return null;
    if (league && schedulePathFromUrl(href).indexOf('/league/schedule/' + league.leagueCode + '/' + league.leagueId + '/') !== 0) return null;
    const m = href.match(PLAYER_HREF_RE);
    if (!m) return null;
    const id = parseInt(m[1], 10);
    return Number.isSafeInteger(id) ? id : null;
  }

  /**
   * Selected-division roster boundary (Slice 3C marker isolation).
   * Returns only roster members whose OWN division field equals the
   * selected division. This is a player-IDENTITY boundary: division lives
   * on the DartConnect Inertia roster record next to the stable player ID,
   * so isolation never matches display names or venue text. Used both by
   * the session adapter (see createNightSession) and by the marker
   * candidate contexts, so a foreign-division player effectively does not
   * exist to the selected division's marker planning.
   */
  function filterRosterForDivision(roster, division) {
    const players = Array.isArray(roster) ? roster : [];
    if (typeof division !== 'string' || !division) return players.slice();
    // Players WITHOUT a division field are unclassified (legacy/direct-API
    // callers, never produced by the real Inertia roster parse) and are
    // never treated as foreign. Only an explicit DIFFERENT division
    // excludes — that is exactly the cross-division contamination case.
    return players.filter((p) => p && (!p.division || p.division === division));
  }

  /** DartConnect live abbreviation: "James Harrison" -> "James H". Null when unusable. */
  function abbreviateName(fullName) {
    if (typeof fullName !== 'string') return null;
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (!first || !last) return null;
    return first + ' ' + last.charAt(0).toUpperCase();
  }

  /** Canonical pair key. orientation: 'as-is' keeps left/right; 'sorted' is orientation-free. */
  function pairKey(abbrevA, abbrevB, orientation) {
    if (!abbrevA || !abbrevB) return null;
    const a = abbrevA.trim();
    const b = abbrevB.trim();
    if (!a || !b) return null;
    if (orientation === 'sorted') return [a, b].sort().join('||');
    return a + '||' + b;
  }

  /**
   * Sort fixtures: date -> round -> session, stable original DOM order last.
   * Missing round/session sort after present values within the same date.
   */
  function sortFixtures(fixtures) {
    const rank = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER);
    return fixtures
      .map((f, i) => ({ f, i }))
      .sort((x, y) => {
        const dx = (x.f.dateValue || 0) - (y.f.dateValue || 0);
        if (dx !== 0) return dx;
        const dr = rank(x.f.roundValue) - rank(y.f.roundValue);
        if (dr !== 0) return dr;
        const ds = rank(x.f.sessionValue) - rank(y.f.sessionValue);
        if (ds !== 0) return ds;
        return x.i - y.i;
      })
      .map((entry) => entry.f);
  }

  /**
   * Deduplicate fixtures. Primary key is the DartConnect match id;
   * data key (date+division+round+session+both IDs) is the fallback.
   * Returns { fixtures, removed }.
   */
  function dedupeFixtures(fixtures) {
    const seen = new Set();
    const out = [];
    let removed = 0;
    for (const f of fixtures) {
      const key = f.matchId != null ? 'id:' + f.matchId : [
        f.dateValue || 0, f.division, f.roundValue == null ? '' : f.roundValue,
        f.sessionValue == null ? '' : f.sessionValue,
        f.playerA.id || f.playerA.name, f.playerB.id || f.playerB.name,
      ].join('|');
      if (seen.has(key)) { removed += 1; continue; }
      seen.add(key);
      out.push(f);
    }
    return { fixtures: out, removed };
  }

  /** Visible fixtures for a division after Not Here filtering. */
  function visibleFixtures(fixtures, division, absentIds) {
    return fixtures.filter((f) => {
      if (f.division !== division) return false;
      if (absentIds.has(f.playerA.id) || absentIds.has(f.playerB.id)) return false;
      return true;
    });
  }

  /**
   * Match live abbreviated pairs against outstanding fixtures.
   * Marks exactly those fixtures where one unique outstanding fixture
   * matches the complete pair. orientation: 'as-is' (default) or 'sorted'.
   */
  function matchLiveFixtures(fixtures, livePairs, orientation) {
    const result = new Map();
    const index = new Map();
    for (const f of fixtures) {
      if (f.status === 'playing') continue;
      const a = abbreviateName(f.playerA.name);
      const b = abbreviateName(f.playerB.name);
      const key = pairKey(a, b, orientation || 'as-is');
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(f);
    }
    for (const live of livePairs) {
      const key = pairKey(live.a, live.b, orientation || 'as-is');
      if (!key) continue;
      const candidates = index.get(key) || [];
      if (candidates.length === 1) result.set(candidates[0], live);
    }
    return result;
  }

  /* ============================== 4. Persistent state ============================== */

  /** First discovered division is the default when no valid saved selection exists. */
  function defaultState(divisions) {
    const list = Array.isArray(divisions) ? divisions : [];
    return { division: list.length ? list[0] : '', absentIds: [], selectedMatchDate: null, theme: null };
  }

  /** Resolve the effective theme: saved value wins, else system preference. */
  function defaultTheme(saved, prefersDark) {
    if (saved === 'light' || saved === 'dark') return saved;
    return prefersDark ? 'dark' : 'light';
  }

  function systemPrefersDark() {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { return false; }
  }

  /**
   * Load per-league state (division/absent/date) from `storeKey` plus the
   * global theme preference. Division is validated against `divisions`
   * (discovered data), never fixed constants. Pure except storage reads.
   */
  function loadState(storage, divisions, storeKey) {
    const list = Array.isArray(divisions) ? divisions : [];
    const state = defaultState(list);
    try {
      const raw = storeKey ? storage.getItem(storeKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (list.indexOf(parsed.division) !== -1) state.division = parsed.division;
        if (Array.isArray(parsed.absentIds)) {
          state.absentIds = parsed.absentIds.filter((id) => Number.isSafeInteger(id));
        }
        if (typeof parsed.selectedMatchDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.selectedMatchDate)) {
          state.selectedMatchDate = parsed.selectedMatchDate;
        }
      }
    } catch (e) {
      warn('localStorage read failed, using defaults:', e);
    }
    try {
      const theme = storage.getItem(THEME_KEY);
      if (theme === 'light' || theme === 'dark') state.theme = theme;
    } catch (e) {
      warn('theme read failed:', e);
    }
    return state;
  }

  /**
   * Save per-league state under `storeKey` and the theme globally.
   * Never writes when `storeKey` is missing (no cross-league leakage).
   */
  function saveState(storage, state, storeKey) {
    try {
      if (storeKey) {
        storage.setItem(storeKey, JSON.stringify({
          division: state.division,
          absentIds: state.absentIds,
          selectedMatchDate: state.selectedMatchDate || null,
        }));
      }
    } catch (e) {
      warn('localStorage write failed:', e);
    }
    try {
      if (state.theme === 'light' || state.theme === 'dark') storage.setItem(THEME_KEY, state.theme);
    } catch (e) {
      warn('theme write failed:', e);
    }
  }

  /**
   * ONE-TIME legacy V1.0 migration (South Staffordshire ONLY).
   * Copies compatible fields from the old fixed key to the new per-league
   * key when the new key does not exist yet. Never overwrites, never deletes
   * the old key, never throws, and is a no-op for every other league.
   */
  function migrateLegacyState(storage, league) {
    try {
      if (!storage || !league || league.leagueCode !== LEGACY_SSTAFF_CODE || league.leagueId !== LEGACY_SSTAFF_ID) return false;
      const storeKey = storageKeyForLeague(league);
      if (!storeKey || storage.getItem(storeKey) != null) return false;
      const raw = storage.getItem(LEGACY_SSTAFF_KEY);
      if (raw == null) return false;
      const parsed = JSON.parse(raw);
      const next = {};
      if (typeof parsed.division === 'string' && parsed.division) next.division = parsed.division;
      if (Array.isArray(parsed.absentIds)) {
        next.absentIds = parsed.absentIds.filter((id) => Number.isSafeInteger(id));
      }
      if (typeof parsed.selectedMatchDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.selectedMatchDate)) {
        next.selectedMatchDate = parsed.selectedMatchDate;
      }
      storage.setItem(storeKey, JSON.stringify(next));
      if ((parsed.theme === 'light' || parsed.theme === 'dark') && storage.getItem(THEME_KEY) == null) {
        storage.setItem(THEME_KEY, parsed.theme);
      }
      return true;
    } catch (e) {
      warn('legacy state migration failed; starting fresh:', e);
      return false;
    }
  }

  /* ============ 4b. Match date filter (pure; upper-bound semantics) ============ */

  /** Distinct ISO dates across fixtures, ascending. Ordering is by ISO value, never display text. */
  function distinctMatchDates(fixtures) {
    const seen = {};
    fixtures.forEach((f) => {
      if (typeof f.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) seen[f.date] = true;
    });
    return Object.keys(seen).sort();
  }

  /** Today's LOCAL calendar date as ISO. Built from local components so UK
   * midnight is never shifted by UTC conversion. Accepts an optional Date
   * (test seam); defaults to now. */
  function todayLocalIso(now) {
    const d = now instanceof Date ? now : new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Automatic match-night date: exact today when present, else the earliest
   * available date >= today, else the latest available date ('' when none).
   */
  function defaultMatchDate(availableDates, todayIso) {
    if (!availableDates.length) return '';
    if (availableDates.indexOf(todayIso) !== -1) return todayIso;
    for (let i = 0; i < availableDates.length; i++) {
      if (availableDates[i] >= todayIso) return availableDates[i];
    }
    return availableDates[availableDates.length - 1];
  }

  /** Restore a saved date when still available, else fall back to automatic. */
  function resolveMatchDate(availableDates, savedDate, todayIso) {
    if (savedDate && availableDates.indexOf(savedDate) !== -1) return savedDate;
    return defaultMatchDate(availableDates, todayIso);
  }

  /** Upper-bound filter: fixtures with date <= selected, plus dateless ones. */
  function withinSelectedDate(fixtures, dateIso) {
    if (!dateIso) return fixtures.slice();
    return fixtures.filter((f) => typeof f.date !== 'string' || !f.date || f.date <= dateIso);
  }

  /** Full display pipeline: division -> date upper bound -> Not Here removal. */
  function applyDisplayFilters(fixtures, division, dateIso, absentIds) {
    return visibleFixtures(withinSelectedDate(fixtures, dateIso), division, absentIds);
  }

  /* ============================== 5. data-page extraction ============================== */

  /**
   * Extract and parse the Inertia data-page JSON from schedule HTML.
   * The attribute value is HTML-entity encoded; the first raw double
   * quote terminates it (inner quotes are always encoded).
   */
  function extractDataPageProps(html) {
    if (typeof html !== 'string' || !html) throw new Error('empty HTML document');
    const marker = 'data-page="';
    const start = html.indexOf(marker);
    if (start === -1) throw new Error('data-page attribute not found');
    const valueStart = start + marker.length;
    const end = html.indexOf('"', valueStart);
    if (end === -1) throw new Error('data-page attribute unterminated');
    const decoded = html.slice(valueStart, end)
      .split('&quot;').join('"')
      .split('&#039;').join("'")
      .split('&#x27;').join("'")
      .split('&lt;').join('<')
      .split('&gt;').join('>')
      .split('&amp;').join('&');
    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch (e) {
      throw new Error('data-page JSON unparseable: ' + (e && e.message));
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.props || typeof parsed.props !== 'object') {
      throw new Error('data-page JSON has no props object');
    }
    return parsed.props;
  }

  /** Recursively collect division objects that carry a competitors array. */
  function findDivisionRosters(props) {
    const out = [];
    (function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.competitors) && typeof node.division === 'string') {
        out.push(node);
        return;
      }
      Object.keys(node).forEach((k) => walk(node[k]));
    })(props);
    return out;
  }

  /**
   * Ordered unique division names from the Schedule Filter panel data
   * (authoritative roster source). Document order is preserved. Pure.
   */
  function discoverDivisions(props) {
    const out = [];
    const seen = new Set();
    findDivisionRosters(props).forEach((block) => {
      const division = typeof block.division === 'string' ? block.division.trim().replace(/\s+/g, ' ') : '';
      if (!division || seen.has(division)) return;
      seen.add(division);
      out.push(division);
    });
    return out;
  }

  /**
   * Authoritative roster from the Schedule Filter panel data.
   * Returns { players: [{id, name, division}], warnings }.
   * Accepts every well-formed roster block; division filtering (if any)
   * is the caller's decision, not the parser's.
   */
  function parseRosterFromProps(props, league) {
    const players = [];
    const warnings = [];
    const seen = new Set();
    findDivisionRosters(props).forEach((block) => {
      const division = typeof block.division === 'string' ? block.division.trim().replace(/\s+/g, ' ') : '';
      if (!division) {
        warnings.push('roster block without division skipped');
        return;
      }
      block.competitors.forEach((c) => {
        const id = typeof c.id === 'number' ? c.id : parsePlayerIdFromHref(c.url, league);
        const name = typeof c.competitor_name === 'string' ? c.competitor_name.trim().replace(/\s+/g, ' ') : '';
        if (!Number.isSafeInteger(id) || !name) {
          warnings.push('roster entry without id/name skipped');
          return;
        }
        if (seen.has(id)) return;
        seen.add(id);
        players.push({ id, name, division });
      });
    });
    return { players, warnings };
  }

  /** Recursively collect match-group arrays by key name, in document order. */
  function findMatchGroups(props, key) {
    const out = [];
    (function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach((k) => {
        if (k === key && Array.isArray(node[k])) {
          node[k].forEach((g) => out.push(g));
          return;
        }
        walk(node[k]);
      });
    })(props);
    return out;
  }

  function parseRoundNumber(schedTime) {
    const m = typeof schedTime === 'string' ? schedTime.match(/Round\s+(\d+)/i) : null;
    return m ? parseInt(m[1], 10) : null;
  }

  function parseSessionNumber(venueBoardLabel) {
    const m = typeof venueBoardLabel === 'string' ? venueBoardLabel.match(/Session\s+(\d+)/i) : null;
    return m ? parseInt(m[1], 10) : null;
  }

  function parseDateValue(schedDate) {
    if (typeof schedDate !== 'string') return 0;
    const m = schedDate.match(/^(20\d{2})-(\d{2})-(\d{2})/);
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  }

  function cleanDivisionName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/^Division:\s*/i, '').trim();
  }

  /**
   * Outstanding fixtures from pending (delayed) + future (upcoming) groups.
   * Display order is away-first, home-second (the (H) marker sits on home).
   * Only fixtures in `divisions` (discovered roster divisions) are accepted;
   * fixtures referencing divisions without a roster are skipped and counted
   * under skipped.unknownDivision (never silently merged, never invented).
   * Skips completed (status C), byes, and entries without numeric IDs.
   */
  function parseFixturesFromProps(props, divisions) {
    const allowed = new Set(Array.isArray(divisions) ? divisions : []);
    const fixtures = [];
    const warnings = [];
    const skipped = { completed: 0, bye: 0, noIds: 0, unknownDivision: 0, notMatch: 0 };
    const groups = findMatchGroups(props, 'pending_match_groups').map((g) => ({ group: g, delayed: true }))
      .concat(findMatchGroups(props, 'future_match_groups').map((g) => ({ group: g, delayed: false })));
    if (groups.length === 0) warnings.push('no pending/future match groups found');
    groups.forEach(({ group, delayed }) => {
      const dateLabel = [group.date_label, group.day_of_week].filter(Boolean).join(' - ');
      const dateValue = parseDateValue(group.date);
      (Array.isArray(group.divisions) ? group.divisions : []).forEach((divBlock) => {
        const division = cleanDivisionName(divBlock.division_name);
        const items = Array.isArray(divBlock.items) ? divBlock.items : [];
        if (!allowed.has(division)) {
          skipped.unknownDivision += items.length;
          warnOnce('match group with unknown division skipped: ' + (division || '(empty)'));
          return;
        }
        items.forEach((item) => {
        if (!item || item.item_type !== 'match') { skipped.notMatch += 1; return; }
        if (item.status === 'C') { skipped.completed += 1; return; }
        if (item.is_bye) { skipped.bye += 1; return; }
        const home = item.home || {};
        const away = item.away || {};
        const homeId = Number.isSafeInteger(home.id) ? home.id : null;
        const awayId = Number.isSafeInteger(away.id) ? away.id : null;
        const homeName = typeof home.name === 'string' ? home.name.trim().replace(/\s+/g, ' ') : '';
        const awayName = typeof away.name === 'string' ? away.name.trim().replace(/\s+/g, ' ') : '';
        if (homeId == null || awayId == null || !homeName || !awayName) {
          skipped.noIds += 1;
          return;
        }
        fixtures.push({
          matchId: typeof item.id === 'number' ? item.id : null,
          date: typeof group.date === 'string' ? group.date.slice(0, 10) : '',
          dateLabel,
          dateValue,
          division,
          roundLabel: typeof item.sched_time_label === 'string' ? item.sched_time_label : (typeof item.sched_time === 'string' ? item.sched_time : ''),
          roundValue: parseRoundNumber(item.sched_time),
          sessionLabel: typeof item.venue_board_label === 'string' ? item.venue_board_label : '',
          sessionValue: parseSessionNumber(item.venue_board_label),
          playerA: { id: awayId, name: awayName },
          playerB: { id: homeId, name: homeName },
          delayed: !!delayed,
          status: 'waiting',
        });
        });
      });
    });
    return { fixtures, warnings, skipped };
  }

  /* ============================== 6b. Match Center live API ============================== */

  const TV_API_BASE = 'https://tv.dartconnect.com';

  function tvApiUrl(kind, league) {
    // kind: 'live' | 'matches'. The stage/season id is the numeric schedule id.
    const suffix = kind === 'live' ? '/matches/live/' + league.leagueId : '/matches/' + league.leagueId;
    return TV_API_BASE + '/api/league/' + league.leagueCode + suffix;
  }

  /** Match Centre page URL for a league context (DOM-scrape fallback). */
  function matchCentreUrl(league) {
    return 'https://tv.dartconnect.com/league/' + league.leagueCode + '/matches/' + league.leagueId;
  }

  /**
   * Exact POST body the official Match Center client sends to both league
   * endpoints (verified in its JS bundle: {division_id, competitor_id},
   * both null with no filter selected). The live endpoint HTTP-500s when
   * these keys are absent (verified 2026-09-27: '{}'/no-body -> 500 3/3,
   * this body -> 200 3/3, alternating trials, identical headers).
   * Never send '{}' or an empty body here.
   */
  const LEAGUE_POST_BODY = '{"division_id":null,"competitor_id":null}';

  /** POST JSON via the Tampermonkey transport. Resolves {ok, status, json, error}. */
  function apiPost(transport, url, body) {
    return new Promise((resolve) => {
      if (!transport || typeof transport !== 'function') {
        resolve({ ok: false, status: 0, json: null, error: 'transport unavailable' });
        return;
      }
      try {
        transport({
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          data: typeof body === 'string' ? body : LEAGUE_POST_BODY,
          timeout: 15000,
          onload: (resp) => {
            if (resp.status < 200 || resp.status >= 300) {
              resolve({ ok: false, status: resp.status, json: null, error: 'HTTP ' + resp.status });
              return;
            }
            try {
              resolve({ ok: true, status: resp.status, json: JSON.parse(resp.responseText), error: null });
            } catch (e) {
              resolve({ ok: false, status: resp.status, json: null, error: 'unparseable JSON' });
            }
          },
          onerror: (e) => resolve({ ok: false, status: 0, json: null, error: 'request failed' }),
          ontimeout: () => resolve({ ok: false, status: 0, json: null, error: 'timed out' }),
        });
      } catch (e) {
        resolve({ ok: false, status: 0, json: null, error: 'transport error' });
      }
    });
  }

  function numId(v) {
    if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
    if (typeof v === 'string' && /^[0-9]+$/.test(v)) {
      const n = parseInt(v, 10);
      if (Number.isSafeInteger(n)) return n;
    }
    return null;
  }

  function cleanName(v) {
    if (typeof v !== 'string') return '';
    return v.trim().replace(/\s+/g, ' ');
  }

  function normName(v) {
    return cleanName(v).toLowerCase();
  }

  /**
   * Flip DartConnect's surname-first form ("Harrison, James") to schedule
   * order ("James Harrison"). Passes anything else through cleaned.
   * Genuine live/match payloads use surname-first in opponent_X_players and
   * league_match left/right team_name; the schedule uses First Last.
   */
  function unflipName(v) {
    const s = cleanName(v);
    if (!s) return '';
    const m = s.match(/^(.+?),\s*(.+)$/);
    if (!m) return s;
    const last = m[1].trim().replace(/\s+/g, ' ');
    const first = m[2].trim().replace(/\s+/g, ' ');
    if (!last || !first) return s;
    return first + ' ' + last;
  }

  /**
   * Normalize one API match record into {matchIds:[], ids:[a,b]|[],
   * names:[a,b], state, ref, division}. Handles:
   * - the observed reg shape (left/right with numeric ids + team_name);
   * - the genuine live shape (verified 2026-09-27): top-level
   *   league_match_id + status "O" + opponent_0/1 ("James H" abbrev) +
   *   opponent_0/1_players (surname-first full) + nested league_match
   *   {left/right with numeric ids + surname-first team_name};
   * - generic players/competitors variants defensively.
   * matchIds[0] is the schedule fixture id when known (league_match_id
   * first): the live record's top-level id is a broadcast id, not a
   * fixture id. ref carries the spectator watch key when present.
   * Returns null when the record carries nothing matchable.
   */
  function normalizeApiRecord(m) {
    if (!m || typeof m !== 'object') return null;
    const matchIds = [];
    const pushId = (v) => {
      const n = numId(v);
      if (n != null && matchIds.indexOf(n) === -1) matchIds.push(n);
    };
    pushId(m.league_match_id);
    if (m.league_match && typeof m.league_match === 'object') {
      pushId(m.league_match.league_match_id);
      pushId(m.league_match.id);
    }
    pushId(m.match_id);
    pushId(m.id);
    let aId = null, bId = null, aName = '', bName = '';
    const left = m.left || m.home || null;
    const right = m.right || m.away || null;
    if (left && right) {
      aId = numId(left.id); bId = numId(right.id);
      aName = unflipName(left.team_name || left.name || left.competitor_name);
      bName = unflipName(right.team_name || right.name || right.competitor_name);
    } else if (m.league_match && m.league_match.left && m.league_match.right) {
      aId = numId(m.league_match.left.id); bId = numId(m.league_match.right.id);
      aName = unflipName(m.league_match.left.team_name || m.league_match.left.name);
      bName = unflipName(m.league_match.right.team_name || m.league_match.right.name);
    } else if (typeof m.opponent_0 === 'string' || typeof m.opponent_1 === 'string') {
      aName = unflipName(m.opponent_0_players) || cleanName(m.opponent_0);
      bName = unflipName(m.opponent_1_players) || cleanName(m.opponent_1);
    } else if (Array.isArray(m.players) && m.players.length >= 2) {
      aId = numId(m.players[0].id); bId = numId(m.players[1].id);
      aName = unflipName(m.players[0].name); bName = unflipName(m.players[1].name);
    } else if (Array.isArray(m.competitors) && m.competitors.length >= 2) {
      aId = numId(m.competitors[0].id); bId = numId(m.competitors[1].id);
      aName = unflipName(m.competitors[0].name); bName = unflipName(m.competitors[1].name);
    }
    const state = cleanName(m.status || m.state || m.stage || '');
    const ref = cleanName(m.match_reference || m.reference || m.spectator_key || '');
    if (!matchIds.length && aId == null && !aName) return null;
    return { matchIds, ids: [aId, bId], names: [aName, bName], state, ref, division: cleanName(m.division || '') };
  }

  /** Collect candidate record objects from an API payload of unknown shape. */
  function collectApiRecords(payload, stats) {
    const out = [];
    function noteRaw(m) {
      if (!stats) return;
      stats.received += 1;
      const key = (m && typeof m === 'object')
        ? String(m.status != null ? m.status : (m.state != null ? m.state : (m.stage != null ? m.stage : '(empty)')))
        : '(non-object)';
      stats.byStatus[key] = (stats.byStatus[key] || 0) + 1;
    }
    function pushArray(arr) {
      arr.forEach((m) => {
        if (m && typeof m === 'object') {
          noteRaw(m);
          const rec = normalizeApiRecord(m);
          if (rec) out.push(rec);
          else if (stats) stats.dropped += 1;
        }
      });
    }
    if (Array.isArray(payload)) { pushArray(payload); return out; }
    if (!payload || typeof payload !== 'object') return out;
    if (Array.isArray(payload.matches)) pushArray(payload.matches);
    else if (payload.matches && typeof payload.matches === 'object') pushArray(Object.keys(payload.matches).map((k) => payload.matches[k]));
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // reg-style: { division: { date: [matches] } }
        Object.keys(v).forEach((d) => {
          const byDate = v[d];
          if (byDate && typeof byDate === 'object' && !Array.isArray(byDate)) {
            Object.keys(byDate).forEach((date) => {
              if (Array.isArray(byDate[date])) pushArray(byDate[date]);
            });
          }
        });
      }
    });
    return out;
  }

  /**
   * A record counts as live when its state is set and not a completed
   * marker. Observed live-endpoint statuses (verified 2026-09-27): "O"
   * (open/scoring now, carries spectator_key + opponent_0/1); "U"/"S"
   * rows are tablet-linked upcoming/scheduled. "C" marks completed.
   */
  function isLiveRecord(rec) {
    if (!rec.state) return true;
    return !/^(c|completed|complete|finished|final)$/i.test(rec.state);
  }

  /** Safe shape summary of an API payload (keys + array lengths only, depth-limited). */
  function summarizeJsonShape(json) {
    try {
      return shapeNode(json, 0);
    } catch (e) { return 'uninspectable'; }
  }

  function shapeNode(node, depth) {
    if (Array.isArray(node)) return 'array[' + node.length + ']';
    if (!node || typeof node !== 'object' || depth > 2) return Array.isArray(node) ? 'array?' : typeof node;
    const parts = Object.keys(node).slice(0, 15).map((k) => k + ':' + shapeNode(node[k], depth + 1));
    return '{' + parts.join(', ') + '}';
  }

  /** Safe normalized view of one live record for diagnostics (no auth material exists here). */
  function safeRecord(rec) {
    return {
      matchId: rec.matchIds.length ? rec.matchIds[0] : null,
      leftId: rec.ids[0],
      rightId: rec.ids[1],
      leftName: rec.names[0] || '',
      rightName: rec.names[1] || '',
      division: rec.division || '',
      status: rec.state || '',
      reference: rec.ref || '',
    };
  }

  /** True when record and fixture share any identity at any level/orientation. */
  function sharesIdentity(f, rec) {
    if (rec.matchIds.length && f.matchId != null && rec.matchIds.indexOf(f.matchId) !== -1) return true;
    const pairs = [[rec.ids[0], rec.ids[1]], [rec.ids[1], rec.ids[0]]];
    for (const [ra, rb] of pairs) {
      if (ra != null && rb != null && ((f.playerA.id === ra && f.playerB.id === rb))) return true;
    }
    const names = [[normName(rec.names[0]), normName(rec.names[1])], [normName(rec.names[1]), normName(rec.names[0])]];
    for (const [ra, rb] of names) {
      if (ra && rb && normName(f.playerA.name) === ra && normName(f.playerB.name) === rb) return true;
    }
    const aa = abbreviateName(rec.names[0]);
    const ab = abbreviateName(rec.names[1]);
    if (aa && ab) {
      const fa = abbreviateName(f.playerA.name);
      const fb = abbreviateName(f.playerB.name);
      if ((fa === aa && fb === ab) || (fa === ab && fb === aa)) return true;
    }
    return false;
  }

  /**
   * Diagnose every live record against the full fixture list: runs the
   * standard matcher on the candidate set, then classifies each unmatched
   * record as outside-selected-division, outside-selected-date,
   * no-candidate (or missing-competitors when the record carries nothing
   * matchable). Returns { marked, ambiguous, unmatched, rejected } where
   * rejected entries carry { record: safeRecord, reason }.
   */
  function diagnoseLiveMatch(allFixtures, candidates, records, state) {
    const matched = matchLiveRecords(candidates, records);
    const decided = new Set();
    matched.marked.forEach((rec) => decided.add(rec));
    matched.ambiguous.forEach((a) => decided.add(a.record));
    const rejected = [];
    matched.unmatched.forEach((rec) => {
      const hasIds = rec.ids[0] != null && rec.ids[1] != null;
      const hasNames = !!(rec.names[0] && rec.names[1]);
      if (!hasIds && !hasNames) {
        rejected.push({ record: safeRecord(rec), reason: 'missing-competitors' });
        return;
      }
      const anyHit = allFixtures.filter((f) => sharesIdentity(f, rec));
      if (!anyHit.length) {
        rejected.push({ record: safeRecord(rec), reason: 'no-candidate' });
        return;
      }
      if (!anyHit.some((f) => f.division === state.division)) {
        rejected.push({ record: safeRecord(rec), reason: 'outside-selected-division' });
        return;
      }
      if (state.selectedMatchDate && !anyHit.some((f) => !f.date || f.date <= state.selectedMatchDate)) {
        rejected.push({ record: safeRecord(rec), reason: 'outside-selected-date' });
        return;
      }
      rejected.push({ record: safeRecord(rec), reason: 'no-candidate' });
    });
    return { marked: matched.marked, ambiguous: matched.ambiguous, unmatched: matched.unmatched, rejected };
  }

  /**
   * Priority matching: 1) schedule match id, 2) numeric player-id pair,
   * 3) full-name pair, 4) abbreviated pair. Same orientation first, then
   * swapped — each level requires exactly one candidate. Returns
   * { marked: Map(fixture->record), ambiguous: [], unmatched: [] }.
   */
  function matchLiveRecords(fixtures, records) {
    const marked = new Map();
    const ambiguous = [];
    const unmatched = [];
    const claimed = new Set();
    records.forEach((rec) => {
      const levels = [
        () => matchById(fixtures, rec),
        () => matchByPair(fixtures, rec, false, false),
        () => matchByPair(fixtures, rec, true, false),
        () => matchByPair(fixtures, rec, false, true),
        () => matchByPair(fixtures, rec, true, true),
        () => matchAbbreviated(fixtures, rec, false),
        () => matchAbbreviated(fixtures, rec, true),
      ];
      let done = false;
      for (const level of levels) {
        const hits = level().filter((f) => !claimed.has(f));
        if (hits.length === 1) {
          marked.set(hits[0], rec);
          claimed.add(hits[0]);
          done = true;
          break;
        }
        if (hits.length > 1) {
          ambiguous.push({ record: rec, candidates: hits.length });
          done = true;
          break;
        }
      }
      if (!done) unmatched.push(rec);
    });
    return { marked, ambiguous, unmatched };
  }

  function matchById(fixtures, rec) {
    if (!rec.matchIds.length) return [];
    return fixtures.filter((f) => f.matchId != null && rec.matchIds.indexOf(f.matchId) !== -1);
  }

  function matchByPair(fixtures, rec, swapped, byName) {
    const ra = byName ? normName(rec.names[0]) : rec.ids[0];
    const rb = byName ? normName(rec.names[1]) : rec.ids[1];
    if (ra == null || ra === '' || rb == null || rb === '') return [];
    return fixtures.filter((f) => {
      const fa = byName ? normName(f.playerA.name) : f.playerA.id;
      const fb = byName ? normName(f.playerB.name) : f.playerB.id;
      if (fa == null || fa === '' || fb == null || fb === '') return false;
      return swapped ? (fa === rb && fb === ra) : (fa === ra && fb === rb);
    });
  }

  function matchAbbreviated(fixtures, rec, swapped) {
    const ra = abbreviateName(rec.names[0]);
    const rb = abbreviateName(rec.names[1]);
    if (!ra || !rb) return [];
    const key = swapped ? pairKey(rb, ra, 'as-is') : pairKey(ra, rb, 'as-is');
    return fixtures.filter((f) => {
      const fa = abbreviateName(f.playerA.name);
      const fb = abbreviateName(f.playerB.name);
      return pairKey(fa, fb, 'as-is') === key;
    });
  }

  /* ============================== 6c. Live polling ============================== */

  const LIVE_POLL_MS = 30000;
  let liveTimer = null;
  let liveInFlight = false;
  let activeLiveCtx = null;

  function formatClock(iso) {
    try {
      const d = iso ? new Date(iso) : new Date();
      const pad = (n) => (n < 10 ? '0' : '') + n;
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    } catch (e) { return ''; }
  }

  /** Compact "reason×count" summary for console logging. Pure. */
  function tallyReasons(rejected) {
    const counts = {};
    (rejected || []).forEach((r) => {
      counts[r.reason] = (counts[r.reason] || 0) + 1;
    });
    const keys = Object.keys(counts);
    if (!keys.length) return 'none';
    return keys.map((k) => k + '×' + counts[k]).join(', ');
  }

  let currentLiveTitle = '';

  function liveNoteText(info) {
    const clock = formatClock(info.lastChecked);
    const checked = clock ? ' · checked ' + clock : '';
    const playing = info.playing || 0;
    if (info.failed || (info.error && !info.rowsFound)) {
      currentLiveTitle = 'Match Center check failed (' + (info.error || 'unknown') + '). Showing schedule data only; PLAYING is last-known.';
      return 'Live: Connection error · ' + playing + ' playing (last known)' + checked;
    }
    if (info.fallback) {
      currentLiveTitle = 'Live endpoint failed; schedule fallback in use. Source: ' + (info.source || 'none') + ' · HTTP ' + info.requestStatus;
      return 'Live: Connected (schedule fallback) · ' + playing + ' playing' + checked;
    }
    currentLiveTitle = 'Source: ' + (info.source || 'none') + ' · HTTP ' + info.requestStatus +
      ' · rows ' + info.rowsFound + ' · ambiguous ' + (info.ambiguous ? info.ambiguous.length : 0);
    return 'Live: Connected · ' + playing + ' playing' + checked;
  }

  function refreshLive(ctx) {
    if (liveInFlight) return Promise.resolve();
    liveInFlight = true;
    const info = ctx.live;
    info.lastChecked = new Date().toISOString();
    info.error = null;
    const candidates = (ctx.data.fixtures || []).filter((f) =>
      f.division === ctx.state.division &&
      (!f.date || !ctx.state.selectedMatchDate || f.date <= ctx.state.selectedMatchDate));
    return fetchLiveState(ctx.transport, candidates, ctx.data.fixtures || [], ctx.state, ctx.league).then((result) => {
      liveInFlight = false;
      info.source = result.source;
      info.requestStatus = result.status;
      info.rowsFound = result.rows;
      info.parsed = result.parsed;
      info.ambiguous = result.ambiguous;
      info.unmatched = result.unmatched;
      info.rejected = result.rejected;
      info.endpointUsed = result.endpointUsed;
      info.responseShape = result.responseShape;
      info.recordsReceived = result.recordsReceived;
      info.statusCounts = result.statusCounts || {};
      info.attempts = result.attempts || [];
      info.consideredLive = result.consideredLive;
      info.normalized = result.normalized;
      info.error = result.error;
      info.liveOk = result.liveOk;
      info.failed = !result.ok;
      info.fallback = result.ok && result.source !== 'api-live';
      log('live poll:', info.endpointUsed || info.source, 'HTTP', info.requestStatus,
        '| received', info.recordsReceived, '| by status', JSON.stringify(info.statusCounts),
        '| live', info.consideredLive, '| marked', result.marked.size,
        '| rejected', tallyReasons(info.rejected));
      if (result.ok && result.source === 'api-live') {
        // Authoritative live response: absence of a record clears PLAYING.
        ctx.data.fixtures.forEach((f) => { if (f.status === 'playing') f.status = 'waiting'; });
        result.marked.forEach((rec, fixture) => {
          fixture.status = 'playing';
          log('PLAYING:', fixture.playerA.name, 'vs', fixture.playerB.name, rec.ref || '');
        });
      } else if (result.ok) {
        // Non-authoritative fallback (schedule/completed data or DOM
        // scrape): positive evidence may add PLAYING, but absence proves
        // nothing, so never clear here. Completed (C) records can never
        // match as live — they are filtered before matching.
        result.marked.forEach((rec, fixture) => {
          if (fixture.status !== 'playing') {
            fixture.status = 'playing';
            log('PLAYING (fallback):', fixture.playerA.name, 'vs', fixture.playerB.name, rec.ref || '');
          }
        });
      } else {
        // Transport failure on every source: UNKNOWN state, not proof the
        // match stopped. Preserve PLAYING exactly as-is.
        warn('live endpoints unreachable; preserving last-known PLAYING state.');
      }
      info.playing = ctx.data.fixtures.filter((f) => f.status === 'playing').length;
      // Slice 3C: the strongest reliable factual signal that a delayed
      // fixture has been taken into the programme is factual PLAYING.
      // Consumption happens at most once per fixture (identity recorded
      // runtime-only), decrements BOTH participants, then the rerender
      // below re-plans globally from the updated constraint.
      ctx.data.fixtures.forEach((f) => {
        if (f.delayed && f.status === 'playing') {
          const res = consumeDelayedAllowance(ctx.data.delayedAllowanceRuntime, f);
          if (res.consumed) ctx.data.delayedAllowanceRuntime = res.runtime;
        }
      });
      ctx.rerender(liveNoteText(info));
    }).catch((e) => {
      liveInFlight = false;
      info.error = String((e && e.message) || e);
      warn('live refresh failed; schedule unaffected:', e);
      ctx.rerender(liveNoteText(info));
    });
  }

  function startLivePolling(ctx) {
    stopLivePolling();
    liveTimer = setInterval(() => { refreshLive(ctx); }, LIVE_POLL_MS);
  }

  function stopLivePolling() {
    if (liveTimer !== null) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  /**
   * Live-state fetch: API live endpoint, then API matches endpoint for
   * non-completed records, then DOM scrape fallback. Applies priority
   * matching against the candidate fixtures. Never throws.
   */
  function fetchLiveState(transport, fixtures, allFixtures, state, league) {
    const summary = {
      ok: false, source: 'none', status: 0, rows: 0, parsed: 0,
      marked: new Map(), ambiguous: [], unmatched: [], rejected: [],
      endpointUsed: '', responseShape: '', recordsReceived: 0, consideredLive: 0,
      statusCounts: {}, attempts: [],
      normalized: [], error: null, liveOk: false,
    };
    function apply(records, stats, source, status, shape) {
      summary.ok = true;
      summary.source = source;
      summary.endpointUsed = source === 'dom' ? 'dom-scrape' : tvApiUrl(source === 'api-live' ? 'live' : 'matches', league);
      summary.status = status;
      summary.responseShape = shape;
      summary.recordsReceived = stats.received;
      summary.statusCounts = stats.byStatus;
      summary.consideredLive = records.length;
      summary.parsed = records.length;
      summary.normalized = records.map(safeRecord);
      const diagnosed = diagnoseLiveMatch(allFixtures, fixtures, records, state);
      summary.marked = diagnosed.marked;
      summary.ambiguous = diagnosed.ambiguous;
      summary.unmatched = diagnosed.unmatched;
      summary.rejected = diagnosed.rejected;
      summary.rows = records.length;
      return summary;
    }
    function attempt(kind, res) {
      summary.attempts.push({
        endpoint: kind === 'dom' ? 'dom-scrape' : tvApiUrl(kind, league),
        status: res.status || 0,
        error: res.error || null,
        records: 0,
      });
      return summary.attempts[summary.attempts.length - 1];
    }
    function freshStats() {
      return { received: 0, byStatus: {}, dropped: 0 };
    }
    return apiPost(transport, tvApiUrl('live', league)).then((res) => {
      const att = attempt('live', res);
      summary.liveOk = !!(res.ok && res.json !== null);
      if (res.ok && res.json !== null) {
        const stats = freshStats();
        const all = collectApiRecords(res.json, stats);
        att.records = all.length;
        const records = all.filter(isLiveRecord);
        if (records.length > 0 || res.status === 200) {
          const out = apply(records, stats, 'api-live', res.status, summarizeJsonShape(res.json));
          pushNotLive(out, all);
          return out;
        }
      }
      return apiPost(transport, tvApiUrl('matches', league)).then((res2) => {
        const att2 = attempt('matches', res2);
        if (res2.ok && res2.json !== null) {
          const stats = freshStats();
          const all = collectApiRecords(res2.json, stats);
          att2.records = all.length;
          const records = all.filter(isLiveRecord);
          const out = apply(records, stats, 'api-matches', res2.status, summarizeJsonShape(res2.json));
          pushNotLive(out, all);
          return out;
        }
        summary.error = (res.error || res2.error || 'unreachable');
        summary.status = res2.status || res.status;
        summary.endpointUsed = tvApiUrl('live', league) + ' then ' + tvApiUrl('matches', league);
        return fetchLiveDom(transport, league).then((domRecords) => {
          if (domRecords === null) return summary;
          const domStats = freshStats();
          domStats.received = domRecords.length;
          return apply(domRecords, domStats, 'dom', 200, 'dom-rows[' + domRecords.length + ']');
        });
      });
    });

    function pushNotLive(out, all) {
      all.forEach((rec) => {
        if (!isLiveRecord(rec)) out.rejected.push({ record: safeRecord(rec), reason: 'status-not-live' });
      });
    }
  }

  /** Last-resort DOM scrape of the Match Center page (rows are usually client-rendered). */
  function fetchLiveDom(transport, league) {
    return new Promise((resolve) => {
      if (!transport || typeof transport !== 'function' || typeof DOMParser === 'undefined') {
        resolve(null);
        return;
      }
      try {
        transport({
          method: 'GET', url: matchCentreUrl(league), timeout: 15000,
          onload: (resp) => {
            if (resp.status < 200 || resp.status >= 300) { resolve(null); return; }
            try {
              const doc = new DOMParser().parseFromString(resp.responseText, 'text/html');
              resolve(parseLiveRows(doc).map((r) => ({ matchIds: [], ids: [null, null], names: [r.a, r.b], state: 'live', ref: r.ref, division: '' })));
            } catch (e) { resolve(null); }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null),
        });
      } catch (e) { resolve(null); }
    });
  }

  /** Parse live rows from Match Center HTML. Pure against a Document. */
  function parseLiveRows(doc) {
    const rows = [];
    doc.querySelectorAll(KNOWN_SELECTORS.liveRow).forEach((row) => {
      const left = row.querySelector(KNOWN_SELECTORS.liveLeft);
      const right = row.querySelector(KNOWN_SELECTORS.liveRight);
      if (!left || !right) return;
      const a = left.textContent.trim().replace(/\s+/g, ' ');
      const b = right.textContent.trim().replace(/\s+/g, ' ');
      if (!a || !b) return;
      const ref = row.querySelector(KNOWN_SELECTORS.liveRefDesktop + ',' + KNOWN_SELECTORS.liveRefMobile);
      rows.push({ a, b, ref: ref ? ref.textContent.trim() : '' });
    });
    return rows;
  }

  /* ============================== 6d. Match Night Scheduler Domain Model (Slice 1) ============================== */

  const PLAYER_STATES = {
    AVAILABLE: 'AVAILABLE',
    PLAYING: 'PLAYING',
    MARKING: 'MARKING',
    ABSENT: 'ABSENT',
  };

  const GAME_TYPES = {
    CURRENT: 'CURRENT',
    DELAYED: 'DELAYED',
    EXTRA: 'EXTRA',
  };

  const GAME_STATUSES = {
    WAITING: 'WAITING',
    ALLOCATED: 'ALLOCATED',
    PLAYING: 'PLAYING',
    COMPLETED: 'COMPLETED',
    DELAYED_REJECTED: 'DELAYED_REJECTED',
  };

  const MARKER_IMPACTS = {
    GREEN: 'GREEN',
    AMBER: 'AMBER',
    RED: 'RED',
  };

  const BOARD_STATUSES = {
    AVAILABLE: 'AVAILABLE',
    OCCUPIED: 'OCCUPIED',
  };

  function createBoard(boardNumber) {
    return {
      boardNumber,
      status: BOARD_STATUSES.AVAILABLE,
      activeMatchId: null,
      markerPlayerId: null,
      activeGame: null,
    };
  }

  function createInitialBoards(boardCount) {
    const count = typeof boardCount === 'number' && boardCount > 0 ? Math.floor(boardCount) : 4;
    const boards = [];
    for (let i = 1; i <= count; i++) {
      boards.push(createBoard(i));
    }
    return boards;
  }

  function classifyGameType(fixture, selectedMatchDate) {
    if (!fixture) return GAME_TYPES.CURRENT;
    if (fixture.isExtra) return GAME_TYPES.EXTRA;
    if (fixture.delayed) return GAME_TYPES.DELAYED;
    if (selectedMatchDate && fixture.date && fixture.date > selectedMatchDate) return GAME_TYPES.EXTRA;
    return GAME_TYPES.CURRENT;
  }

  function createNightSession(config) {
    const cfg = config || {};
    const managedBoardsEnabled = !!cfg.managedBoardsEnabled;
    const boardCount = typeof cfg.boardCount === 'number' && cfg.boardCount > 0 ? Math.floor(cfg.boardCount) : 4;

    let boards = [];
    if (managedBoardsEnabled) {
      if (Array.isArray(cfg.boards) && cfg.boards.length > 0) {
        boards = cfg.boards.map((b, idx) => ({
          boardNumber: b.boardNumber || (idx + 1),
          status: b.status || (b.activeMatchId ? BOARD_STATUSES.OCCUPIED : BOARD_STATUSES.AVAILABLE),
          activeMatchId: b.activeMatchId || null,
          markerPlayerId: b.markerPlayerId || null,
          activeGame: b.activeGame || null,
        }));
      } else {
        boards = createInitialBoards(boardCount);
      }
    }

    const toSet = (v) => {
      if (v instanceof Set) return new Set(v);
      if (Array.isArray(v)) return new Set(v);
      return new Set();
    };

    // Selected-division roster boundary: the session's player pool is the
    // selected division's roster ONLY. Fixtures are already division-filtered
    // upstream (getPlayableGames et al.), but without this filter foreign-
    // division players entered derivePlayerStates -> the marker candidate
    // pool -> the global opening marker optimiser. Club markers belong to
    // the selected division; a player from another division/venue must not
    // be proposed, scored or consumed as candidate breadth. Note: an
    // EXPLICITLY supplied cfg.eligibleMarkerPool / externalPlayers at the
    // planner boundary remains honoured (deliberate external-guest option).
    const divisionMembers = filterRosterForDivision(cfg.players, cfg.selectedDivision);
    const divisionAbsent = (Array.isArray(cfg.absentIds) ? cfg.absentIds : [])
      .filter((id) => divisionMembers.some((p) => p.id === id));
    return {
      players: divisionMembers,
      fixtures: Array.isArray(cfg.fixtures) ? cfg.fixtures.slice() : [],
      selectedDivision: typeof cfg.selectedDivision === 'string' ? cfg.selectedDivision : '',
      selectedMatchDate: typeof cfg.selectedMatchDate === 'string' ? cfg.selectedMatchDate : null,
      managedBoardsEnabled,
      boardCount,
      boards,
      includeDelayed: !!cfg.includeDelayed,
      rejectedDelayedMatchIds: toSet(cfg.rejectedDelayedMatchIds),
      absentIds: toSet(divisionAbsent),
      activeGames: Array.isArray(cfg.activeGames) ? cfg.activeGames.slice() : [],
      completedMatchIds: toSet(cfg.completedMatchIds),
      markingPlayerIds: toSet(cfg.markingPlayerIds),
      // Slice 3C: runtime delayed catch-up allowance (R per player). A NEW
      // delayed fixture is eligible only when BOTH participants hold R > 0.
      // Factual PLAYING delayed games are never constrained by R.
      delayedAllowanceRuntime: cfg.delayedAllowanceRuntime || null,
      lastCompleted: cfg.lastCompleted || null,
    };
  }

  function derivePlayerStates(session, externalPlayers) {
    const map = new Map();
    const allPlayers = (session.players || []).concat(Array.isArray(externalPlayers) ? externalPlayers : []);

    allPlayers.forEach((p) => {
      if (p && Number.isSafeInteger(p.id) && !map.has(p.id)) {
        map.set(p.id, {
          id: p.id,
          name: p.name || '',
          division: p.division || '',
          state: PLAYER_STATES.AVAILABLE,
          currentMatchId: null,
          currentBoard: null,
        });
      }
    });

    session.absentIds.forEach((id) => {
      if (map.has(id)) {
        map.get(id).state = PLAYER_STATES.ABSENT;
      } else {
        map.set(id, { id, name: '', division: '', state: PLAYER_STATES.ABSENT, currentMatchId: null, currentBoard: null });
      }
    });

    (session.activeGames || []).forEach((ag) => {
      const aId = ag.playerA && ag.playerA.id;
      const bId = ag.playerB && ag.playerB.id;
      if (aId != null) {
        const p = map.get(aId) || { id: aId, name: (ag.playerA && ag.playerA.name) || '', division: '', state: PLAYER_STATES.AVAILABLE };
        p.state = PLAYER_STATES.PLAYING;
        p.currentMatchId = ag.matchId;
        p.currentBoard = ag.boardNumber || null;
        map.set(aId, p);
      }
      if (bId != null) {
        const p = map.get(bId) || { id: bId, name: (ag.playerB && ag.playerB.name) || '', division: '', state: PLAYER_STATES.AVAILABLE };
        p.state = PLAYER_STATES.PLAYING;
        p.currentMatchId = ag.matchId;
        p.currentBoard = ag.boardNumber || null;
        map.set(bId, p);
      }
      if (ag.markerId != null) {
        const m = map.get(ag.markerId) || { id: ag.markerId, name: '', division: '', state: PLAYER_STATES.AVAILABLE };
        if (m.state !== PLAYER_STATES.PLAYING) {
          m.state = PLAYER_STATES.MARKING;
          m.currentMatchId = ag.matchId;
          m.currentBoard = ag.boardNumber || null;
        }
        map.set(ag.markerId, m);
      }
    });

    // Factual MARKING players (Slice 3C): first-class local state. They
    // cannot be recommended to play or to mark anything else while their
    // duty is factually held. This runs BEFORE the board-occupied loop so
    // board-slot markers cannot downgrade an explicit MARKING to MARKING
    // (identical here) or, later, PLAYING to anything else.
    session.markingPlayerIds.forEach((id) => {
      const p = map.get(id) || { id, name: '', division: '', state: PLAYER_STATES.MARKING };
      p.state = PLAYER_STATES.MARKING;
      map.set(id, p);
    });

    if (session.managedBoardsEnabled && Array.isArray(session.boards)) {
      session.boards.forEach((b) => {
        if (b.status === BOARD_STATUSES.OCCUPIED) {
          if (b.markerPlayerId != null && map.has(b.markerPlayerId)) {
            const m = map.get(b.markerPlayerId);
            if (m.state !== PLAYER_STATES.PLAYING) {
              m.state = PLAYER_STATES.MARKING;
              m.currentBoard = b.boardNumber;
              m.currentMatchId = b.activeMatchId;
            }
          }
        }
      });
    }

    return map;
  }

  function rankPlayableGames(games) {
    const rank = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER);
    return games.slice().sort((x, y) => {
      const typeX = x.gameType === GAME_TYPES.CURRENT ? 0 : 1;
      const typeY = y.gameType === GAME_TYPES.CURRENT ? 0 : 1;
      if (typeX !== typeY) return typeX - typeY;

      const dx = (x.dateValue || 0) - (y.dateValue || 0);
      if (dx !== 0) return dx;

      const dr = rank(x.roundValue) - rank(y.roundValue);
      if (dr !== 0) return dr;

      const ds = rank(x.sessionValue) - rank(y.sessionValue);
      if (ds !== 0) return ds;

      return (x.matchId || 0) - (y.matchId || 0);
    });
  }

  function getPlayableGames(session, playerStates) {
    const pStates = playerStates || derivePlayerStates(session);
    const playable = [];
    const activeMatchIds = new Set((session.activeGames || []).map((ag) => ag.matchId));

    (session.fixtures || []).forEach((f) => {
      if (session.selectedDivision && f.division && f.division !== session.selectedDivision) {
        return;
      }
      if (session.completedMatchIds.has(f.matchId) || f.status === 'completed' || f.status === 'C') {
        return;
      }
      if (activeMatchIds.has(f.matchId) || f.status === 'playing') {
        return;
      }
      const gType = classifyGameType(f, session.selectedMatchDate);
      if (gType === GAME_TYPES.DELAYED) {
        if (!session.includeDelayed) return;
        if (session.rejectedDelayedMatchIds.has(f.matchId)) return;
        // Opportunistic catch-up only: both participants need remaining
        // delayed allowance (R > 0). Never applies to current-night games.
        if (session.delayedAllowanceRuntime && !canScheduleDelayedFixture(session.delayedAllowanceRuntime, f)) {
          return;
        }
      } else if (gType === GAME_TYPES.EXTRA) {
        return;
      } else {
        if (session.selectedMatchDate && f.date && f.date > session.selectedMatchDate) {
          return;
        }
      }

      const pa = pStates.get(f.playerA.id);
      const pb = pStates.get(f.playerB.id);
      const paAvail = pa && pa.state === PLAYER_STATES.AVAILABLE;
      const pbAvail = pb && pb.state === PLAYER_STATES.AVAILABLE;

      if (paAvail && pbAvail) {
        playable.push(Object.assign({}, f, { gameType: gType }));
      }
    });

    return rankPlayableGames(playable);
  }

  function evaluateMarkerImpact(session, candidatePlayerId, options) {
    const opts = options || {};
    const currentStates = derivePlayerStates(session, opts.externalPlayers);
    const candidate = currentStates.get(candidatePlayerId);

    if (!candidate || candidate.state !== PLAYER_STATES.AVAILABLE) {
      return {
        candidateId: candidatePlayerId,
        impact: MARKER_IMPACTS.RED,
        score: -100,
        reason: 'Candidate is not available (state: ' + (candidate ? candidate.state : 'UNKNOWN') + ')',
        blockedGames: [],
        hypoPlayableCount: 0,
      };
    }

    const baselinePlayable = getPlayableGames(session, currentStates);
    const baselineCount = baselinePlayable.length;

    const directlyBlocked = baselinePlayable.filter((g) =>
      g.playerA.id === candidatePlayerId || g.playerB.id === candidatePlayerId
    );

    let availableBoards = 1;
    if (session.managedBoardsEnabled) {
      const freeBoards = (session.boards || []).filter((b) => b.status === BOARD_STATUSES.AVAILABLE);
      availableBoards = Math.max(1, freeBoards.length);
    }

    const hypoStates = new Map(currentStates);
    hypoStates.set(candidatePlayerId, Object.assign({}, candidate, { state: PLAYER_STATES.MARKING }));
    const hypoPlayable = getPlayableGames(session, hypoStates);
    const hypoCount = hypoPlayable.length;

    const allOutstandingForCandidate = (session.fixtures || []).filter((f) => {
      if (session.completedMatchIds.has(f.matchId)) return false;
      if (f.division && session.selectedDivision && f.division !== session.selectedDivision) return false;
      if (session.selectedMatchDate && f.date && f.date > session.selectedMatchDate) return false;
      return f.playerA.id === candidatePlayerId || f.playerB.id === candidatePlayerId;
    });

    let impact = MARKER_IMPACTS.GREEN;
    let reason = 'Candidate has no upcoming game conflicts; no playable games blocked';
    let score = 100;

    if (baselinePlayable.length > 0 && directlyBlocked.length > 0) {
      const isTopRanked = baselinePlayable[0].playerA.id === candidatePlayerId || baselinePlayable[0].playerB.id === candidatePlayerId;

      if (isTopRanked) {
        impact = MARKER_IMPACTS.RED;
        reason = 'Candidate is needed for the top-priority immediately playable game';
        score = 10;
      } else if (hypoCount < availableBoards && baselineCount >= availableBoards) {
        impact = MARKER_IMPACTS.RED;
        reason = 'Assigning candidate would starve available boards (playable count drops below board capacity)';
        score = 20;
      } else if (hypoCount === 0) {
        impact = MARKER_IMPACTS.RED;
        reason = 'Assigning candidate removes all immediately playable games';
        score = 15;
      } else {
        impact = MARKER_IMPACTS.AMBER;
        reason = 'Candidate is in an immediately playable game, but other playable games exist to fill capacity';
        score = 50;
      }
    } else if (allOutstandingForCandidate.length > 0) {
      impact = MARKER_IMPACTS.GREEN;
      reason = 'Candidate is not in any immediately playable game; safe to mark';
      score = 80;
    } else {
      impact = MARKER_IMPACTS.GREEN;
      reason = 'Candidate has completed all scheduled fixtures; ideal marker';
      score = 120;
    }

    if (session.managedBoardsEnabled && Array.isArray(opts.recentFinisherIds) && opts.recentFinisherIds.indexOf(candidatePlayerId) !== -1) {
      score += 10;
    }

    return {
      candidateId: candidatePlayerId,
      candidateName: candidate.name,
      candidateDivision: candidate.division,
      impact,
      score,
      reason,
      blockedGames: directlyBlocked.map((g) => g.matchId),
      hypoPlayableCount: hypoCount,
    };
  }

  function recommendNextGames(session, options) {
    const opts = options || {};
    const currentStates = derivePlayerStates(session, opts.externalPlayers);
    const playable = getPlayableGames(session, currentStates);

    if (playable.length === 0) {
      return {
        recommendations: [],
        playableCount: 0,
        reason: 'NO_PLAYABLE_GAMES',
      };
    }

    let limit = opts.limit;
    if (!limit) {
      if (session.managedBoardsEnabled) {
        const freeBoards = (session.boards || []).filter((b) => b.status === BOARD_STATUSES.AVAILABLE);
        limit = Math.max(1, freeBoards.length);
      } else {
        limit = Math.min(playable.length, 4);
      }
    }

    const candidatePool = [];
    if (Array.isArray(opts.eligibleMarkerPool) && opts.eligibleMarkerPool.length > 0) {
      opts.eligibleMarkerPool.forEach((p) => {
        const id = typeof p === 'number' ? p : (p && p.id);
        if (Number.isSafeInteger(id) && candidatePool.indexOf(id) === -1) candidatePool.push(id);
      });
    } else {
      currentStates.forEach((p) => {
        if (p.state === PLAYER_STATES.AVAILABLE) candidatePool.push(p.id);
      });
    }

    const recommendations = [];
    const selectedGameCandidates = playable.slice(0, limit);

    selectedGameCandidates.forEach((game) => {
      const markerCandidates = candidatePool.filter((id) => id !== game.playerA.id && id !== game.playerB.id);
      const evaluatedMarkers = markerCandidates.map((cId) =>
        evaluateMarkerImpact(session, cId, {
          externalPlayers: opts.externalPlayers,
          recentFinisherIds: opts.recentFinisherIds,
        })
      );

      evaluatedMarkers.sort((x, y) => {
        const tierRank = (imp) => (imp === MARKER_IMPACTS.GREEN ? 0 : imp === MARKER_IMPACTS.AMBER ? 1 : 2);
        const dt = tierRank(x.impact) - tierRank(y.impact);
        if (dt !== 0) return dt;
        const ds = y.score - x.score;
        if (ds !== 0) return ds;
        return (x.candidateId || 0) - (y.candidateId || 0);
      });

      const bestMarker = evaluatedMarkers.find((m) =>
        m.impact === MARKER_IMPACTS.GREEN || m.impact === MARKER_IMPACTS.AMBER
      ) || null;

      recommendations.push({
        game,
        recommendedMarkers: evaluatedMarkers,
        bestMarker,
      });
    });

    return {
      recommendations,
      playableCount: playable.length,
      reason: 'OK',
    };
  }

  function applyGameStarted(session, action) {
    const act = action || {};
    const matchId = act.matchId;
    const boardNumber = act.boardNumber;
    const markerId = act.markerId || null;

    const targetFixture = (session.fixtures || []).find((f) => f.matchId === matchId) || act.customGame || null;
    const playerA = act.playerA || (targetFixture && targetFixture.playerA) || null;
    const playerB = act.playerB || (targetFixture && targetFixture.playerB) || null;

    const newActiveGames = (session.activeGames || []).filter((ag) => ag.matchId !== matchId);
    newActiveGames.push({
      matchId,
      playerA,
      playerB,
      boardNumber: boardNumber || null,
      markerId,
      isExtra: !!act.isExtra,
    });

    let newBoards = session.boards;
    if (session.managedBoardsEnabled && Array.isArray(session.boards)) {
      newBoards = session.boards.map((b) => {
        if (b.boardNumber === boardNumber) {
          return Object.assign({}, b, {
            status: BOARD_STATUSES.OCCUPIED,
            activeMatchId: matchId,
            markerPlayerId: markerId,
            activeGame: targetFixture,
          });
        }
        return b;
      });
    }

    return Object.assign({}, session, {
      activeGames: newActiveGames,
      boards: newBoards,
    });
  }

  function applyGameCompleted(session, action) {
    const act = action || {};
    const matchId = act.matchId;
    const boardNumber = act.boardNumber;

    const activeGame = (session.activeGames || []).find((ag) =>
      (matchId != null && ag.matchId === matchId) || (boardNumber != null && ag.boardNumber === boardNumber)
    );

    const completedId = matchId != null ? matchId : (activeGame && activeGame.matchId);
    const newCompletedMatchIds = new Set(session.completedMatchIds);
    if (completedId != null) newCompletedMatchIds.add(completedId);

    const newActiveGames = (session.activeGames || []).filter((ag) => ag !== activeGame && ag.matchId !== completedId);

    let newBoards = session.boards;
    if (session.managedBoardsEnabled && Array.isArray(session.boards)) {
      newBoards = session.boards.map((b) => {
        if ((boardNumber != null && b.boardNumber === boardNumber) || (completedId != null && b.activeMatchId === completedId)) {
          return Object.assign({}, b, {
            status: BOARD_STATUSES.AVAILABLE,
            activeMatchId: null,
            markerPlayerId: null,
            activeGame: null,
          });
        }
        return b;
      });
    }

    const lastCompleted = activeGame ? {
      matchId: activeGame.matchId,
      playerAId: activeGame.playerA ? activeGame.playerA.id : null,
      playerBId: activeGame.playerB ? activeGame.playerB.id : null,
      boardNumber: activeGame.boardNumber || boardNumber || null,
    } : null;

    return Object.assign({}, session, {
      completedMatchIds: newCompletedMatchIds,
      activeGames: newActiveGames,
      boards: newBoards,
      lastCompleted: lastCompleted || session.lastCompleted,
    });
  }

  function applyUnexpectedActiveGame(session, action) {
    const act = action || {};
    const matchId = act.matchId || ('extra-' + Date.now());
    const playerA = act.playerA || { id: null, name: 'Player A' };
    const playerB = act.playerB || { id: null, name: 'Player B' };
    const boardNumber = act.boardNumber || null;
    const markerId = act.markerId || null;

    return applyGameStarted(session, {
      matchId,
      playerA,
      playerB,
      boardNumber,
      markerId,
      isExtra: true,
    });
  }

  function rejectDelayedGame(session, matchId) {
    if (matchId == null) return session;
    const newRejected = new Set(session.rejectedDelayedMatchIds);
    newRejected.add(matchId);
    return Object.assign({}, session, {
      rejectedDelayedMatchIds: newRejected,
    });
  }

  /* ============================== 6e. Match Night Running Order Optimiser (Slice 2A & 2B) ============================== */

  const SCHEDULING_STRATEGIES = {
    NORMAL: 'NORMAL',
    OPTIMISED: 'OPTIMISED',
  };

  const PROJECTED_MARKER_CONFIDENCE = {
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW',
  };

  const REASON_CODES = {
    REC_BOTTLENECK_PROGRESS: 'REC_BOTTLENECK_PROGRESS',
    REC_UNLOCKS_SUBSEQUENT: 'REC_UNLOCKS_SUBSEQUENT',
    REC_MAX_CONCURRENCY: 'REC_MAX_CONCURRENCY',
    REC_SAFE_MARKER_AVAIL: 'REC_SAFE_MARKER_AVAIL',
    DELAYED_SAFE_SPARE_CAPACITY: 'DELAYED_SAFE_SPARE_CAPACITY',
    DELAYED_CREATES_CURRENT_BOTTLENECK: 'DELAYED_CREATES_CURRENT_BOTTLENECK',
    MARKER_RED_BLOCKED: 'MARKER_RED_BLOCKED',
    NO_PLAYABLE_GAMES: 'NO_PLAYABLE_GAMES',
    PLAN_OPTIMISED_REDUCED_WAVES: 'PLAN_OPTIMISED_REDUCED_WAVES',
    PLAN_NORMAL_FIXTURE_ORDER: 'PLAN_NORMAL_FIXTURE_ORDER',
  };

  /**
   * Generates mutually compatible sets of playable games up to the specified capacity.
   * A candidate set is valid if all competitors across all games in the set are pairwise disjoint
   * and currently available (not active, absent, or marking).
   * Pure, deterministic, and returns partial sets if complete capacity cannot be filled.
   */
  function getCompatibleCandidateSets(session, playableGames, capacity, options) {
    const opts = options || {};
    const cap = typeof capacity === 'number' && capacity > 0 ? Math.floor(capacity) : (session.managedBoardsEnabled ? session.boardCount : 4);
    const pool = Array.isArray(playableGames) ? playableGames : getPlayableGames(session);

    if (pool.length === 0 || cap <= 0) return [];

    const maxSets = typeof opts.maxSets === 'number' && opts.maxSets > 0 ? opts.maxSets : 500;
    const allSets = [];

    function isCompatible(candidateSet, game) {
      const gA = game.playerA && game.playerA.id;
      const gB = game.playerB && game.playerB.id;
      if (gA == null || gB == null || gA === gB) return false;

      for (let i = 0; i < candidateSet.length; i++) {
        const existing = candidateSet[i];
        const eA = existing.playerA && existing.playerA.id;
        const eB = existing.playerB && existing.playerB.id;
        if (gA === eA || gA === eB || gB === eA || gB === eB) {
          return false;
        }
      }
      return true;
    }

    const searchLimit = typeof opts.searchLimit === 'number' && opts.searchLimit > 0 ? opts.searchLimit : 2000;
    function search(index, currentSet) {
      if (allSets.length >= searchLimit) return;
      if (currentSet.length > 0) {
        allSets.push(currentSet.slice());
      }
      if (currentSet.length === cap) return;

      for (let i = index; i < pool.length; i++) {
        const g = pool[i];
        if (isCompatible(currentSet, g)) {
          currentSet.push(g);
          search(i + 1, currentSet);
          currentSet.pop();
        }
      }
    }

    search(0, []);

    if (allSets.length === 0) return [];

    // Find maximum set size achieved
    let maxFoundSize = 0;
    for (let i = 0; i < allSets.length; i++) {
      if (allSets[i].length > maxFoundSize) maxFoundSize = allSets[i].length;
    }

    const includeAllPartials = opts.includeAllPartials === true;
    const targetSets = includeAllPartials ? allSets : allSets.filter((s) => s.length === maxFoundSize);

    // Sort candidate sets deterministically:
    // 1. Set size descending
    // 2. Sum of fixture priority ranks
    // 3. String composite of match IDs
    targetSets.sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length;
      const sumRankA = a.reduce((sum, g) => sum + (pool.indexOf(g) >= 0 ? pool.indexOf(g) : 999), 0);
      const sumRankB = b.reduce((sum, g) => sum + (pool.indexOf(g) >= 0 ? pool.indexOf(g) : 999), 0);
      if (sumRankA !== sumRankB) return sumRankA - sumRankB;
      const idStrA = a.map((g) => g.matchId || 0).join(':');
      const idStrB = b.map((g) => g.matchId || 0).join(':');
      return idStrA < idStrB ? -1 : idStrA > idStrB ? 1 : 0;
    });

    return targetSets.slice(0, maxSets);
  }

  /**
   * Evaluates candidate set robustness across all possible single-game completion outcomes.
   * For each game in the candidate set, simulates what becomes playable if that game completes first
   * while the remaining games in the set continue playing.
   * Pure and duration-independent.
   */
  function evaluateSetRobustness(session, candidateSet, options) {
    if (!Array.isArray(candidateSet) || candidateSet.length === 0) {
      return {
        candidateMatchIds: [],
        setSize: 0,
        minPlayableCount: 0,
        avgPlayableCount: 0,
        deadEndRisk: true,
        completionOutcomes: [],
        refillCapacityRate: 0,
      };
    }

    const candidateMatchIds = candidateSet.map((g) => g.matchId);
    const k = candidateSet.length;
    const outcomes = [];
    let minPlayable = Number.MAX_SAFE_INTEGER;
    let sumPlayable = 0;
    let successfulRefillCount = 0;

    for (let i = 0; i < k; i++) {
      const finishedGame = candidateSet[i];

      // Simulate state: start all games in candidateSet, then complete finishedGame
      let simState = session;
      for (let j = 0; j < k; j++) {
        simState = applyGameStarted(simState, {
          matchId: candidateSet[j].matchId,
          playerA: candidateSet[j].playerA,
          playerB: candidateSet[j].playerB,
        });
      }

      simState = applyGameCompleted(simState, {
        matchId: finishedGame.matchId,
      });

      const nextPlayable = getPlayableGames(simState);
      const nextCount = nextPlayable.length;

      if (nextCount < minPlayable) minPlayable = nextCount;
      sumPlayable += nextCount;
      if (nextCount >= 1) successfulRefillCount += 1;

      outcomes.push({
        finishedMatchId: finishedGame.matchId,
        nextPlayableCount: nextCount,
        nextPlayableMatchIds: nextPlayable.map((f) => f.matchId),
      });
    }

    const minPlayableCount = minPlayable === Number.MAX_SAFE_INTEGER ? 0 : minPlayable;
    const avgPlayableCount = k > 0 ? (sumPlayable / k) : 0;
    const deadEndRisk = minPlayableCount === 0;
    const refillCapacityRate = k > 0 ? (successfulRefillCount / k) : 0;

    return {
      candidateMatchIds,
      setSize: k,
      minPlayableCount,
      avgPlayableCount,
      deadEndRisk,
      completionOutcomes: outcomes,
      refillCapacityRate,
    };
  }

  /**
   * Evaluates player dependency and bottleneck metrics across remaining unplayed fixtures.
   * Pure and deterministic.
   */
  function evaluatePlayerBottlenecks(session, options) {
    const uncompletedFixtures = (session.fixtures || []).filter((f) => {
      if (session.completedMatchIds && session.completedMatchIds.has(f.matchId)) return false;
      if (f.status === 'completed' || f.status === 'C') return false;
      if (session.selectedDivision && f.division && f.division !== session.selectedDivision) return false;
      return true;
    });

    const playerCounts = new Map();
    const playerOpponents = new Map();

    (session.players || []).forEach((p) => {
      if (p && Number.isSafeInteger(p.id)) {
        playerCounts.set(p.id, 0);
        playerOpponents.set(p.id, new Set());
      }
    });

    uncompletedFixtures.forEach((f) => {
      const aId = f.playerA && f.playerA.id;
      const bId = f.playerB && f.playerB.id;
      if (aId != null) {
        playerCounts.set(aId, (playerCounts.get(aId) || 0) + 1);
        if (bId != null) {
          if (!playerOpponents.has(aId)) playerOpponents.set(aId, new Set());
          playerOpponents.get(aId).add(bId);
        }
      }
      if (bId != null) {
        playerCounts.set(bId, (playerCounts.get(bId) || 0) + 1);
        if (aId != null) {
          if (!playerOpponents.has(bId)) playerOpponents.set(bId, new Set());
          playerOpponents.get(bId).add(aId);
        }
      }
    });

    const playerMetrics = new Map();
    playerCounts.forEach((count, pId) => {
      const opps = playerOpponents.get(pId) || new Set();
      let unlockingCount = 0;
      opps.forEach((oppId) => {
        if ((playerCounts.get(oppId) || 0) <= 1) {
          unlockingCount += 1;
        }
      });

      const bottleneckScore = count * 10 + unlockingCount * 5;
      playerMetrics.set(pId, {
        id: pId,
        remainingCount: count,
        unlockingCount,
        bottleneckScore,
      });
    });

    function getFixtureBottleneckScore(f) {
      if (!f) return 0;
      const aMetric = playerMetrics.get(f.playerA && f.playerA.id) || { remainingCount: 0, bottleneckScore: 0 };
      const bMetric = playerMetrics.get(f.playerB && f.playerB.id) || { remainingCount: 0, bottleneckScore: 0 };
      const maxRemaining = Math.max(aMetric.remainingCount, bMetric.remainingCount);
      return aMetric.bottleneckScore + bMetric.bottleneckScore + (maxRemaining * 5);
    }

    return {
      playerMetrics,
      getFixtureBottleneckScore,
    };
  }

  /**
   * Assesses structural/advisory marker confidence for candidate sets during planning.
   * Returns structural rating (HIGH, MEDIUM, LOW) without probabilistic claims.
   */
  function evaluateProjectedMarkerConfidence(session, candidateSet, options) {
    const opts = options || {};
    const set = Array.isArray(candidateSet) ? candidateSet : [];
    const k = set.length;

    if (k === 0) {
      return {
        rating: PROJECTED_MARKER_CONFIDENCE.HIGH,
        freeMarkerCount: 0,
        requiredCount: 0,
        reasonCode: REASON_CODES.REC_SAFE_MARKER_AVAIL,
        reason: 'No games in set; marker requirement is zero',
      };
    }

    const playerStates = derivePlayerStates(session, opts.externalPlayers);
    const setPlayerIds = new Set();
    set.forEach((g) => {
      if (g.playerA && g.playerA.id != null) setPlayerIds.add(g.playerA.id);
      if (g.playerB && g.playerB.id != null) setPlayerIds.add(g.playerB.id);
    });

    let availableFreeCount = 0;
    playerStates.forEach((p) => {
      if (p.state === PLAYER_STATES.AVAILABLE && !setPlayerIds.has(p.id)) {
        availableFreeCount += 1;
      }
    });

    let rating = PROJECTED_MARKER_CONFIDENCE.HIGH;
    let reasonCode = REASON_CODES.REC_SAFE_MARKER_AVAIL;
    let reason = 'Abundant free markers available during match execution';

    if (availableFreeCount >= k) {
      rating = PROJECTED_MARKER_CONFIDENCE.HIGH;
      reasonCode = REASON_CODES.REC_SAFE_MARKER_AVAIL;
      reason = 'Sufficient independent free markers available for all concurrent boards';
    } else if (availableFreeCount > 0) {
      rating = PROJECTED_MARKER_CONFIDENCE.MEDIUM;
      reasonCode = REASON_CODES.REC_SAFE_MARKER_AVAIL;
      reason = 'Limited initial free markers; match completions will replenish marker supply';
    } else {
      rating = PROJECTED_MARKER_CONFIDENCE.LOW;
      reasonCode = REASON_CODES.MARKER_RED_BLOCKED;
      reason = 'Marker supply tightly constrained; initial matches will rely on immediate finishers';
    }

    return {
      rating,
      freeMarkerCount: availableFreeCount,
      requiredCount: k,
      reasonCode,
      reason,
    };
  }

  /**
   * Comparative structural evaluation of a delayed fixture vs current-night programme.
   * Pure and deterministic.
   */
  function evaluateDelayedGameImpact(session, delayedFixture, options) {
    if (!delayedFixture) {
      return { recommended: false, reasonCode: REASON_CODES.NO_PLAYABLE_GAMES, reason: 'Invalid fixture' };
    }

    if (!session.includeDelayed) {
      return { recommended: false, reasonCode: REASON_CODES.DELAYED_CREATES_CURRENT_BOTTLENECK, reason: 'Delayed games are disabled in session settings' };
    }

    if (session.rejectedDelayedMatchIds && session.rejectedDelayedMatchIds.has(delayedFixture.matchId)) {
      return { recommended: false, reasonCode: REASON_CODES.DELAYED_CREATES_CURRENT_BOTTLENECK, reason: 'Delayed game rejected for current session (NOT TONIGHT)' };
    }

    const pStates = derivePlayerStates(session);
    const pa = pStates.get(delayedFixture.playerA && delayedFixture.playerA.id);
    const pb = pStates.get(delayedFixture.playerB && delayedFixture.playerB.id);

    if (!pa || pa.state !== PLAYER_STATES.AVAILABLE || !pb || pb.state !== PLAYER_STATES.AVAILABLE) {
      return { recommended: false, reasonCode: REASON_CODES.NO_PLAYABLE_GAMES, reason: 'Competitors are not currently available' };
    }

    const pendingCurrentForCompetitors = (session.fixtures || []).filter((f) => {
      if (f.delayed || f.isExtra) return false;
      if (session.completedMatchIds && session.completedMatchIds.has(f.matchId)) return false;
      if (f.status === 'completed' || f.status === 'C') return false;
      if (session.selectedDivision && f.division && f.division !== session.selectedDivision) return false;
      if (session.selectedMatchDate && f.date && f.date > session.selectedMatchDate) return false;

      const aId = f.playerA && f.playerA.id;
      const bId = f.playerB && f.playerB.id;
      return aId === pa.id || bId === pa.id || aId === pb.id || bId === pb.id;
    });

    if (pendingCurrentForCompetitors.length > 0) {
      const currentlyPlayableCurrent = pendingCurrentForCompetitors.filter((cf) => {
        const cpa = pStates.get(cf.playerA && cf.playerA.id);
        const cpb = pStates.get(cf.playerB && cf.playerB.id);
        return cpa && cpa.state === PLAYER_STATES.AVAILABLE && cpb && cpb.state === PLAYER_STATES.AVAILABLE;
      });

      if (currentlyPlayableCurrent.length > 0) {
        return {
          recommended: false,
          reasonCode: REASON_CODES.DELAYED_CREATES_CURRENT_BOTTLENECK,
          reason: 'Delayed game held back: competitors needed for immediately playable current-night matches',
          conflictingCurrentMatchIds: currentlyPlayableCurrent.map((f) => f.matchId),
        };
      }
    }

    return {
      recommended: true,
      reasonCode: REASON_CODES.DELAYED_SAFE_SPARE_CAPACITY,
      reason: 'Delayed game is safe to play without disrupting current programme',
      conflictingCurrentMatchIds: [],
    };
  }

  /**
   * Simulates a multi-wave execution rollout starting from the given session.
   * Pure, deterministic, and duration-independent.
   */
  function simulateWaveRollout(session, openingCandidateSet, capacity, maxWaves, isOptimised) {
    const waves = [];
    let simSession = session;
    const waveLimit = typeof maxWaves === 'number' && maxWaves > 0 ? Math.floor(maxWaves) : 50;

    if (Array.isArray(openingCandidateSet) && openingCandidateSet.length > 0) {
      waves.push({
        waveNumber: 1,
        games: openingCandidateSet.slice(),
      });
      for (let i = 0; i < openingCandidateSet.length; i++) {
        simSession = applyGameStarted(simSession, {
          matchId: openingCandidateSet[i].matchId,
          playerA: openingCandidateSet[i].playerA,
          playerB: openingCandidateSet[i].playerB,
        });
      }
      for (let i = 0; i < openingCandidateSet.length; i++) {
        simSession = applyGameCompleted(simSession, {
          matchId: openingCandidateSet[i].matchId,
        });
      }
    }

    while (waves.length < waveLimit) {
      const playable = getPlayableGames(simSession);
      if (playable.length === 0) {
        break;
      }

      let waveGames = [];
      if (!isOptimised) {
        const candSets = getCompatibleCandidateSets(simSession, playable, capacity, { maxSets: 1 });
        waveGames = (candSets && candSets[0]) || [];
      } else {
        const candSets = getCompatibleCandidateSets(simSession, playable, capacity, { maxSets: 6 });
        if (!candSets || candSets.length === 0) break;

        const bMetrics = evaluatePlayerBottlenecks(simSession);
        let bestSet = candSets[0];
        let bestScore = -Infinity;

        for (let i = 0; i < candSets.length; i++) {
          const cSet = candSets[i];
          let score = cSet.length * 100;
          for (let j = 0; j < cSet.length; j++) {
            score += bMetrics.getFixtureBottleneckScore(cSet[j]);
          }
          if (score > bestScore) {
            bestScore = score;
            bestSet = cSet;
          }
        }
        waveGames = bestSet;
      }

      if (waveGames.length === 0) break;

      waves.push({
        waveNumber: waves.length + 1,
        games: waveGames,
      });

      for (let i = 0; i < waveGames.length; i++) {
        simSession = applyGameStarted(simSession, {
          matchId: waveGames[i].matchId,
          playerA: waveGames[i].playerA,
          playerB: waveGames[i].playerB,
        });
      }
      for (let i = 0; i < waveGames.length; i++) {
        simSession = applyGameCompleted(simSession, {
          matchId: waveGames[i].matchId,
        });
      }
    }

    let tailCount = 0;
    for (let i = waves.length - 1; i >= 0; i--) {
      if (waves[i].games.length === 1 && waves.length > 1) {
        tailCount++;
      } else {
        break;
      }
    }

    const totalScheduledGames = waves.reduce((sum, w) => sum + w.games.length, 0);

    return {
      waves,
      totalWaves: waves.length,
      totalScheduledGames,
      bottleneckTailDepth: tailCount,
    };
  }

  /**
   * Computes a projected multi-wave running order for the match night.
   * Supports NORMAL (greedy fixture order) and OPTIMISED (global look-ahead) strategies.
   * Pure, immutable, and host-independent.
   */
  function getProjectedRunningOrder(session, options) {
    const opts = options || {};
    const strategy = (opts.strategy === SCHEDULING_STRATEGIES.OPTIMISED)
      ? SCHEDULING_STRATEGIES.OPTIMISED
      : SCHEDULING_STRATEGIES.NORMAL;

    const capacity = (typeof opts.capacity === 'number' && opts.capacity > 0)
      ? Math.floor(opts.capacity)
      : (session.managedBoardsEnabled ? (session.boardCount || 4) : 4);

    const maxWaves = typeof opts.maxWaves === 'number' && opts.maxWaves > 0 ? Math.floor(opts.maxWaves) : 50;

    const initialPlayable = getPlayableGames(session);
    const activeMatchIds = new Set((session.activeGames || []).map((ag) => ag.matchId));
    const uncompletedFixtures = (session.fixtures || []).filter((f) => {
      if (session.completedMatchIds && session.completedMatchIds.has(f.matchId)) return false;
      if (activeMatchIds.has(f.matchId)) return false;
      if (f.status === 'completed' || f.status === 'C') return false;
      if (session.selectedDivision && f.division && f.division !== session.selectedDivision) return false;
      if (!session.includeDelayed && f.delayed) return false;
      if (session.rejectedDelayedMatchIds && session.rejectedDelayedMatchIds.has(f.matchId)) return false;
      if (session.selectedMatchDate && f.date && f.date > session.selectedMatchDate && !f.delayed) return false;
      return true;
    });

    if (uncompletedFixtures.length === 0 || initialPlayable.length === 0) {
      return {
        strategy,
        openingRecommendations: [],
        projectedWaves: [],
        projectedNextPriorities: [],
        projectedLater: [],
        unschedulableFixtures: uncompletedFixtures.slice(),
        metrics: {
          totalWaves: 0,
          totalScheduledGames: 0,
          bottleneckTailDepth: 0,
          robustnessScore: 0,
          markerConfidence: PROJECTED_MARKER_CONFIDENCE.HIGH,
          refillCapacityRate: 0,
          planScore: 0,
        },
        reasonCodes: [REASON_CODES.NO_PLAYABLE_GAMES],
      };
    }

    let selectedRollout = null;
    let openingRob = null;
    let openingMarkerConf = null;
    let computedPlanScore = 0;

    if (strategy === SCHEDULING_STRATEGIES.NORMAL) {
      selectedRollout = simulateWaveRollout(session, null, capacity, maxWaves, false);
      const openingSet = (selectedRollout.waves[0] && selectedRollout.waves[0].games) || [];
      openingRob = evaluateSetRobustness(session, openingSet);
      openingMarkerConf = evaluateProjectedMarkerConfidence(session, openingSet, opts);
      computedPlanScore = (selectedRollout.totalScheduledGames * 50) - (selectedRollout.totalWaves * 100);
    } else {
      const candidateOpenings = getCompatibleCandidateSets(session, initialPlayable, capacity, { maxSets: 16 });
      if (candidateOpenings.length === 0) {
        selectedRollout = simulateWaveRollout(session, null, capacity, maxWaves, false);
        const openingSet = (selectedRollout.waves[0] && selectedRollout.waves[0].games) || [];
        openingRob = evaluateSetRobustness(session, openingSet);
        openingMarkerConf = evaluateProjectedMarkerConfidence(session, openingSet, opts);
      } else {
        const bottlenecks = evaluatePlayerBottlenecks(session);
        let bestPlan = null;
        let bestScore = -Infinity;

        for (let i = 0; i < candidateOpenings.length; i++) {
          const openingSet = candidateOpenings[i];
          const rollout = simulateWaveRollout(session, openingSet, capacity, maxWaves, true);
          const rob = evaluateSetRobustness(session, openingSet);
          const markerConf = evaluateProjectedMarkerConfidence(session, openingSet, opts);

          let unlockingScore = 0;
          rollout.waves.forEach((w, wIdx) => {
            const weight = 1 / (wIdx + 1);
            w.games.forEach((g) => {
              unlockingScore += weight * bottlenecks.getFixtureBottleneckScore(g);
            });
          });

          let score = 0;
          score -= (rollout.totalWaves * 100);
          score -= (rollout.bottleneckTailDepth * 40);
          score += (rollout.totalScheduledGames * 50);
          score += (unlockingScore * 2);
          score += (rob.minPlayableCount * 25);
          score += (rob.avgPlayableCount * 10);
          if (rob.deadEndRisk) score -= 300;

          if (markerConf.rating === PROJECTED_MARKER_CONFIDENCE.HIGH) score += 20;
          else if (markerConf.rating === PROJECTED_MARKER_CONFIDENCE.MEDIUM) score += 10;
          else score -= 20;

          if (score > bestScore || !bestPlan) {
            bestScore = score;
            bestPlan = {
              rollout,
              openingRob: rob,
              openingMarkerConf: markerConf,
              planScore: score,
            };
          }
        }

        selectedRollout = bestPlan.rollout;
        openingRob = bestPlan.openingRob;
        openingMarkerConf = bestPlan.openingMarkerConf;
        computedPlanScore = bestPlan.planScore;
      }
    }

    const scheduledMatchIds = new Set();
    selectedRollout.waves.forEach((w) => {
      w.games.forEach((g) => scheduledMatchIds.add(g.matchId));
    });

    const unschedulable = uncompletedFixtures.filter((f) => !scheduledMatchIds.has(f.matchId));

    // Marker recommendations for opening wave
    const openingGames = (selectedRollout.waves[0] && selectedRollout.waves[0].games) || [];
    const candidatePool = [];
    if (Array.isArray(opts.eligibleMarkerPool) && opts.eligibleMarkerPool.length > 0) {
      opts.eligibleMarkerPool.forEach((p) => {
        const id = typeof p === 'number' ? p : (p && p.id);
        if (Number.isSafeInteger(id) && candidatePool.indexOf(id) === -1) candidatePool.push(id);
      });
    } else {
      const currentStates = derivePlayerStates(session, opts.externalPlayers);
      currentStates.forEach((p) => {
        if (p.state === PLAYER_STATES.AVAILABLE) candidatePool.push(p.id);
      });
    }

    const openingRecommendations = [];
    openingGames.forEach((game) => {
      const markerCandidates = candidatePool.filter((id) => id !== game.playerA.id && id !== game.playerB.id);
      const evaluatedMarkers = markerCandidates.map((cId) =>
        evaluateMarkerImpact(session, cId, {
          externalPlayers: opts.externalPlayers,
          recentFinisherIds: opts.recentFinisherIds,
        })
      );

      evaluatedMarkers.sort((x, y) => {
        const tierRank = (imp) => (imp === MARKER_IMPACTS.GREEN ? 0 : imp === MARKER_IMPACTS.AMBER ? 1 : 2);
        const dt = tierRank(x.impact) - tierRank(y.impact);
        if (dt !== 0) return dt;
        const ds = y.score - x.score;
        if (ds !== 0) return ds;
        return (x.candidateId || 0) - (y.candidateId || 0);
      });

      const bestMarker = evaluatedMarkers.find((m) =>
        m.impact === MARKER_IMPACTS.GREEN || m.impact === MARKER_IMPACTS.AMBER
      ) || null;

      openingRecommendations.push({
        game,
        recommendedMarkers: evaluatedMarkers,
        bestMarker,
      });
    });

    const projectedNextPriorities = (selectedRollout.waves[1] && selectedRollout.waves[1].games.slice()) || [];
    const projectedLater = selectedRollout.waves.slice(2).reduce((acc, w) => acc.concat(w.games), []);

    const reasonCodes = [];
    if (strategy === SCHEDULING_STRATEGIES.OPTIMISED) {
      reasonCodes.push(REASON_CODES.PLAN_OPTIMISED_REDUCED_WAVES);
      reasonCodes.push(REASON_CODES.REC_MAX_CONCURRENCY);
      if (openingRob && !openingRob.deadEndRisk) {
        reasonCodes.push(REASON_CODES.REC_BOTTLENECK_PROGRESS);
      }
      if (openingMarkerConf && openingMarkerConf.rating !== PROJECTED_MARKER_CONFIDENCE.LOW) {
        reasonCodes.push(REASON_CODES.REC_SAFE_MARKER_AVAIL);
      }
    } else {
      reasonCodes.push(REASON_CODES.PLAN_NORMAL_FIXTURE_ORDER);
      reasonCodes.push(REASON_CODES.REC_MAX_CONCURRENCY);
    }

    return {
      strategy,
      openingRecommendations,
      projectedWaves: selectedRollout.waves,
      projectedNextPriorities,
      projectedLater,
      unschedulableFixtures: unschedulable,
      metrics: {
        totalWaves: selectedRollout.totalWaves,
        totalScheduledGames: selectedRollout.totalScheduledGames,
        bottleneckTailDepth: selectedRollout.bottleneckTailDepth,
        robustnessScore: openingRob ? openingRob.minPlayableCount : 0,
        markerConfidence: openingMarkerConf ? openingMarkerConf.rating : PROJECTED_MARKER_CONFIDENCE.HIGH,
        refillCapacityRate: openingRob ? openingRob.refillCapacityRate : 0,
        planScore: computedPlanScore,
      },
      reasonCodes,
    };
  }

  /* ============================== 6f. Slice 3B managed physical boards (browser-independent core) ============================== */

  const MANAGED_BOARD_UNASSIGNED = 'UNASSIGNED';
  const MAX_MANAGED_BOARDS = 6;

  /** Lowercase name/id token for id-less live rows. Pure. */
  function boardPlayerToken(player) {
    if (player && Number.isSafeInteger(player.id)) return String(player.id);
    return String((player && player.name) || '?').toLowerCase();
  }

  /** Stable game key for any fixture/live row, id-less included. Pure. */
  function boardKeyForGame(game) {
    if (!game) return null;
    if (game.matchId != null) return 'id:' + game.matchId;
    return 'pair:' + boardPlayerToken(game.playerA) + ':' + boardPlayerToken(game.playerB);
  }

  /**
   * Managed-board runtime state: N physical boards, all UNASSIGNED.
   * No board identity is invented when managed boards are OFF.
   */
  function createManagedBoardRuntime(boardCount) {
    const count = typeof boardCount === 'number' && boardCount > 0 ? Math.floor(boardCount) : 4;
    const boards = [];
    for (let i = 1; i <= count; i++) {
      boards.push({ boardNumber: i, gameKey: null });
    }
    return { boards };
  }

  /** Find the board currently owning a game. Pure. */
  function findBoardOwningGame(runtime, game) {
    if (!runtime || !runtime.boards || !Array.isArray(runtime.boards)) return null;
    const key = boardKeyForGame(game);
    if (!key) return null;
    return runtime.boards.find((b) => b.gameKey === key) || null;
  }

  /** Free boards: every physical board with no assigned game. Pure. */
  function getAvailableManagedBoards(runtime) {
    if (!runtime || !runtime.boards || !Array.isArray(runtime.boards)) return [];
    return runtime.boards.filter((b) => b.gameKey === null);
  }

  /**
   * Assign a game to a board. Fails when the board is occupied, the game is
   * already on another board, the board number is out of range, or the game
   * is not currently eligible per the existing scheduler rules (a player is
   * ABSENT, the game is factual PLAYING/active, or already completed).
   * Returns { ok, runtime, reason } — never throws, never mutates input.
   */
  function assignGameToBoard(runtime, game, boardNumber, context) {
    if (!runtime || !Array.isArray(runtime.boards)) return { ok: false, runtime, reason: 'no-runtime' };
    if (!game || typeof game !== 'object') return { ok: false, runtime, reason: 'invalid-game' };
    if (game.status === 'playing') return { ok: false, runtime, reason: 'game-active' };
    const ctx = context || {};
    const absentIds = ctx.absentIds || [];
    const completedMatchIds = ctx.completedMatchIds || [];
    const activeMatchIds = ctx.activeMatchIds || [];
    const aId = game.playerA && game.playerA.id;
    const bId = game.playerB && game.playerB.id;
    if ((aId != null && absentIds.indexOf(aId) !== -1) || (bId != null && absentIds.indexOf(bId) !== -1)) {
      return { ok: false, runtime, reason: 'player-unavailable' };
    }
    if ((game.matchId != null && (completedMatchIds.indexOf(game.matchId) !== -1 || activeMatchIds.indexOf(game.matchId) !== -1))) {
      return { ok: false, runtime, reason: 'game-active' };
    }
    const key = boardKeyForGame(game);
    if (!key) return { ok: false, runtime, reason: 'invalid-game' };
    const n = typeof boardNumber === 'number' ? Math.floor(boardNumber) : 0;
    if (n < 1 || n > runtime.boards.length) return { ok: false, runtime, reason: 'invalid-board' };
    if (runtime.boards.some((b) => b.gameKey === key)) return { ok: false, runtime, reason: 'game-already-assigned' };
    const board = runtime.boards.find((b) => b.boardNumber === n);
    if (!board) return { ok: false, runtime, reason: 'invalid-board' };
    if (board.gameKey !== null) return { ok: false, runtime, reason: 'board-occupied' };
    const boards = runtime.boards.map((b) => (b.boardNumber === n ? Object.assign({}, b, { gameKey: key }) : b));
    return { ok: true, runtime: { boards }, reason: null };
  }

  /**
   * Release a board back to UNASSIGNED. RELEASE means ONLY "this physical
   * board is no longer assigned to this game": it is not completion, not
   * abandonment, and changes no DartConnect/live state. No-op when already
   * free. Returns { ok, runtime, reason } — never throws, never mutates input.
   */
  function releaseBoard(runtime, boardNumber) {
    if (!runtime || !Array.isArray(runtime.boards)) return { ok: false, runtime, reason: 'no-runtime' };
    const n = typeof boardNumber === 'number' ? Math.floor(boardNumber) : 0;
    const board = runtime.boards.find((b) => b.boardNumber === n);
    if (!board) return { ok: false, runtime, reason: 'invalid-board' };
    if (board.gameKey === null) return { ok: true, runtime, reason: 'already-unassigned' };
    const boards = runtime.boards.map((b) => (b.boardNumber === n ? Object.assign({}, b, { gameKey: null }) : b));
    return { ok: true, runtime: { boards }, reason: null };
  }

  /**
   * Board-count changes are protected:
   * - increase: existing assignments are preserved exactly, new boards UNASSIGNED;
   * - decrease: rejected while any removed board still owns a game, so an
   *   assignment is never silently destroyed. Returns
   *   { ok, runtime, reason } with reason 'occupied-boards-removed'
   *   (carrying their numbers) when the reduction must be refused.
   */
  function resizeManagedBoards(runtime, newCount) {
    if (!runtime || !Array.isArray(runtime.boards)) return { ok: false, runtime, reason: 'no-runtime' };
    const count = typeof newCount === 'number' && newCount > 0 ? Math.floor(newCount) : 0;
    if (count < 1 || count > MAX_MANAGED_BOARDS) return { ok: false, runtime, reason: 'invalid-count' };
    if (count === runtime.boards.length) return { ok: true, runtime, reason: 'unchanged' };
    if (count > runtime.boards.length) {
      const boards = runtime.boards.slice();
      for (let i = runtime.boards.length + 1; i <= count; i++) {
        boards.push({ boardNumber: i, gameKey: null });
      }
      return { ok: true, runtime: { boards }, reason: null };
    }
    const removed = runtime.boards.slice(count);
    const occupied = removed.filter((b) => b.gameKey !== null).map((b) => b.boardNumber);
    if (occupied.length > 0) {
      return { ok: false, runtime, reason: 'occupied-boards-removed', occupiedBoards: occupied };
    }
    return { ok: true, runtime: { boards: runtime.boards.slice(0, count) }, reason: null };
  }

  /**
   * Ownership conflicts with factual state, computed for presentation.
   * NEVER mutates: an assignment surviving a factual change (e.g. an
   * assigned player is marked NOT HERE) is preserved and surfaced
   * compactly instead of being silently rewritten.
   */
  function detectManagedBoardConflicts(runtime, view) {
    const out = [];
    if (!runtime || !Array.isArray(runtime.boards)) return out;
    const absent = (view && view.absentIds) || [];
    const fixtures = (view && view.fixtures) || [];
    runtime.boards.forEach((b) => {
      if (b.gameKey === null) return;
      const game = fixtures.find((f) => boardKeyForGame(f) === b.gameKey);
      if (!game) return;
      const aId = game.playerA && game.playerA.id;
      const bId = game.playerB && game.playerB.id;
      if ((aId != null && absent.indexOf(aId) !== -1) || (bId != null && absent.indexOf(bId) !== -1)) {
        out.push({ boardNumber: b.boardNumber, gameKey: b.gameKey, conflict: 'not-here' });
      }
    });
    return out;
  }

  /* ============================== 6f-bis. Slice 3C marker ownership (browser-independent core) ============================== */

  /**
   * Factual marker runtime: which game is factually MARKED by which player.
   * Owns one source of truth for the invariants "one factual marker per
   * game" and "one factual marking duty per player". Runtime match-night
   * state only — NEVER persisted.
   */
  function createMarkerRuntime() {
    return { byGame: {}, byMarker: {} };
  }

  /** Stable game identity (same key scheme as board ownership). Pure. */
  function markerGameKey(game) {
    return boardKeyForGame(game);
  }

  /** Find the factual marker (player id) owning a game. Pure. */
  function findMarkerForGame(runtime, game) {
    if (!runtime || !runtime.byGame) return null;
    const key = markerGameKey(game);
    return key != null && Object.prototype.hasOwnProperty.call(runtime.byGame, key)
      ? runtime.byGame[key]
      : null;
  }

  /** Find the factual game (key) a player is MARKING. Pure. */
  function findGameMarkedByPlayer(runtime, playerId) {
    if (!runtime || !runtime.byMarker) return null;
    return Object.prototype.hasOwnProperty.call(runtime.byMarker, playerId)
      ? runtime.byMarker[playerId]
      : null;
  }

  /**
   * Eligible marker candidates from factual state: AVAILABLE players only —
   * never absent, factual PLAYING, already factually MARKING, already
   * assigned to this game, or (with excludeParticipants) anyone in the game
   * to be marked. Deterministic ascending id order. Pure.
   */
  function getEligibleMarkerCandidates(context) {
    const ctx = context || {};
    const players = Array.isArray(ctx.players) ? ctx.players : [];
    const absent = ctx.absentIds || [];
    const playing = ctx.playingPlayerIds || [];
    const marking = ctx.markingPlayerIds || [];
    const gameKey = ctx.gameKey || null;
    const markedGames = ctx.markedGameKeys || [];
    const excludeParticipants = !!ctx.excludeParticipants;
    const participants = ctx.participantIds || [];
    // Selected-division roster boundary: when the caller supplies the
    // selected division's roster IDs, only those players can ever become
    // marker candidates (player-ID membership, never display names).
    const rosterDivisionIds = Array.isArray(ctx.rosterDivisionIds)
      ? ctx.rosterDivisionIds.slice().sort((a, b) => a - b) : null;
    const out = [];
    players.forEach((p) => {
      if (!p || !Number.isSafeInteger(p.id)) return;
      if (absent.indexOf(p.id) !== -1) return;
      if (playing.indexOf(p.id) !== -1) return;
      if (marking.indexOf(p.id) !== -1) return;
      if (rosterDivisionIds && rosterDivisionIds.indexOf(p.id) === -1) return;
      if (excludeParticipants && participants.indexOf(p.id) !== -1) return;
      if (gameKey != null && markedGames[gameKey] === p.id) return;
      out.push({ id: p.id, name: p.name || ('#' + p.id) });
    });
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /**
   * Assign a factual marker. Enforces both ownership invariants: one
   * factual marker per game, one factual marking duty per player. Uses the
   * same factual eligibility rules as recommendations — an absent, PLAYING,
   * or already-MARKING player is never assignable. Returns
   * { ok, runtime, reason }; never throws, never mutates the input.
   */
  function assignMarkerToGame(runtime, game, playerId, context) {
    if (!runtime || !runtime.byGame || !runtime.byMarker) return { ok: false, runtime, reason: 'no-runtime' };
    const key = markerGameKey(game);
    if (key == null) return { ok: false, runtime, reason: 'invalid-game' };
    const ctx = context || {};
    if (!Number.isSafeInteger(playerId)) return { ok: false, runtime, reason: 'invalid-player' };
    // Confirmation defence (Slice 3C marker isolation): a marker outside
    // the selected division's roster is rejected at the domain boundary —
    // never only hidden in the dropdown.
    if (Array.isArray(ctx.rosterDivisionIds) && ctx.rosterDivisionIds.indexOf(playerId) === -1) {
      return { ok: false, runtime, reason: 'player-division-mismatch' };
    }
    // One factual marker per game: an already-marked game is never
    // re-assigned through this path (use changeMarkerForGame for the
    // atomic operator transition).
    if (findMarkerForGame(runtime, game) != null) return { ok: false, runtime, reason: 'game-already-marked' };
    if ((ctx.absentIds || []).indexOf(playerId) !== -1) return { ok: false, runtime, reason: 'player-unavailable' };
    if ((ctx.playingPlayerIds || []).indexOf(playerId) !== -1) return { ok: false, runtime, reason: 'player-unavailable' };
    const currentDuty = findGameMarkedByPlayer(runtime, playerId);
    if (currentDuty != null) return { ok: false, runtime, reason: 'player-already-marking' };
    const participants = ctx.participantIds || [];
    if (participants.indexOf(playerId) !== -1) return { ok: false, runtime, reason: 'participant' };
    const byGame = Object.assign({}, runtime.byGame);
    const byMarker = Object.assign({}, runtime.byMarker);
    byGame[key] = playerId;
    byMarker[playerId] = key;
    return { ok: true, runtime: { byGame, byMarker }, reason: null };
  }

  /**
   * Change the factual marker of a marked game ATOMICALLY: the previous
   * marker is released and the new one assigned in one transition, or the
   * transition is rejected and the existing valid assignment survives
   * untouched. Never leaves two players marking the same game.
   */
  function changeMarkerForGame(runtime, game, newPlayerId, context) {
    if (!runtime || !runtime.byGame || !runtime.byMarker) return { ok: false, runtime, reason: 'no-runtime' };
    const key = markerGameKey(game);
    if (key == null) return { ok: false, runtime, reason: 'invalid-game' };
    const current = Object.prototype.hasOwnProperty.call(runtime.byGame, key) ? runtime.byGame[key] : null;
    if (current == null) return { ok: false, runtime, reason: 'not-marked' };
    if (newPlayerId === current) return { ok: true, runtime, reason: 'unchanged' };
    // Confirmation defence (Slice 3C marker isolation): changing to a
    // player outside the selected division's roster is rejected.
    if (Array.isArray((context || {}).rosterDivisionIds) && context.rosterDivisionIds.indexOf(newPlayerId) === -1) {
      return { ok: false, runtime, reason: 'player-division-mismatch' };
    }
    const ctx = context || {};
    const participants = (ctx.participantIds || []).slice();
    const rel = releaseMarkerFromGame(runtime, game);
    if (!rel.ok) return { ok: false, runtime, reason: rel.reason || 'release-failed' };
    const asg = assignMarkerToGame(rel.runtime, game, newPlayerId,
      Object.assign({}, ctx, { participantIds: participants.filter((id) => id !== current) })
    );
    if (!asg.ok) {
      // Rejected: restore the previous valid assignment exactly.
      const restored = assignMarkerToGame(rel.runtime, game, current,
        { participantIds: participants.filter((id) => id !== current), skipEligibility: true });
      if (restored.ok) return { ok: false, runtime: restored.runtime, reason: asg.reason || 'invalid-new-marker' };
      return { ok: false, runtime: rel.runtime, reason: asg.reason || 'invalid-new-marker' };
    }
    return asg;
  }

  /**
   * Release a factual marker. Means ONLY "this player is no longer
   * factually assigned to mark this game" — never completion, board
   * release, availability beyond this duty, or any DartConnect change.
   * Releasing an unmarked game (or an unknown game) is a deterministic
   * no-op success. Pure.
   */
  function releaseMarkerFromGame(runtime, game) {
    if (!runtime || !runtime.byGame || !runtime.byMarker) return { ok: false, runtime, reason: 'no-runtime' };
    const key = markerGameKey(game);
    if (key == null) return { ok: false, runtime, reason: 'invalid-game' };
    const current = Object.prototype.hasOwnProperty.call(runtime.byGame, key) ? runtime.byGame[key] : null;
    if (current == null) return { ok: true, runtime, reason: 'not-marked' };
    const byGame = Object.assign({}, runtime.byGame);
    const byMarker = Object.assign({}, runtime.byMarker);
    delete byGame[key];
    if (byMarker[current] === key) delete byMarker[current];
    return { ok: true, runtime: { byGame, byMarker }, reason: null };
  }

  /**
   * Factual conflicts for compact presentation. An assignment is preserved
   * when the operator later marks its marker NOT HERE; it is surfaced here
   * and resolved only by explicit operator action — never silently.
   */
  function detectMarkerConflicts(runtime, view) {
    const out = [];
    if (!runtime || !runtime.byGame) return out;
    const absent = (view && view.absentIds) || [];
    Object.keys(runtime.byGame).forEach((key) => {
      if (absent.indexOf(runtime.byGame[key]) !== -1) {
        out.push({ gameKey: key, markerId: runtime.byGame[key], conflict: 'not-here' });
      }
    });
    return out;
  }

  /* ============================== 6f-ter. Slice 3C delayed catch-up allowance (browser-independent core) ============================== */

  /**
   * Delayed fixtures are OPPORTUNISTIC CATCH-UP games, never targets. The
   * per-player allowance bounds how many delayed catch-up fixtures each
   * player may be drawn into per runtime session. Runtime state only —
   * never persisted.
   */
  const DEFAULT_DELAYED_CATCHUP_ALLOWANCE = 1;

  /**
   * Factual outstanding-delayed backlog for every player id: N per player.
   * Derived from the existing fixture data by reliable player ID only;
   * counts a delayed fixture when the player is either participant.
   * Informational factual backlog: Delayed ON/OFF, collapsed groups, NOT
   * HERE, strategy, and board/marker ownership never change N. Pure.
   */
  function getDelayedBacklogByPlayer(fixtures) {
    const backlog = {};
    (Array.isArray(fixtures) ? fixtures : []).forEach((f) => {
      if (!f || !f.delayed) return;
      const a = f.playerA && f.playerA.id;
      const b = f.playerB && f.playerB.id;
      if (Number.isSafeInteger(a)) backlog[a] = (backlog[a] || 0) + 1;
      if (Number.isSafeInteger(b) && b !== a) backlog[b] = (backlog[b] || 0) + 1;
    });
    return backlog;
  }

  /**
   * Delayed-allowance runtime: R per player (REMAINING allowance, not a
   * configured maximum), defaulted from factual backlog, plus runtime-only
   * consumed-game identities so a delayed fixture can consume at most once.
   * Pure initialiser: never mutates fixtures.
   */
  function createDelayedAllowanceRuntime(fixtures) {
    const backlog = getDelayedBacklogByPlayer(fixtures);
    const allowance = {};
    const consumedDelayedGameKeys = {};
    Object.keys(backlog).forEach((idStr) => {
      const n = backlog[idStr];
      if (n > 0) allowance[idStr] = Math.min(DEFAULT_DELAYED_CATCHUP_ALLOWANCE, n);
    });
    return { allowance, consumedDelayedGameKeys };
  }

  /** N: factual outstanding delayed fixtures for a player. Pure. */
  function getDelayedOutstandingCount(backlog, playerId) {
    return (backlog && backlog[playerId]) || 0;
  }

  /** R: remaining delayed catch-up allowance for a player. Pure. */
  function getRemainingDelayedAllowance(allowanceRuntime, playerId) {
    if (!allowanceRuntime || !allowanceRuntime.allowance) return 0;
    return allowanceRuntime.allowance[playerId] || 0;
  }

  /**
   * Operator override of R, clamped to the factual range 0..N (values
   * above N clamp to N; negative/invalid clamp to 0). Changing R is a
   * runtime constraint update only — it starts nothing and consumes
   * nothing. Returns { ok, runtime, reason }; never mutates the input.
   */
  function setRemainingDelayedAllowance(allowanceRuntime, playerId, value, backlog) {
    if (!allowanceRuntime || !allowanceRuntime.allowance) return { ok: false, runtime: allowanceRuntime, reason: 'no-runtime' };
    if (!Number.isSafeInteger(playerId)) return { ok: false, runtime: allowanceRuntime, reason: 'invalid-player' };
    const n = getDelayedOutstandingCount(backlog, playerId);
    if (!Number.isFinite(value)) return { ok: false, runtime: allowanceRuntime, reason: 'invalid-value' };
    const clamped = Math.max(0, Math.min(n, Math.floor(value)));
    const allowance = Object.assign({}, allowanceRuntime.allowance);
    if (clamped > 0) allowance[playerId] = clamped;
    else delete allowance[playerId];
    return { ok: true, runtime: { allowance, consumedDelayedGameKeys: allowanceRuntime.consumedDelayedGameKeys }, reason: null };
  }

  /**
   * NEW delayed-fixture eligibility: BOTH participants must hold remaining
   * allowance > 0. Current-night fixtures are never constrained by R.
   * Pure.
   */
  function canScheduleDelayedFixture(allowanceRuntime, fixture) {
    if (!fixture || !fixture.delayed) return true;
    const rt = allowanceRuntime || { allowance: {}, consumedDelayedGameKeys: {} };
    const a = fixture.playerA && fixture.playerA.id;
    const b = fixture.playerB && fixture.playerB.id;
    if (a != null && getRemainingDelayedAllowance(rt, a) <= 0) return false;
    if (b != null && b !== a && getRemainingDelayedAllowance(rt, b) <= 0) return false;
    return true;
  }

  /**
   * Factual consumption: a delayed fixture taken into the programme on a
   * strong factual signal consumes 1 allowance from BOTH participants
   * (bounded at zero) and records the game key so repeated observation of
   * the same fixture never double-consumes. Returns
   * { ok, runtime, consumed, reason }; never mutates the input.
   */
  function consumeDelayedAllowance(allowanceRuntime, fixture) {
    if (!fixture || !fixture.delayed) return { ok: false, runtime: allowanceRuntime, consumed: false, reason: 'not-delayed' };
    const rt = allowanceRuntime || { allowance: {}, consumedDelayedGameKeys: {} };
    const key = boardKeyForGame(fixture);
    if (rt.consumedDelayedGameKeys[key]) return { ok: true, runtime: rt, consumed: false, reason: 'already-consumed' };
    const allowance = Object.assign({}, rt.allowance);
    const dec = (id) => {
      const cur = getRemainingDelayedAllowance(rt, id);
      if (cur > 0) allowance[id] = cur - 1;
      else delete allowance[id];
    };
    const a = fixture.playerA && fixture.playerA.id;
    const b = fixture.playerB && fixture.playerB.id;
    if (Number.isSafeInteger(a)) dec(a);
    if (Number.isSafeInteger(b) && b !== a) dec(b);
    const consumedDelayedGameKeys = Object.assign({}, rt.consumedDelayedGameKeys);
    consumedDelayedGameKeys[key] = true;
    return { ok: true, runtime: { allowance, consumedDelayedGameKeys }, consumed: true, reason: null };
  }

  /** Runtime-only consumed identities for delayed fixtures. Pure. */
  function getConsumedDelayedGameKeys(allowanceRuntime) {
    return (allowanceRuntime && allowanceRuntime.consumedDelayedGameKeys) || {};
  }

  /* ============================== 6g. UI scale (pure steps + FIT) ============================== */

  const UI_SCALE_VALUES = [75, 80, 90, 100, 110, 125];
  const UI_SCALE_DEFAULT = 100;

  /** Round any candidate to the nearest supported step; ties round down. Pure. */
  function normalizeUiScale(value) {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
    if (Number.isNaN(n)) return UI_SCALE_DEFAULT;
    let best = UI_SCALE_VALUES[0];
    for (let i = 1; i < UI_SCALE_VALUES.length; i++) {
      const v = UI_SCALE_VALUES[i];
      if (Math.abs(v - n) <= Math.abs(best - n)) best = v;
    }
    return best;
  }

  /** One supported step down/up, clamped at the boundaries. Pure. */
  function previousUiScale(value) {
    const n = normalizeUiScale(value);
    const idx = UI_SCALE_VALUES.indexOf(n);
    return idx <= 0 ? UI_SCALE_VALUES[0] : UI_SCALE_VALUES[idx - 1];
  }

  function nextUiScale(value) {
    const n = normalizeUiScale(value);
    const idx = UI_SCALE_VALUES.indexOf(n);
    return idx === -1 || idx >= UI_SCALE_VALUES.length - 1
      ? UI_SCALE_VALUES[UI_SCALE_VALUES.length - 1]
      : UI_SCALE_VALUES[idx + 1];
  }

  /** Parse a raw stored preference value; anything unsupported -> 100. Pure. */
  function parseStoredUiScale(raw) {
    if (raw == null) return UI_SCALE_DEFAULT;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n)) return UI_SCALE_DEFAULT;
    return normalizeUiScale(n);
  }

  /**
   * Scale preference storage wrappers (UI adapter; the only browser-adjacent
   * part of the scale feature). The scale key is dedicated: it must never
   * mix with league state, scheduler runtime state or board runtime state.
   * loadUiScale returns a supported value or 100 — never throws.
   */
  function loadUiScale(storage) {
    try {
      const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(SCALE_KEY) : null;
      return parseStoredUiScale(raw);
    } catch (e) {
      warn('ui-scale read failed; using 100%:', e);
      return UI_SCALE_DEFAULT;
    }
  }

  /** Best-effort persist of the scale preference; never throws. */
  function saveUiScale(storage, value) {
    try {
      const v = parseStoredUiScale(value);
      if (storage && typeof storage.setItem === 'function') storage.setItem(SCALE_KEY, String(v));
    } catch (e) {
      warn('ui-scale write failed:', e);
    }
  }

  /**
   * Explicit FIT action: choose one supported step from viewport geometry.
   * Considers height first (vertical density is the point of FIT), then
   * width. Returns a supported value only; never below 75 or above 125.
   * Pure — the caller supplies viewport dimensions; FIT computes exactly
   * once per explicit selection and is never an active auto-layout mode.
   */
  function fitUiScale(viewportWidth, viewportHeight) {
    const h = typeof viewportHeight === 'number' && Number.isFinite(viewportHeight) ? viewportHeight : 0;
    const w = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : 0;
    let fit = UI_SCALE_DEFAULT;
    if (h > 0 && h < 640) fit = 75;
    else if (h < 720) fit = 80;
    else if (h < 810) fit = 90;
    if (w > 0 && w < 1100 && fit > 80) fit = 80;
    else if (w > 0 && w < 1280 && fit > 90) fit = 90;
    return fit;
  }

  /* ============================== 6h. Slice 3A UI planning adapter (browser-dependent; NOT scheduler core) ============================== */

  // Memory-only Slice 3A control state. Deliberately NOT persisted: every
  // page load starts fresh. Existing division/date/absent/theme persistence
  // is untouched.
  function defaultSchedulerUiState() {
    return {
      strategy: SCHEDULING_STRATEGIES.NORMAL,
      includeDelayed: false,
      managedBoardsEnabled: false,
      boardCount: 4, // UI default only; never hard-coded into scheduler logic.
    };
  }

  /**
   * UI adapter: project the factual night (parsed fixtures + live PLAYING
   * flags + Not Here) into a planner NightSession.
   *
   * READ-ONLY on `fixtures`: the session gets shallow copies, and statuses
   * pass through exactly as the factual pipeline wrote them ('playing' is
   * what the scheduler core already understands). Each live fixture is
   * additionally projected as a session activeGame so its players occupy
   * capacity (PLAYING in derivePlayerStates) and the game itself can never
   * be recommended — including live rows whose DartConnect match id is
   * unknown (projection-local key, never shown, never written back).
   *
   * Managed-board ownership is factual operator state: when supplied, each
   * owned game is also projected as an activeGame (boardNumber included),
   * consuming player capacity in the planner exactly like live games. This
   * is how the planner learns about ownership without any duplicated
   * scheduling logic in the UI.
   *
   * No board identity is invented: unmanaged capacity is capacity only.
   */
  function buildNightSession(schedulerUiState, data, state) {
    const ui = schedulerUiState || defaultSchedulerUiState();
    const boardCount = Math.min(6, Math.max(1, Math.floor(ui.boardCount) || 4));
    const factual = Array.isArray(data.fixtures) ? data.fixtures : [];
    const sessionFixtures = factual.map((f) => Object.assign({}, f));
    const activeGames = sessionFixtures
      .filter((f) => f.status === 'playing')
      .map((f) => ({
        matchId: f.matchId != null ? f.matchId : 'live-' + (f.playerA && f.playerA.id) + '-' + (f.playerB && f.playerB.id),
        playerA: f.playerA,
        playerB: f.playerB,
        boardNumber: null,
        markerId: (data.markerRuntime && findMarkerForGame(data.markerRuntime, f)) || null,
        isExtra: false,
      }));
    if (ui.managedBoardsEnabled && data.boardRuntime && Array.isArray(data.boardRuntime.boards)) {
      data.boardRuntime.boards.forEach((b) => {
        if (b.gameKey === null) return;
        const game = sessionFixtures.find((f) => boardKeyForGame(f) === b.gameKey);
        if (!game) return;
        const liveIds = new Set(activeGames.filter((ag) => typeof ag.matchId === 'number').map((ag) => ag.matchId));
        if (game.matchId != null && liveIds.has(game.matchId)) return;
        activeGames.push({
          matchId: game.matchId != null ? game.matchId : boardKeyForGame(game),
          playerA: game.playerA,
          playerB: game.playerB,
          boardNumber: b.boardNumber,
          markerId: findMarkerForGame(data.markerRuntime, game),
          isExtra: false,
        });
      });
    }
    return createNightSession({
      players: Array.isArray(data.roster) ? data.roster : [],
      fixtures: sessionFixtures,
      selectedDivision: state.division,
      selectedMatchDate: state.selectedMatchDate,
      managedBoardsEnabled: !!ui.managedBoardsEnabled,
      boardCount,
      includeDelayed: !!ui.includeDelayed,
      absentIds: Array.isArray(state.absentIds) ? state.absentIds.slice() : [],
      activeGames,
      completedMatchIds: [],
      // Confirmed markers are FACT: each owning player is projected as
      // factually MARKING (planner eligibility), independent of Managed
      // Boards and independent of any PLAYING state.
      markingPlayerIds: data.markerRuntime
        ? Object.keys(data.markerRuntime.byMarker || {}).map(Number).filter(Number.isSafeInteger)
        : [],
      delayedAllowanceRuntime: data.delayedAllowanceRuntime || null,
    });
  }

  /**
   * UI adapter around getProjectedRunningOrder: what the operator should do
   * now (advice), the planner's projected next wave, and how many further
   * games are planned. Slice 3A deliberately does NOT render the complete
   * projected-later plan, planner scores, internal reason codes or
   * robustness calculations. Recommendable fixtures keep the 'waiting'
   * status needed for the advice row rendering below.
   */
  function buildSchedulerAdvice(schedulerUiState, data, state) {
    const ui = schedulerUiState || defaultSchedulerUiState();
    const session = buildNightSession(ui, data, state);
    const plan = getProjectedRunningOrder(session, { strategy: ui.strategy });
    const advice = {
      playableCount: plan.unschedulableFixtures.length === 0 && plan.projectedWaves.length > 0
        ? (plan.projectedWaves[0] && plan.projectedWaves[0].games.length) || 0
        : 0,
      recommended: [],
      projectedNext: [],
      laterCount: 0,
      session,
      markerRuntime: data.markerRuntime || null,
    };
    // Only genuinely waiting games are shown as advice: anything the core
    // let through with a non-waiting status (never expected at this
    // boundary) would be factual state, not recommendation material.
    plan.openingRecommendations.forEach((r) => {
      if (r.game && r.game.status === 'waiting') advice.recommended.push(r.game);
    });
    advice.projectedNext = plan.projectedNextPriorities.filter((g) => g.status === 'waiting');
    advice.laterCount = Math.max(0, plan.metrics.totalScheduledGames
      - advice.recommended.length - advice.projectedNext.length);

    /* Slice 3C opening-wave marker advice — GLOBAL, not greedy.
     * PROPOSED only, never factual. The opening wave is treated as a SET:
     * for the unmarked opening games we evaluate bounded combinations of
     * distinct eligible volunteers and keep the combination that best
     * preserves the remaining programme (planner's evaluateMarkerImpact:
     * a player needed soon scores low, a player with nothing outstanding
     * scores high), with deterministic ascending-id tie-breaks.
     *
     * Bounds: per game only the top CANDIDATE_BREADTH=4 ranked candidates
     * are considered, so the search is at most 4^n with n = opening games
     * (n <= capacity <= 6) -> <= 4096 leaves, each scored O(n) from cached
     * impacts. FACT beats ADVICE: games with confirmed markers are skipped
     * and their markers are unavailable via the factual MARKING
     * projection — they are never overwritten by a better combination. */
    const playerStates = derivePlayerStates(session);
    const availableIds = [];
    playerStates.forEach((p) => {
      if (p.state === PLAYER_STATES.AVAILABLE) availableIds.push(p.id);
    });
    availableIds.sort((a, b) => a - b);
    // Slice 3C marker isolation: restrict to the selected division's roster
    // so the global optimiser never scores or selects foreign players.
    const divRoster = filterRosterForDivision(data.roster, state && state.division);
    const divRosterIds = divRoster.map((p) => p.id);
    const availableIdsDiv = availableIds.filter((id) => divRosterIds.indexOf(id) !== -1);
    const openPool = divRosterIds.length > 0 ? availableIdsDiv : availableIds;
    const markedGameKeys = Object.assign({}, (data.markerRuntime && data.markerRuntime.byGame) || {});
    const CANDIDATE_BREADTH = 4;
    const openGames = [];
    advice.recommended.forEach((game) => {
      const gKey = markerGameKey(game);
      game.confirmedMarkerId = markedGameKeys[gKey] != null ? markedGameKeys[gKey] : null;
      if (game.confirmedMarkerId == null) openGames.push(game);
    });
    const impactCache = {};
    const fitness = (id) => {
      if (impactCache[id] === undefined) impactCache[id] = evaluateMarkerImpact(session, id).score;
      return impactCache[id];
    };
    const perGameCandidates = openGames.map((game) =>
      openPool
        .filter((id) => id !== game.playerA.id && id !== game.playerB.id)
        .sort((a, b) => (fitness(b) - fitness(a)) || (a - b))
        .slice(0, CANDIDATE_BREADTH)
    );
    const chosen = new Array(openGames.length).fill(null);
    let bestScore = -Infinity;
    let bestSeq = null;
    const used = new Set();
    (function select(idx, score, seq) {
      if (idx === openGames.length) {
        const better = score > bestScore ||
          (score === bestScore && (bestSeq === null || seq.join(',') < bestSeq.join(',')));
        if (better) { bestScore = score; bestSeq = seq.slice(); }
        return;
      }
      const cands = perGameCandidates[idx];
      if (!cands.length) { select(idx + 1, score, seq); return; }
      for (let i = 0; i < cands.length; i++) {
        const id = cands[i];
        if (used.has(id)) continue;
        used.add(id);
        seq.push(id);
        select(idx + 1, score + fitness(id), seq);
        seq.pop();
        used.delete(id);
      }
    })(0, 0, []);
    openGames.forEach((game, i) => { game.proposedMarkerId = bestSeq ? bestSeq[i] : null; });
    advice.recommended.forEach((game) => {
      if (game.proposedMarkerId === undefined) game.proposedMarkerId = null;
    });
    return advice;
  }

  /* ============================== 7. Compact UI ============================== */

  const CSS = [
    '.sssl-overlay{--bg:#0f172a;--panel:#1e293b;--roster:#111c30;--text:#e2e8f0;--muted:#b5c0cd;--faint:#94a3b8;--border:#334155;--control:#243244;--control-border:#475569;--accent:#14b8a6;--accent-ink:#06281c;--row-alt:rgba(148,163,184,0.08);--datebar:#243244;--datebar-text:#b5c0cd;--absent-bg:#3b2f14;--absent-border:#f59e0b;--absent-text:#fcd34d;--playing:#22c55e;--playing-bg:#166534;--playing-ink:#f0fdf4;--delayed:#f59e0b;--err-border:#ef4444;--err-bg:#3b2228;--err-text:#fecaca;--fs:14px;--fs-sm:13px;--fs-xs:12px;--fs-2xs:11px;--fs-3xs:10px;--pad-strip:5px 16px;--pad-row:3px 10px;--pad-btn:4px 12px;--pad-btn-sm:2px 10px;--pad-pane:8px 16px;--pad-pane-side:8px 12px;--pad-player:3px 8px;--pad-sel:4px 8px;--gap-bar:12px;--gap-ctrl:6px;--gap-strip:10px;--edge-reserve:96px;--roster-min:252px;--roster-max:282px;position:fixed;inset:0;z-index:2147483647;background:var(--bg);color:var(--text);font-family:"Segoe UI",Arial,sans-serif;font-size:var(--fs);display:flex;flex-direction:column}',
    '.sssl-overlay[data-theme="light"]{--bg:#f1f5f9;--panel:#ffffff;--roster:#f8fafc;--text:#0f172a;--muted:#475569;--faint:#64748b;--border:#cbd5e1;--control:#ffffff;--control-border:#94a3b8;--accent:#0d9488;--accent-ink:#ffffff;--row-alt:rgba(15,23,42,0.045);--datebar:#334155;--datebar-text:#f8fafc;--absent-bg:#fef3c7;--absent-border:#b45309;--absent-text:#92400e;--playing:#15803d;--playing-bg:#15803d;--playing-ink:#ffffff;--delayed:#b45309;--err-border:#dc2626;--err-bg:#fef2f2;--err-text:#991b1b;color-scheme:light}',
    '.sssl-overlay[data-zoom="75"]{--fs:10.5px;--fs-sm:9.75px;--fs-xs:9px;--fs-2xs:8.25px;--fs-3xs:7.5px;--pad-strip:3.75px 12px;--pad-row:2.25px 7.5px;--pad-btn:3px 9px;--pad-btn-sm:1.5px 7.5px;--pad-pane:6px 12px;--pad-pane-side:6px 9px;--pad-player:2.25px 6px;--pad-sel:3px 6px;--gap-bar:9px;--gap-ctrl:4.5px;--gap-strip:7.5px;--edge-reserve:72px;--roster-min:190px;--roster-max:212px}',
    '.sssl-overlay[data-zoom="80"]{--fs:11.2px;--fs-sm:10.4px;--fs-xs:9.6px;--fs-2xs:8.8px;--fs-3xs:8px;--pad-strip:4px 12.8px;--pad-row:2.4px 8px;--pad-btn:3.2px 9.6px;--pad-btn-sm:1.6px 8px;--pad-pane:6.4px 12.8px;--pad-pane-side:6.4px 9.6px;--pad-player:2.4px 6.4px;--pad-sel:3.2px 6.4px;--gap-bar:9.6px;--gap-ctrl:4.8px;--gap-strip:8px;--edge-reserve:76.8px;--roster-min:202px;--roster-max:226px}',
    '.sssl-overlay[data-zoom="90"]{--fs:12.6px;--fs-sm:11.7px;--fs-xs:10.8px;--fs-2xs:9.9px;--fs-3xs:9px;--pad-strip:4.5px 14.4px;--pad-row:2.7px 9px;--pad-btn:3.6px 10.8px;--pad-btn-sm:1.8px 9px;--pad-pane:7.2px 14.4px;--pad-pane-side:7.2px 10.8px;--pad-player:2.7px 7.2px;--pad-sel:3.6px 7.2px;--gap-bar:10.8px;--gap-ctrl:5.4px;--gap-strip:9px;--edge-reserve:86.4px;--roster-min:227px;--roster-max:254px}',
    '.sssl-overlay[data-zoom="110"]{--fs:15.4px;--fs-sm:14.3px;--fs-xs:13.2px;--fs-2xs:12.1px;--fs-3xs:11px;--pad-strip:5.5px 17.6px;--pad-row:3.3px 11px;--pad-btn:4.4px 13.2px;--pad-btn-sm:2.2px 11px;--pad-pane:8.8px 17.6px;--pad-pane-side:8.8px 13.2px;--pad-player:3.3px 8.8px;--pad-sel:4.4px 8.8px;--gap-bar:13.2px;--gap-ctrl:6.6px;--gap-strip:11px;--edge-reserve:105.6px;--roster-min:277px;--roster-max:310px}',
    '.sssl-overlay[data-zoom="125"]{--fs:17.5px;--fs-sm:16.25px;--fs-xs:15px;--fs-2xs:13.75px;--fs-3xs:12.5px;--pad-strip:6.25px 20px;--pad-row:3.75px 12.5px;--pad-btn:5px 15px;--pad-btn-sm:2.5px 12.5px;--pad-pane:10px 20px;--pad-pane-side:10px 15px;--pad-player:3.75px 10px;--pad-sel:5px 10px;--gap-bar:15px;--gap-ctrl:7.5px;--gap-strip:12.5px;--edge-reserve:120px;--roster-min:315px;--roster-max:353px}',
    '.sssl-topbar{display:flex;align-items:center;gap:var(--gap-bar);padding:var(--pad-strip);background:var(--panel);border-bottom:1px solid var(--border);flex:none}',
    '.sssl-title{font-size:calc(var(--fs) + 2px);font-weight:700;white-space:nowrap}',
    '.sssl-divsel{display:flex;gap:var(--gap-ctrl);flex-wrap:wrap}',
    '.sssl-divsel button{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:var(--pad-btn);font-size:var(--fs-sm);cursor:pointer}',
    '.sssl-divsel button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}',
    '.sssl-topbar .spacer{flex:1}',
    '.sssl-btn{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:var(--pad-btn);font-size:var(--fs-sm);cursor:pointer;white-space:nowrap}',
    '.sssl-btn:hover{border-color:var(--accent)}',
    '.sssl-datelabel{font-size:var(--fs-sm);color:var(--muted);white-space:nowrap}',
    '.sssl-datesel{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:var(--pad-sel);font-size:var(--fs-sm);max-width:190px}',
    '.sssl-zoom{display:flex;align-items:center;gap:4px}',
    '.sssl-zoom button{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:var(--pad-btn-sm);font-size:var(--fs-sm);cursor:pointer;min-width:24px;text-align:center}',
    '.sssl-zoom button:hover{border-color:var(--accent)}',
    '.sssl-zoom .val{font-size:var(--fs-sm);color:var(--muted);min-width:42px;text-align:center;white-space:nowrap}',
    '.sssl-main{flex:1;display:flex;min-height:0}',
    '.sssl-fixtures{flex:1 1 77%;overflow-y:auto;padding:var(--pad-pane);min-width:0}',
    // Slice 3C: content-aware sidebar. The roster hugs its rendered content
    // (max-content: larger names + the delayed allowance control) and grows
    // ONLY up to the per-scale --roster-max safety bound, never without
    // limit; below the content width it falls back to --roster-min. The
    // fixture area always stays dominant (flex-shrink on the sidebar only).
    '.sssl-roster{flex:0 1 max-content;min-width:var(--roster-min);max-width:var(--roster-max);border-left:1px solid var(--border);overflow-y:auto;overflow-x:hidden;padding:var(--pad-pane-side);background:var(--roster)}',
    '.sssl-datebar{background:var(--datebar);color:var(--datebar-text);font-size:var(--fs-xs);font-weight:700;padding:3px var(--gap-strip);border-radius:4px;margin:10px 0 4px;position:sticky;top:0}',
    '.sssl-datebar.collapsible{cursor:pointer;user-select:none}',
    '.sssl-datebar.collapsible:hover{opacity:0.85}',
    '.sssl-datebar .fold{margin-right:6px;font-size:var(--fs-xs)}',
    '.sssl-datebar .delayed{color:var(--delayed);font-weight:700;margin-left:8px;font-size:var(--fs-2xs)}',
    '.sssl-row{display:flex;align-items:center;padding:var(--pad-row);border-radius:3px;line-height:1.35;position:relative}',
    // Matchup centre invariance: right-side status/action controls are
    // absolute overlays and never consume flex width. The two name spans
    // keep EQUAL flex growth and carry SYMMETRIC edge reserves, so the
    // pa/vs/pb centre point is identical with no indicator, BOARD N ×,
    // PLAYING, or both. The reserve also ellipsises long names before
    // they can run underneath any right-edge overlay.
    '.sssl-row .sssl-pa{margin-left:var(--edge-reserve)}',
    '.sssl-row .sssl-pb{margin-right:var(--edge-reserve)}',
    '.sssl-row.alt{background:var(--row-alt)}',
    '.sssl-pa{flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-vs{flex:0 0 44px;text-align:center;font-weight:700;font-size:var(--fs-xs);color:var(--faint)}',
    '.sssl-pb{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-playing{position:absolute;right:10px;top:50%;transform:translateY(-50%);margin-left:0;color:var(--playing);font-weight:700;font-size:var(--fs-2xs);white-space:nowrap}',
    '.sssl-row.playing{position:relative;background:var(--playing-bg)}',
    '.sssl-row.playing .sssl-pa,.sssl-row.playing .sssl-pb{font-weight:700;color:var(--playing-ink)}',
    '.sssl-row.playing .sssl-vs,.sssl-row.playing .sssl-playing{color:var(--playing-ink)}',
    '.sssl-row.playing .sssl-vs,.sssl-row.playing .sssl-playing{color:var(--playing-ink)}',
    // Deterministic right-edge overlay slots (never in-flow):
    //   slot 1 (right:10px)              = ● PLAYING
    //   slot 2 (right:edge-reserve)      = BOARD N × on a playing row,
    //                                      or the assign select on an
    //                                      unassigned playing row
    //   BOARD N × on a non-playing row   = right:10px (slot 1, free)
    // Slot 2 scales with zoom so PLAYING and the controls cannot overlap.
    '.sssl-row .bown{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px}',
    '.sssl-row.playing .bown{right:var(--edge-reserve)}',
    '.sssl-row .bassign-slot{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%)}',
    '.sssl-row .bown .sssl-brel{padding:1px 6px;min-width:18px;text-align:center;line-height:1.2}',
    '.sssl-rhead{font-size:var(--fs-xs);font-weight:700;color:var(--muted);margin:2px 0 6px}',
    '.sssl-player{display:block;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--text);font-size:var(--fs);font-weight:600;padding:var(--pad-player);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-player:hover{border-color:var(--control-border)}',
    '.sssl-player.absent{background:var(--absent-bg);border-color:var(--absent-border);color:var(--absent-text);font-weight:600}',
    '.sssl-playerrow{display:flex;align-items:center;gap:4px;min-width:0}',
    '.sssl-playerrow .sssl-player{flex:1;min-width:0}',
    '.sssl-playerrow .dallow{flex:none;font-size:var(--fs-2xs);color:var(--muted);white-space:nowrap;display:inline-flex;align-items:center;gap:3px}',
    // (N/R): N stays plain informational text; R is a REAL compact control —
    // bordered box, accent tint, native select with a permanent caret glyph
    // absolutely positioned on its right edge (pointer-events:none, so the
    // whole box INCLUDING the caret is the clickable target). Width derives
    // from the scale variables (~37 CSS px at 100%). Reads as (6 / [1 ▼]).
    // Options stay 0..N (the caret is not an option); picking a value never
    // toggles NOT HERE.
    '.sssl-rwrap{position:relative;display:inline-flex;align-items:center}',
    '.sssl-rsel{background:var(--control);color:var(--accent);border:1px solid var(--control-border);border-radius:3px;padding:1px 14px 1px 5px;font-size:var(--fs-2xs);width:calc(var(--fs-2xs) * 3 + 4px);cursor:pointer;font-weight:700;text-align:left;-webkit-appearance:none;appearance:none}',
    '.sssl-rsel:hover,.sssl-rsel:focus{border-color:var(--accent);color:var(--text);outline:none}',
    '.sssl-rwrap .dcaret{position:absolute;right:3px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--accent);font-size:var(--fs-3xs);font-weight:700}',
    '.sssl-note{font-size:var(--fs-2xs);color:var(--faint);margin-top:8px}',
    '.sssl-error{margin:16px;padding:12px;border:1px solid var(--err-border);border-radius:6px;background:var(--err-bg);color:var(--err-text);font-size:var(--fs-sm);white-space:pre-wrap}',
    '.sssl-empty{padding:24px;color:var(--faint);font-size:var(--fs-sm)}',
    // Slice 3A scheduler strip + advice rows.
    '.sssl-ctrlstrip{display:flex;align-items:center;gap:var(--gap-strip);flex-wrap:wrap;padding:var(--pad-strip);background:var(--panel);border-bottom:1px solid var(--border);font-size:var(--fs-xs);color:var(--muted);flex:none}',
    '.sssl-ctrlstrip .grp{display:flex;align-items:center;gap:var(--gap-ctrl);white-space:nowrap}',
    '.sssl-ctrlstrip .lbl{font-size:var(--fs-2xs);color:var(--muted)}',
    '.sssl-ctrlstrip button{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:var(--pad-btn-sm);font-size:var(--fs-xs);cursor:pointer}',
    '.sssl-ctrlstrip button:hover{border-color:var(--accent)}',
    '.sssl-ctrlstrip button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}',
    '.sssl-ctrlstrip .hint{font-size:var(--fs-2xs);color:var(--faint);margin-left:auto;white-space:nowrap}',
    '.sssl-advicehead{font-size:var(--fs-2xs);font-weight:700;letter-spacing:0.08em;color:var(--muted);margin:12px 0 4px}',
    '.sssl-advicehead .badge{display:inline-block;padding:0 6px;border-radius:8px;margin-right:6px;font-size:var(--fs-3xs);color:var(--accent-ink);background:var(--accent)}',
    '.sssl-advicehead.projected .badge{background:var(--border);color:var(--text)}',
    '.sssl-advice{display:flex;align-items:center;padding:var(--pad-row);border-radius:3px;border:1px dashed var(--accent);margin-bottom:2px}',
    '.sssl-advice .mark{flex:0 0 26px;font-weight:700;font-size:var(--fs-2xs);color:var(--faint);text-align:center}',
    // Recommendation SEQUENCE number: reserved left-edge slot (existing
    // mark column), symmetric with the right control reserve. Metadata
    // only — never a board number, never flow content that could shift
    // the matchup centre.
    '.sssl-advice.projected{border-style:dotted;border-color:var(--faint);opacity:0.9}',
    '.sssl-advice.projected .mark{color:var(--muted)}',
    '.sssl-advice .pa{flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-advice .vs{flex:0 0 44px;text-align:center;font-weight:700;font-size:var(--fs-xs);color:var(--faint)}',
    '.sssl-advice .pb{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-advice .note{font-size:var(--fs-2xs);color:var(--muted);white-space:nowrap;margin-left:8px}',
    '.sssl-advice .proj{font-size:var(--fs-3xs);color:var(--faint);margin-left:10px;white-space:nowrap}',
    '.sssl-advice .ctrl{margin-left:8px;flex:none}',
    // Slice 3B managed physical boards.
    '.sssl-boards{margin-top:2px}',
    '.sssl-boards .brow{display:flex;align-items:center;padding:var(--pad-row);border-radius:3px;border:1px solid var(--border);margin-bottom:2px;min-height:calc(var(--fs) + 8px)}',
    '.sssl-boards .brow .num{flex:0 0 22px;font-weight:700;font-size:var(--fs-xs);color:var(--muted)}',
    '.sssl-boards .brow .names{flex:1;display:flex;align-items:center;overflow:hidden;white-space:nowrap}',
    '.sssl-boards .brow .names .pa{flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis}',
    '.sssl-boards .brow .names .vs{flex:0 0 32px;text-align:center;font-weight:700;font-size:var(--fs-xs);color:var(--faint)}',
    '.sssl-boards .brow .names .pb{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis}',
    '.sssl-boards .brow .un{color:var(--faint);font-size:var(--fs-2xs);letter-spacing:0.06em}',
    '.sssl-boards .brow .rel{margin-left:8px;flex:none}',
    '.sssl-bassign{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:1px 6px;font-size:var(--fs-xs);cursor:pointer;max-width:96px}',
    '.sssl-bassign:hover{border-color:var(--accent)}',
    '.sssl-bassign:disabled{opacity:0.5;cursor:default}',
    '.sssl-brel{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:1px 8px;font-size:var(--fs-2xs);cursor:pointer;white-space:nowrap}',
    '.sssl-brel:hover{border-color:var(--delayed)}',
    '.sssl-row .mkown{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px}',
    '.sssl-row.playing .mkown{right:calc(var(--edge-reserve) + 96px)}',
    '.sssl-row .mkslot{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%)}',
    '.sssl-row.playing .mkslot{right:calc(var(--edge-reserve) + 96px)}',
    '.sssl-mksel{background:var(--control);color:var(--text);border:1px dashed var(--accent);border-radius:4px;padding:1px 6px;font-size:var(--fs-xs);max-width:160px;height:calc(var(--fs-xs) + 8px);line-height:1.2;vertical-align:middle;text-overflow:ellipsis}',
    '.sssl-mksel:hover{border-color:var(--accent)}',
    '.sssl-mkchip{display:inline-block;font-size:var(--fs-3xs);font-weight:700;letter-spacing:0.06em;padding:0 6px;border-radius:8px;color:var(--accent-ink);background:var(--border);vertical-align:1px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-chip{display:inline-block;font-size:var(--fs-3xs);font-weight:700;letter-spacing:0.06em;padding:0 6px;border-radius:8px;margin-right:6px;color:var(--accent-ink);background:var(--accent);vertical-align:1px}',
    '.sssl-chip.warn{background:var(--absent-border);color:#fff}',
  ].join('\n');

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Roster name for a factual marker id ('#id' fallback; never invented). */
  function markerNameForId(data, playerId) {
    const p = (data.roster || []).find((r) => r.id === playerId);
    return (p && p.name) || ('#' + playerId);
  }

  /**
   * Compact shared marker selector used by BOTH the RECOMMENDED rows and
   * the factual FIXTURES rows, so marker eligibility is built once from the
   * domain helper (getEligibleMarkerCandidates) and never duplicated in the
   * DOM layer. The scheduler's proposed marker, when supplied, is only
   * PRESELECTED advice — nothing becomes factual until the operator picks
   * an entry. Selecting the placeholder leaves the marker unassigned.
   *
   * Selection priority: confirmed fact > proposed advice > '—'. The
   * proposal binds display-only: the selector's default value is set to
   * the proposal WITHOUT calling assignMarkerToGame or touching the
   * marker runtime. A proposal that is absent or no longer eligible at
   * render time (stale advice) falls back safely to the placeholder and
   * the ineligible option is not offered; the next global re-plan
   * produces fresh advice. A confirmed marker (o.confirmedMarkerId),
   * when supplied, is always displayed and always wins over the proposal
   * (CONFIRMED FACT > PROPOSED ADVICE > '—').
   */
  function markerSelectEl(opts) {
    const o = opts || {};
    const sel = document.createElement('select');
    sel.className = 'sssl-mksel';
    sel.setAttribute('aria-label', 'Marker for this game');
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'MARKER: —';
    sel.appendChild(ph);
    const confirmedId = o.confirmedMarkerId != null ? o.confirmedMarkerId : null;
    const eligible = getEligibleMarkerCandidates(o.context);
    const proposedEligible = confirmedId == null && o.proposedMarkerId != null &&
      eligible.some((c) => c.id === o.proposedMarkerId);
    if (confirmedId != null) {
      // CONFIRMED FACT: always displayed, even if the player has since
      // become ineligible — a fact is never overwritten by advice.
      const confirmed = document.createElement('option');
      confirmed.value = String(confirmedId);
      confirmed.textContent = 'MARKER: ' + o.nameFor(confirmedId);
      sel.appendChild(confirmed);
    } else if (proposedEligible) {
      const proposed = document.createElement('option');
      proposed.value = String(o.proposedMarkerId);
      proposed.textContent = 'MARKER: ' + o.nameFor(o.proposedMarkerId);
      sel.appendChild(proposed);
    }
    eligible.forEach((c) => {
      if (confirmedId != null && c.id === confirmedId) return;
      if (proposedEligible && c.id === o.proposedMarkerId) return;
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    // Display-only default (see doc comment above): CONFIRMED FACT first,
    // then the proposal, so the CLOSED control reads 'MARKER: <name>'.
    // ADVICE only — factual assignment happens exclusively via onConfirm,
    // and a proposal that is no longer eligible at render time falls back
    // to the placeholder; no other candidate is ever substituted by the UI.
    if (confirmedId != null) {
      sel.value = String(confirmedId);
    } else if (proposedEligible) {
      sel.value = String(o.proposedMarkerId);
    }
    sel.addEventListener('change', () => {
      const chosen = parseInt(sel.value, 10);
      sel.value = '';
      if (Number.isSafeInteger(chosen) && chosen >= 1 && o.onConfirm) o.onConfirm(chosen);
    });
    return sel;
  }

  /** Compact board <select> offering only currently free boards ('B1'…). */
  function boardSelectEl(rtv, onPick) {
    const sel = document.createElement('select');
    sel.className = 'sssl-bassign';
    sel.setAttribute('aria-label', 'Assign to board');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'BOARD ▾';
    sel.appendChild(placeholder);
    const free = getAvailableManagedBoards(rtv);
    free.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = String(b.boardNumber);
      opt.textContent = 'Board ' + b.boardNumber;
      sel.appendChild(opt);
    });
    if (free.length === 0) {
      sel.disabled = true;
      placeholder.textContent = 'NO FREE BOARD';
    }
    sel.addEventListener('change', () => {
      const n = parseInt(sel.value, 10);
      sel.value = '';
      if (Number.isSafeInteger(n) && n >= 1) onPick(n);
    });
    return sel;
  }

  let activeSchedulerUi = null;
  let activeBoardRuntime = null;

  function render(state, storage, data, liveNote, diagnostics, schedulerUi) {
    if (!schedulerUi) schedulerUi = activeSchedulerUi || defaultSchedulerUiState();
    if (!data.boardRuntime) data.boardRuntime = createManagedBoardRuntime(schedulerUi.boardCount);
    if (!data.markerRuntime) data.markerRuntime = createMarkerRuntime();
    // Slice 3C runtime: delayed catch-up allowance, defaulted from factual
    // backlog (N). Created once per boot; consumption and overrides update
    // it in place. Never persisted.
    if (!data.delayedAllowanceRuntime) data.delayedAllowanceRuntime = createDelayedAllowanceRuntime(data.fixtures);
    const rtv = data.boardRuntime;
    const mkr = data.markerRuntime;
    // Slice 3C marker isolation: the selected division's roster ids gate
    // every marker candidate context and every confirmation in this view.
    const divRosterIds = filterRosterForDivision(data.roster, state.division).map((p) => p.id);
    activeBoardRuntime = rtv;
    closeOverlay();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.documentElement.appendChild(style);

    const overlay = el('div', 'sssl-overlay');
    overlay.id = 'sssl-match-night';
    overlay.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
    overlay.dataset.zoom = String(schedulerUi.zoom);

    const topbar = el('div', 'sssl-topbar');
    topbar.appendChild(el('div', 'sssl-title', 'Match Night'));
    const divsel = el('div', 'sssl-divsel');
    (data.divisions && data.divisions.length ? data.divisions : [state.division]).forEach((div) => {
      const b = el('button', div === state.division ? 'on' : '', div);
      b.type = 'button';
      b.addEventListener('click', () => {
        state.division = div;
        saveState(storage, state, data.storeKey);
        render(state, storage, data, liveNote, diagnostics, activeSchedulerUi);
        if (activeLiveCtx) refreshLive(activeLiveCtx);
      });
      divsel.appendChild(b);
    });
    topbar.appendChild(divsel);
    if (data.availableDates && data.availableDates.length > 0) {
      topbar.appendChild(el('span', 'sssl-datelabel', 'Match Date'));
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Match Date');
      select.className = 'sssl-datesel';
      data.availableDates.forEach((iso) => {
        const opt = document.createElement('option');
        opt.value = iso;
        opt.textContent = (data.dateLabels && data.dateLabels[iso]) || iso;
        if (iso === state.selectedMatchDate) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        state.selectedMatchDate = select.value || null;
        saveState(storage, state, data.storeKey);
        render(state, storage, data, liveNote, diagnostics, activeSchedulerUi);
        if (activeLiveCtx) refreshLive(activeLiveCtx);
      });
      topbar.appendChild(select);
    }
    topbar.appendChild(el('div', 'spacer'));
    // Application UI scale: presentation only, persisted as a preference.
    // Never touches scheduler, factual or NOT HERE state.
    const zoomWrap = el('div', 'sssl-zoom');
    const zoomLabel = el('span', 'val', schedulerUi.zoom + '%');
    const zoomOut = el('button', '', '−');
    zoomOut.type = 'button';
    zoomOut.title = 'Smaller interface';
    zoomOut.setAttribute('aria-label', 'Decrease interface scale');
    zoomOut.addEventListener('click', () => {
      schedulerUi.zoom = previousUiScale(schedulerUi.zoom);
      saveUiScale(storage, schedulerUi.zoom);
      render(state, storage, data, liveNote, diagnostics, schedulerUi);
    });
    const zoomIn = el('button', '', '+');
    zoomIn.type = 'button';
    zoomIn.title = 'Larger interface';
    zoomIn.setAttribute('aria-label', 'Increase interface scale');
    zoomIn.addEventListener('click', () => {
      schedulerUi.zoom = nextUiScale(schedulerUi.zoom);
      saveUiScale(storage, schedulerUi.zoom);
      render(state, storage, data, liveNote, diagnostics, schedulerUi);
    });
    const zoomFit = el('button', '', 'FIT');
    zoomFit.type = 'button';
    zoomFit.title = 'Fit interface to this window (one explicit step)';
    zoomFit.setAttribute('aria-label', 'Fit interface to window');
    zoomFit.addEventListener('click', () => {
      schedulerUi.zoom = fitUiScale(window.innerWidth, window.innerHeight);
      saveUiScale(storage, schedulerUi.zoom);
      render(state, storage, data, liveNote, diagnostics, schedulerUi);
    });
    zoomWrap.appendChild(zoomOut);
    zoomWrap.appendChild(zoomLabel);
    zoomWrap.appendChild(zoomIn);
    zoomWrap.appendChild(zoomFit);
    topbar.appendChild(zoomWrap);
    const themeBtn = el('button', 'sssl-btn', state.theme === 'light' ? '☀ Light' : '☾ Dark');
    themeBtn.type = 'button';
    themeBtn.title = 'Switch appearance (theme is saved)';
    themeBtn.setAttribute('aria-label', 'Switch appearance, currently ' + (state.theme === 'light' ? 'light' : 'dark'));
    themeBtn.addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      saveState(storage, state);
      render(state, storage, data, liveNote, diagnostics, activeSchedulerUi);
    });
    topbar.appendChild(themeBtn);
    const refresh = el('button', 'sssl-btn', '↻ Refresh');
    refresh.type = 'button';
    refresh.title = 'Reload the schedule (completed games disappear; division and Not Here state are kept)';
    refresh.addEventListener('click', () => window.location.reload());
    topbar.appendChild(refresh);
    const exit = el('button', 'sssl-btn', 'Exit');
    exit.type = 'button';
    exit.addEventListener('click', closeOverlay);
    topbar.appendChild(exit);
    overlay.appendChild(topbar);

    /* Slice 3A scheduler control strip (memory-only state). Toggling never
     * mutates factual state; it only changes the advisory plan computed
     * from the existing scheduler/planner core. */
    const strip = el('div', 'sssl-ctrlstrip');
    strip.setAttribute('role', 'toolbar');
    strip.setAttribute('aria-label', 'Scheduler options');
    strip.appendChild(el('span', 'lbl', 'Scheduling'));
    const stratGroup = el('span', 'grp');
    [SCHEDULING_STRATEGIES.NORMAL, SCHEDULING_STRATEGIES.OPTIMISED].forEach((mode) => {
      const b = el('button', schedulerUi.strategy === mode ? 'on' : '',
        mode === SCHEDULING_STRATEGIES.NORMAL ? 'NORMAL' : 'OPTIMISED');
      b.type = 'button';
      b.title = mode === SCHEDULING_STRATEGIES.NORMAL
        ? 'Plan in fixture order (advice only; factual state is unchanged)'
        : 'Plan globally for fewer waves (advice only; factual state is unchanged)';
      b.setAttribute('aria-pressed', schedulerUi.strategy === mode ? 'true' : 'false');
      b.addEventListener('click', () => {
        schedulerUi.strategy = mode;
        render(state, storage, data, liveNote, diagnostics, schedulerUi);
      });
      stratGroup.appendChild(b);
    });
    strip.appendChild(stratGroup);
    strip.appendChild(el('span', 'lbl', 'Delayed'));
    const delayGroup = el('span', 'grp');
    [[false, 'OFF', 'Delayed (postponed) games stay out of the scheduling advice'],
     [true, 'ON', 'Eligible delayed games may enter the scheduling advice']].forEach(([on, label, tip]) => {
      const b = el('button', schedulerUi.includeDelayed === on ? 'on' : '', label);
      b.type = 'button';
      b.title = tip;
      b.setAttribute('aria-pressed', schedulerUi.includeDelayed === on ? 'true' : 'false');
      b.addEventListener('click', () => {
        schedulerUi.includeDelayed = on;
        render(state, storage, data, liveNote, diagnostics, schedulerUi);
      });
      delayGroup.appendChild(b);
    });
    strip.appendChild(delayGroup);
    strip.appendChild(el('span', 'lbl', 'Managed Boards'));
    const mbGroup = el('span', 'grp');
    [[false, 'OFF', 'Advisory scheduling without physical board identity (effective capacity only)'],
     [true, 'ON', 'Plan and operate against physical boards you assign explicitly (runtime only)']].forEach(([on, label, tip]) => {
      const b = el('button', schedulerUi.managedBoardsEnabled === on ? 'on' : '', label);
      b.type = 'button';
      b.title = tip;
      b.setAttribute('aria-pressed', schedulerUi.managedBoardsEnabled === on ? 'true' : 'false');
      b.addEventListener('click', () => {
        schedulerUi.managedBoardsEnabled = on;
        // OFF only hides board presentation; the runtime assignments are
        // factual operator state and survive until an explicit release or
        // a protected board-count change. ON in the same session reveals
        // them again.
        if (on && !data.boardRuntime) {
          data.boardRuntime = createManagedBoardRuntime(schedulerUi.boardCount);
        }
        render(state, storage, data, liveNote, diagnostics, schedulerUi);
      });
      mbGroup.appendChild(b);
    });
    strip.appendChild(mbGroup);
    if (schedulerUi.managedBoardsEnabled) {
      const boardGroup = el('span', 'grp');
      boardGroup.appendChild(el('span', 'lbl', 'Boards'));
      for (let n = 1; n <= 6; n++) {
        const b = el('button', schedulerUi.boardCount === n ? 'on' : '', String(n));
        b.type = 'button';
        b.title = n + ' board' + (n === 1 ? '' : 's') + ' available for the plan';
        b.setAttribute('aria-pressed', schedulerUi.boardCount === n ? 'true' : 'false');
        b.addEventListener('click', () => {
          const res = resizeManagedBoards(data.boardRuntime, n);
          if (!res.ok) {
            data.boardNotice = 'Board ' + res.occupiedBoards.join(' and Board ') +
              ' still assigned — RELEASE first, then reduce.';
            return;
          }
          data.boardNotice = null;
          schedulerUi.boardCount = n;
          data.boardRuntime = res.runtime;
          render(state, storage, data, liveNote, diagnostics, schedulerUi);
        });
        boardGroup.appendChild(b);
      }
      strip.appendChild(boardGroup);
      if (data.boardNotice) {
        const notice = el('span', 'hint');
        notice.style.color = 'var(--delayed)';
        notice.textContent = data.boardNotice;
        strip.appendChild(notice);
      }
      // Compact, non-destructive conflict surfacing: an assignment whose
      // game now involves a NOT HERE player is preserved and flagged here
      // (its fixture row is hidden by the factual NOT HERE filter).
      detectManagedBoardConflicts(rtv, { fixtures: data.fixtures, absentIds: state.absentIds }).forEach((c) => {
        const cf = el('span', 'hint');
        cf.style.color = 'var(--delayed)';
        cf.textContent = 'BOARD ' + c.boardNumber + ': assigned game has a NOT HERE player';
        strip.appendChild(cf);
      });
      // Slice 3C: same philosophy for factual marker ownership.
      detectMarkerConflicts(mkr, { absentIds: state.absentIds }).forEach((c) => {
        const cf = el('span', 'hint');
        cf.style.color = 'var(--delayed)';
        cf.textContent = 'MARKER: assigned marker is NOT HERE (game ' + c.gameKey + ')';
        strip.appendChild(cf);
      });
    }
    strip.appendChild(el('span', 'hint', 'Scheduler advice only — factual state is unchanged'));
    overlay.appendChild(strip);

    const main = el('div', 'sssl-main');
    const listPane = el('div', 'sssl-fixtures');
    const rosterPane = el('div', 'sssl-roster');

    const absent = new Set(state.absentIds);
    const shown = applyDisplayFilters(data.fixtures, state.division, state.selectedMatchDate, absent);

    if (data.parseFailed) {
      listPane.appendChild(el('div', 'sssl-error', 'Could not parse the DartConnect schedule.\n' + (diagnostics || '')));
    } else if (shown.length === 0) {
      listPane.appendChild(el('div', 'sssl-empty', 'No outstanding fixtures for ' + state.division + '.'));
    }

    /* Slice 3A: scheduler ADVICE above the factual rows. RECOMMENDED is
     * what is actionable now; PROJECTED NEXT is the planner's next
     * projected possibility. Neither is factual match state, neither can
     * start games or mutate anything, and no marker identity is shown:
     * projected marker confidence is a structural rating, not an
     * assignment. */
    let advice = null;
    if (!data.parseFailed && shown.length > 0) {
      try {
        advice = buildSchedulerAdvice(schedulerUi, data, state);
      } catch (e) {
        warn('scheduler advice failed (factual display unaffected):', e);
      }
    }
    if (advice) {
      if (advice.recommended.length > 0) {
        const head = el('div', 'sssl-advicehead');
        head.appendChild(el('span', 'badge', 'RECOMMENDED'));
        head.appendChild(document.createTextNode(
          'start now' + (advice.recommended.length > 1 ? ' · up to ' + advice.recommended.length + ' games' : '') +
          (advice.laterCount > 0 ? ' · ' + advice.laterCount + ' planned later' : '')));
        listPane.appendChild(head);
        advice.recommended.forEach((g, seq) => {
          // RECOMMENDATION SEQUENCE (1..n, follow the actual advice order):
          // presentation metadata in the reserved left-edge slot. It is
          // NOT a physical board number and implies no board mapping —
          // boards remain explicit operator assignment only.
          const row = el('div', 'sssl-advice');
          row.appendChild(el('span', 'mark', String(seq + 1)));
          row.appendChild(el('span', 'pa', g.playerA.name));
          row.appendChild(el('span', 'vs', 'vs'));
          row.appendChild(el('span', 'pb', g.playerB.name));
          if (schedulerUi.managedBoardsEnabled) {
            const assignedBoard = findBoardOwningGame(rtv, g);
            if (assignedBoard) {
              const chip = el('span', 'note');
              chip.appendChild(el('span', 'chip', 'BOARD ' + assignedBoard.boardNumber));
              row.appendChild(chip);
              const rel = el('button', 'sssl-brel', 'RELEASE');
              rel.type = 'button';
              rel.title = 'Unassign this game from Board ' + assignedBoard.boardNumber + ' (the game itself is unchanged)';
              rel.addEventListener('click', () => {
                releaseBoard(rtv, assignedBoard.boardNumber);
                render(state, storage, data, liveNote, diagnostics, schedulerUi);
              });
              row.appendChild(rel);
            } else {
              const ctrl = el('span', 'ctrl');
              ctrl.appendChild(boardSelectEl(rtv, (n) => {
                const res = assignGameToBoard(rtv, g, n, { absentIds: Array.from(absent) });
                if (res.ok) data.boardRuntime = res.runtime;
                render(state, storage, data, liveNote, diagnostics, schedulerUi);
              }));
              row.appendChild(ctrl);
            }
          }
          // Slice 3C marker control: proposed = ADVICE (preselected only);
          // choosing/confirming is the operator's explicit act. Confirmed
          // games show the factual chip + × (duty-only release).
          if (g.confirmedMarkerId != null) {
            const mk = el('span', 'note');
            mk.appendChild(el('span', 'mkchip', 'MARKER ' + markerNameForId(data, g.confirmedMarkerId)));
            mk.title = 'Confirmed factual marker. Use × to release, or the marker dropdown to change.';
            row.appendChild(mk);
            const relMk = el('button', 'sssl-brel', '×');
            relMk.type = 'button';
            relMk.title = 'Release marker duty only (board ownership, factual state and DartConnect are unchanged)';
            relMk.addEventListener('click', () => {
              const res = releaseMarkerFromGame(mkr, g);
              if (res.ok) data.markerRuntime = res.runtime;
              render(state, storage, data, liveNote, diagnostics, schedulerUi);
            });
            row.appendChild(relMk);
          } else {
            const mkCtx = {
              players: data.roster,
              absentIds: Array.from(absent),
              playingPlayerIds: data.fixtures.filter((x) => x.status === 'playing').flatMap((x) => [x.playerA.id, x.playerB.id]).filter((id) => id != null),
              markingPlayerIds: Object.keys(mkr.byMarker).map(Number).filter(Number.isSafeInteger),
              markedGameKeys: mkr.byGame,
              rosterDivisionIds: divRosterIds,
              excludeParticipants: true,
              participantIds: [g.playerA.id, g.playerB.id],
            };
            const sel = markerSelectEl({
              proposedMarkerId: g.proposedMarkerId,
              nameFor: (id) => markerNameForId(data, id),
              context: mkCtx,
              onConfirm: (chosen) => {
                const res = assignMarkerToGame(mkr, g, chosen, {
                  absentIds: mkCtx.absentIds,
                  playingPlayerIds: mkCtx.playingPlayerIds,
                  rosterDivisionIds: divRosterIds,
                  participantIds: [g.playerA.id, g.playerB.id],
                });
                if (res.ok) data.markerRuntime = res.runtime;
                else warn('marker assignment rejected:', res.reason);
                render(state, storage, data, liveNote, diagnostics, schedulerUi);
              },
            });
            const mkWrap = el('span', 'ctrl');
            mkWrap.appendChild(sel);
            row.appendChild(mkWrap);
          }
          listPane.appendChild(row);
        });
      }
      if (advice.projectedNext.length > 0) {
        const pHead = el('div', 'sssl-advicehead projected');
        pHead.appendChild(el('span', 'badge', 'PROJECTED NEXT'));
        pHead.appendChild(document.createTextNode('next projected possibility'));
        listPane.appendChild(pHead);
        const pRow = el('div', 'sssl-advice projected');
        pRow.appendChild(el('span', 'mark', '→'));
        pRow.appendChild(el('span', 'pa', advice.projectedNext[0].playerA.name));
        pRow.appendChild(el('span', 'vs', 'vs'));
        pRow.appendChild(el('span', 'pb', advice.projectedNext[0].playerB.name));
        if (advice.projectedNext.length > 1) {
          pRow.appendChild(el('span', 'proj', '+' + (advice.projectedNext.length - 1) + ' more'));
        }
        listPane.appendChild(pRow);
      }
      const listHead = el('div', 'sssl-advicehead projected');
      listHead.appendChild(el('span', 'badge', 'FIXTURES'));
      listHead.appendChild(document.createTextNode('factual schedule (PLAYING = live)'));
      listPane.appendChild(listHead);
    }

    let lastDate = null;
    let alt = false;
    // Presentation-only collapse state for delayed date groups. Runtime
    // only (per boot, never persisted, never read by the scheduler
    // adapters): toggling hides fixture ROWS visually and nothing else.
    const delayedCollapsed = data.delayedCollapsed || (data.delayedCollapsed = {});
    shown.forEach((f) => {
      const groupKey = f.date || f.dateLabel;
      if (f.dateLabel !== lastDate) {
        lastDate = f.dateLabel;
        alt = false;
        const bar = el('div', 'sssl-datebar');
        if (f.delayed) {
          // Historical/delayed groups are individually collapsible and
          // default to EXPANDED. The current-night group is not collapsible.
          const collapsed = !!delayedCollapsed[groupKey];
          bar.classList.add('collapsible');
          bar.appendChild(el('span', 'fold', collapsed ? '▸' : '▾'));
          bar.appendChild(document.createTextNode(f.dateLabel || 'Unscheduled'));
          bar.appendChild(el('span', 'delayed', 'DELAYED'));
          bar.setAttribute('role', 'button');
          bar.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          bar.title = collapsed ? 'Expand delayed fixtures for this date' : 'Collapse delayed fixtures for this date';
          bar.addEventListener('click', () => {
            delayedCollapsed[groupKey] = !delayedCollapsed[groupKey];
            render(state, storage, data, liveNote, diagnostics, schedulerUi);
          });
        } else {
          bar.appendChild(document.createTextNode(f.dateLabel || 'Unscheduled'));
        }
        listPane.appendChild(bar);
      }
      // Collapsed delayed group: hide these rows visually only.
      if (f.delayed && delayedCollapsed[groupKey]) return;
      const row = el('div', 'sssl-row' + (alt ? ' alt' : '') + (f.status === 'playing' ? ' playing' : ''));
      alt = !alt;
      row.appendChild(el('span', 'sssl-pa', f.playerA.name));
      row.appendChild(el('span', 'sssl-vs', 'vs'));
      row.appendChild(el('span', 'sssl-pb', f.playerB.name));
      if (schedulerUi.managedBoardsEnabled) {
        const assignedBoard = findBoardOwningGame(rtv, f);
        if (assignedBoard) {
          // (Slice 3B board ownership indicator)
          // Factual operator ownership marker on the fixture row itself:
          // it means ONLY "assigned to physical Board N". It is never
          // PLAYING, completion, a DartConnect start or a result, and ×
          // performs the same factual release as every other release path.
          const own = el('span', 'bown');
          own.appendChild(el('span', 'chip', 'BOARD ' + assignedBoard.boardNumber));
          const x = el('button', 'sssl-brel', '×');
          x.type = 'button';
          x.title = 'Release Board ' + assignedBoard.boardNumber + ' (assignment only; the fixture itself is unchanged)';
          x.setAttribute('aria-label', 'Release Board ' + assignedBoard.boardNumber);
          x.addEventListener('click', () => {
            releaseBoard(rtv, assignedBoard.boardNumber);
            render(state, storage, data, liveNote, diagnostics, schedulerUi);
          });
          own.appendChild(x);
          row.appendChild(own);
        } else if (f.status === 'playing') {
          // Reliable DartConnect live rows may be associated with a board.
          const ctrl = el('span', 'bassign-slot');
          ctrl.appendChild(boardSelectEl(rtv, (n) => {
            const res = assignGameToBoard(rtv, f, n, { absentIds: Array.from(absent) });
            if (res.ok) data.boardRuntime = res.runtime;
            render(state, storage, data, liveNote, diagnostics, schedulerUi);
          }));
          row.appendChild(ctrl);
        }
      }
      if (f.status === 'playing') row.appendChild(el('span', 'sssl-playing', '● PLAYING'));
      // Slice 3C: factual marker overlay (right edge). Presence of a
      // confirmed marker never means PLAYING/completion — duty only. It is
      // shown on the row regardless of Managed Boards and regardless of the
      // game's live state; × releases the duty only.
      // Factual marker visibility rules (visual-noise reduction):
      //  - confirmed marker: ALWAYS shown (FACT beats ADVICE), any state;
      //  - unmarked PLAYING rows: assignment slot offered (reliably
      //    identified live games are operator-actionable);
      //  - unmarked waiting rows: only when board-assigned (board-first
      //    workflow) or currently actionable advice (proposal preselect).
      //  - ordinary waiting rows: NO marker control — clean list.
      const fMarkerId = findMarkerForGame(mkr, f);
      const adviceFor = (advice && advice.recommended.find((g) => markerGameKey(g) === markerGameKey(f))) || null;
      const showMarkerControl = fMarkerId != null || f.status === 'playing' ||
        findBoardOwningGame(rtv, f) != null || adviceFor != null;
      if (fMarkerId != null) {
        const mkOwn = el('span', 'mkown');
        mkOwn.appendChild(el('span', 'mkchip', 'MARKER ' + markerNameForId(data, fMarkerId)));
        const mkX = el('button', 'sssl-brel', '×');
        mkX.type = 'button';
        mkX.title = 'Release marker duty only (board ownership, PLAYING and factual state are unchanged)';
        mkX.setAttribute('aria-label', 'Release marker ' + markerNameForId(data, fMarkerId));
        mkX.addEventListener('click', () => {
          const res = releaseMarkerFromGame(mkr, f);
          if (res.ok) data.markerRuntime = res.runtime;
          render(state, storage, data, liveNote, diagnostics, schedulerUi);
        });
        mkOwn.appendChild(mkX);
        row.appendChild(mkOwn);
      } else if (showMarkerControl) {
        const mkCtx = {
          players: data.roster,
          absentIds: Array.from(absent),
          playingPlayerIds: data.fixtures.filter((x) => x.status === 'playing').flatMap((x) => [x.playerA.id, x.playerB.id]).filter((id) => id != null),
          markingPlayerIds: Object.keys(mkr.byMarker).map(Number).filter(Number.isSafeInteger),
          markedGameKeys: mkr.byGame,
          rosterDivisionIds: divRosterIds,
          excludeParticipants: true,
          participantIds: [f.playerA.id, f.playerB.id],
        };
        const sel = markerSelectEl({
          proposedMarkerId: adviceFor ? adviceFor.proposedMarkerId : null,
          nameFor: (id) => markerNameForId(data, id),
          context: mkCtx,
          onConfirm: (chosen) => {
            const res = assignMarkerToGame(mkr, f, chosen, {
              absentIds: mkCtx.absentIds,
              playingPlayerIds: mkCtx.playingPlayerIds,
              rosterDivisionIds: divRosterIds,
              participantIds: [f.playerA.id, f.playerB.id],
            });
            if (res.ok) data.markerRuntime = res.runtime;
            else warn('marker assignment rejected:', res.reason);
            render(state, storage, data, liveNote, diagnostics, schedulerUi);
          },
        });
        const slot = el('span', 'mkslot');
        slot.appendChild(sel);
        row.appendChild(slot);
      }
      row.title = [f.dateLabel, f.roundLabel, f.sessionLabel].filter(Boolean).join(' · ');
      listPane.appendChild(row);
    });

    rosterPane.appendChild(el('div', 'sssl-rhead', 'NOT HERE'));
    const roster = data.roster.filter((p) => p.division === state.division);
    roster.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    // Slice 3C: informational factual delayed backlog (N) + remaining
    // catch-up allowance (R) per player. N is derived purely from fixture
    // data; R is runtime state the operator may override per player.
    const backlog = getDelayedBacklogByPlayer(data.fixtures);
    const delayRt = data.delayedAllowanceRuntime;
    const rowWrap = el('div', 'sssl-playerwrap');
    roster.forEach((p) => {
      const rowWrapItem = el('div', 'sssl-playerrow');
      const n = getDelayedOutstandingCount(backlog, p.id);
      const r = getRemainingDelayedAllowance(delayRt, p.id);
      const b = el('button', 'sssl-player' + (absent.has(p.id) ? ' absent' : ''), p.name);
      b.type = 'button';
      b.title = absent.has(p.id) ? 'Click to mark present' : 'Click to mark Not Here';
      b.addEventListener('click', () => {
        const next = new Set(state.absentIds);
        if (next.has(p.id)) next.delete(p.id);
        else next.add(p.id);
        state.absentIds = Array.from(next);
        saveState(storage, state, data.storeKey);
        render(state, storage, data, liveNote, diagnostics, activeSchedulerUi);
      });
      rowWrapItem.appendChild(b);
      if (n > 0) {
        // (N/R): hidden entirely when N = 0. The allowance number is an
        // interactive override, clamped by the domain core to 0..N.
        const dWrap = el('span', 'dallow');
        dWrap.appendChild(document.createTextNode('(' + n + '/'));
        const rSel = document.createElement('select');
        rSel.className = 'sssl-rsel';
        rSel.setAttribute('aria-label', 'Delayed catch-up allowance for ' + p.name);
        // Discoverability (presentation only): a permanent caret glyph is
        // overlaid on the select's right edge. It is NOT an <option> (it
        // would be invisible on a closed select and could never be picked);
        // it is a pointer-events:none span, so clicks land on the select.
        // Discoverability: options stay 0..N (spec: retain 0..N). The
        // native select keeps its native dropdown arrow in the open list;
        // the overlaid .dcaret glyph marks it interactive when closed.
        for (let v = 0; v <= n; v++) {
          const opt = document.createElement('option');
          opt.value = String(v);
          opt.textContent = String(v);
          if (v === r) opt.selected = true;
          rSel.appendChild(opt);
        }
        rSel.title = 'Delayed: outstanding / remaining tonight';
        rSel.addEventListener('click', (e) => e.stopPropagation());
        rSel.addEventListener('change', () => {
          const chosen = parseInt(rSel.value, 10);
          if (!Number.isSafeInteger(chosen)) return; // never feed NaN to the domain
          const res = setRemainingDelayedAllowance(delayRt, p.id, chosen, backlog);
          if (res.ok) {
            data.delayedAllowanceRuntime = res.runtime;
            render(state, storage, data, liveNote, diagnostics, schedulerUi); // global re-plan
          }
        });
        dWrap.appendChild(rSel);
        // Permanent visible affordance on the select's right edge. NOT an
        // <option> (that would be invisible when closed and could be picked);
        // a pointer-events:none span inside a relative wrapper, so clicks on
        // the glyph land on the select and the caret tracks every scale.
        const rWrap = el('span', 'rwrap');
        rWrap.appendChild(rSel);
        rWrap.appendChild(el('span', 'dcaret', '\u25be'));
        dWrap.appendChild(rWrap);
        dWrap.appendChild(document.createTextNode(')'));
        rowWrapItem.appendChild(dWrap);
      }
      rowWrap.appendChild(rowWrapItem);
    });
    while (rowWrap.firstChild) rosterPane.appendChild(rowWrap.firstChild);
    const clear = el('button', 'sssl-btn', 'Clear Not Here');
    clear.type = 'button';
    clear.style.marginTop = '8px';
    clear.addEventListener('click', () => {
      state.absentIds = [];
      saveState(storage, state);
      render(state, storage, data, liveNote, diagnostics, activeSchedulerUi);
    });
    rosterPane.appendChild(clear);
    if (liveNote) {
      const noteEl = el('div', 'sssl-note', liveNote);
      if (currentLiveTitle) noteEl.title = currentLiveTitle;
      rosterPane.appendChild(noteEl);
    }

    main.appendChild(listPane);
    main.appendChild(rosterPane);
    overlay.appendChild(main);
    document.documentElement.appendChild(overlay);
    overlay._ssslStyle = style;
  }

  function closeOverlay() {
    const prev = document.getElementById('sssl-match-night');
    if (prev) {
      if (prev._ssslStyle && prev._ssslStyle.parentNode) prev._ssslStyle.parentNode.removeChild(prev._ssslStyle);
      if (prev.parentNode) prev.parentNode.removeChild(prev);
    } else {
      Array.prototype.forEach.call(document.querySelectorAll('style'), (s) => {
        if (s.textContent && s.textContent.indexOf('.sssl-overlay') !== -1 && s.parentNode) {
          s.parentNode.removeChild(s);
        }
      });
    }
  }

  function diagnosticsText(info) {
    const lines = Object.keys(info.rosterCounts || {}).map((div) => div + ' roster: ' + info.rosterCounts[div]);
    return lines.concat([
      'Player links found: ' + info.playerLinks,
      'Fixture candidates found: ' + info.candidates,
      'Fixtures parsed: ' + info.parsed,
      'Delayed: ' + info.delayed,
      'Duplicates removed: ' + info.duplicates,
    ]).join('\n');
  }

  /* ============================== 8. Boot ============================== */

  function isSchedulePage(loc) {
    if (!loc || loc.hostname !== 'my.dartconnect.com') return false;
    return parseLeagueContext(loc.pathname || '') !== null;
  }

  /** Expand collapsed postponed date groups, then resolve when settled. */
  function expandPostponedGroups(doc) {
    const toggles = Array.prototype.slice.call(doc.querySelectorAll(KNOWN_SELECTORS.postponedToggle));
    let expanded = 0;
    toggles.forEach((t) => {
      if (t.getAttribute('aria-expanded') === 'false') {
        try { t.click(); expanded += 1; } catch (e) { warn('postponed toggle click failed:', e); }
      }
    });
    log('postponed toggles expanded:', expanded);
    return new Promise((resolve) => {
      if (expanded === 0) { resolve(); return; }
      let waited = 0;
      const timer = setInterval(() => {
        waited += 400;
        const stillClosed = doc.querySelectorAll(KNOWN_SELECTORS.postponedToggle + '[aria-expanded="false"]').length;
        if (stillClosed === 0 || waited >= 5000) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  }

  function boot(windowObj, doc, storage, transport) {
    // Slice 3A scheduler control state: memory only, defaults every load.
    const schedulerUi = defaultSchedulerUiState();
    // Slice 3B UI scale: presentation preference, persisted independently.
    schedulerUi.zoom = loadUiScale(storage);
    // League identity comes from the schedule page URL (V1.1 LeagueContext).
    // boot only runs on schedule pages, so this is non-null in practice.
    const league = parseLeagueContext(windowObj && windowObj.location && windowObj.location.href);
    migrateLegacyState(storage, league);
    const storeKey = league ? storageKeyForLeague(league) : null;
    const state = loadState(storage, [], storeKey);
    state.theme = defaultTheme(state.theme, systemPrefersDark());
    log('state restored:', state.division, '| absent:', state.absentIds.length);
    const data = { fixtures: [], roster: [], divisions: [], parseFailed: false, league, storeKey };
    const info = {
      rosterCounts: {}, playerLinks: 0,
      candidates: 0, parsed: 0, delayed: 0, duplicates: 0,
    };
    try {
      const html = doc.documentElement.outerHTML;
      const props = extractDataPageProps(html);
      const roster = parseRosterFromProps(props, league);
      roster.warnings.forEach(warnOnce);
      data.roster = roster.players;
      data.divisions = discoverDivisions(props);
      // Re-validate the saved division against discovered divisions; fall
      // back to the first discovered division (preserves valid SStaff state).
      if (data.divisions.indexOf(state.division) === -1) {
        state.division = data.divisions.length ? data.divisions[0] : '';
        saveState(storage, state, data.storeKey);
      }
      data.divisions.forEach((div) => {
        info.rosterCounts[div] = roster.players.filter((p) => p.division === div).length;
      });
      info.playerLinks = roster.players.length;
      const parsed = parseFixturesFromProps(props, data.divisions);
      parsed.warnings.forEach(warnOnce);
      info.candidates = parsed.fixtures.length;
      const deduped = dedupeFixtures(parsed.fixtures);
      info.duplicates = deduped.removed;
      data.fixtures = sortFixtures(deduped.fixtures);
      info.parsed = data.fixtures.length;
      info.delayed = data.fixtures.filter((f) => f.delayed).length;
      data.availableDates = distinctMatchDates(data.fixtures);
      data.dateLabels = {};
      data.fixtures.forEach((f) => {
        if (f.date && !data.dateLabels[f.date] && f.dateLabel) data.dateLabels[f.date] = f.dateLabel;
      });
      state.selectedMatchDate = resolveMatchDate(data.availableDates, state.selectedMatchDate, todayLocalIso());
      saveState(storage, state);
      lastInfo = {
        version: VERSION,
        leagueCode: league ? league.leagueCode : null,
        leagueId: league ? league.leagueId : null,
        scheduleUrl: league ? league.scheduleUrl : null,
        storageKey: storeKey,
        selectedDivision: state.division,
        discoveredDivisions: data.divisions.slice(),
        rosterCounts: Object.assign({}, info.rosterCounts),
        totalFixtures: info.parsed,
        fixturesByDivision: {},
        unknownFixtureDivisions: parsed.skipped ? parsed.skipped.unknownDivision : 0,
        delayedFixtureCount: info.delayed,
        duplicateCountRemoved: info.duplicates,
        selectedMatchDate: state.selectedMatchDate,
        availableMatchDates: data.availableDates.slice(),
        fixturesWithinSelectedDate: withinSelectedDate(data.fixtures, state.selectedMatchDate).length,
      };
      data.divisions.forEach((div) => {
        lastInfo.fixturesByDivision[div] = data.fixtures.filter((f) => f.division === div).length;
      });
      lastInfo.fixturesCopy = data.fixtures.map((f) => JSON.parse(JSON.stringify(f)));
      lastInfo.rosterCopy = data.roster.map((p) => ({ id: p.id, name: p.name, division: p.division }));
      log('divisions:', JSON.stringify(data.divisions),
        '| roster:', JSON.stringify(info.rosterCounts),
        '| fixtures:', info.parsed, '| delayed:', info.delayed,
        '| dupes:', info.duplicates, '| skipped:', JSON.stringify(parsed.skipped || {}));
      if (roster.players.length === 0 && data.fixtures.length === 0) {
        data.parseFailed = true;
      }
    } catch (e) {
      data.parseFailed = true;
      err('parse exception:', e);
    }

    render(state, storage, data, 'Live detection: checking Match Center…', diagnosticsText(info), schedulerUi);
    activeSchedulerUi = schedulerUi;

    // Live engine: initial check now, then conservative polling. The core
    // UI is already rendered; live updates only flip fixture status.
    const live = {
      source: 'none', lastChecked: null, requestStatus: 0, rowsFound: 0,
      parsed: 0, playing: 0, ambiguous: [], unmatched: [], rejected: [],
      endpointUsed: '', responseShape: '', recordsReceived: 0, consideredLive: 0,
      statusCounts: {}, attempts: [],
      normalized: [], error: null, liveOk: false, failed: false, fallback: false,
    };
    lastInfo.liveSource = live.source;
    lastInfo.liveLastChecked = live.lastChecked;
    lastInfo.liveRequestStatus = live.requestStatus;
    lastInfo.liveRowsFound = live.rowsFound;
    lastInfo.liveMatchesParsed = live.parsed;
    lastInfo.playingFixtureCount = live.playing;
    lastInfo.ambiguousLiveMatches = live.ambiguous;
    lastInfo.unmatchedLiveMatches = live.unmatched;
    lastInfo.liveRejectedRecords = live.rejected;
    lastInfo.liveStatusCounts = live.statusCounts;
    lastInfo.liveAttempts = live.attempts;
    lastInfo.liveEndpointUsed = live.endpointUsed;
    lastInfo.liveHttpStatus = live.requestStatus;
    lastInfo.liveResponseShape = live.responseShape;
    lastInfo.liveRecordsReceived = live.recordsReceived;
    lastInfo.liveRecordsConsideredLive = live.consideredLive;
    lastInfo.liveNormalizedRecords = live.normalized;
    lastInfo.liveError = live.error;
    lastInfo.liveOk = live.liveOk;
    const liveCtx = {
      state, storage, data, transport, live, league,
      rerender: (note) => {
        lastInfo.liveSource = live.source;
        lastInfo.liveLastChecked = live.lastChecked;
        lastInfo.liveRequestStatus = live.requestStatus;
        lastInfo.liveRowsFound = live.rowsFound;
        lastInfo.liveMatchesParsed = live.parsed;
        lastInfo.playingFixtureCount = live.playing;
        lastInfo.ambiguousLiveMatches = live.ambiguous;
        lastInfo.unmatchedLiveMatches = live.unmatched;
        lastInfo.liveRejectedRecords = live.rejected;
    lastInfo.liveStatusCounts = live.statusCounts;
    lastInfo.liveAttempts = live.attempts;
        lastInfo.liveEndpointUsed = live.endpointUsed;
        lastInfo.liveHttpStatus = live.requestStatus;
        lastInfo.liveResponseShape = live.responseShape;
        lastInfo.liveRecordsReceived = live.recordsReceived;
        lastInfo.liveRecordsConsideredLive = live.consideredLive;
        lastInfo.liveNormalizedRecords = live.normalized;
        lastInfo.liveError = live.error;
        lastInfo.liveOk = live.liveOk;
        lastInfo.selectedDivision = state.division;
        lastInfo.selectedMatchDate = state.selectedMatchDate;
        render(state, storage, data, note, diagnosticsText(info), activeSchedulerUi);
      },
    };
    // Division/date changes re-check live state against the new candidate set.
    liveCtx.refreshOnFilterChange = () => { refreshLive(liveCtx); };
    activeLiveCtx = liveCtx;
    refreshLive(liveCtx);
    startLivePolling(liveCtx);
  }

  function start() {
    if (!isSchedulePage(window.location)) {
      log('not the schedule page; idle.');
      return;
    }
    expandPostponedGroups(document).then(() => {
      boot(window, document, window.localStorage, typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
    });
  }

  /* ============================== 9. Exports ============================== */

  const api = {
    VERSION,
    THEME_KEY,
    SCALE_KEY,
    storageKeyForLeague,
    migrateLegacyState,
    discoverDivisions,
    parsePlayerIdFromHref,
    filterRosterForDivision,
    abbreviateName,
    pairKey,
    sortFixtures,
    dedupeFixtures,
    visibleFixtures,
    distinctMatchDates,
    todayLocalIso,
    defaultMatchDate,
    resolveMatchDate,
    withinSelectedDate,
    applyDisplayFilters,
    tvApiUrl,
    matchCentreUrl,
    apiPost,
    LEAGUE_POST_BODY,
    parseLeagueContext,
    normalizeApiRecord,
    collectApiRecords,
    isLiveRecord,
    unflipName,
    summarizeJsonShape,
    safeRecord,
    diagnoseLiveMatch,
    tallyReasons,
    matchLiveRecords,
    matchLiveFixtures,
    fetchLiveState,
    refreshLive,
    liveNoteText,
    parseDateLabel: parseDateValue,
    defaultState,
    loadState,
    saveState,
    defaultTheme,
    systemPrefersDark,
    extractDataPageProps,
    findDivisionRosters,
    parseRosterFromProps,
    findMatchGroups,
    parseFixturesFromProps,
    parseRoundNumber,
    parseSessionNumber,
    parseDateValue,
    diagnosticsText,
    PLAYER_STATES,
    GAME_TYPES,
    GAME_STATUSES,
    MARKER_IMPACTS,
    BOARD_STATUSES,
    createBoard,
    createInitialBoards,
    classifyGameType,
    createNightSession,
    derivePlayerStates,
    rankPlayableGames,
    getPlayableGames,
    evaluateMarkerImpact,
    recommendNextGames,
    applyGameStarted,
    applyGameCompleted,
    applyUnexpectedActiveGame,
    rejectDelayedGame,
    SCHEDULING_STRATEGIES,
    PROJECTED_MARKER_CONFIDENCE,
    REASON_CODES,
    getCompatibleCandidateSets,
    evaluateSetRobustness,
    evaluatePlayerBottlenecks,
    evaluateProjectedMarkerConfidence,
    evaluateDelayedGameImpact,
    getProjectedRunningOrder,
    defaultSchedulerUiState,
    buildNightSession,
    buildSchedulerAdvice,
    MANAGED_BOARD_UNASSIGNED,
    MAX_MANAGED_BOARDS,
    boardKeyForGame,
    createManagedBoardRuntime,
    findBoardOwningGame,
    getAvailableManagedBoards,
    assignGameToBoard,
    releaseBoard,
    resizeManagedBoards,
    detectManagedBoardConflicts,
    createMarkerRuntime,
    markerGameKey,
    findMarkerForGame,
    findGameMarkedByPlayer,
    getEligibleMarkerCandidates,
    assignMarkerToGame,
    changeMarkerForGame,
    releaseMarkerFromGame,
    detectMarkerConflicts,
    markerSelectEl,
    DEFAULT_DELAYED_CATCHUP_ALLOWANCE,
    getDelayedBacklogByPlayer,
    createDelayedAllowanceRuntime,
    getDelayedOutstandingCount,
    getRemainingDelayedAllowance,
    setRemainingDelayedAllowance,
    canScheduleDelayedFixture,
    consumeDelayedAllowance,
    getConsumedDelayedGameKeys,
    UI_SCALE_VALUES,
    UI_SCALE_DEFAULT,
    normalizeUiScale,
    previousUiScale,
    nextUiScale,
    parseStoredUiScale,
    fitUiScale,
    loadUiScale,
    saveUiScale,
  };

  api.getDiagnostics = function () {
    const base = lastInfo || {
      version: VERSION, selectedDivision: null, rosterCounts: null,
      totalFixtures: null, fixturesByDivision: null, delayedFixtureCount: null,
      duplicateCountRemoved: null, selectedMatchDate: null,
      availableMatchDates: null, fixturesWithinSelectedDate: null,
    };
    base.parseWarnings = parseWarnings.slice();
    base.getFixtures = function () {
      return (lastInfo && lastInfo.fixturesCopy) || null;
    };
    base.getRoster = function () {
      return (lastInfo && lastInfo.rosterCopy) || null;
    };
    return base;
  };

  // Tampermonkey runs userscripts in an isolated world: the sandbox
  // `window` above is NOT the page window the operator sees in DevTools.
  // Expose the read-only diagnostics API on the real page window so
  // window.__matchNightSingles.getDiagnostics() works from the console.
  // The legacy __ssslMatchNight alias is retained (diagnostics only).
  if (typeof window !== 'undefined') {
    window.__matchNightSingles = api;
    window.__ssslMatchNight = api;
  }
  try {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow !== window) {
      unsafeWindow.__matchNightSingles = api;
      unsafeWindow.__ssslMatchNight = api;
    }
  } catch (e) {
    warn('page-window diagnostics exposure unavailable:', e);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})();

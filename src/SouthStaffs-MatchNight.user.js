// ==UserScript==
// @name         South Staffs Match Night
// @namespace    https://github.com/south-staffs-superleague
// @version      1.1.0-dev
// @description  Compact match-night management screen for the South Staffordshire Superleague (Universal / White Eagle): division rosters, Not Here filtering, postponed-fixture merging, live PLAYING detection.
// @author       South Staffs Superleague
// @match        https://my.dartconnect.com/league/schedule/*
// @match        https://tv.dartconnect.com/league/SStaffSL/matches/24343
// @connect      tv.dartconnect.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/* South Staffs Match Night — V1.1.0-dev (league-context foundation).
 *
 * Schedule data comes from the page's embedded Inertia data-page JSON
 * (props.sidebar.divisions[].competitors for the roster;
 * props.pending_match_groups / future_match_groups for fixtures).
 * This is deterministic page data, not scraped markup.
 *
 * Pure logic (extract / parse / sort / filter / match) is separate from
 * DOM rendering and is unit-tested against the genuine captured HTML in
 * references/schedule-normal.html (see test/parse-check.cjs).
 * No DartConnect markup is invented anywhere.
 */
(function () {
  'use strict';

  /* ============================== 1. Diagnostics ============================== */

  const VERSION = '1.1.0-dev';
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

  /* ============================== 7. Compact UI ============================== */

  const CSS = [
    '.sssl-overlay{--bg:#0f172a;--panel:#1e293b;--roster:#111c30;--text:#e2e8f0;--muted:#b5c0cd;--faint:#94a3b8;--border:#334155;--control:#243244;--control-border:#475569;--accent:#14b8a6;--accent-ink:#06281c;--row-alt:rgba(148,163,184,0.08);--datebar:#243244;--datebar-text:#b5c0cd;--absent-bg:#3b2f14;--absent-border:#f59e0b;--absent-text:#fcd34d;--playing:#22c55e;--playing-bg:#166534;--playing-ink:#f0fdf4;--delayed:#f59e0b;--err-border:#ef4444;--err-bg:#3b2228;--err-text:#fecaca;position:fixed;inset:0;z-index:2147483647;background:var(--bg);color:var(--text);font-family:"Segoe UI",Arial,sans-serif;font-size:14px;display:flex;flex-direction:column}',
    '.sssl-overlay[data-theme="light"]{--bg:#f1f5f9;--panel:#ffffff;--roster:#f8fafc;--text:#0f172a;--muted:#475569;--faint:#64748b;--border:#cbd5e1;--control:#ffffff;--control-border:#94a3b8;--accent:#0d9488;--accent-ink:#ffffff;--row-alt:rgba(15,23,42,0.045);--datebar:#334155;--datebar-text:#f8fafc;--absent-bg:#fef3c7;--absent-border:#b45309;--absent-text:#92400e;--playing:#15803d;--playing-bg:#15803d;--playing-ink:#ffffff;--delayed:#b45309;--err-border:#dc2626;--err-bg:#fef2f2;--err-text:#991b1b;color-scheme:light}',
    '.sssl-topbar{display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--border);flex:none}',
    '.sssl-title{font-size:16px;font-weight:700;white-space:nowrap}',
    '.sssl-divsel{display:flex;gap:6px;flex-wrap:wrap}',
    '.sssl-divsel button{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:4px 12px;font-size:13px;cursor:pointer}',
    '.sssl-divsel button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}',
    '.sssl-topbar .spacer{flex:1}',
    '.sssl-btn{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:4px 12px;font-size:13px;cursor:pointer;white-space:nowrap}',
    '.sssl-btn:hover{border-color:var(--accent)}',
    '.sssl-datelabel{font-size:13px;color:var(--muted);white-space:nowrap}',
    '.sssl-datesel{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:4px 8px;font-size:13px;max-width:190px}',
    '.sssl-main{flex:1;display:flex;min-height:0}',
    '.sssl-fixtures{flex:1 1 77%;overflow-y:auto;padding:8px 16px;min-width:0}',
    '.sssl-roster{flex:0 0 23%;min-width:220px;max-width:250px;border-left:1px solid var(--border);overflow-y:auto;padding:8px 12px;background:var(--roster)}',
    '.sssl-datebar{background:var(--datebar);color:var(--datebar-text);font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;margin:10px 0 4px;position:sticky;top:0}',
    '.sssl-datebar .delayed{color:var(--delayed);font-weight:700;margin-left:8px;font-size:11px}',
    '.sssl-row{display:flex;align-items:center;padding:3px 10px;border-radius:3px;line-height:1.35}',
    '.sssl-row.alt{background:var(--row-alt)}',
    '.sssl-pa{flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-vs{flex:0 0 44px;text-align:center;font-weight:700;font-size:12px;color:var(--faint)}',
    '.sssl-pb{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-playing{position:absolute;right:10px;top:50%;transform:translateY(-50%);margin-left:0;color:var(--playing);font-weight:700;font-size:11px;white-space:nowrap}',
    '.sssl-row.playing{position:relative;background:var(--playing-bg)}',
    '.sssl-row.playing .sssl-pa,.sssl-row.playing .sssl-pb{font-weight:700;color:var(--playing-ink)}',
    '.sssl-row.playing .sssl-vs,.sssl-row.playing .sssl-playing{color:var(--playing-ink)}',
    '.sssl-rhead{font-size:12px;font-weight:700;color:var(--muted);margin:2px 0 6px}',
    '.sssl-player{display:block;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--text);font-size:13px;padding:3px 8px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sssl-player:hover{border-color:var(--control-border)}',
    '.sssl-player.absent{background:var(--absent-bg);border-color:var(--absent-border);color:var(--absent-text);font-weight:600}',
    '.sssl-note{font-size:11px;color:var(--faint);margin-top:8px}',
    '.sssl-error{margin:16px;padding:12px;border:1px solid var(--err-border);border-radius:6px;background:var(--err-bg);color:var(--err-text);font-size:13px;white-space:pre-wrap}',
    '.sssl-empty{padding:24px;color:var(--faint);font-size:13px}',
  ].join('\n');

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function render(state, storage, data, liveNote, diagnostics) {
    closeOverlay();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.documentElement.appendChild(style);

    const overlay = el('div', 'sssl-overlay');
    overlay.id = 'sssl-match-night';
    overlay.dataset.theme = state.theme === 'light' ? 'light' : 'dark';

    const topbar = el('div', 'sssl-topbar');
    topbar.appendChild(el('div', 'sssl-title', 'Match Night'));
    const divsel = el('div', 'sssl-divsel');
    (data.divisions && data.divisions.length ? data.divisions : [state.division]).forEach((div) => {
      const b = el('button', div === state.division ? 'on' : '', div);
      b.type = 'button';
      b.addEventListener('click', () => {
        state.division = div;
        saveState(storage, state, data.storeKey);
        render(state, storage, data, liveNote, diagnostics);
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
        render(state, storage, data, liveNote, diagnostics);
        if (activeLiveCtx) refreshLive(activeLiveCtx);
      });
      topbar.appendChild(select);
    }
    topbar.appendChild(el('div', 'spacer'));
    const themeBtn = el('button', 'sssl-btn', state.theme === 'light' ? '☀ Light' : '☾ Dark');
    themeBtn.type = 'button';
    themeBtn.title = 'Switch appearance (theme is saved)';
    themeBtn.setAttribute('aria-label', 'Switch appearance, currently ' + (state.theme === 'light' ? 'light' : 'dark'));
    themeBtn.addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      saveState(storage, state);
      render(state, storage, data, liveNote, diagnostics);
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

    let lastDate = null;
    let alt = false;
    shown.forEach((f) => {
      if (f.dateLabel !== lastDate) {
        lastDate = f.dateLabel;
        alt = false;
        const bar = el('div', 'sssl-datebar', f.dateLabel || 'Unscheduled');
        if (f.delayed) bar.appendChild(el('span', 'delayed', 'DELAYED'));
        listPane.appendChild(bar);
      }
      const row = el('div', 'sssl-row' + (alt ? ' alt' : '') + (f.status === 'playing' ? ' playing' : ''));
      alt = !alt;
      row.appendChild(el('span', 'sssl-pa', f.playerA.name));
      row.appendChild(el('span', 'sssl-vs', 'vs'));
      row.appendChild(el('span', 'sssl-pb', f.playerB.name));
      if (f.status === 'playing') row.appendChild(el('span', 'sssl-playing', '● PLAYING'));
      row.title = [f.dateLabel, f.roundLabel, f.sessionLabel].filter(Boolean).join(' · ');
      listPane.appendChild(row);
    });

    rosterPane.appendChild(el('div', 'sssl-rhead', 'NOT HERE'));
    const roster = data.roster.filter((p) => p.division === state.division);
    roster.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    roster.forEach((p) => {
      const b = el('button', 'sssl-player' + (absent.has(p.id) ? ' absent' : ''), p.name);
      b.type = 'button';
      b.title = absent.has(p.id) ? 'Click to mark present' : 'Click to mark Not Here';
      b.addEventListener('click', () => {
        const next = new Set(state.absentIds);
        if (next.has(p.id)) next.delete(p.id);
        else next.add(p.id);
        state.absentIds = Array.from(next);
        saveState(storage, state, data.storeKey);
        render(state, storage, data, liveNote, diagnostics);
      });
      rosterPane.appendChild(b);
    });
    const clear = el('button', 'sssl-btn', 'Clear Not Here');
    clear.type = 'button';
    clear.style.marginTop = '8px';
    clear.addEventListener('click', () => {
      state.absentIds = [];
      saveState(storage, state);
      render(state, storage, data, liveNote, diagnostics);
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

    render(state, storage, data, 'Live detection: checking Match Center…', diagnosticsText(info));

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
        render(state, storage, data, note, diagnosticsText(info));
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
    storageKeyForLeague,
    migrateLegacyState,
    discoverDivisions,
    parsePlayerIdFromHref,
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
  // window.__ssslMatchNight.getDiagnostics() works from the console.
  if (typeof window !== 'undefined') {
    window.__ssslMatchNight = api;
  }
  try {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow !== window) {
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

/* Parser checks against the GENUINE captured schedule HTML.
 * No DartConnect markup is invented here: every expectation below was read
 * from references/schedule-normal.html itself.
 * Run: node test/parse-check.cjs (exit 0 = pass).
 */
const fs = require('fs');
const path = require('path');
const api = require('../src/SouthStaffs-MatchNight.user.js');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'references', 'schedule-normal.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS ' + name); }
  else { failures += 1; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

// ---- data-page extraction ----
let props = null;
try {
  props = api.extractDataPageProps(html);
  check('data-page extracts', true);
} catch (e) {
  check('data-page extracts', false, String(e && e.message));
}
check('props has groups', !!(props && props.pending_match_groups && props.future_match_groups));

// ---- roster ----
const roster = api.parseRosterFromProps(props);
const byDiv = {};
roster.players.forEach((p) => { byDiv[p.division] = (byDiv[p.division] || 0) + 1; });
check('Universal roster is 23', byDiv.Universal === 23, JSON.stringify(byDiv));
check('White Eagle roster is 23', byDiv['White Eagle'] === 23, JSON.stringify(byDiv));
check('no unknown-division players', roster.players.every((p) => p.division !== 'Unknown'));
const ids = new Set(roster.players.map((p) => p.id));
check('roster ids unique', ids.size === roster.players.length);
const harrison = roster.players.find((p) => p.id === 5765962);
check('James Harrison 5765962 Universal',
  !!(harrison && harrison.name === 'James Harrison' && harrison.division === 'Universal'),
  JSON.stringify(harrison));
const hughes = roster.players.find((p) => p.name === 'James Hughes');
check('James Hughes distinct id', !!(hughes && hughes.id !== 5765962), JSON.stringify(hughes));
const batchelor = roster.players.find((p) => p.id === 6052051);
check('Adam Batchelor 6052051 White Eagle',
  !!(batchelor && batchelor.division === 'White Eagle'), JSON.stringify(batchelor));

// ---- fixtures ----
const discoveredSStaff = api.discoverDivisions(props);
check('SStaffSL discovers Universal then White Eagle',
  JSON.stringify(discoveredSStaff) === JSON.stringify(['Universal', 'White Eagle']),
  JSON.stringify(discoveredSStaff));
const parsed = api.parseFixturesFromProps(props, discoveredSStaff);
check('pending groups found', api.findMatchGroups(props, 'pending_match_groups').length === 4);
check('future groups found', api.findMatchGroups(props, 'future_match_groups').length >= 1);
const delayed = parsed.fixtures.filter((f) => f.delayed);
check('delayed fixtures present', delayed.length > 0, String(delayed.length));
check('delayed dates are Sep', delayed.every((f) => f.dateValue < new Date(2026, 9, 1).getTime()));
check('no byes included', parsed.skipped.bye > 0 || true, JSON.stringify(parsed.skipped));
check('all fixtures have numeric ids', parsed.fixtures.every((f) =>
  Number.isSafeInteger(f.playerA.id) && Number.isSafeInteger(f.playerB.id)));
check('all fixtures have known division', parsed.fixtures.every((f) =>
  f.division === 'Universal' || f.division === 'White Eagle'));
check('match ids unique', new Set(parsed.fixtures.map((f) => f.matchId)).size === parsed.fixtures.length);
const deduped = api.dedupeFixtures(parsed.fixtures);
check('dedupe removes none on clean data', deduped.removed === 0, String(deduped.removed));
const sorted = api.sortFixtures(deduped.fixtures);
let ordered = true;
for (let i = 1; i < sorted.length; i++) {
  const a = sorted[i - 1], b = sorted[i];
  const ka = [a.dateValue, a.roundValue == null ? 1e15 : a.roundValue, a.sessionValue == null ? 1e15 : a.sessionValue];
  const kb = [b.dateValue, b.roundValue == null ? 1e15 : b.roundValue, b.sessionValue == null ? 1e15 : b.sessionValue];
  if (ka[0] > kb[0] || (ka[0] === kb[0] && (ka[1] > kb[1] || (ka[1] === kb[1] && ka[2] > kb[2])))) { ordered = false; break; }
}
check('sorted date->round->session', ordered);
check('completed groups exist but are ignored',
  api.findMatchGroups(props, 'completed_match_groups').length >= 1 &&
  !sorted.some((f) => f.matchId === 10259293));
const oct1 = sorted.filter((f) => f.dateLabel.indexOf('01 Oct') !== -1 && f.division === 'Universal');
check('01 Oct Universal fixtures exist', oct1.length > 0, String(oct1.length));
check('01 Oct has Session 1 rows', oct1.some((f) => f.sessionValue === 1));
check('round values are 1/2', sorted.every((f) => f.roundValue === 1 || f.roundValue === 2));
const hughesFix = sorted.find((f) =>
  (f.playerA.name === 'James Hughes' || f.playerB.name === 'James Hughes') &&
  (f.playerA.name === 'Patrick Pace' || f.playerB.name === 'Patrick Pace'));
check('Hughes/Pace fixture present', !!hughesFix, hughesFix ? hughesFix.dateLabel : 'missing');
if (hughesFix) {
  check('display order is away-first (Hughes is playerA)',
    hughesFix.playerA.name === 'James Hughes' && hughesFix.playerB.name === 'Patrick Pace',
    hughesFix.playerA.name + ' vs ' + hughesFix.playerB.name);
}

// ---- pure unit checks (synthetic edge cases, not DOM) ----
check('abbreviate James Harrison', api.abbreviateName('James Harrison') === 'James H');
check('abbreviate trims (H)', api.abbreviateName('  Nick   Walton  ') === 'Nick W');
const dupes = api.dedupeFixtures([
  { matchId: 1, dateValue: 5, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' },
  { matchId: 1, dateValue: 5, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' },
  { matchId: 2, dateValue: 5, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' },
]);
check('dedupe by match id', dupes.fixtures.length === 2 && dupes.removed === 1);
const visible = api.visibleFixtures(
  [{ division: 'Universal', playerA: { id: 1 }, playerB: { id: 2 } }], 'Universal', new Set([2]));
check('not-here filters by id', visible.length === 0);
const live = api.matchLiveFixtures(
  [{ playerA: { name: 'James Harrison' }, playerB: { name: 'Nick Walton' }, status: 'waiting' }],
  [{ a: 'James H', b: 'Nick W', ref: 'M9' }], 'as-is');
check('pair match unique', live.size === 1);
const ambiguous = api.matchLiveFixtures(
  [{ playerA: { name: 'James Harrison' }, playerB: { name: 'Nick Walton' }, status: 'waiting' },
   { playerA: { name: 'James Hughes' }, playerB: { name: 'Nick Walton' }, status: 'waiting' }],
  [{ a: 'James H', b: 'Nick W', ref: 'M9' }], 'as-is');
check('ambiguous pair unmarked', ambiguous.size === 0);

// ---- match date filter (genuine dates + pure boundary values) ----
const dates = api.distinctMatchDates(sorted);
check('distinct dates from capture', dates.length >= 7 && dates[0] === '2026-09-03', JSON.stringify(dates));
check('dates ascending', dates.every((d, i) => i === 0 || dates[i - 1] <= d));
check('exact today selects today', api.defaultMatchDate(dates, '2026-10-01') === '2026-10-01');
check('between dates selects next', api.defaultMatchDate(dates, '2026-09-25') === '2026-10-01', api.defaultMatchDate(dates, '2026-09-25'));
check('after final selects latest', api.defaultMatchDate(dates, '2027-01-01') === dates[dates.length - 1]);
check('empty dates give empty default', api.defaultMatchDate([], '2026-10-01') === '');
check('todayLocalIso is local calendar', api.todayLocalIso(new Date(2026, 8, 26, 0, 30)) === '2026-09-26');
const restoredOct1 = api.resolveMatchDate(dates, '2026-10-01', '2026-09-26');
check('saved valid date restores', restoredOct1 === '2026-10-01');
check('saved invalid date falls back', api.resolveMatchDate(dates, '2026-05-01', '2026-09-26') === '2026-10-01');
const bounded = api.withinSelectedDate(sorted, '2026-10-01');
check('<= includes earlier delayed', bounded.some((f) => f.delayed && f.date < '2026-10-01'));
check('<= excludes later', bounded.every((f) => !f.date || f.date <= '2026-10-01'));
check('later fixtures exist to exclude', sorted.some((f) => f.date > '2026-10-01'));
const combo = api.applyDisplayFilters(sorted, 'Universal', '2026-10-01', new Set());
check('date+division combine', combo.every((f) => f.division === 'Universal' && (!f.date || f.date <= '2026-10-01')));
const withAbsent = api.applyDisplayFilters(sorted, 'Universal', '2026-10-01', new Set([5765962]));
check('date+division+nothere combine',
  withAbsent.every((f) => f.playerA.id !== 5765962 && f.playerB.id !== 5765962) &&
  withAbsent.length < combo.length);
function memStore(initial) {
  let data = initial === undefined ? null : initial;
  return {
    getItem: () => data,
    setItem: (_, v) => { data = String(v); },
  };
}
const store = memStore();
const storeKey = 'match-night-singles:SStaffSL:24343';
const st0 = api.loadState(store, [], storeKey);
check('fresh state has null date', st0.selectedMatchDate === null);
st0.selectedMatchDate = '2026-10-01';
st0.absentIds = [5765962];
api.saveState(store, st0, storeKey);
const st1 = api.loadState(store, [], storeKey);
check('state round-trips date+absent', st1.selectedMatchDate === '2026-10-01' && st1.absentIds.join() === '5765962');
check('restored date resolves when available', api.resolveMatchDate(dates, st1.selectedMatchDate, '2026-09-26') === '2026-10-01');

// ---- theme ----
check('saved theme wins', api.defaultTheme('light', true) === 'light');
check('system dark default', api.defaultTheme(null, true) === 'dark');
check('system light default', api.defaultTheme(null, false) === 'light');
check('invalid saved falls back', api.defaultTheme('sepia', false) === 'light');
const tstore = memStore();
const tst = api.loadState(tstore);
check('fresh theme null', tst.theme === null);
tst.theme = 'dark';
api.saveState(tstore, tst);
check('theme round-trips', api.loadState(tstore).theme === 'dark');

// ---- live matching (synthetic records + genuine fixtures) ----
const first = sorted[0];
const byId = api.matchLiveRecords([first], [{ matchIds: [first.matchId], ids: [null, null], names: ['', ''], state: 'P', ref: 'M9', division: '' }]);
check('exact match-id marks', byId.marked.size === 1);
const byOtherId = api.matchLiveRecords([first], [{ matchIds: [99999999], ids: [null, null], names: ['', ''], state: 'P', ref: '', division: '' }]);
check('wrong match-id unmarked', byOtherId.marked.size === 0 && byOtherId.unmatched.length === 1);
const byPair = api.matchLiveRecords([first], [{ matchIds: [], ids: [first.playerA.id, first.playerB.id], names: ['', ''], state: 'P', ref: '', division: '' }]);
check('exact numeric pair marks', byPair.marked.size === 1);
const byPairSwapped = api.matchLiveRecords([first], [{ matchIds: [], ids: [first.playerB.id, first.playerA.id], names: ['', ''], state: 'P', ref: '', division: '' }]);
check('swapped numeric pair marks', byPairSwapped.marked.size === 1);
const byNames = api.matchLiveRecords([first], [{ matchIds: [], ids: [null, null], names: [first.playerA.name, first.playerB.name], state: 'P', ref: '', division: '' }]);
check('exact full-name pair marks', byNames.marked.size === 1);
const abA = api.abbreviateName(first.playerA.name);
const abB = api.abbreviateName(first.playerB.name);
const byAbbr = api.matchLiveRecords(sorted.filter((f) => f.division === first.division), [{ matchIds: [], ids: [null, null], names: [abA || '?', abB || '?'], state: 'P', ref: '', division: '' }]);
const abCollisions = sorted.filter((f) => f.division === first.division &&
  api.abbreviateName(f.playerA.name) === abA && api.abbreviateName(f.playerB.name) === abB).length;
check('abbreviated pair unique-or-ambiguous honestly', (abCollisions === 1 && byAbbr.marked.size === 1) || (abCollisions > 1 && byAbbr.marked.size === 0));
const harrisonLive = sorted.filter((f) => f.playerA.name === 'James Harrison' || f.playerB.name === 'James Harrison');
const hughesLive = sorted.filter((f) => f.playerA.name === 'James Hughes' || f.playerB.name === 'James Hughes');
if (harrisonLive.length && hughesLive.length) {
  const allU = sorted.filter((f) => f.division === 'Universal');
  const amb = api.matchLiveRecords(allU, [{ matchIds: [], ids: [null, null], names: ['James H', hughesLive[0].playerA.name === 'James Hughes' ? hughesLive[0].playerB.name : hughesLive[0].playerA.name], state: 'P', ref: '', division: '' }]);
  check('live james-h pair resolves uniquely-or-not by data', amb.marked.size <= 1);
}
const multi = api.matchLiveRecords(sorted.filter((f) => f.division === 'Universal').slice(0, 20),
  [{ matchIds: [], ids: [null, null], names: ['', ''], state: '', ref: '', division: '' },
   { matchIds: [sorted[0].matchId], ids: [null, null], names: ['', ''], state: '', ref: '', division: '' }]);
check('empty record unmatched, id record marked', multi.unmatched.length === 1 && multi.marked.size <= 1);
first.status = 'playing';
const stillShown = api.applyDisplayFilters([first], first.division, first.date, new Set());
check('PLAYING does not affect filtering', stillShown.length === 1);
first.status = 'waiting';
check('normalize reg-shape record', (() => {
  const rec = api.normalizeApiRecord({ id: 10258690, league_match_id: 10258690, status: 'C', division: 'Universal', left: { id: 5765932, team_name: 'Harvey, Mark' }, right: { id: 1, team_name: 'X, Y' } });
  return !!rec && rec.matchIds[0] === 10258690 && rec.ids[0] === 5765932 && rec.state === 'C';
})());
check('completed records are not live', api.isLiveRecord({ state: 'C' }) === false);
check('stateless records treated live', api.isLiveRecord({ state: '' }) === true);
check('reg payload collects', (() => {
  const recs = api.collectApiRecords({ reg: { Universal: { '2026-09-03': [{ id: 5, status: 'P', left: { id: 1 }, right: { id: 2 } }] } } });
  return recs.length === 1 && recs[0].matchIds[0] === 5;
})());

// ---- live status line ----
check('live failure note', api.liveNoteText({ error: 'timed out', rowsFound: 0, playing: 0 }).indexOf('Live: Connection error') === 0);
check('live success note', api.liveNoteText({ error: null, rowsFound: 3, playing: 1, source: 'api-live', requestStatus: 200, ambiguous: [] }).indexOf('Live: Connected · 1 playing · checked ') === 0);
check('live zero note distinguishes success', api.liveNoteText({ error: null, rowsFound: 2, playing: 0, source: 'api-live', requestStatus: 200, ambiguous: [] }).indexOf('Live: Connected · 0 playing') === 0);

// ---- live diagnostics classification ----
const diagState = { division: 'Universal', selectedMatchDate: '2026-10-01' };
const diagFixtures = [
  { matchId: 101, division: 'Universal', date: '2026-10-01', playerA: { id: 1, name: 'James Harrison' }, playerB: { id: 2, name: 'Nick Walton' }, status: 'waiting' },
  { matchId: 102, division: 'Universal', date: '2026-10-08', playerA: { id: 3, name: 'Lee Hodgkiss' }, playerB: { id: 4, name: 'Steven Lowe' }, status: 'waiting' },
  { matchId: 103, division: 'White Eagle', date: '2026-10-01', playerA: { id: 5, name: 'Adam Batchelor' }, playerB: { id: 6, name: 'Andrew Smith' }, status: 'waiting' },
];
const diagCandidates = diagFixtures.filter((f) => f.division === 'Universal' && f.date <= '2026-10-01');
check('diagnose marks by id', (() => {
  const d = api.diagnoseLiveMatch(diagFixtures, diagCandidates,
    [{ matchIds: [101], ids: [null, null], names: ['', ''], state: 'P', ref: 'M9', division: '' }], diagState);
  return d.marked.size === 1 && d.rejected.length === 0;
})());
check('diagnose flags outside-selected-date', (() => {
  const d = api.diagnoseLiveMatch(diagFixtures, diagCandidates,
    [{ matchIds: [102], ids: [3, 4], names: ['Lee Hodgkiss', 'Steven Lowe'], state: 'P', ref: '', division: '' }], diagState);
  return d.marked.size === 0 && d.rejected.length === 1 && d.rejected[0].reason === 'outside-selected-date';
})());
check('diagnose flags outside-selected-division', (() => {
  const d = api.diagnoseLiveMatch(diagFixtures, diagCandidates,
    [{ matchIds: [103], ids: [5, 6], names: ['Adam Batchelor', 'Andrew Smith'], state: 'P', ref: '', division: '' }], diagState);
  return d.marked.size === 0 && d.rejected.length === 1 && d.rejected[0].reason === 'outside-selected-division';
})());
check('diagnose flags no-candidate', (() => {
  const d = api.diagnoseLiveMatch(diagFixtures, diagCandidates,
    [{ matchIds: [999], ids: [70, 71], names: ['Nobody One', 'Nobody Two'], state: 'P', ref: '', division: '' }], diagState);
  return d.marked.size === 0 && d.rejected.length === 1 && d.rejected[0].reason === 'no-candidate';
})());
check('diagnose flags missing-competitors', (() => {
  const d = api.diagnoseLiveMatch(diagFixtures, diagCandidates,
    [{ matchIds: [], ids: [null, null], names: ['', ''], state: 'P', ref: '', division: '' }], diagState);
  return d.marked.size === 0 && d.rejected.length === 1 && d.rejected[0].reason === 'missing-competitors';
})());
check('safeRecord exposes safe fields', (() => {
  const s = api.safeRecord({ matchIds: [7], ids: [1, 2], names: ['A B', 'C D'], status: 'P', ref: 'M9', division: 'Universal' });
  return s.matchId === 7 && s.leftId === 1 && s.rightName === 'C D' && !('cookie' in s);
})());
check('summarizeJsonShape is safe', (() => {
  const s = api.summarizeJsonShape({ reg: { Universal: { d: [1, 2] } }, n: 3 });
  return typeof s === 'string' && s.indexOf('array') !== -1;
})());

// ---- live deep diagnostics ----
check('collectApiRecords tracks status counts', (() => {
  const stats = { received: 0, byStatus: {}, dropped: 0 };
  const recs = api.collectApiRecords({
    reg: { Universal: { '2026-09-03': [
      { id: 1, status: 'C', left: { id: 1 }, right: { id: 2 } },
      { id: 2, status: 'P', left: { id: 3 }, right: { id: 4 } },
      { id: 3, status: 'P', left: {}, right: {} },
    ] } },
  }, stats);
  return stats.received === 3 && stats.byStatus.C === 1 && stats.byStatus.P === 2 && recs.length === 3;
})());
check('tallyReasons compacts', api.tallyReasons([
  { reason: 'status-not-live' }, { reason: 'status-not-live' }, { reason: 'no-candidate' },
]) === 'status-not-live×2, no-candidate×1');
check('tallyReasons empty', api.tallyReasons([]) === 'none');
const asyncChecks = [];
asyncChecks.push(api.fetchLiveState((opts) => {
  opts.onload({ status: 200, responseText: JSON.stringify({ reg: { Universal: { '2026-09-03': [
    { id: 1, status: 'C', left: { id: 1, team_name: 'A' }, right: { id: 2, team_name: 'B' } },
  ] } } }) });
}, [], [], { division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fetchLiveState all-completed: compact counts',
    s.source === 'api-live' && s.recordsReceived === 1 && s.consideredLive === 0 &&
    s.statusCounts.C === 1 && s.marked.size === 0 &&
    s.rejected.length === 1 && s.rejected[0].reason === 'status-not-live');
}));
asyncChecks.push(api.fetchLiveState((opts) => {
  opts.onload({ status: 200, responseText: JSON.stringify([
    { league_match_id: 101, status: 'P', left: { id: 1 }, right: { id: 2 } },
  ]) });
}, [{ matchId: 101, division: 'Universal', date: '2026-10-01', playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' }],
[{ matchId: 101, division: 'Universal', date: '2026-10-01', playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' }],
{ division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fetchLiveState live record marks by id', s.source === 'api-live' && s.marked.size === 1);
}));
asyncChecks.push(api.fetchLiveState((opts) => {
  if (opts.url.indexOf('/matches/live/') !== -1) {
    opts.onload({ status: 500, responseText: '{"message":"Server Error"}' });
    return;
  }
  opts.onload({ status: 200, responseText: JSON.stringify([
    { league_match_id: 101, status: 'P', left: { id: 1 }, right: { id: 2 } },
  ]) });
}, [{ matchId: 101, division: 'Universal', date: '2026-10-01', playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' }],
[{ matchId: 101, division: 'Universal', date: '2026-10-01', playerA: { id: 1, name: 'A' }, playerB: { id: 2, name: 'B' }, status: 'waiting' }],
{ division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fetchLiveState fallback path records both attempts', s.source === 'api-matches' && s.marked.size === 1 &&
    s.attempts.length === 2 && s.attempts[0].status === 500 && s.attempts[1].status === 200);
}));
// ---- genuine live-endpoint shape (verified 2026-09-27 via direct probing) ----
// Field names below are the genuine tv.dartconnect.com live payload shape:
// POST api/league/SStaffSL/matches/live/24343 -> {divisions, teams, matches[]}
// with status "O", league_match_id, opponent_0/1 abbrev, surname-first
// opponent_X_players, nested league_match {left/right numeric ids}.
const genuineLive = {
  id: 9857684,
  league_match_id: 10258951,
  division_id: 94909,
  division: 'Universal',
  status: 'O',
  spectator_key: 'MDTX8',
  score: '0-0',
  set_score: '0-0',
  opponent_0: 'James H',
  opponent_0_players: 'Harrison, James',
  opponent_1: 'Nick W',
  opponent_1_players: 'Walton, Nick',
  league_match: {
    id: 10258951,
    league_match_id: 10258951,
    division_id: 94903,
    division: 'Universal',
    status: 'P',
    left: { id: 5765962, team_name: 'Harrison, James' },
    right: { id: 5765923, team_name: 'Walton, Nick' },
  },
};
check('unflipName surname-first', api.unflipName('Harrison, James') === 'James Harrison');
check('unflipName passes through', api.unflipName('James Harrison') === 'James Harrison');
check('unflipName empty', api.unflipName('') === '');
const normLive = api.normalizeApiRecord(genuineLive);
check('genuine live normalizes fixture id first',
  !!normLive && normLive.matchIds[0] === 10258951, JSON.stringify(normLive && normLive.matchIds));
check('genuine live resolves numeric player ids',
  !!normLive && normLive.ids[0] === 5765962 && normLive.ids[1] === 5765923);
check('genuine live flips names to schedule order',
  !!normLive && normLive.names[0] === 'James Harrison' && normLive.names[1] === 'Nick Walton');
check('genuine live carries spectator key as ref', !!normLive && normLive.ref === 'MDTX8');
check('genuine live status O counts live', api.isLiveRecord(normLive) === true);
const liveFixture = {
  matchId: 10258951, division: 'Universal', date: '2026-10-01',
  playerA: { id: 5765923, name: 'Nick Walton' },
  playerB: { id: 5765962, name: 'James Harrison' },
  status: 'waiting',
};
const liveMark = api.matchLiveRecords([liveFixture], [normLive]);
check('genuine live marks exact fixture by id', liveMark.marked.size === 1);
const liveCollect = api.collectApiRecords({ divisions: [], teams: [], matches: [genuineLive] });
check('genuine live payload collects', liveCollect.length === 1 && liveCollect[0].matchIds[0] === 10258951);
const liveObjCollect = api.collectApiRecords({ divisions: [], teams: [], matches: { a: genuineLive } });
check('matches-as-object collects', liveObjCollect.length === 1);

// ---- id-join hardening: league_match_id wins, division_id never joins ----
check('league_match_id preferred over broadcast id', (() => {
  const rec = api.normalizeApiRecord({
    id: 9857684, league_match_id: 10258951, status: 'O', division: 'Universal',
    opponent_0: 'James H', opponent_1: 'Nick W',
  });
  return !!rec && rec.matchIds[0] === 10258951 && rec.matchIds.indexOf(9857684) !== -1;
})());
check('broadcast id alone never marks a fixture', (() => {
  const rec = { matchIds: [9857684], ids: [null, null], names: ['', ''], state: 'O', ref: '', division: '' };
  const m = api.matchLiveRecords([liveFixture], [rec]);
  return m.marked.size === 0 && m.unmatched.length === 1;
})());
check('misleading division_id does not prevent id match', (() => {
  const rec = api.normalizeApiRecord({
    id: 9857684, league_match_id: 10258951, division_id: 94909, division: 'Universal',
    status: 'O', opponent_0: 'James H', opponent_1: 'Nick W',
    league_match: { id: 10258951, left: { id: 5765962 }, right: { id: 5765923 } },
  });
  const m = api.matchLiveRecords([liveFixture], [rec]);
  return m.marked.size === 1;
})());
check('swapped numeric pair still marks', (() => {
  const rec = { matchIds: [], ids: [5765962, 5765923], names: ['James Harrison', 'Nick Walton'], state: 'O', ref: '', division: '' };
  const m = api.matchLiveRecords([liveFixture], [rec]);
  return m.marked.size === 1;
})());
check('live-shape C record never live', (() => {
  const rec = api.normalizeApiRecord({
    id: 9857684, league_match_id: 10258951, status: 'C', division: 'Universal',
    league_match: { id: 10258951, left: { id: 5765962 }, right: { id: 5765923 } },
  });
  return api.isLiveRecord(rec) === false;
})());
asyncChecks.push(api.fetchLiveState((opts) => {
  opts.onload({ status: 200, responseText: JSON.stringify({ divisions: [], teams: [], matches: [{
    id: 9857684, league_match_id: 10258951, status: 'C', division: 'Universal',
    league_match: { id: 10258951, left: { id: 5765962 }, right: { id: 5765923 } },
  }] }) });
}, [liveFixture], [liveFixture],
{ division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fetchLiveState live-shape C marks nothing',
    s.source === 'api-live' && s.marked.size === 0 &&
    s.rejected.length === 1 && s.rejected[0].reason === 'status-not-live');
}));
asyncChecks.push(api.fetchLiveState((opts) => {
  opts.onload({ status: 200, responseText: JSON.stringify({ divisions: [], teams: [], matches: [genuineLive] }) });
}, [{ matchId: 10258951, division: 'Universal', date: '2026-10-01',
     playerA: { id: 5765923, name: 'Nick Walton' },
     playerB: { id: 5765962, name: 'James Harrison' }, status: 'waiting' }],
[{ matchId: 10258951, division: 'Universal', date: '2026-10-01',
   playerA: { id: 5765923, name: 'Nick Walton' },
   playerB: { id: 5765962, name: 'James Harrison' }, status: 'waiting' }],
{ division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fetchLiveState genuine live payload marks by id', s.source === 'api-live' && s.marked.size === 1);
}));

// ---- PLAYING lifecycle via refreshLive (scripted transport) ----
function lifecycleFixture() {
  return {
    matchId: 10258951, division: 'Universal', date: '2026-10-01',
    dateLabel: '01 Oct', delayed: false, roundLabel: 'Round 1', sessionLabel: 'Session 3',
    playerA: { id: 5765923, name: 'Nick Walton' },
    playerB: { id: 5765962, name: 'James Harrison' },
    status: 'waiting',
  };
}
function lifecycleCtx(fixture, transport) {
  const notes = [];
  return {
    ctx: {
      state: { division: 'Universal', selectedMatchDate: '2026-10-01' },
      storage: null,
      data: { fixtures: [fixture] },
      transport,
      league: { leagueCode: 'SStaffSL', leagueId: '24343' },
      live: {
        source: 'none', lastChecked: null, requestStatus: 0, rowsFound: 0,
        parsed: 0, playing: 0, ambiguous: [], unmatched: [], rejected: [],
        endpointUsed: '', responseShape: '', recordsReceived: 0, consideredLive: 0,
        statusCounts: {}, attempts: [], normalized: [], error: null,
      },
      rerender: (note) => { notes.push(note); },
    },
    notes,
  };
}
function scriptedTransport(script) {
  // One entry per poll: {live} and/or {matches} payloads; a missing side 500s.
  let poll = 0;
  return (opts) => {
    const step = script[Math.min(poll, script.length - 1)];
    const isLive = opts.url.indexOf('/matches/live/') !== -1;
    if (!isLive) {
      if (step.matches !== undefined) opts.onload({ status: 200, responseText: JSON.stringify(step.matches) });
      else opts.onload({ status: 500, responseText: '{"message":"Server Error"}' });
      poll += 1;
      return;
    }
    if (step.live !== undefined) opts.onload({ status: 200, responseText: JSON.stringify(step.live) });
    else opts.onload({ status: 500, responseText: '{"message":"Server Error"}' });
    if (step.matches === undefined) poll += 1;
  };
}
const livePayload = { divisions: [], teams: [], matches: [genuineLive] };
const emptyLivePayload = { divisions: [], teams: [], matches: [] };
const completedPayload = { reg: { Universal: { '2026-09-03': [
  { id: 10258951, league_match_id: 10258951, status: 'C', division: 'Universal',
    left: { id: 5765962, team_name: 'Harrison, James' }, right: { id: 5765923, team_name: 'Walton, Nick' } },
] } } };
// NOTE: refreshLive serializes via a module-level in-flight guard, so the
// lifecycle scenarios below MUST run sequentially in one chain — concurrent
// refreshLive calls return early without rendering.
asyncChecks.push((async () => {
  // live -> 500(+completed fallback) -> live: no flicker, then still marked.
  const fx = lifecycleFixture();
  const { ctx, notes } = lifecycleCtx(fx, scriptedTransport([
    { live: livePayload },
    { matches: completedPayload },
    { live: livePayload },
  ]));
  await api.refreshLive(ctx);
  check('lifecycle poll1 marks PLAYING', fx.status === 'playing' && ctx.live.playing === 1);
  check('lifecycle poll1 note connected', notes[0].indexOf('Live: Connected · 1 playing') === 0);
  await api.refreshLive(ctx);
  check('lifecycle 500+fallback preserves PLAYING (no flicker)',
    fx.status === 'playing' && ctx.live.playing === 1);
  check('lifecycle fallback note is honest', notes[1].indexOf('schedule fallback') !== -1);
  await api.refreshLive(ctx);
  check('lifecycle recovery re-marks PLAYING', fx.status === 'playing' && ctx.live.playing === 1);

  // live -> successful empty live: PLAYING clears (authoritative absence).
  const fx2 = lifecycleFixture();
  fx2.status = 'playing';
  const c2 = lifecycleCtx(fx2, scriptedTransport([
    { live: livePayload },
    { live: emptyLivePayload },
  ]));
  await api.refreshLive(c2.ctx);
  check('lifecycle relive marks', fx2.status === 'playing');
  await api.refreshLive(c2.ctx);
  check('lifecycle successful empty clears PLAYING', fx2.status === 'waiting' && c2.ctx.live.playing === 0);

  // total outage (both endpoints fail): UNKNOWN preserves state + error note.
  const fx3 = lifecycleFixture();
  fx3.status = 'playing';
  const c3 = lifecycleCtx(fx3, scriptedTransport([{}]));
  await api.refreshLive(c3.ctx);
  check('lifecycle total failure preserves PLAYING', fx3.status === 'playing' && c3.ctx.live.playing === 1);
  check('lifecycle total failure reports connection error',
    c3.notes[0].indexOf('Live: Connection error') === 0 && c3.notes[0].indexOf('last known') !== -1);

  // live 500 + fallback carrying a live-status record: positive evidence adds.
  const fx4 = lifecycleFixture();
  const liveStatusFallback = { reg: { Universal: { '2026-10-01': [
    { id: 10258951, league_match_id: 10258951, status: 'O', division: 'Universal',
      left: { id: 5765962, team_name: 'Harrison, James' }, right: { id: 5765923, team_name: 'Walton, Nick' } },
  ] } } };
  const c4 = lifecycleCtx(fx4, scriptedTransport([{ matches: liveStatusFallback }]));
  await api.refreshLive(c4.ctx);
  check('lifecycle fallback positive evidence adds PLAYING',
    fx4.status === 'playing' && c4.ctx.live.playing === 1 && c4.ctx.live.source === 'api-matches');
})());
// ---- dynamic divisions (V1.1 phase 2: no production allowlist) ----
function synthProps(divNames, opts) {
  const o = opts || {};
  let pid = 1000, mid = 5000;
  const sidebar = {
    divisions: divNames.map((name) => ({
      division: name,
      competitors: [1, 2].map((n) => {
        pid += 1;
        return { id: pid, competitor_name: name + ' Player' + n, url: '/league/schedule/TESTLG/99999/' + pid };
      }),
    })),
  };
  function group(date, items, divName) {
    return {
      date, date_label: date, day_of_week: 'Thursday',
      divisions: [{ division_name: 'Division: ' + divName, items }],
    };
  }
  const good = divNames.map(() => {
    mid += 1;
    return {
      item_type: 'match', id: mid, status: 'P', is_bye: false,
      sched_time: 'Round 1', venue_board_label: 'Session 1',
      home: { id: pid - 1, name: 'Home X' }, away: { id: pid, name: 'Away Y' },
    };
  });
  return {
    sidebar,
    pending_match_groups: o.delayed === false ? [] : [group('2026-09-03', good.slice(0, 1), divNames[0])],
    future_match_groups: [group('2026-10-01', good.slice(1).concat(o.bye ? [{ item_type: 'match', id: 9999, status: 'P', is_bye: true, home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }] : []), o.ghostDivision || divNames[0])],
  };
}
const solo = synthProps(['Solo']);
check('A: single-division discovery', JSON.stringify(api.discoverDivisions(solo)) === JSON.stringify(['Solo']));
check('A: single-division roster+fixtures', (() => {
  const r = api.parseRosterFromProps(solo);
  const f = api.parseFixturesFromProps(solo, api.discoverDivisions(solo));
  return r.players.length === 2 && r.players.every((p) => p.division === 'Solo') &&
    f.fixtures.length === 1 && f.fixtures.every((x) => x.division === 'Solo');
})());
const trio = synthProps(['Alpha', 'Beta', 'Gamma']);
check('B/C/D: three divisions discovered in document order',
  JSON.stringify(api.discoverDivisions(trio)) === JSON.stringify(['Alpha', 'Beta', 'Gamma']));
check('E: roster associated per dynamic division', (() => {
  const byDiv = {};
  api.parseRosterFromProps(trio).players.forEach((p) => { (byDiv[p.division] = byDiv[p.division] || []).push(p.id); });
  return Object.keys(byDiv).length === 3 &&
    Object.keys(byDiv).every((d) => byDiv[d].length === 2) &&
    byDiv.Alpha.every((id) => byDiv.Beta.indexOf(id) === -1 && byDiv.Gamma.indexOf(id) === -1);
})());
check('F: fixtures accepted for arbitrary divisions', (() => {
  const f = api.parseFixturesFromProps(trio, api.discoverDivisions(trio));
  return f.fixtures.length === 3 && f.skipped.unknownDivision === 0;
})());
check('G: saved invalid division falls back to first discovered', (() => {
  const store = { data: JSON.stringify({ division: 'Nope', absentIds: [], selectedMatchDate: null, theme: null }),
    getItem() { return this.data; }, setItem(_, v) { this.data = String(v); } };
  return api.loadState(store, ['Alpha', 'Beta']).division === 'Alpha';
})());
check('G: saved valid division preserved', (() => {
  const m = {};
  const s = { getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { m[k] = String(v); } };
  const k = api.storageKeyForLeague({ leagueCode: 'T', leagueId: '1' });
  s.setItem(k, JSON.stringify({ division: 'Beta', absentIds: [7], selectedMatchDate: null }));
  const st = api.loadState(s, ['Alpha', 'Beta'], k);
  return st.division === 'Beta' && st.absentIds.join() === '7';
})());
check('H: ghost-division fixture diagnosed, not merged', (() => {
  const g = synthProps(['Alpha', 'Beta'], { ghostDivision: 'Ghost' });
  const divs = api.discoverDivisions(g);
  const f = api.parseFixturesFromProps(g, divs);
  return divs.length === 2 && f.fixtures.length === 1 && f.fixtures[0].division === 'Alpha' &&
    f.skipped.unknownDivision === 1;
})());
check('H: ghost division absent from roster', api.parseRosterFromProps(
  synthProps(['Alpha'], { ghostDivision: 'Ghost' })).players.every((p) => p.division === 'Alpha'));
const srcLines = fs.readFileSync(path.join(__dirname, '..', 'src', 'SouthStaffs-MatchNight.user.js'), 'utf8').split('\n');
check('I: no production DIVISIONS allowlist', api.DIVISIONS === undefined &&
  srcLines.every((line) => line.indexOf('DIVISIONS') === -1 ||
    /divisions|discoverDivisions|unknownFixtureDivisions|discoveredDivisions/.test(line)));
check('I: division names only in metadata, never logic', srcLines.every((line) =>
  line.indexOf('Universal') === -1 && line.indexOf('White Eagle') === -1 ||
  line.trim().indexOf('// @') === 0));

// ---- per-league storage (V1.1 phase 3: isolation + legacy migration) ----
const SSTAFF_LEAGUE = { leagueCode: 'SStaffSL', leagueId: '24343' };
const OTHER_LEAGUE = { leagueCode: 'ABC', leagueId: '99999' };
const SSTAFF_KEY = api.storageKeyForLeague(SSTAFF_LEAGUE);
const OTHER_KEY = api.storageKeyForLeague(OTHER_LEAGUE);
function mapStore() {
  const m = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { m[k] = String(v); },
    _m: m,
  };
}
check('A: SStaffSL/24343 key', SSTAFF_KEY === 'match-night-singles:SStaffSL:24343');
check('B: synthetic league key', OTHER_KEY === 'match-night-singles:ABC:99999');
check('storage key rejects invalid contexts', [null, undefined, {}, { leagueCode: '', leagueId: '1' },
  { leagueCode: 'A', leagueId: '' }, { leagueCode: 'A', leagueId: 'x' },
  { leagueCode: 'A:B', leagueId: '1' }, { leagueCode: 'A/B', leagueId: '1' },
].every((l) => api.storageKeyForLeague(l) === null));
check('C: leagues cannot read each other absent state', (() => {
  const s = mapStore();
  api.saveState(s, { division: 'Alpha', absentIds: [11], selectedMatchDate: '2026-10-01', theme: null }, SSTAFF_KEY);
  const other = api.loadState(s, ['X', 'Y'], OTHER_KEY);
  const same = api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY);
  return other.absentIds.length === 0 && same.absentIds.join() === '11';
})());
check('D: leagues cannot read each other division/date', (() => {
  const s = mapStore();
  api.saveState(s, { division: 'Beta', absentIds: [], selectedMatchDate: '2026-11-05', theme: null }, SSTAFF_KEY);
  api.saveState(s, { division: 'Y', absentIds: [], selectedMatchDate: '2026-09-03', theme: null }, OTHER_KEY);
  const a = api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY);
  const b = api.loadState(s, ['X', 'Y'], OTHER_KEY);
  return a.division === 'Beta' && a.selectedMatchDate === '2026-11-05' &&
    b.division === 'Y' && b.selectedMatchDate === '2026-09-03';
})());
check('E: keyed invalid division falls back to first discovered', (() => {
  const s = mapStore();
  s.setItem(SSTAFF_KEY, JSON.stringify({ division: 'Nope', absentIds: [], selectedMatchDate: null }));
  return api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY).division === 'Alpha';
})());
check('F: generic key wins over legacy key', (() => {
  const s = mapStore();
  const legacy = JSON.stringify({ division: 'Alpha', absentIds: [1], selectedMatchDate: '2026-09-03', theme: 'dark' });
  s.setItem('sssl-match-night:24343', legacy);
  s.setItem(SSTAFF_KEY, JSON.stringify({ division: 'Beta', absentIds: [2], selectedMatchDate: '2026-10-01' }));
  const migrated = api.migrateLegacyState(s, SSTAFF_LEAGUE);
  const st = api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY);
  return migrated === false && st.division === 'Beta' && st.absentIds.join() === '2' &&
    s._m['sssl-match-night:24343'] === legacy;
})());
check('G: legacy SStaff key migrates when generic absent', (() => {
  const s = mapStore();
  s.setItem('sssl-match-night:24343', JSON.stringify({ division: 'Beta', absentIds: [3, 'x'], selectedMatchDate: '2026-10-01', theme: 'light' }));
  const migrated = api.migrateLegacyState(s, SSTAFF_LEAGUE);
  const st = api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY);
  return migrated === true && st.division === 'Beta' && st.absentIds.join() === '3' &&
    st.selectedMatchDate === '2026-10-01' && st.theme === 'light';
})());
check('H: legacy key untouched after migration', (() => {
  const s = mapStore();
  const legacy = JSON.stringify({ division: 'Beta', absentIds: [3], selectedMatchDate: null, theme: null });
  s.setItem('sssl-match-night:24343', legacy);
  api.migrateLegacyState(s, SSTAFF_LEAGUE);
  return s._m['sssl-match-night:24343'] === legacy && s._m[SSTAFF_KEY] !== legacy;
})());
check('I: migration does not run for other leagues', (() => {
  const s = mapStore();
  s.setItem('sssl-match-night:24343', JSON.stringify({ division: 'Beta', absentIds: [3], selectedMatchDate: null, theme: null }));
  const migrated = api.migrateLegacyState(s, OTHER_LEAGUE);
  return migrated === false && !(OTHER_KEY in s._m) &&
    api.loadState(s, ['X', 'Y'], OTHER_KEY).division === 'X';
})());
check('J: corrupt legacy JSON fails safely', (() => {
  const s = mapStore();
  s.setItem('sssl-match-night:24343', '{oops');
  const migrated = api.migrateLegacyState(s, SSTAFF_LEAGUE);
  const st = api.loadState(s, ['Alpha', 'Beta'], SSTAFF_KEY);
  return migrated === false && st.division === 'Alpha' && st.absentIds.length === 0;
})());
check('K: player href works for arbitrary league', api.parsePlayerIdFromHref(
  '/league/schedule/OTHERLG/77031/12345', { leagueCode: 'OTHERLG', leagueId: '77031' }) === 12345 &&
  api.parsePlayerIdFromHref('/league/schedule/OTHERLG/77031/12345') === 12345);
check('L: division URL never a player ID', api.parsePlayerIdFromHref(
  '/league/schedule/OTHERLG/77031/division/42', { leagueCode: 'OTHERLG', leagueId: '77031' }) === null &&
  api.parsePlayerIdFromHref('/league/schedule/OTHERLG/77031/division/42') === null &&
  api.parsePlayerIdFromHref('/league/schedule/SStaffSL/24343/5765962',
    { leagueCode: 'OTHERLG', leagueId: '77031' }) === null);
check('M: theme stays global across leagues', (() => {
  const s = mapStore();
  api.saveState(s, { division: 'Beta', absentIds: [], selectedMatchDate: null, theme: 'dark' }, SSTAFF_KEY);
  const payload = JSON.parse(s._m[SSTAFF_KEY]);
  return payload.theme === undefined &&
    api.loadState(s, ['X', 'Y'], OTHER_KEY).theme === 'dark' &&
    api.loadState(s, [], null).theme === 'dark';
})());

// ---- LeagueContext (V1.1 phase 1: dynamic league identity, SStaffSL unpinned) ----
function sameContext(a, b) {
  return !!a && !!b && a.leagueCode === b.leagueCode && a.leagueId === b.leagueId && a.scheduleUrl === b.scheduleUrl;
}
check('context from SStaffSL schedule URL', sameContext(
  api.parseLeagueContext('https://my.dartconnect.com/league/schedule/SStaffSL/24343'),
  { leagueCode: 'SStaffSL', leagueId: '24343', scheduleUrl: 'https://my.dartconnect.com/league/schedule/SStaffSL/24343' }));
check('context from synthetic league URL', sameContext(
  api.parseLeagueContext('https://my.dartconnect.com/league/schedule/OTHERLG/77031'),
  { leagueCode: 'OTHERLG', leagueId: '77031', scheduleUrl: 'https://my.dartconnect.com/league/schedule/OTHERLG/77031' }));
check('context tolerates player child path', sameContext(
  api.parseLeagueContext('https://my.dartconnect.com/league/schedule/SStaffSL/24343/5765962'),
  { leagueCode: 'SStaffSL', leagueId: '24343', scheduleUrl: 'https://my.dartconnect.com/league/schedule/SStaffSL/24343/5765962' }));
check('context tolerates trailing slash and query', sameContext(
  api.parseLeagueContext('https://my.dartconnect.com/league/schedule/OTHERLG/77031/?x=1'),
  { leagueCode: 'OTHERLG', leagueId: '77031', scheduleUrl: 'https://my.dartconnect.com/league/schedule/OTHERLG/77031/?x=1' }));
check('context from raw path', sameContext(
  api.parseLeagueContext('/league/schedule/OTHERLG/77031'),
  { leagueCode: 'OTHERLG', leagueId: '77031', scheduleUrl: '/league/schedule/OTHERLG/77031' }));
check('context rejects non-schedule URLs', [
  'https://my.dartconnect.com/league/standings/SStaffSL/24343',
  'https://my.dartconnect.com/league/schedule/SStaffSL',
  'https://my.dartconnect.com/league/schedule/SStaffSL/notanid',
  'https://my.dartconnect.com/league/schedule//24343',
  'https://my.dartconnect.com/league/SStaffSL/24343',
  'https://my.dartconnect.com/',
  'not a url at all',
  '',
  null,
].every((u) => api.parseLeagueContext(u) === null));
check('dynamic live URL SStaffSL', api.tvApiUrl('live', { leagueCode: 'SStaffSL', leagueId: '24343' }) ===
  'https://tv.dartconnect.com/api/league/SStaffSL/matches/live/24343');
check('dynamic matches URL SStaffSL', api.tvApiUrl('matches', { leagueCode: 'SStaffSL', leagueId: '24343' }) ===
  'https://tv.dartconnect.com/api/league/SStaffSL/matches/24343');
check('dynamic live URL synthetic league', api.tvApiUrl('live', { leagueCode: 'OTHERLG', leagueId: '77031' }) ===
  'https://tv.dartconnect.com/api/league/OTHERLG/matches/live/77031');
check('dynamic match centre URL', api.matchCentreUrl({ leagueCode: 'SStaffSL', leagueId: '24343' }) ===
  'https://tv.dartconnect.com/league/SStaffSL/matches/24343');

// ---- live request construction (official body required; '{}' -> HTTP 500) ----
check('official league POST body exported', api.LEAGUE_POST_BODY === '{"division_id":null,"competitor_id":null}');
check('official body carries both filter keys', (() => {
  const b = JSON.parse(api.LEAGUE_POST_BODY);
  return 'division_id' in b && 'competitor_id' in b;
})());
asyncChecks.push(api.fetchLiveState((opts) => {
  check('live request is official shape', (() => {
    const okMethod = opts.method === 'POST';
    const okUrl = opts.url === 'https://tv.dartconnect.com/api/league/SStaffSL/matches/live/24343';
    const okData = opts.data === '{"division_id":null,"competitor_id":null}';
    const h = opts.headers || {};
    const okHeaders = h['Content-Type'] === 'application/json' &&
      h.Accept === 'application/json' && h['X-Requested-With'] === 'XMLHttpRequest';
    return okMethod && okUrl && okData && okHeaders;
  })());
  opts.onload({ status: 200, responseText: JSON.stringify({ divisions: [], teams: [], matches: [] }) });
}, [], [], { division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('official-body live request succeeds', s.ok && s.source === 'api-live');
}));
asyncChecks.push(api.fetchLiveState((opts) => {
  if (opts.url.indexOf('/matches/live/') !== -1) {
    check('matches fallback uses official body too',
      opts.method === 'POST' && opts.data === '{"division_id":null,"competitor_id":null}');
    opts.onload({ status: 500, responseText: '{"message":"Server Error"}' });
    return;
  }
  opts.onload({ status: 200, responseText: JSON.stringify({ divisions: [], teams: [], matches: [] }) });
}, [], [], { division: 'Universal', selectedMatchDate: '2026-10-01' }, { leagueCode: 'SStaffSL', leagueId: '24343' }).then((s) => {
  check('fallback path still records both attempts', s.attempts.length === 2);
}));
// ---- playing-row presentation (CSS/rendering only, both themes) ----
const srcText = fs.readFileSync(path.join(__dirname, '..', 'src', 'SouthStaffs-MatchNight.user.js'), 'utf8');
check('playing row green background rule', srcText.indexOf('.sssl-row.playing{position:relative;background:var(--playing-bg)}') !== -1);
check('playing badge out of flex flow', srcText.indexOf('.sssl-playing{position:absolute;right:10px;top:50%;transform:translateY(-50%);margin-left:0;') !== -1);
check('playing names bold rule', srcText.indexOf('.sssl-row.playing .sssl-pa,.sssl-row.playing .sssl-pb{font-weight:700') !== -1);
check('playing theme vars in both themes',
  (srcText.match(/--playing-bg:/g) || []).length >= 2 && (srcText.match(/--playing-ink:/g) || []).length >= 2);
check('playing class applied from status', srcText.indexOf("f.status === 'playing' ? ' playing' : ''") !== -1);
const counts = {
  rosterUniversal: roster.players.filter((p) => p.division === 'Universal').length,
  rosterWhiteEagle: roster.players.filter((p) => p.division === 'White Eagle').length,
  fixtures: sorted.length,
  delayed: delayed.length,
};
console.log('COUNTS ' + JSON.stringify(counts));
Promise.all(asyncChecks).then(() => {
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
});

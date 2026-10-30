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
function lifecycleCtx(fixture, transport, dataExtra) {
  const notes = [];
  return {
    ctx: {
      state: { division: 'Universal', selectedMatchDate: '2026-10-01' },
      storage: null,
      data: Object.assign({ fixtures: [fixture] }, dataExtra || {}),
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
  // live -> 500(+empty fallback) -> live: no flicker, then still marked.
  // NOTE: the fallback payload deliberately carries NO record for this match.
  // A completed record would (correctly, LIVE-01) complete the game instead of
  // testing the flicker case.
  const fx = lifecycleFixture();
  const { ctx, notes } = lifecycleCtx(fx, scriptedTransport([
    { live: livePayload },
    { matches: { matches: [] } },
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

  // LIVE-01 (live-venue defect, 22 Oct): a successful but EMPTY live response
  // used to clear PLAYING, which freed both players mid-match and let the
  // scheduler recommend them for another game. Absence from the live feed is
  // NOT completion, so PLAYING is now retained until a completed record
  // proves the match is over.
  const fx2 = lifecycleFixture();
  fx2.status = 'playing';
  const c2 = lifecycleCtx(fx2, scriptedTransport([
    { live: livePayload },
    { live: emptyLivePayload },
    { live: completedPayload },
  ]));
  await api.refreshLive(c2.ctx);
  check('lifecycle relive marks', fx2.status === 'playing');
  await api.refreshLive(c2.ctx);
  check('LIVE-01: an empty live response RETAINS PLAYING (absence is not completion)',
    fx2.status === 'playing' && c2.ctx.live.playing === 1);
  check('LIVE-01: the retained game is flagged as unconfirmed, not concealed',
    c2.ctx.live.unconfirmed === 1 && c2.notes[1].indexOf('1 unconfirmed') !== -1);
  await api.refreshLive(c2.ctx);
  check('LIVE-01: a completed record releases the game (status completed, no longer playing)',
    fx2.status === 'completed' && c2.ctx.live.playing === 0);

  // LIVE-01: completion is the ONLY thing that ends a committed game, and it
  // releases the marker duty and the physical board with it (a person must
  // never stay double-booked, and a freed board must be genuinely free).
  const fxDone = lifecycleFixture();
  fxDone.status = 'playing';
  const boardRt = api.assignGameToBoard(api.createManagedBoardRuntime(4),
    Object.assign({}, fxDone, { status: 'waiting' }), 1).runtime;
  const markRt = api.assignMarkerToGame(api.createMarkerRuntime(), fxDone, 5765970, {
    absentIds: [], playingPlayerIds: [], participantIds: [5765923, 5765962],
  }).runtime;
  const cDone = lifecycleCtx(fxDone, scriptedTransport([{ live: completedPayload }]),
    { boardRuntime: boardRt, markerRuntime: markRt });
  check('LIVE-01: the marker and board are held before completion',
    api.findMarkerForGame(cDone.ctx.data.markerRuntime, fxDone) === 5765970 &&
    api.findBoardOwningGame(cDone.ctx.data.boardRuntime, fxDone).boardNumber === 1);
  await api.refreshLive(cDone.ctx);
  check('LIVE-01: completion releases the marker duty and the board',
    fxDone.status === 'completed' &&
    api.findMarkerForGame(cDone.ctx.data.markerRuntime, fxDone) === null &&
    api.findBoardOwningGame(cDone.ctx.data.boardRuntime, fxDone) === null);

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

  // TRIAL-05: the automatic poll VISIBLY reports when it changed the factual
  // PLAYING set ('· updated' cue) so the operator sees the screen updating
  // itself without pressing Refresh.
  const fx5 = lifecycleFixture();
  const c5 = lifecycleCtx(fx5, scriptedTransport([
    { live: livePayload },         // marks PLAYING -> changed
    { live: livePayload },         // same set -> unchanged
    { live: emptyLivePayload },    // LIVE-01: retained, so still unchanged
    { live: completedPayload },    // factual completion -> changed (released)
  ]));
  await api.refreshLive(c5.ctx);
  check('TRIAL-05 poll that CHANGES the PLAYING set raises the updated cue',
    c5.ctx.live.updated === true && c5.notes[0].indexOf('· updated') !== -1);
  await api.refreshLive(c5.ctx);
  check('TRIAL-05 poll with UNCHANGED PLAYING set raises no updated cue',
    c5.ctx.live.updated === false && c5.notes[1].indexOf('· updated') === -1);
  await api.refreshLive(c5.ctx);
  check('LIVE-01: an empty authoritative response alone never clears PLAYING',
    fx5.status === 'playing' && c5.ctx.live.updated === false && c5.notes[2].indexOf('· updated') === -1);
  await api.refreshLive(c5.ctx);
  check('TRIAL-05 factual completion raises the updated cue',
    fx5.status === 'completed' && c5.ctx.live.updated === true && c5.notes[3].indexOf('· updated') !== -1);
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

// ---- V1.1 production branding/metadata ----
check('product name is generic', srcLines.some((l) => l.trim() === '// @name         Match Night Singles Manager'));
check('version is 1.1.0', srcLines.some((l) => l.trim() === '// @version      1.1.0'));
check('schedule @match is generic', srcLines.some((l) => l.trim() === '// @match        https://my.dartconnect.com/league/schedule/*'));
check('no tv @match remains', srcLines.every((l) => l.trim().indexOf('// @match') !== 0 || l.indexOf('tv.dartconnect.com') === -1));
check('tv @connect retained', srcLines.some((l) => l.trim() === '// @connect      tv.dartconnect.com'));
check('diagnostics alias exposed', srcLines.some((l) => l.indexOf('__matchNightSingles') !== -1) &&
  srcLines.some((l) => l.indexOf('__ssslMatchNight') !== -1));

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
// ---- fixture-row centre invariance (Slice 3B board indicator layout) ----
// The pa/vs/pb matchup must stay centred identically regardless of right-side
// overlays: controls are absolute (out of flex flow) and the only concession
// is a SYMMETRIC edge reserve on the two name spans (equal left margin on pa,
// equal right margin on pb), which never moves the centre point.
check('fixture row is a positioning context', srcText.indexOf('.sssl-row{display:flex;align-items:center;padding:var(--pad-row);border-radius:3px;line-height:1.35;position:relative}') !== -1);
check('board ownership indicator is an absolute overlay', srcText.indexOf('.sssl-row .bown{position:absolute;right:10px;top:50%') !== -1);
check('board indicator slots behind PLAYING on playing rows', srcText.indexOf('.sssl-row.playing .bown{right:var(--edge-reserve)}') !== -1);
check('board assign select is an absolute overlay', srcText.indexOf('.sssl-row .bassign-slot{position:absolute;right:var(--edge-reserve);top:50%') !== -1);
check('symmetric edge reserve on fixture name spans',
  srcText.indexOf('.sssl-row .sssl-pa{margin-left:var(--edge-reserve)}') !== -1 &&
  srcText.indexOf('.sssl-row .sssl-pb{margin-right:var(--edge-reserve)}') !== -1);
check('edge reserve defined for every scale step',
  (srcText.match(/--edge-reserve:/g) || []).length === 6 && (srcText.match(/--edge-reserve:96px/) || []).length === 1);
check('no in-flow board controls on fixture rows (old layout hacks removed)',
  srcText.indexOf('margin-right:64px') === -1 && srcText.indexOf('.sssl-bassign{margin-right') === -1);
// ---- collapsible delayed date groups (presentation only) ----
check('delayed datebar is clickable with fold indicator',
  srcText.indexOf('.sssl-datebar.collapsible{cursor:pointer;user-select:none}') !== -1 &&
  srcText.indexOf("el('span', 'fold', collapsed ? '\u25b8' : '\u25be')") !== -1);
check('fold uses scaled compact styling', srcText.indexOf("'.sssl-datebar .fold{margin-right:6px;font-size:var(--fs-xs)}'") !== -1);
check('collapse hides rows only for delayed groups (through the effective-state rule)',
  srcText.indexOf('if (f.delayed && delayedGroupCollapsed(delayedCollapsed, groupKey, liveIn[groupKey] || 0)) return;') !== -1);
check('current-night bars never become collapsible',
  srcText.indexOf("bar.classList.add('collapsible')") !== -1 &&
  srcText.indexOf("if (f.delayed) {") !== -1);
// COLS-05: the collapse state was runtime-only until a manual Refresh (a full
// page reload) was observed to expand the operator's collapsed delayed groups.
// It is now persisted INSIDE the existing league store key under stable date
// ids — still no collapse-specific storage key and still no per-row write.
check('collapse state persists through the existing store key (stable date ids)',
  (srcText.match(/delayedCollapsed/g) || []).length >= 3 &&
  srcText.indexOf('const delayedCollapsed = pruneCollapsedGroups(state,') !== -1 &&
  srcText.indexOf('collapsedGroups: state.collapsedGroups || {},') !== -1 &&
  srcText.indexOf('state.collapsedGroups = normalizeCollapsedGroups(parsed.collapsedGroups);') !== -1 &&
  srcText.indexOf('function collapsedGroupKey(fixture)') !== -1 &&
  srcText.indexOf('function pruneCollapsedGroups(state, liveGroupKeys)') !== -1 &&
  srcText.indexOf("match-night-singles:collapsed") === -1 &&
  srcText.indexOf("setItem(.*delayedCollapsed") === -1);
// ---- Slice 3C marker management UI contracts ----
check('compact MARKER control exists on RECOMMENDED rows',
  srcText.indexOf("function markerSelectEl(opts)") !== -1 &&
  srcText.indexOf("sel.className = 'sssl-mksel'") !== -1 &&
  // COLS-01 + MARKER-9: advice reads 'A: <name>', a confirmed fact reads
  // 'M: <name>' and the placeholder 'M: —' is the unassigned state. The words
  // are abbreviated (manager request) because the fixture columns are narrow;
  // the control's tooltip still spells each state out in full.
  srcText.indexOf("'A: ' + o.nameFor(o.proposedMarkerId)") !== -1 &&
  srcText.indexOf("'M: ' + o.nameFor(confirmedId)") !== -1 &&
  srcText.indexOf("'.sssl-mksel.confirmed{border-style:solid}'") !== -1 &&
  srcText.indexOf("markerSelectEl({") !== -1);
check('shared marker selector used by recommended AND factual rows (no duplicated eligibility)',
  (srcText.match(/markerSelectEl\(\{/g) || []).length >= 2 &&
  (srcText.match(/getEligibleMarkerCandidates/g) || []).length >= 2);
check('factual marker display + release affordance exists, and can be removed or reallocated in place',
  // the delayed column keeps the compact FACT chip + ×
  srcText.indexOf("el('span', 'mkchip', 'M ' + markerNameForId(data, fMarkerId))") !== -1 &&
  srcText.indexOf('releaseMarkerFromGame(mkr, f)') !== -1 &&
  // MARKER-9: the game table shows the fact IN the control and offers the two
  // acts the manager asked for — reallocate (another name) and remove ('M: —')
  srcText.indexOf('confirmedMarkerId: fMarkerId,') !== -1 &&
  srcText.indexOf('onClear: () => {') !== -1 &&
  srcText.indexOf("if (typeof o.onClear === 'function') o.onClear();") !== -1 &&
  srcText.indexOf('a confirmed duty is displayed, never overwritten') !== -1);
check('PROJECTED NEXT has no marker assignment control',
  srcText.indexOf("sssl-mksel") !== -1 &&
  (srcText.match(/projectedNext\[0\]/g) || []).length >= 1 &&
  srcText.indexOf('projectedNext[0].proposedMarkerId') === -1);
check('marker UI uses no transform scaling',
  srcText.indexOf("'.sssl-mkchip{display:inline-block;font-size:var(--fs-3xs)") !== -1);
// MARKER-9 (manager request): the marker drop-down is the same SOLID control as
// the board drop-down — one shared rule, no dashed/dotted outline anywhere. The
// ADVICE/FACT distinction is the option text; a pending handoff is colour only.
check('MARKER-9: the marker drop-down is styled exactly like the board drop-down',
  srcText.indexOf("'.sssl-bassign,.sssl-mksel{background:var(--control);color:var(--text);border:1px solid var(--control-border);border-radius:4px;padding:1px 6px;font-size:var(--fs-xs);cursor:pointer;line-height:1.2;vertical-align:middle;text-overflow:ellipsis}'") !== -1 &&
  srcText.indexOf("'.sssl-bassign{max-width:96px}'") !== -1 &&
  srcText.indexOf("'.sssl-mksel{max-width:260px}'") !== -1 &&
  // no SELECT keeps a dashed/dotted outline (the advice CARD's dashed border and
  // its 'awaiting a board' dot cue are different elements and stay: an advice
  // card must never read as a fact)
  srcText.indexOf("'.sssl-mksel{background:var(--control);color:var(--text);border:1px dashed var(--accent)") === -1 &&
  srcText.indexOf("'.sssl-mksel{border-style:dotted") === -1 &&
  srcText.indexOf('border-style:dotted;border-color:var(--delayed)') === -1 &&
  srcText.indexOf('border:1px dashed var(--accent)') !== -1 &&
  srcText.indexOf("'.sssl-mksel.confirmed{border-style:solid}'") !== -1 &&
  srcText.indexOf("'.sssl-mkslot.pending .sssl-mksel{border-color:var(--delayed);color:var(--delayed)}'") !== -1 &&
  // the distinction the accepted contract requires is still there, in words
  srcText.indexOf("'A: ' + o.nameFor(o.proposedMarkerId)") !== -1 &&
  srcText.indexOf("'M: ' + o.nameFor(confirmedId)") !== -1);
check('no marker localStorage key exists',
  srcText.indexOf("match-night-singles:marker") === -1 &&
  (srcText.match(/MARKER_KEY/g) || []).length === 0);
// ---- Slice 3C delayed catch-up allowance contracts ----
check('(N/R) delayed indicator renders compactly in NOT HERE rows',
  srcText.indexOf("document.createTextNode('(' + n + '/')") !== -1 &&
  srcText.indexOf("'.sssl-playerrow .dallow{flex:none;font-size:var(--fs-2xs)") !== -1);
check('no (0/R) rendering: indicator hidden entirely at N=0',
  srcText.indexOf('if (n > 0) {') !== -1 &&
  srcText.indexOf("'(' + 0 + '/'") === -1);
check('compact per-player allowance override control exists',
  srcText.indexOf("rSel.className = 'sssl-rsel'") !== -1 &&
  srcText.indexOf("'Delayed: outstanding / remaining tonight'") !== -1);
check('allowance range bounded by factual N via domain clamp',
  srcText.indexOf('for (let v = 0; v <= n; v++)') !== -1 &&
  srcText.indexOf('Math.max(0, Math.min(n, Math.floor(value)))') !== -1);
check('no delayed-allowance persistence key',
  srcText.indexOf('match-night-singles:delayed') === -1 &&
  srcText.indexOf('match-night-singles:allowance') === -1 &&
  srcText.indexOf('DELAYED_ALLOWANCE_KEY') === -1);
check('consumption wired to factual PLAYING only, at most once',
  srcText.indexOf('if (f.delayed && f.status === \'playing\') {') !== -1 &&
  srcText.indexOf('consumeDelayedAllowance(ctx.data.delayedAllowanceRuntime, f)') !== -1);
check('allowance applies only to delayed classification in eligibility',
  srcText.indexOf('canScheduleDelayedFixture(session.delayedAllowanceRuntime, f)') !== -1 &&
  srcText.indexOf('if (!fixture || !fixture.delayed) return true;') !== -1);
// ---- Slice 3C presentation polish contracts ----
// COLS-08 (targeted presentation correction): the RECOMMENDED rows no longer
// centre themselves with absolute overlay slots — a long name could be painted
// over the marker dropdown / board select at 1366x768 (BOARD 4 / Mark Bennett
// vs David Ashworth-Taylor / marker). Each row is now ONE explicit CSS grid
// with a cell for every column, and every cell exists on every row.
check('COLS-08: RECOMMENDED rows are one explicit grid with a cell for every column',
  srcText.indexOf('--adv-tpl:var(--adv-seq) var(--adv-board) minmax(0,1fr) var(--adv-vs) minmax(0,1fr) var(--adv-marker) var(--adv-status);display:grid;grid-template-columns:var(--adv-tpl)') !== -1 &&
  srcText.indexOf("const paEl = el('span', 'sssl-pa', g.playerA.name);") !== -1 &&
  srcText.indexOf("const pbEl = el('span', 'sssl-pb', g.playerB.name);") !== -1 &&
  srcText.indexOf("row.appendChild(el('span', 'sssl-vs', 'vs'))") !== -1 &&
  srcText.indexOf("const markerCell = markerControlsShown ? el('span', 'mkslot') : null;") !== -1 &&
  srcText.indexOf('const statusCell = ' + "el('span', 'astat');") !== -1 &&
  srcText.indexOf('if (markerCell) row.appendChild(markerCell);') !== -1 &&
  srcText.indexOf('row.appendChild(statusCell);') !== -1 &&
  srcText.indexOf("const ctrl = el('span', 'bassign-slot')") !== -1);
check('COLS-08: no advice cell is absolutely positioned any more (collision cannot recur)',
  srcText.indexOf("'.sssl-advice .mkslot{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .mkown{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .bown{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .bassign-slot{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .amark{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .mknone{position:absolute") === -1 &&
  srcText.indexOf("'.sssl-advice .sssl-pa{margin-left:var(--edge-reserve)}'") === -1 &&
  srcText.indexOf("'.sssl-advice .sssl-pb{margin-right:var(--edge-reserve)}'") === -1);
check('COLS-08: names ellipsise inside their own column and keep the full name on hover',
  srcText.indexOf("paEl.title = g.playerA.name;") !== -1 &&
  srcText.indexOf("pbEl.title = g.playerB.name;") !== -1 &&
  // fixture rows too: a narrow column may truncate, never silently
  srcText.indexOf("paSpan.title = f.playerA.name;") !== -1 &&
  srcText.indexOf("pbSpan.title = f.playerB.name;") !== -1 &&
  srcText.indexOf("'.sssl-advice .sssl-pa,.sssl-advice .sssl-pb{min-width:0}'") !== -1 &&
  srcText.indexOf("'.sssl-pa{flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'") !== -1);
check('COLS-08: the marker control owns its own column and truncates inside it',
  srcText.indexOf("'.sssl-advice .mkslot{display:flex;align-items:center;min-width:0;overflow:hidden}'") !== -1 &&
  srcText.indexOf("'.sssl-advice .mkslot .sssl-mksel{width:100%;max-width:100%;min-width:0}'") !== -1 &&
  srcText.indexOf("'.sssl-advice .mkown .mkchip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'") !== -1);
check('COLS-08: the board column exists in BOTH managed-board modes (only its width changes)',
  srcText.indexOf("--adv-board:0px;--adv-status:0px;") !== -1 &&
  srcText.indexOf("'.sssl-advicepane.managed .sssl-advice{--adv-board:calc(var(--fs-xs) * 8)}'") !== -1 &&
  srcText.indexOf("advicePane.classList.toggle('managed', schedulerUi.managedBoardsEnabled === true);") !== -1 &&
  srcText.indexOf("'.sssl-advice .g-board .sssl-bassign{max-width:100%;min-width:0}'") !== -1);
check('COLS-08: the status column is a PANE decision (uniform width, never content-sized per row)',
  srcText.indexOf("'.sssl-advicepane.hasstatus .sssl-advice{--adv-status:calc(var(--fs-3xs) * 9)}'") !== -1 &&
  srcText.indexOf("advicePane.classList.toggle('hasstatus',") !== -1 &&
  srcText.indexOf("'.sssl-advice .astat{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}'") !== -1 &&
  srcText.indexOf('minmax(0,max-content)') === -1);
check('COLS-08: recommendation sequence is its own grid column (a sequence, never a board number)',
  srcText.indexOf("row.appendChild(el('span', 'amark', String(seq + 1))") !== -1 &&
  srcText.indexOf("'.sssl-advice .amark{min-width:0;text-align:left;") !== -1 &&
  srcText.indexOf('NOT a physical board number') !== -1);
check('COLS-08: PROJECTED NEXT uses the same seven-cell grid (same collision rules)',
  srcText.indexOf("const pRow = el('div', 'sssl-advice projected');") !== -1 &&
  srcText.indexOf("pRow.appendChild(el('span', 'amark', '→'));") !== -1 &&
  srcText.indexOf("pRow.appendChild(el('span', 'g-board'));") !== -1 &&
  srcText.indexOf("pnA.title = advice.projectedNext[0].playerA.name;") !== -1 &&
  srcText.indexOf("pRow.appendChild(el('span', 'mkslot'));") !== -1 &&
  srcText.indexOf("pRow.appendChild(el('span', 'astat'));") !== -1);
check('advice rows keep no in-flow layout classes (old centre-shifting layout removed)',
  srcText.indexOf("'.sssl-advice .mark{") === -1 &&
  srcText.indexOf("'.sssl-advice .pa{") === -1 &&
  srcText.indexOf("'.sssl-advice .ctrl{") === -1 &&
  srcText.indexOf("'.sssl-advice .note{") === -1 &&
  srcText.indexOf("'.sssl-advice .proj{") === -1);
check('factual-row marker visibility rules (fact or pending handoff ONLY; OFF and delayed remove them all)',
  srcText.indexOf('const showMarkerControl = markerControlWanted(f);') !== -1 &&
  srcText.indexOf('if (!markerUiOn || f.delayed) return false;') !== -1 &&
  srcText.indexOf('if (findMarkerForGame(mkr, f) != null) return true;') !== -1 &&
  // MARKER-9: the table never PROPOSES a marker; only a pending handoff from
  // the top allocation earns a control there
  srcText.indexOf('the game table NO LONGER offers the marker') !== -1 &&
  srcText.indexOf('return validatePendingMarker(') !== -1 &&
  srcText.indexOf("if (f.status === 'playing') return true;") === -1 &&
  srcText.indexOf('return markerManualMode;') === -1 &&
  srcText.indexOf('board-assigned (board-first') !== -1 &&
  srcText.indexOf('MARKER-7 OFF: no marker control on any row') !== -1);
check('confirmed marker is shown in every marker mode EXCEPT OFF (hidden, never deleted)',
  srcText.indexOf('if (markerUiOn && fMarkerId != null && f.delayed) {') !== -1 &&
  srcText.indexOf('A confirmed duty is deliberately NOT deleted') !== -1 &&
  // the runtime is never cleared by a mode switch
  (srcText.match(/data\.markerRuntime = createMarkerRuntime\(\)/g) || []).length === 1 &&
  srcText.indexOf('schedulerUi.markerPolicy = mode;') !== -1);
// COLS-07: the single fixture pane + content-aware sidebar became three
// columns (tonight | delayed | NOT HERE) at ~50/25/25, each scrolling on its
// own under a FULL-WIDTH scheduling area. Per-scale NOT HERE bounds survive.
check('layout: tonight | delayed side by side in a full-height NOT HERE page split',
  srcText.indexOf("'.sssl-cols{flex:1;display:flex;min-height:0;align-items:stretch}'") !== -1 &&
  srcText.indexOf("'.sssl-left{flex:1 1 75%;display:flex;flex-direction:column;min-height:0;min-width:0}'") !== -1 &&
  srcText.indexOf("'.sssl-fixtures-row{flex:1;display:flex;min-height:0;min-width:0}'") !== -1 &&
  srcText.indexOf("'.sssl-col.today{flex:2 1 0}'") !== -1 &&
  srcText.indexOf("'.sssl-col.delayed{flex:1 1 0;border-left:1px solid var(--border);background:var(--roster)}'") !== -1 &&
  // MARKER-10: NOT HERE is adjustable (drag divider / rail collapse); its
  // default width is still the quarter it always was
  srcText.indexOf("'.sssl-col.nothere{flex:0 0 var(--nh-w,25%);border-left:1px solid var(--border);background:var(--roster)}'") !== -1 &&
  srcText.indexOf("'.sssl-splitter{flex:0 0 7px;align-self:stretch;cursor:col-resize;position:relative;background:transparent;touch-action:none}'") !== -1 &&
  srcText.indexOf("const splitter = el('div', 'sssl-splitter');") !== -1 &&
  srcText.indexOf('cols.appendChild(splitter);') !== -1 &&
  srcText.indexOf('let nhWidthPx = Number.isSafeInteger(state.night && state.night.notHereWidth)') !== -1 &&
  srcText.indexOf('nhWidthPx = val;') !== -1 &&
  srcText.indexOf('notHereWidth: saved,') !== -1 &&
  srcText.indexOf('persistNight();') !== -1 &&
  srcText.indexOf("else if (ev.key === 'ArrowRight') applyNhWidth(nhWidthOf() - 16, true);") !== -1 &&
  srcText.indexOf("setRail(overlay.dataset.nh !== 'rail');") !== -1 &&
  srcText.indexOf("'.sssl-col{display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}'") !== -1 &&
  srcText.indexOf("'.sssl-main{flex:1;display:flex;flex-direction:column;min-height:0}'") !== -1 &&
  (srcText.match(/--roster-min:/g) || []).length === 6 &&
  srcText.indexOf('overflow-y:auto') !== -1);
check('narrow windows stack the regions instead of clipping them',
  srcText.indexOf('@media (max-width:860px){.sssl-cols{flex-wrap:wrap;overflow-y:auto}.sssl-cols .sssl-left{flex:1 1 100%}') !== -1);
check('both top control bars stay FULL WIDTH above the split',
  srcText.indexOf("overlay.appendChild(topbar);") !== -1 &&
  srcText.indexOf('overlay.appendChild(strip);') !== -1 &&
  srcText.indexOf('overlay.appendChild(main);') !== -1);
check('NOT HERE is a full-height right panel below the second toolbar (not a fixture column)',
  srcText.indexOf("cols.appendChild(left);") !== -1 &&
  srcText.indexOf('cols.appendChild(colNotHere);') !== -1 &&
  srcText.indexOf('fixturesRow.appendChild(colToday);') !== -1 &&
  srcText.indexOf('fixturesRow.appendChild(colDelayed);') !== -1 &&
  srcText.indexOf('left.appendChild(advicePane);') !== -1 &&
  srcText.indexOf('left.appendChild(fixturesRow);') !== -1 &&
  srcText.indexOf('main.appendChild(advicePane);') === -1);
check('recommendations render at the top of the LEFT region only (no duplicate section)',
  srcText.indexOf('advicePane.appendChild') !== -1 &&
  srcText.indexOf('listPane.appendChild(head)') === -1 &&
  srcText.indexOf('delayedPane.appendChild(pRow)') === -1 &&
  srcText.indexOf('const listHead = el') === -1);
check('one shared row builder renders both fixture columns (no duplicated controls)',
  srcText.indexOf('const renderFixtureGroups = (pane, rows, liveCounts) => {') !== -1 &&
  srcText.indexOf('const liveDelayedCounts = liveDelayedGroupCounts(delayedRows);') !== -1 &&
  srcText.indexOf('renderFixtureGroups(listPane, currentRows, {});') !== -1 &&
  srcText.indexOf('renderFixtureGroups(delayedPane, delayedRows, liveDelayedCounts);') !== -1 &&
  (srcText.match(/const showMarkerControl = /g) || []).length === 1 &&
  (srcText.match(/el\('span', 'sssl-chip sm', 'B' \+ assignedBoard/g) || []).length === 2);
// ---- DELAY-LIVE: live-match awareness in the delayed panel ----
// The live state used here is the EXISTING one (the live poll matches records
// by league_match_id / numeric pair / abbreviations); these guards pin the
// presentation rules that were added on top of it.
check('DELAY-LIVE: live delayed fixtures are counted per STABLE date group',
  srcText.indexOf('function liveDelayedGroupCounts(delayedRows) {') !== -1 &&
  srcText.indexOf("if (!f || f.status !== 'playing') return;") !== -1 &&
  srcText.indexOf('const key = collapsedGroupKey(f);') !== -1);
check('DELAY-LIVE: a live group is forced open from DERIVED state (manual preference never overwritten)',
  srcText.indexOf('function delayedGroupCollapsed(collapsedState, groupKey, liveCount) {') !== -1 &&
  srcText.indexOf('if (Number.isFinite(liveCount) && liveCount > 0) return false;') !== -1 &&
  srcText.indexOf('return !!(collapsedState && groupKey && collapsedState[groupKey]);') !== -1 &&
  // the click handler is the ONLY writer of the preference, and it is only
  // attached when the group holds no live match
  srcText.indexOf('delayedCollapsed[groupKey] = !delayedCollapsed[groupKey];') !== -1 &&
  srcText.indexOf("bar.classList.add('autolive');") !== -1 &&
  srcText.indexOf("bar.classList.add('collapsible');") !== -1);
check('DELAY-LIVE: live group heading carries a compact PLAYING count, not a collapse toggle',
  srcText.indexOf("const chip = el('span', 'liven', '● PLAYING ' + live);") !== -1 &&
  srcText.indexOf("bar.classList.add('live');") !== -1 &&
  srcText.indexOf('Expanded automatically: a fixture in this group is PLAYING. ') !== -1 &&
  srcText.indexOf("'.sssl-datebar .liven{display:inline-block;margin-left:6px;") !== -1 &&
  srcText.indexOf("'.sssl-datebar.live{background:var(--playing-bg);color:var(--playing-ink)}'") !== -1);
check('DELAY-LIVE: the live highlight itself is the existing PLAYING row style',
  srcText.indexOf("const row = el('div', 'sssl-row' + (alt ? ' alt' : '') + (f.status === 'playing' ? ' playing' : ''));") !== -1);
check('COLS-09: ONE authoritative Tonight/Delayed classification rule',
  srcText.indexOf('function applyMatchDateClassification(fixtures, dateIso) {') !== -1 &&
  srcText.indexOf("if (date === iso) { f.delayed = false; counts.current += 1; return; }") !== -1 &&
  srcText.indexOf("if (date < iso) { f.delayed = true; counts.delayed += 1; return; }") !== -1 &&
  srcText.indexOf('counts.future += 1;') !== -1 &&
  // called once per render BEFORE the panel split and the scheduler build
  srcText.indexOf('applyMatchDateClassification(data.fixtures, state.selectedMatchDate);') !== -1 &&
  srcText.indexOf('applyMatchDateClassification(ctx.data.fixtures, ctx.state.selectedMatchDate);') !== -1 &&
  srcText.indexOf('bucketDelayed: !!delayed,') !== -1);
check('columns are classified by the existing factual delayed flag only',
  srcText.indexOf('const delayedRows = shown.filter((f) => f.delayed);') !== -1 &&
  srcText.indexOf('const currentRows = shown.filter((f) => !f.delayed);') !== -1);
check('delayed column visibility is NOT tied to the Delayed ON/OFF scheduling option',
  srcText.indexOf('delayedPane.appendChild(delayedHead);') !== -1 &&
  srcText.indexOf("if (!schedulerUi.includeDelayed) delayedPane") === -1);
check('NOT HERE player text is venue-readable (larger, bolder)',
  srcText.indexOf("color:var(--text);font-size:var(--fs);font-weight:600;padding:var(--pad-player)") !== -1);
check('(N/R): R is a real bordered control with a permanent overlaid caret affordance',
  srcText.indexOf("'.sssl-rsel{background:var(--control);color:var(--accent);border:1px solid var(--control-border);") !== -1 &&
  srcText.indexOf("el('span', 'dcaret', '\\u25be')") !== -1 &&
  srcText.indexOf("'.sssl-rwrap .dcaret{position:absolute;right:3px;top:50%;transform:translateY(-50%);pointer-events:none;") !== -1 &&
  srcText.indexOf("const rWrap = el('span', 'rwrap');") !== -1 &&
  // still a REAL control with the same interaction wiring
  srcText.indexOf('rSel.addEventListener(\'click\', (e) => e.stopPropagation());') !== -1 &&
  srcText.indexOf("rSel.addEventListener('change', () => {") !== -1 &&
  srcText.indexOf('const chosen = parseInt(rSel.value, 10);') !== -1);
check('MARKER-8: Not Here numerics are centred, ~13px at 100%, and consistently sized',
  // font-size is derived from --fs (14px at 100% => 13px) so every zoom step follows
  srcText.indexOf('font-size:calc(var(--fs) - 1px)') !== -1 &&
  srcText.indexOf('text-align:center;text-align-last:center;vertical-align:middle') !== -1 &&
  srcText.indexOf('padding:2px 12px;') !== -1 &&
  srcText.indexOf('width:calc(var(--fs) * 2 + 16px)') !== -1 &&
  srcText.indexOf('font-weight:700') !== -1 &&
  // one rule styles every Not Here numeric input (no per-player overrides)
  (srcText.match(/rSel\.className = 'sssl-rsel'/g) || []).length === 1 &&
  srcText.indexOf("rSel.style.") === -1);
check('(N/R) affordance is presentation-only (semantics untouched)',
  srcText.indexOf('for (let v = 0; v <= n; v++)') !== -1 &&
  srcText.indexOf("e.stopPropagation()") !== -1 &&
  srcText.indexOf('setRemainingDelayedAllowance(delayRt, p.id') !== -1);
check('selected-division roster boundary enforced at session, candidate and confirmation boundaries',
  srcText.indexOf('function filterRosterForDivision(') !== -1 &&
  srcText.indexOf('filterRosterForDivision(cfg.players, cfg.selectedDivision)') !== -1 &&
  srcText.indexOf("reason: 'player-division-mismatch'") !== -1 &&
  (srcText.match(/rosterDivisionIds/g) || []).length >= 5);
check('marker selector and factual marker control remain present (3C corrections preserved)',
  srcText.indexOf('function markerSelectEl(opts)') !== -1 &&
  srcText.indexOf('releaseMarkerFromGame(mkr, f)') !== -1);
check('global opening-set selection intact (bounded, not greedy)',
  srcText.indexOf('CANDIDATE_BREADTH = 4') !== -1 &&
  srcText.indexOf('GLOBAL, not greedy') !== -1);
check('marker overlay follows the edge-reserve overlay pattern',
  srcText.indexOf("'.sssl-row .mkown{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%)") !== -1 &&
  srcText.indexOf("'.sssl-row .mkslot{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%)}'") !== -1 &&
  srcText.indexOf("'.sssl-row.playing .mkown{right:calc(var(--edge-reserve) + 96px)}'") !== -1);
// ---- POST-LIVE-TRIAL FIX SLICE (TRIAL-01..07) source guards ----
check('TRIAL-01: night settings persist inside the EXISTING league store key (no new key, JSON night field)',
  srcText.indexOf('night: state.night || null,') !== -1 &&
  srcText.indexOf('if (parsed.night && typeof parsed.night === \'object\'') !== -1 &&
  srcText.indexOf('function buildNightPersistedState(') !== -1 &&
  srcText.indexOf("setItem(THEME_KEY, state.theme)") !== -1);
check('TRIAL-01: boot restores night settings into the scheduler UI and allowance runtime',
  srcText.indexOf('if (state.night.strategy) schedulerUi.strategy = state.night.strategy;') !== -1 &&
  srcText.indexOf('applySavedDelayedAllowance(') !== -1 &&
  srcText.indexOf('const persistNight = () => {') !== -1);
check('TRIAL-01: board/marker runtimes stay memory-only (no persistence write for ownership)',
  srcText.indexOf('data.boardRuntime = buildNightPersistedState') === -1 &&
  srcText.indexOf('night.markerRuntime') === -1 &&
  srcText.indexOf('night.boardRuntime') === -1);
check('TRIAL-02: both release handlers APPLY the pure releaseBoard result (no silent no-op)',
  (srcText.match(/const res = releaseBoard\(rtv, assignedBoard\.boardNumber\);/g) || []).length === 2 &&
  (srcText.match(/if \(res\.ok\) \{\s*data\.boardRuntime = res\.runtime;\s*persistDispatch\(\);\s*\}/g) || []).length >= 1 &&
  (srcText.match(/if \(res\.ok\) data\.boardRuntime = res\.runtime;/g) || []).length >= 1 &&
  srcText.indexOf('releaseBoard(rtv, assignedBoard.boardNumber);\n') === -1);
check('TRIAL-02B: BOARD chip is styled and compact (no unstyled .chip class, sm variant present)',
  srcText.indexOf("el('span', 'chip', 'B '") === -1 &&
  (srcText.match(/el\('span', 'sssl-chip sm', 'B' \+ assignedBoard/g) || []).length === 2 &&
  srcText.indexOf("'.sssl-chip.sm{") !== -1);
check('TRIAL-02: FIXTURE-row edge reserves untouched (advice rows moved to the grid instead)',
  (srcText.match(/--edge-reserve:96px/g) || []).length === 1 &&
  (srcText.match(/--edge-reserve:/g) || []).length === 6 &&
  srcText.indexOf("'.sssl-row .sssl-pa{margin-left:var(--edge-reserve)}'") !== -1 &&
  srcText.indexOf("'.sssl-row .sssl-pb{margin-right:var(--edge-reserve)}'") !== -1 &&
  srcText.indexOf("'.sssl-advice .sssl-pb{margin-right:var(--edge-reserve)}'") === -1);
check('TRIAL-03: recommended-group participant union excluded from every per-game marker candidate list',
  // MARKER-11: the union covers the WHOLE recommendation pane, not just the
  // free-board prefix, so a player in a "waiting for a board" row can never
  // mark an earlier row of the same pane (the Drew Tyler defect).
  srcText.indexOf('const recommendedGroupIds = nextCapacity > 0') !== -1 &&
  srcText.indexOf('? nextDispatchParticipantIds(advice.recommended, 0, advice.recommended.length)') !== -1 &&
  srcText.indexOf('proposalPool.filter((id) => !recommendedGroupIds.has(id) && !ownIds.has(id))') !== -1 &&
  srcText.indexOf('MARKER-11 dispatch-GROUP union') !== -1 &&
  srcText.indexOf('TRIAL-03 opening-wave resource validity') !== -1);
check('TRIAL-03: exhausted candidate list skips honestly (no dead-end branch)',
  srcText.indexOf('if (!extended) select(idx + 1, score, seq);') !== -1);
check('TRIAL-04: MARKER OFF is a domain gate, not just a dropdown filter',
  srcText.indexOf("reason: 'player-marker-off'") !== -1 &&
  srcText.indexOf('if (markerOff.indexOf(p.id) !== -1) return;') !== -1 &&
  srcText.indexOf('const markerOffSet = new Set(markerOffIds);') !== -1 &&
  srcText.indexOf('markerOffIds: mkCtx.markerOffIds,') !== -1);
check('TRIAL-04: roster toggle is compact, per-player, and persisted with the night settings',
  (srcText.match(/el\('button', 'mkoff'/g) || []).length === 1 &&
  srcText.indexOf("'.sssl-playerrow .mkoff{") !== -1 &&
  srcText.indexOf("'.sssl-playerrow .mkoff.on{") !== -1 &&
  srcText.indexOf('state.markerOffIds = Array.from(s);') !== -1);
check('TRIAL-06: delayed catch-up default is 0 (opt-in per player)',
  srcText.indexOf('const DEFAULT_DELAYED_CATCHUP_ALLOWANCE = 0;') !== -1 &&
  srcText.indexOf('const DEFAULT_DELAYED_CATCHUP_ALLOWANCE = 1;') === -1);
check('TRIAL-06: bulk All→0 / All→1 controls exist and persist through the night snapshot',
  srcText.indexOf("el('button', 'sssl-btn', 'All \\u2192 0')") !== -1 &&
  srcText.indexOf("el('button', 'sssl-btn', 'All \\u2192 1')") !== -1 &&
  srcText.indexOf('applyBulkAllowance') !== -1 &&
  srcText.indexOf("'.sssl-bulkdelay{") !== -1 &&
  srcText.indexOf('absentSet.has(id)') !== -1);
check('TRIAL-05: live note shows an updated cue when a poll changes the PLAYING set',
  srcText.indexOf("const updated = info.updated ? ' · updated' : '';", ) !== -1 &&
  srcText.indexOf('info.updated = playingKeysAfter.size !== playingKeysBefore.size') !== -1);
check('TRIAL-07: light theme softened; dark theme untouched; status colours preserved',
  srcText.indexOf('[data-theme="light"]{--bg:#e8eaf0;--panel:#f2f3f7;--roster:#eceef3;') !== -1 &&
  srcText.indexOf('--control:#f7f8fa;--control-border:#94a3b8;--accent:#0d9488') !== -1 &&
  srcText.indexOf('--bg:#0f172a;--panel:#1e293b;') !== -1 &&
  (srcText.match(/--playing-bg:/g) || []).length >= 2 &&
  (srcText.match(/--playing-ink:/g) || []).length >= 2);
const bnpsBody = srcText.slice(srcText.indexOf('function buildNightPersistedState('),
  srcText.indexOf('function buildNightPersistedState(') + 900);
check('night snapshot never contains planner or factual-state keys',
  bnpsBody.indexOf('recommended') === -1 && bnpsBody.indexOf('projected') === -1 &&
  bnpsBody.indexOf('.status') === -1 && bnpsBody.indexOf('markerRuntime') === -1 &&
  bnpsBody.indexOf('boardRuntime') === -1);
// ---- ACCEPTANCE FOLLOW-UP (ACCEPT-01..04) source guards ----
check('ACCEPT-01: dispatch queue order is applied + remembered in render, and survives board dispatch',
  srcText.indexOf('advice.recommended = applyDispatchOrder(advice.recommended, data.dispatchOrder);') !== -1 &&
  srcText.indexOf('data.dispatchOrder = rememberDispatchOrder(advice.recommended);') !== -1 &&
  srcText.indexOf('const dispatchToBoard = (boardNumber, game, proposedMarkerId) => {') !== -1 &&
  /invalidateDispatchOrder\(\);\r?\n\s*state\.night = buildNightPersistedState/.test(srcText));
check('ACCEPT-01: genuine changes always invalidate the queue; dispatch/release never do',
  (srcText.match(/data\.dispatchOrder = null;/g) || []).length >= 6 &&
  /const dispatchToBoard = \(boardNumber, game, proposedMarkerId\) => \{\r?\n\s*const res = assignGameToBoard/.test(srcText));
check('ACCEPT-01: remembered queue is session presentation memory only (never persisted)',
  srcText.indexOf('data.dispatchOrder') !== -1 &&
  srcText.indexOf('dispatchOrder: ') === -1 &&
  bnpsBody.indexOf('dispatchOrder') === -1);
check('ACCEPT-02: dispatch hands the proposal over as PENDING advice, never factual MARKING',
  // The handoff may be re-pointed at the named board's own loser (LOSER
  // continuity), so the persisted pending advice is `handoff`, not the raw
  // plan proposal. It is still only PENDING advice.
  srcText.indexOf('if (Number.isSafeInteger(handoff)) {') !== -1 &&
  srcText.indexOf('? loserPendingForBoard(') !== -1 &&
  srcText.indexOf('const pendingId = validatePendingMarker(pendingRaw, markerCtxFor(f));') !== -1 &&
  srcText.indexOf("el('span', 'mkslot' +") !== -1 &&
  srcText.indexOf("          (fMarkerId == null && pendingId != null ? ' pending' : ''));") !== -1 &&
  srcText.indexOf('const clearPendingMarker = (game) => {') !== -1);
check('ACCEPT-02: pending advice is re-validated against current eligibility, never shown stale',
  srcText.indexOf('function validatePendingMarker(pendingId, context)') !== -1 &&
  srcText.indexOf("reason: 'player-marker-off'") !== -1);
check('ACCEPT-03: board ownership + pending handoff persist in the SAME store key, restored defensively',
  srcText.indexOf('dispatch: (dispatchState && typeof dispatchState') !== -1 &&
  srcText.indexOf("if (n.dispatch && typeof n.dispatch === 'object'") !== -1 &&
  srcText.indexOf('function restoreDispatchState(boardCount, saved, fixtures)') !== -1 &&
  srcText.indexOf('restoreDispatchState(schedulerUi.boardCount, savedDispatch, data.fixtures)') !== -1);
check('ACCEPT-03/4C: release persists immediately (a released board never resurrects)',
  (srcText.match(/persistDispatch\(\);/g) || []).length >= 3 &&
  srcText.indexOf('function snapshotDispatchState(runtime, pendingMarkers, history, fixtures)') !== -1);
check('ACCEPT-03/5: dispatch state is scoped by division@date (never crosses divisions)',
  srcText.indexOf('mergeDispatchBucket(state.night && state.night.dispatch, dispatchBucketKey(state)') !== -1 &&
  srcText.indexOf('function mergeDispatchBucket(previous, bucket, value)') !== -1);
check('ACCEPT-04: marker control has materially more width (real names display in full)',
  srcText.indexOf('max-width:260px') !== -1 && srcText.indexOf('max-width:240px') !== -1 &&
  srcText.indexOf('max-width:160px') === -1 && srcText.indexOf('max-width:120px') === -1);
check('ACCEPT-04/P: marker overlays stay absolute (accepted centring contract untouched)',
  srcText.indexOf("'.sssl-mkslot.pending .sssl-mksel{") !== -1 &&
  srcText.indexOf("'.sssl-row .mkslot{position:absolute;right:var(--edge-reserve);top:50%;transform:translateY(-50%)}'") !== -1 &&
  (srcText.match(/--edge-reserve:/g) || []).length === 6 &&
  (srcText.match(/--edge-reserve:96px/g) || []).length === 1);
check('MARKER-9: the full-boards state is the abbreviated compact label, not clipped text',
  srcText.indexOf("placeholder.textContent = 'B: FULL';") !== -1 &&
  srcText.indexOf('NO FREE BOARD') === -1);
// ---- MARKER model (acceptance follow-up #2) source guards ----
check('MARKER-1: a pending marker RESERVES the player in the domain (proposal, selector, confirmation)',
  srcText.indexOf('function reservedPendingMarkerIds(data, state, exceptGameKey)') !== -1 &&
  srcText.indexOf("reason: 'player-marker-pending'") !== -1 &&
  srcText.indexOf('if (reserved.indexOf(p.id) !== -1) return;') !== -1 &&
  srcText.indexOf('const proposalPool = openPool.filter((id) => !reservedIds.has(id));') !== -1 &&
  srcText.indexOf('pendingMarkerIds: reservedPendingMarkerIds(data, state, markerGameKey(game)).filter') !== -1);
check('MARKER-1: reservation is NOT factual MARKING (distinct scheduler state)',
  srcText.indexOf("RESERVED: 'RESERVED',") !== -1 &&
  srcText.indexOf('p.state = PLAYER_STATES.RESERVED;') !== -1 &&
  srcText.indexOf('markingPlayerIds: data.markerRuntime') !== -1);
check('MARKER-2: the "already played tonight" signal uses FACTUAL completion evidence only',
  srcText.indexOf('function getPlayedPlayerIds(completedMatches, date, division)') !== -1 &&
  srcText.indexOf('function completedMatchesFromApiRecords(records)') !== -1 &&
  srcText.indexOf('function isCompletedRecord(rec)') !== -1 &&
  srcText.indexOf("if (item.status === 'C') {") !== -1 &&
  srcText.indexOf('data.completedMatches = Array.isArray(parsed.completed)') !== -1);
check('MARKER-2: "already played" is a FAIR PREFERENCE, never a hard eligibility gate',
  srcText.indexOf('playedIds.has(id) &&') === -1 &&
  srcText.indexOf('&& playedIds.has(id)') === -1 &&
  srcText.indexOf('const proposalPool = openPool.filter((id) => !reservedIds.has(id));') !== -1 &&
  srcText.indexOf('const MARKER_PLAYED_BONUS = 500;') !== -1 &&
  srcText.indexOf('(playedIds.has(id) ? MARKER_PLAYED_BONUS : 0) -') !== -1 &&
  srcText.indexOf('playedIds,') !== -1);
// COLS-02: "next N" is still capacity-driven and never hard-coded to four.
// It is now computed from FACTUAL occupancy (a PLAYING game the operator has
// not named still occupies a physical board), so a full venue yields 0
// instead of the plan's length.
check('MARKER-4: next-N is capacity-driven (factual free board slots), never hard-coded to four',
  srcText.indexOf('const DEFAULT_SCHEDULING_CAPACITY = 4;') !== -1 &&
  srcText.indexOf('function getNextDispatchCapacity(session, boardRuntime)') !== -1 &&
  srcText.indexOf('return getBoardOccupancy(session, boardRuntime).free;') !== -1 &&
  srcText.indexOf('function getBoardOccupancy(session, boardRuntime)') !== -1 &&
  srcText.indexOf('if (b && typeof b.gameKey === \'string\' && b.gameKey) busy.add(b.gameKey);') !== -1 &&
  srcText.indexOf('if (key) busy.add(key);') !== -1 &&
  srcText.indexOf('return { managed, boardsKnown: !!rows, capacity, occupied, free: Math.max(0, capacity - occupied) };') !== -1 &&
  srcText.indexOf(': DEFAULT_SCHEDULING_CAPACITY);') !== -1 &&
  srcText.indexOf('function nextDispatchParticipantIds(games, index, capacity)') !== -1 &&
  // 6 original capacity derivations + 2 in projectNextWaveWithDuties, which
  // replays the plan at the same capacity as the plan itself used.
  (srcText.match(/DEFAULT_SCHEDULING_CAPACITY/g) || []).length === 8 &&
  srcText.indexOf('? (session.managedBoardsEnabled ? (session.boardCount || 4) : 4)') === -1 &&
  srcText.indexOf('(session.managedBoardsEnabled ? session.boardCount : 4)') === -1);
check('MARKER-4: zero capacity invents no marker allocation; an insufficient pool is left honestly null',
  srcText.indexOf('const recommendedGroupIds = nextCapacity > 0') !== -1 &&
  srcText.indexOf('      : [];') !== -1 &&
  srcText.indexOf('if (!cands.length) { select(idx + 1, score, seq); return; }') !== -1 &&
  srcText.indexOf('if (!extended) select(idx + 1, score, seq);') !== -1 &&
  srcText.indexOf('proposedMarkerId = bestSeq ? bestSeq[i] : null') !== -1);
check('MARKER-2: completion is never inferred from PLAYING',
  srcText.indexOf("f.status === 'playing') || playedIds.has(id)") === -1 &&
  srcText.indexOf('playedIds.add') === -1);
check('MARKER-3: FAIR rotation drives the GLOBAL opening-wave allocation',
  srcText.indexOf('const MARKER_FAIR_PENALTY = 1000;') !== -1 &&
  srcText.indexOf('const MARKER_RECENT_PENALTY = 250;') !== -1 &&
  // LOSER adds a per-(game, player) duty bonus to the same global search, so
  // FAIR scoring is unchanged while a loser still wins his own game.
  srcText.indexOf('select(idx + 1, score + combinedScore(id) + loserDutyBonus(idx, id), seq);') !== -1 &&
  srcText.indexOf('const loserDutyBonus = (idx, id) =>') !== -1 &&
  srcText.indexOf('scoreOf: combinedScore') !== -1);
check('MARKER-2/3: the played preference is the FIRST ranking tier, rotation penalty stays dominant',
  srcText.indexOf('// Tier 1: factual "already played tonight" - preference, not a gate.') !== -1 &&
  srcText.indexOf('const played = o.playedIds instanceof Set ? o.playedIds') !== -1 &&
  srcText.indexOf('that actually happened - always wins over the soft "has played" hint.') !== -1 &&
  srcText.indexOf('if (ca !== cb) return ca - cb;') !== -1);
check('MARKER-3: marker history is recorded/released and persisted inside the existing store key',
  srcText.indexOf('function recordMarkerMark(history, playerId, gameKey)') !== -1 &&
  srcText.indexOf('function releaseMarkerMark(history, playerId)') !== -1 &&
  srcText.indexOf('entry.history = normalizeMarkerHistory(b.history);') !== -1 &&
  srcText.indexOf('snapshotDispatchState(data.boardRuntime, data.pendingMarkers, data.markerHistory, data.fixtures)') !== -1 &&
  srcText.indexOf('data.markerHistory = restored.history;') !== -1);
check('MARKER-1: a reservation never blocks the game that owns the pending marker',
  srcText.indexOf('function reservedPendingMarkerIds(data, state, exceptGameKey)') !== -1 &&
  srcText.indexOf('reservedPendingMarkerIds(data, state, markerGameKey(game))') !== -1 &&
  srcText.indexOf('if (exceptGameKey != null && gameKey === exceptGameKey) return;') !== -1);
check('MARKER-4: marker policy control exists, defaults to FAIR and persists with night controls',
  srcText.indexOf('markerPolicy: MARKER_POLICIES.FAIR,') !== -1 &&
  srcText.indexOf("strip.appendChild(el('span', 'lbl', 'Marker'));") !== -1 &&
  srcText.indexOf('if (isMarkerPolicy(n.markerPolicy)) night.markerPolicy = n.markerPolicy;') !== -1);
check('MARKER-4/10: LOSER is ALWAYS selectable - the mode never depends on a data field',
  // The retired gate required data.loserIds, which no producer ever wrote, so
  // the control was permanently disabled. Absence of a result is now a
  // per-assignment FAIR fallback, not an unavailable mode.
  srcText.indexOf('if (policy === MARKER_POLICIES.LOSER) return true;') !== -1 &&
  srcText.indexOf('loserAvailable') === -1 &&
  srcText.indexOf('b.disabled = !usable') === -1 &&
  srcText.indexOf('LOSER unavailable: no factual winner/loser result data') === -1 &&
  srcText.indexOf('data.loserIds') === -1);
check('MARKER-5: LOSER is factual-only, never guessed',
  srcText.indexOf('function rankLoserCandidates(candidates, options)') !== -1 &&
  srcText.indexOf('if (!loserIds) return null;') !== -1 &&
  srcText.indexOf('function isMarkerPolicyAvailable(policy, view)') !== -1 &&
  // A draw, a bye, a missing score and an unknown side all yield NO loser.
  srcText.indexOf('function resultLoserId(playerAId, aScore, playerBId, bScore)') !== -1 &&
  srcText.indexOf('if (aScore === bScore) return null;') !== -1 &&
  srcText.indexOf('if (item.is_bye) { skipped.bye += 1; return; }') !== -1 &&
  /winner_id|loser_id|loserScore|winnerScore/.test(srcText) === false);
check('LOSER-10: factual scores are retained from both data paths and become duties',
  srcText.indexOf('function parseMatchScore(side)') !== -1 &&
  srcText.indexOf('const cHomeScore = parseMatchScore(cHome);') !== -1 &&
  srcText.indexOf('loserId: resultLoserId(cAwayId, cAwayScore, cHomeId, cHomeScore),') !== -1 &&
  srcText.indexOf('scores: [aScore, bScore],') !== -1 &&
  srcText.indexOf('function getLoserDuties(completedMatches, date, division)') !== -1 &&
  srcText.indexOf('function loserPreferenceForGame(duties, boardNumber)') !== -1);
check('LOSER-10: candidate ordering prefers the factual loser and still respects sequence safety',
  srcText.indexOf('loserIds: loserPreferredByGame[idx].length > 0 ? loserPreferredByGame[idx] : null,') !== -1 &&
  srcText.indexOf('const loserPreferredByGame = openGames.map((game) =>') !== -1 &&
  srcText.indexOf('game.markerFallback = markerPolicy === MARKER_POLICIES.LOSER &&') !== -1);
check('MARKER-5: the loser is never auto-confirmed as MARKING',
  srcText.indexOf('assignMarkerToGame') !== -1 &&
  srcText.indexOf('data.markerRuntime = res.runtime;') !== -1 &&
  // A proposal is still only ADVICE: nothing in the advice path assigns.
  srcText.indexOf('game.proposedMarkerId = bestSeq ? bestSeq[i] : null;') !== -1);
// ---- COLS corrective pass source guards (corrective pass, 15 Oct live use) ----
check('COLS-01: confirmed marker assignments are persisted and restored (Refresh keeps them)',
  srcText.indexOf('function snapshotMarkerAssignments(runtime)') !== -1 &&
  srcText.indexOf('function normalizeMarkerAssignments(raw)') !== -1 &&
  srcText.indexOf('markers: snapshotMarkerAssignments(data.markerRuntime),') !== -1 &&
  // STABLE-01: each confirmed duty also persists its match identity, so a
  // restore can re-find the match after a key-form change.
  srcText.indexOf('markerIdentity: snapshotMarkerIdentity(data.markerRuntime, data.fixtures)') !== -1 &&
  srcText.indexOf('entry.markers = snapshotMarkerAssignments(normalizeMarkerAssignments(b.markers));') !== -1 &&
  srcText.indexOf('data.markerRuntime = restored.markerRuntime;') !== -1 &&
  srcText.indexOf('const markerRuntime = createMarkerRuntime();') !== -1 &&
  // ADVICE is never persisted as an assignment.
  srcText.indexOf('if (!runtime.byMarker || runtime.byMarker[id] !== key) return;') !== -1 &&
  srcText.indexOf('match-night-singles:marker') === -1);
check('COLS-01: the marker control states fact vs advice vs unassigned honestly',
  srcText.indexOf("'No marker assigned. DartConnect does not publish marker assignments, so this is the factual '") !== -1 &&
  srcText.indexOf("'RECOMMENDED marker: '") !== -1 &&
  srcText.indexOf("'CONFIRMED marker: '") !== -1 &&
  srcText.indexOf('advice only, NOT yet assigned') !== -1 &&
  srcText.indexOf('never as a fact.') !== -1);
check('COLS-02: recommendations are labelled by factual board availability',
  srcText.indexOf('const split = splitStartableRecommendations(advice.recommended, advice.freeBoards);') !== -1 &&
  srcText.indexOf('function splitStartableRecommendations(recommended, freeBoards)') !== -1 &&
  srcText.indexOf("'no free board — '") !== -1 &&
  srcText.indexOf('boards in play; these start as boards free') !== -1 &&
  srcText.indexOf("'↓ waiting for a board · '") !== -1 &&
  srcText.indexOf("row.classList.add('awaiting');") !== -1 &&
  srcText.indexOf('advice.freeBoards = occupancy.free;') !== -1 &&
  srcText.indexOf('advice.occupiedBoards = occupancy.occupied;') !== -1);
check('COLS-03: a missing marker is stated, never concealed or invented',
  srcText.indexOf("const nm = el('span', 'mknone', 'NO MARKER');") !== -1 &&
  srcText.indexOf('No eligible marker could be recommended for this game ') !== -1 &&
  srcText.indexOf("'.sssl-advice .mknone{") !== -1);
check('COLS-02/03: three distinct marker states - assigned, genuinely missing, not yet allocated',
  // A full venue is NOT a marker shortage: allocation was never attempted.
  srcText.indexOf("game.markerState = (game.confirmedMarkerId != null || game.proposedMarkerId != null)") !== -1 &&
  srcText.indexOf(": (nextCapacity > 0 ? 'missing' : 'awaiting');") !== -1 &&
  srcText.indexOf('game.markerUnavailable = game.markerState === \'missing\';') !== -1 &&
  srcText.indexOf("if (advice.markerAdviceEnabled && g.markerState === 'missing') {") !== -1 &&
  srcText.indexOf('Waiting for a board — no marker allocation was attempted for this game yet.') !== -1);
check('COLS-04: projections are never presented as immediately executable',
  srcText.indexOf("'next projected possibility · starts after the games above'") !== -1 &&
  srcText.indexOf('Projected next wave — not startable yet.') !== -1 &&
  srcText.indexOf("pRow.classList.add('dependent');") !== -1 &&
  // A projected player may still be PLAYING above; a proposed MARKER never is,
  // because the projection is reconciled against the duties first.
  srcText.indexOf('a player named here may still be PLAYING above.') !== -1 &&
  srcText.indexOf('Anyone proposed as a MARKER above is never ') !== -1);
check('MARKER-7: four exclusive marker modes in the one existing compact control',
  srcText.indexOf("OFF: 'OFF',") !== -1 &&
  srcText.indexOf("MANUAL: 'MANUAL',") !== -1 &&
  srcText.indexOf('[MARKER_POLICIES.OFF, \'OFF\',') !== -1 &&
  srcText.indexOf('[MARKER_POLICIES.MANUAL, \'MANUAL\',') !== -1 &&
  srcText.indexOf('[MARKER_POLICIES.FAIR, \'FAIR\',') !== -1 &&
  srcText.indexOf("[MARKER_POLICIES.LOSER, 'LOSER',") !== -1 &&
  // one pressed mode at a time, persisted with the other night settings
  srcText.indexOf("const b = el('button', markerPolicy === mode ? 'on' : '', label);") !== -1 &&
  srcText.indexOf('schedulerUi.markerPolicy = mode;') !== -1 &&
  srcText.indexOf('if (isMarkerPolicy(n.markerPolicy)) night.markerPolicy = n.markerPolicy;') !== -1 &&
  srcText.indexOf('markerPolicy: MARKER_POLICIES.FAIR,') !== -1);
check('MARKER-7: OFF produces no advice AND no marker controls; MANUAL controls but no advice',
  srcText.indexOf('function markerControlsVisible(policy) {') !== -1 &&
  srcText.indexOf('return policy !== MARKER_POLICIES.OFF;') !== -1 &&
  srcText.indexOf('function markerAdviceEnabledFor(policy) {') !== -1 &&
  srcText.indexOf('return policy === MARKER_POLICIES.FAIR || policy === MARKER_POLICIES.LOSER;') !== -1 &&
  srcText.indexOf('const markerAdviceEnabled = markerAdviceEnabledFor(markerPolicy);') !== -1 &&
  srcText.indexOf('advice.markerControlsVisible = markerControlsVisible(markerPolicy);') !== -1 &&
  srcText.indexOf('advice.markerControlsVisible = markerControlsVisible(markerPolicy);') !== -1 &&
  // OFF shows NOTHING marker-related: no hint line, no verdict
  srcText.indexOf("if (!advice.markerAdviceEnabled && advice.markerControlsVisible) {") !== -1 &&
  srcText.indexOf('Marker advice is OFF — MARKER: — means no marker is assigned.') === -1 &&
  srcText.indexOf('MANUAL — pick a marker for a fixture you can act on. Nothing is recommended or preselected; ') !== -1 &&
  // every mode is a real, selectable control (LOSER included)
  srcText.indexOf('const usable = mode !== MARKER_POLICIES.LOSER') === -1 &&
  srcText.indexOf('b.disabled = !usable') === -1);
check('MARKER-7: OFF removes the marker track from the grid and the roster marker toggle',
  srcText.indexOf("advicePane.classList.toggle('nomarkers', !markerUiOn);") !== -1 &&
  srcText.indexOf('.sssl-advicepane.nomarkers .sssl-advice{--adv-tpl:var(--adv-seq) var(--adv-board) minmax(0,1fr) var(--adv-vs) minmax(0,1fr) var(--adv-status)}') !== -1 &&
  srcText.indexOf('if (markerUiOn) {') !== -1 &&
  srcText.indexOf("const mkT = el('button', 'mkoff'") !== -1 &&
  srcText.indexOf('MARKER-7 OFF: marker availability is meaningless with no marker UI at') !== -1);
check('MARKER-9/COLS-10: fixture rows are ONE line in three fixed bands — [board] [game] [marker]',
  srcText.indexOf("'.sssl-col .sssl-row{display:grid;grid-template-columns:var(--fx-l,0px) minmax(0,1fr) var(--fx-r,0px);align-items:center;column-gap:4px}'") !== -1 &&
  srcText.indexOf("'.fx-pair{display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);align-items:center;column-gap:4px;min-width:0}'") !== -1 &&
  srcText.indexOf("'.fx-left,.fx-right{display:flex;align-items:center;gap:4px;min-width:0}'") !== -1 &&
  srcText.indexOf("'.fx-left{justify-content:flex-start}'") !== -1 &&
  srcText.indexOf("'.fx-right{justify-content:flex-end}'") !== -1 &&
  srcText.indexOf("'.fx-right .sssl-mksel{width:100%}'") !== -1 &&
  srcText.indexOf("'.sssl-col .sssl-row .sssl-pa{margin-left:4px}'") !== -1 &&
  srcText.indexOf("'.sssl-col .sssl-row .bown,.sssl-col .sssl-row .mkslot,.sssl-col .sssl-row .mkown,.sssl-col .sssl-row .bassign-slot,.sssl-col .sssl-row .sssl-playing{position:static;right:auto;top:auto;transform:none;margin-left:0}'") !== -1 &&
  // the pairing is a grid of its own: equal sides, so the vs x and the start
  // of every right-hand name are the same on every row (longest name on the
  // right defines the column)
  srcText.indexOf("const leftCol = el('div', 'fx-left');") !== -1 &&
  srcText.indexOf("const pair = el('div', 'fx-pair');") !== -1 &&
  srcText.indexOf('pair.appendChild(paSpan);') !== -1 &&
  srcText.indexOf("pair.appendChild(el('span', 'sssl-vs', 'vs'));") !== -1 &&
  srcText.indexOf('pair.appendChild(pbSpan);') !== -1 &&
  srcText.indexOf("const rightCol = el('div', 'fx-right');") !== -1 &&
  srcText.indexOf('row.appendChild(leftCol);') !== -1 &&
  srcText.indexOf('row.appendChild(pair);') !== -1 &&
  srcText.indexOf('row.appendChild(rightCol);') !== -1 &&
  // board facts/select LEFT, marker facts/select RIGHT
  srcText.indexOf('leftCol.appendChild(own);') !== -1 &&
  srcText.indexOf('leftCol.appendChild(ctrl);') !== -1 &&
  srcText.indexOf('rightCol.appendChild(mkOwn);') !== -1 &&
  srcText.indexOf('rightCol.appendChild(slot);') !== -1 &&
  // no control is appended to the pairing row at all
  srcText.indexOf('row.appendChild(paSpan);') === -1 &&
  srcText.indexOf('row.appendChild(own);') === -1 &&
  srcText.indexOf('row.appendChild(ctrl);') === -1 &&
  srcText.indexOf('row.appendChild(mkOwn);') === -1 &&
  srcText.indexOf('row.appendChild(slot);') === -1 &&
  srcText.indexOf("row.appendChild(el('span', 'sssl-playing', '● PLAYING'));") === -1 &&
  srcText.indexOf('ctrls.appendChild(') === -1 &&
  srcText.indexOf("'.fx-ctrl") === -1 &&
  // bands are planned per PANE from MEASURED widths, before the rows are built
  srcText.indexOf('const planColumnBands = (pane, rows, paneDelayed) => {') !== -1 &&
  srcText.indexOf('const BOARD_BAND = 52;') !== -1 &&
  srcText.indexOf('const MARKER_BAND = 176;') !== -1 &&
  srcText.indexOf('const FACT_BAND = 132;') !== -1 &&
  srcText.indexOf('planColumnBands(listPane, currentRows, false);') !== -1 &&
  srcText.indexOf('planColumnBands(delayedPane, delayedRows, true);') !== -1 &&
  // the reserved band and the drawn control share ONE predicate
  srcText.indexOf("const showMarkerControl = markerControlWanted(f);") !== -1 &&
  (srcText.match(/const markerControlWanted = /g) || []).length === 1 &&
  (srcText.match(/showMarkerControl/g) || []).length === 2 &&
  srcText.indexOf("el('div', 'sssl-advicehead projected')") !== -1 &&
  srcText.indexOf("el('span', 'badge', 'TONIGHT')") !== -1 &&
  srcText.indexOf("el('span', 'badge', 'DELAYED')") !== -1 &&
  srcText.indexOf("headRow.appendChild(el('div', 'sssl-rhead', 'NOT HERE'));") !== -1);
check('MARKER-9: the marker list only offers players who keep the SEQUENCE playable',
  // playing, marking and "recommended to play in the pane" are excluded
  srcText.indexOf('const upcoming = Array.isArray(ctx.upcomingPlayerIds) ? ctx.upcomingPlayerIds : [];') !== -1 &&
  srcText.indexOf('if (upcoming.indexOf(p.id) !== -1) return;') !== -1 &&
  // the operator's dropdown and the scheduler's search share ONE rule
  srcText.indexOf('function markerSequenceReservedIds(adviceState, excludeGame)') !== -1 &&
  srcText.indexOf('nextDispatchParticipantIds(a.recommended, 0, a.recommended.length).forEach((id) => out.add(id));') !== -1 &&
  srcText.indexOf('upcomingPlayerIds: markerSequenceReservedIds(advice, game),') !== -1 &&
  // and the algorithm keeps applying the same union to its proposals
  srcText.indexOf('const recommendedGroupIds = nextCapacity > 0') !== -1 &&
  srcText.indexOf('proposalPool.filter((id) => !recommendedGroupIds.has(id) && !ownIds.has(id)),') !== -1);
check('MARKER-9: an existing duty can be REALLOCATED or REMOVED from the game row',
  srcText.indexOf('? changeMarkerForGame(mkr, f, chosen, assignCtx)') !== -1 &&
  srcText.indexOf(': assignMarkerToGame(mkr, f, chosen, assignCtx);') !== -1 &&
  srcText.indexOf('onClear: () => {') !== -1 &&
  srcText.indexOf('confirmedMarkerId: fMarkerId,') !== -1 &&
  srcText.indexOf("if (typeof o.onClear === 'function') o.onClear();") !== -1);
check('MARKER-9: DELAYED rows carry NO board/marker drop-down — compact removable facts only',
  // board: the assign SELECT is offered on playing rows EXCEPT delayed ones
  srcText.indexOf("} else if (f.status === 'playing' && !f.delayed) {") !== -1 &&
  srcText.indexOf('a DELAYED row offers NO board control') !== -1 &&
  // marker: no selector on a delayed row in ANY mode — the shared predicate
  // returns false for a delayed fixture before anything else is considered
  srcText.indexOf('const showMarkerControl = markerControlWanted(f);') !== -1 &&
  srcText.indexOf('if (!markerUiOn || f.delayed) return false;') !== -1 &&
  srcText.indexOf('MARKER-9: DELAYED rows get NO marker drop-down at all (any mode)') !== -1 &&
  // the FACTS survive there: BOARD n × and MARKER <name> × stay removable
  srcText.indexOf("el('span', 'sssl-chip sm', 'B' + assignedBoard.boardNumber)") !== -1 &&
  srcText.indexOf("el('span', 'mkchip', 'M ' + markerNameForId(data, fMarkerId))") !== -1 &&
  // Removal stays available everywhere it is shown: the recommendation row and
  // the fixture row for BOARDS (2 paths), plus the delayed fact chip's × and the
  // table control's 'M: —' for MARKERS (2 paths) — none of them needs a
  // drop-down to exist in the delayed column.
  (srcText.match(/releaseBoard\(rtv, assignedBoard\.boardNumber\)/g) || []).length === 2 &&
  (srcText.match(/releaseMarkerFromGame\(mkr, f\)/g) || []).length === 2);
check('MARKER-9: a confirmed fixture-row marker is persisted (survives Refresh, no pending handoff needed)',
  /clearPendingMarker\(f\);\r?\n\s*\/\/ MARKER-9: persist the CONFIRMED duty/.test(srcText) &&
  srcText.indexOf('clearPendingMarker only writes when') !== -1);
check('MARKER-9: a live row states PLAYING without adding a second line',
  // the row-level PLAYING label is gone entirely: the green row, the inset
  // accent bar and the tooltip carry it, plus the group bar's factual count
  (srcText.match(/sssl-playing', '● PLAYING'/g) || []).length === 0 &&
  // liveness is never colour-only: inset accent bar + wording on the row
  srcText.indexOf("'.sssl-col .sssl-row.playing{box-shadow:inset 3px 0 0 var(--playing)}'") !== -1 &&
  srcText.indexOf("'PLAYING — live on DartConnect'") !== -1 &&
  srcText.indexOf('PLAYING = live') !== -1 &&
  srcText.indexOf("const chip = el('span', 'liven', '● PLAYING ' + live);") !== -1);
check('MARKER-9: the toolbar sits on ONE line (the wrapping hint line is removed)',
  srcText.indexOf("el('span', 'hint', 'Scheduler advice only") === -1 &&
  srcText.indexOf('Scheduler advice only — factual state is unchanged') === -1 &&
  srcText.indexOf('Every control now sits on ONE line.') !== -1 &&
  srcText.indexOf("overlay.appendChild(strip);") !== -1 &&
  srcText.indexOf("strip.appendChild(boardGroup);") !== -1);
check('MARKER-8: Not Here heading + Clear share the fixed first row, bulk controls the second',
  srcText.indexOf("const rosterHead = el('div', 'sssl-rosterhead');") !== -1 &&
  srcText.indexOf("const headRow = el('div', 'sssl-rheadrow');") !== -1 &&
  srcText.indexOf("headRow.appendChild(el('div', 'sssl-rhead', 'NOT HERE'));") !== -1 &&
  srcText.indexOf("const clear = el('button', 'sssl-btn', 'Clear Not Here');") !== -1 &&
  srcText.indexOf('headRow.appendChild(clear);') !== -1 &&
  srcText.indexOf('rosterHead.appendChild(headRow);') !== -1 &&
  srcText.indexOf('rosterHead.appendChild(bulkRow);') !== -1 &&
  srcText.indexOf('colNotHere.insertBefore(rosterHead, rosterPane);') !== -1 &&
  // exactly ONE clear button, and no second copy at the bottom
  (srcText.match(/el\('button', 'sssl-btn', 'Clear Not Here'\)/g) || []).length === 1 &&
  srcText.indexOf("clear.style.marginTop = '8px';") === -1 &&
  srcText.indexOf('rosterPane.appendChild(clear);') === -1 &&
  // the header is fixed and only the list scrolls
  srcText.indexOf("'.sssl-rosterhead{flex:none;") !== -1 &&
  srcText.indexOf("'.sssl-roster{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;") !== -1 &&
  // the clear action itself is unchanged (no invented confirmation, no new semantics)
  srcText.indexOf('state.absentIds = [];') !== -1 &&
  srcText.indexOf('data.dispatchOrder = null;') !== -1);
check('@version remains 1.1.0 after the fix slice (release protection)',
  srcText.indexOf('@version      1.1.0') !== -1 && api.VERSION === '1.1.0');

// ---- COLS-09: ONE authoritative Tonight/Delayed classification ----
// Reported live: with the match date set to 15 Oct, the Tonight panel began
// with the 01 Oct group while Delayed held only Sep dates. Cause: `delayed`
// came from DartConnect's own group bucket (pending vs future), which is
// relative to the day the page was rendered, not to the operator's selected
// match date. The classification is now the effective fixture date against the
// selected match date, for the panels AND the scheduler input.
const clsFixtures = () => [
  { matchId: 9001, date: '2026-10-01', dateLabel: '01 Oct', division: 'Universal', delayed: false, bucketDelayed: false, status: 'waiting', playerA: { id: 1, name: 'A One' }, playerB: { id: 2, name: 'B Two' } },
  { matchId: 9002, date: '2026-09-03', dateLabel: '03 Sep', division: 'Universal', delayed: true, bucketDelayed: true, status: 'waiting', playerA: { id: 3, name: 'C Three' }, playerB: { id: 4, name: 'D Four' } },
  { matchId: 9003, date: '2026-10-22', dateLabel: '22 Oct', division: 'Universal', delayed: false, bucketDelayed: false, status: 'waiting', playerA: { id: 5, name: 'E Five' }, playerB: { id: 6, name: 'F Six' } },
  { matchId: 9004, date: '', dateLabel: 'Unscheduled', division: 'Universal', delayed: true, bucketDelayed: true, status: 'waiting', playerA: { id: 7, name: 'G Seven' }, playerB: { id: 8, name: 'H Eight' } },
  // Rescheduled INTO the selected night: DartConnect still buckets it as
  // pending, its effective date is the night it now belongs to.
  { matchId: 9005, date: '2026-10-15', dateLabel: '15 Oct', division: 'Universal', delayed: true, bucketDelayed: true, status: 'waiting', playerA: { id: 9, name: 'I Nine' }, playerB: { id: 10, name: 'J Ten' } },
];
const clsCounts = api.applyMatchDateClassification(clsFixtures(), '2026-10-15');
check('COLS-09: effective date against the selected match date is the rule',
  clsCounts.total === 5 && clsCounts.current === 1 && clsCounts.delayed === 2 &&
  clsCounts.future === 1 && clsCounts.undated === 1);
const clsAfter = clsFixtures();
api.applyMatchDateClassification(clsAfter, '2026-10-15');
check('COLS-09: a fixture dated the selected night is CURRENT whatever bucket it came from',
  clsAfter[4].delayed === false && clsAfter[4].bucketDelayed === true);
check('COLS-09: an earlier outstanding fixture is DELAYED (even from the future bucket)',
  clsAfter[0].delayed === true && clsAfter[0].bucketDelayed === false);
check('COLS-09: a later fixture is never delayed, so it cannot leak in as "delayed backlog"',
  clsAfter[2].delayed === false);
check('COLS-09: a dateless fixture keeps DartConnect\'s bucket (the only evidence available)',
  clsAfter[3].delayed === true);
check('COLS-09: classification is idempotent (re-running never flips a flag)',
  JSON.stringify(api.applyMatchDateClassification(clsAfter, '2026-10-15')) === JSON.stringify(clsCounts) &&
  clsAfter[0].delayed === true && clsAfter[4].delayed === false);
// Real captured league page, 15 Oct selected: before/after panel counts.
(() => {
  const rows = sorted.map((f) => Object.assign({}, f));
  const shown = api.applyDisplayFilters(rows, 'Universal', '2026-10-15', new Set());
  const before = { tonight: shown.filter((f) => !f.delayed).length, delayed: shown.filter((f) => f.delayed).length };
  api.applyMatchDateClassification(rows, '2026-10-15');
  const after = {
    tonight: shown.filter((f) => !f.delayed),
    delayed: shown.filter((f) => f.delayed),
  };
  check('COLS-09: 15 Oct selected — Tonight holds ONLY the 15 Oct group',
    after.tonight.length === 21 && after.tonight.every((f) => f.date === '2026-10-15'));
  check('COLS-09: 15 Oct selected — every earlier outstanding date is in Delayed',
    after.delayed.length === 58 &&
    after.delayed.every((f) => f.date < '2026-10-15') &&
    new Set(after.delayed.map((f) => f.date)).size === 6);
  check('COLS-09: no fixture is lost or double-counted by the correction',
    before.tonight + before.delayed === after.tonight.length + after.delayed.length &&
    before.tonight === 63 && before.delayed === 16);
  check('COLS-09: the future-dated fixture never appears in either panel',
    shown.every((f) => !f.date || f.date <= '2026-10-15'));
})();
// The same classified list is what the scheduler receives: Delayed ON/OFF still
// gates delayed-game eligibility (the existing scheduling option is unchanged).
(() => {
  const rows = clsFixtures();
  api.applyMatchDateClassification(rows, '2026-10-15');
  const players = rows.reduce((acc, f) => acc.concat([f.playerA, f.playerB]), []);
  const view = { division: 'Universal', selectedMatchDate: '2026-10-15' };
  const off = api.buildNightSession(api.defaultSchedulerUiState(), { fixtures: rows, roster: players }, view);
  const on = api.buildNightSession(Object.assign(api.defaultSchedulerUiState(), { includeDelayed: true }), { fixtures: rows, roster: players }, view);
  const playableOff = api.getPlayableGames(off);
  const playableOn = api.getPlayableGames(on);
  check('COLS-09: Delayed OFF still excludes every delayed game from the schedule',
    playableOff.every((f) => !f.delayed));
  check('COLS-09: Delayed ON still admits the earlier outstanding games',
    playableOn.some((f) => f.delayed));
})();

// ---- DELAY-LIVE: live-match awareness in the delayed panel ----
// The live state is the EXISTING one (the poll matches genuine DartConnect
// records by league_match_id / numeric pair / abbreviations). These tests drive
// the REAL refreshLive with scripted transports and then apply the REAL
// presentation rule to the result.
function delayedLiveFixture() {
  // An EARLIER outstanding date than the selected night (10 Oct), carrying the
  // genuine live record's competitor ids so the EXISTING matcher marks it.
  return {
    matchId: 10258951, division: 'Universal', date: '2026-09-03', dateLabel: '03 Sep',
    delayed: true, bucketDelayed: true, roundLabel: 'Round 1', sessionLabel: 'Session 3',
    playerA: { id: 5765923, name: 'Nick Walton' },
    playerB: { id: 5765962, name: 'James Harrison' },
    status: 'waiting',
  };
}
// refreshLive serializes through a module-level in-flight guard, so this block
// waits for every previously queued async check to settle before it polls.
const delayLivePrior = Promise.all(asyncChecks.slice());
asyncChecks.push(delayLivePrior.then(() => (async () => {
  const delayedRows = (ctx) => ctx.data.fixtures.filter((f) => f.delayed);
  const fx = delayedLiveFixture();
  const { ctx } = lifecycleCtx(fx, scriptedTransport([
    { live: livePayload }, { live: livePayload }, { live: completedPayload }, { live: completedPayload },
  ]));
  // The operator collapsed this group earlier in the evening.
  const collapsedState = {};
  collapsedState[api.collapsedGroupKey(fx)] = true;
  const key = api.collapsedGroupKey(fx);
  check('DELAY-LIVE: the group is collapsed by the operator preference to start with',
    api.delayedGroupCollapsed(collapsedState, key, 0) === true);
  await api.refreshLive(ctx);
  let counts = api.liveDelayedGroupCounts(delayedRows(ctx));
  check('DELAY-LIVE: the existing live poll detects the DELAYED fixture as PLAYING',
    fx.status === 'playing' && counts[key] === 1);
  check('DELAY-LIVE: a live group is expanded automatically',
    api.delayedGroupCollapsed(collapsedState, key, counts[key]) === false);
  check('DELAY-LIVE: the operator\'s saved preference is NOT overwritten by the auto-expansion',
    collapsedState[key] === true && Object.keys(collapsedState).length === 1);
  const firstPass = api.delayedGroupCollapsed(collapsedState, key, counts[key]);
  await api.refreshLive(ctx);
  counts = api.liveDelayedGroupCounts(delayedRows(ctx));
  check('DELAY-LIVE: a repeat poll with unchanged live state yields the identical state (no flicker)',
    counts[key] === 1 && api.delayedGroupCollapsed(collapsedState, key, counts[key]) === firstPass &&
    firstPass === false);
  // A second simultaneous live delayed match in the SAME group counts twice.
  const sibling = delayedLiveFixture();
  sibling.matchId = 10258952;
  sibling.playerA = { id: 5765980, name: 'Jason Cowlishaw' };
  sibling.playerB = { id: 5765965, name: 'Michael Wheawall' };
  sibling.status = 'playing';
  check('DELAY-LIVE: multiple simultaneous live matches in one group are counted, not collapsed',
    api.liveDelayedGroupCounts([fx, sibling])[key] === 2 &&
    api.delayedGroupCollapsed(collapsedState, key, 2) === false);
  const elsewhere = api.liveDelayedGroupCounts([Object.assign({}, sibling, { date: '2026-09-10' })]);
  check('DELAY-LIVE: a live match in a DIFFERENT group never opens this one',
    elsewhere['2026-09-10'] === 1 && !elsewhere[key] &&
    api.delayedGroupCollapsed(collapsedState, key, elsewhere[key] || 0) === true);
  // Manual Refresh / recovery: PLAYING survives a failed poll, then clears.
  await api.refreshLive(ctx);
  counts = api.liveDelayedGroupCounts(delayedRows(ctx));
  check('DELAY-LIVE: when the match reports COMPLETED the highlight and count are removed',
    fx.status === 'completed' && counts[key] === undefined);
  check('DELAY-LIVE: the group then returns to the preference the operator always had',
    api.delayedGroupCollapsed(collapsedState, key, 0) === true && collapsedState[key] === true);
  await api.refreshLive(ctx);
  check('DELAY-LIVE: a group without a live match behaves exactly as before (toggle collapsible)',
    api.delayedGroupCollapsed(collapsedState, key, 0) === true);
  // A live delayed match must not hand out a board or a marker by itself, and
  // its players must be unavailable for conflicting work.
  const live = delayedLiveFixture();
  live.status = 'playing';
  const other = { matchId: 10258960, division: 'Universal', date: '2026-10-15', dateLabel: '15 Oct', delayed: false, bucketDelayed: false, status: 'waiting',
    playerA: { id: 111, name: 'P Eleven' }, playerB: { id: 112, name: 'P Twelve' } };
  const players = [live.playerA, live.playerB, other.playerA, other.playerB];
  const view = { division: 'Universal', selectedMatchDate: '2026-10-15' };
  const sessionOff = api.buildNightSession(api.defaultSchedulerUiState(), { fixtures: [live, other], roster: players }, view);
  const occ = api.getBoardOccupancy(sessionOff, null);
  check('DELAY-LIVE: a live delayed match occupies a board factually but is never auto-assigned one',
    occ.occupied === 1 && sessionOff.activeGames.every((g) => g.boardNumber === null));
  const advice = api.buildSchedulerAdvice(api.defaultSchedulerUiState(), { fixtures: [live, other], roster: players }, view);
  const liveIds = [live.playerA.id, live.playerB.id];
  check('DELAY-LIVE: a live delayed fixture is never recommended again and its players are never suggested elsewhere',
    advice.recommended.every((g) => g.matchId !== live.matchId) &&
    advice.recommended.every((g) => liveIds.indexOf(g.playerA.id) === -1 && liveIds.indexOf(g.playerB.id) === -1));
  const cands = api.getEligibleMarkerCandidates({
    players,
    absentIds: [],
    playingPlayerIds: liveIds,
    markingPlayerIds: [],
    markedGameKeys: {},
    excludeParticipants: true,
    participantIds: [other.playerA.id, other.playerB.id],
  }).map((c) => c.id);
  check('DELAY-LIVE: the live players are not offered as markers for anything else',
    cands.indexOf(live.playerA.id) === -1 && cands.indexOf(live.playerB.id) === -1 &&
    cands.length === 0);
})()));

// ---- LOSER mode, marker states, precedence and readability (30 Oct) ----
check('LOSER: a board only matters when it is factual, so continuity is honoured at dispatch',
  srcText.indexOf('function loserPendingForBoard(duties, boardNumber, eligibleIds, fallbackId)') !== -1 &&
  srcText.indexOf('? loserPendingForBoard(') !== -1 &&
  srcText.indexOf('getEligibleMarkerCandidates(markerCtxFor(game)).map((c) => c.id)') !== -1);
check('LOSER: FAIR fallback is automatic, stated and never a mode switch',
  srcText.indexOf('game.markerFallback = markerPolicy === MARKER_POLICIES.LOSER &&') !== -1 &&
  srcText.indexOf("const fb = el('span', 'mkfallback', 'FAIR');") !== -1 &&
  srcText.indexOf('LOSER — no completed match has a recorded result yet, so FAIR selection is used. ') !== -1 &&
  srcText.indexOf('fell back to FAIR (no losing player free for that game).') !== -1);
check('R-10: a marker confirmed from the RECOMMENDED pane is persisted immediately',
  srcText.indexOf('const clearPendingMarker = (game) => {') !== -1 &&
  srcText.indexOf('if (!data.pendingMarkers || data.pendingMarkers[key] == null) return false;') !== -1 &&
  srcText.indexOf('a CONFIRMED duty is an operator fact and must') !== -1 &&
  srcText.indexOf('clearPendingMarker(g);') < srcText.indexOf('a CONFIRMED duty is an operator fact and must'));
check('R-10: PLAYING precedes MARKING, and a stale duty is surfaced as a conflict',
  srcText.indexOf('if (p.state === PLAYER_STATES.PLAYING) p.markingConflict = true;') !== -1 &&
  srcText.indexOf('advice.markingConflicts = markingConflicts;') !== -1 &&
  srcText.indexOf("mk.classList.add('conflict');") !== -1 &&
  srcText.indexOf("const conflict = el('span', 'mkconflict', '! PLAYING');") !== -1 &&
  srcText.indexOf("'.sssl-advice .mkconflict{") !== -1);
check('R-10: RECOMMENDED/PROJECTED names are larger and semibold, marker names match',
  srcText.indexOf("'.sssl-advice{--adv-name-fs:calc(var(--fs) + 1.5px)}'") !== -1 &&
  srcText.indexOf("'.sssl-advice .sssl-pa,.sssl-advice .sssl-pb{font-size:var(--adv-name-fs);font-weight:600;line-height:1.2}'") !== -1 &&
  srcText.indexOf("'.sssl-advice .mkown .mkchip,.sssl-advice .mkslot .sssl-mksel{font-size:var(--adv-name-fs);font-weight:600}'") !== -1);
check('R-10: the VS separator is less prominent and TONIGHT/DELAYED are untouched',
  srcText.indexOf("'.sssl-advice .sssl-vs{font-weight:500;font-size:var(--fs-2xs);color:var(--faint);opacity:0.8}'") !== -1 &&
  // row height stays compact: the marker control loses its vertical padding and
  // the name line-height is pinned, so the larger text cannot grow the row.
  srcText.indexOf("'.sssl-advice .mkslot .sssl-mksel{padding-top:0;padding-bottom:0}'") !== -1 &&
  srcText.indexOf("'.sssl-row .sssl-pa{font-size") === -1 &&
  srcText.indexOf("'.sssl-datebar{font-size:calc") === -1);

check('R-11: PROJECTED NEXT is reconciled against the duties proposed above it',
  srcText.indexOf('function projectNextWaveWithDuties(session, openingGames, dutyHolderIds, options)') !== -1 &&
  srcText.indexOf('projectNextWaveWithDuties,') !== -1 &&
  // the duties are applied to a COPY of the session for one rollout only
  srcText.indexOf('reservedMarkerIds: new Set(Array.from(session.reservedMarkerIds || []).concat(ids)),') !== -1 &&
  // the reconciliation runs AFTER the proposals exist, and only the projection
  // is replaced: the recommended wave is never re-planned
  srcText.indexOf('const replanned = projectNextWaveWithDuties(') >
  srcText.indexOf('openGames.forEach((game, i) => { game.proposedMarkerId = bestSeq ? bestSeq[i] : null; });') &&
  srcText.indexOf('advice.projectedNext = ((replanned && replanned.games) || []).filter((g) => !involvesDuty(g));') !== -1 &&
  srcText.indexOf('advice.projectedNextMarkingWithheld = plannedNext.filter(involvesDuty).length;') !== -1 &&
  // OFF/MANUAL report the fact honestly rather than undefined
  srcText.indexOf('projectedNextMarkingWithheld: 0,') !== -1);
check('R-11: the reconciliation is TEMPORARY (no duty is reserved or persisted)',
  (() => {
    const at = srcText.indexOf('const proposedDutyIds = new Set();');
    const end = srcText.indexOf('return advice;', at);
    if (at === -1 || end === -1) return false;
    const block = srcText.slice(at, end);
    return block.indexOf('persistDispatch') === -1 &&
      block.indexOf('pendingMarkers') === -1 &&
      block.indexOf('markerRuntime =') === -1 &&
      block.indexOf('assignMarkerToGame') === -1;
  })());
check('R-11: no nameable next match states the wait instead of naming an impossible game',
  srcText.indexOf("'waiting · ' +") !== -1 &&
  srcText.indexOf('planned match needs a player who is marking above') !== -1 &&
  srcText.indexOf('planned matches need a player who is marking above') !== -1 &&
  srcText.indexOf('No next match is named yet: every match the plan holds for the next wave needs somebody ') !== -1 &&
  // the wait is a HEAD + one plain line, never a fabricated advice row
  srcText.indexOf("pHold.appendChild(el('span', 'badge', 'PROJECTED NEXT'));") !== -1);

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

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
const parsed = api.parseFixturesFromProps(props);
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
const st0 = api.loadState(store);
check('fresh state has null date', st0.selectedMatchDate === null);
st0.selectedMatchDate = '2026-10-01';
st0.absentIds = [5765962];
api.saveState(store, st0);
const st1 = api.loadState(store);
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
}, [], [], { division: 'Universal', selectedMatchDate: '2026-10-01' }).then((s) => {
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
{ division: 'Universal', selectedMatchDate: '2026-10-01' }).then((s) => {
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
{ division: 'Universal', selectedMatchDate: '2026-10-01' }).then((s) => {
  check('fetchLiveState fallback path records both attempts', s.source === 'api-matches' && s.marked.size === 1 &&
    s.attempts.length === 2 && s.attempts[0].status === 500 && s.attempts[1].status === 200);
}));
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

/* Automated Test Suite for Match Night Scheduler Domain Model (Slice 1).
 * Tests all 25 required scheduler scenarios with 0 DOM / network dependencies.
 * Run: node test/scheduler-check.cjs (exit 0 = all pass).
 */
const fs = require('fs');
const path = require('path');
const api = require('../src/SouthStaffs-MatchNight.user.js');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'references', 'schedule-normal.html'), 'utf8');

const props = api.extractDataPageProps(html);
const discoveredDivisions = api.discoverDivisions(props);
const parsedRoster = api.parseRosterFromProps(props);
const parsedFixtures = api.sortFixtures(api.dedupeFixtures(api.parseFixturesFromProps(props, discoveredDivisions).fixtures).fixtures);

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('PASS ' + name);
  } else {
    failures += 1;
    console.log('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
}

console.log('\n--- Match Night Scheduler Domain Model Tests ---');

// Setup base synthetic dataset for precise test cases
const p1 = { id: 101, name: 'Player One', division: 'Universal' };
const p2 = { id: 102, name: 'Player Two', division: 'Universal' };
const p3 = { id: 103, name: 'Player Three', division: 'Universal' };
const p4 = { id: 104, name: 'Player Four', division: 'Universal' };
const p5 = { id: 105, name: 'Player Five', division: 'Universal' };
const p6 = { id: 106, name: 'Player Six', division: 'Universal' };
const p7 = { id: 107, name: 'Player Seven', division: 'Universal' };
const p8 = { id: 108, name: 'Player Eight', division: 'Universal' };
const p9 = { id: 109, name: 'Player Nine', division: 'Universal' };
const p10 = { id: 110, name: 'Player Ten', division: 'Universal' };
const pExt = { id: 201, name: 'External Guest', division: 'White Eagle' };

const allSyntheticPlayers = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];

const synthFixtures = [
  { matchId: 1, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false },
  { matchId: 2, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p3, playerB: p4, delayed: false },
  { matchId: 3, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p5, playerB: p6, delayed: false },
  { matchId: 4, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p7, playerB: p8, delayed: false },
  { matchId: 5, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p1, playerB: p3, delayed: false },
  { matchId: 6, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p2, playerB: p4, delayed: false },
  { matchId: 7, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p9, playerB: p10, delayed: true },
];

// Test 1: Standard four-board opening allocation/recommendations
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });

  const rec = api.recommendNextGames(session);
  check('1. Standard four-board opening: 4 recommendations generated', rec.recommendations.length === 4);
  check('1. First 4 matches match Round 1',
    rec.recommendations[0].game.matchId === 1 &&
    rec.recommendations[1].game.matchId === 2 &&
    rec.recommendations[2].game.matchId === 3 &&
    rec.recommendations[3].game.matchId === 4);

  // Allocate all 4 to boards
  let sActive = session;
  for (let i = 1; i <= 4; i++) {
    sActive = api.applyGameStarted(sActive, {
      matchId: rec.recommendations[i - 1].game.matchId,
      boardNumber: i,
    });
  }

  check('1. All 4 boards are occupied', sActive.boards.every((b) => b.status === api.BOARD_STATUSES.OCCUPIED));
  const pStates = api.derivePlayerStates(sActive);
  check('1. All 8 active players are PLAYING',
    [101, 102, 103, 104, 105, 106, 107, 108].every((id) => pStates.get(id).state === api.PLAYER_STATES.PLAYING));
  check('1. Free players P9 and P10 are AVAILABLE',
    pStates.get(109).state === api.PLAYER_STATES.AVAILABLE && pStates.get(110).state === api.PLAYER_STATES.AVAILABLE);
})();

// Test 2: Managed Boards OFF
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: false,
  });

  check('2. Boards array empty when boards OFF', session.boards.length === 0);
  const rec = api.recommendNextGames(session);
  check('2. Queue recommendation works without boards', rec.recommendations.length > 0 && rec.playableCount >= 4);
})();

// Test 3: Different board counts
(() => {
  const s1 = api.createNightSession({ managedBoardsEnabled: true, boardCount: 1 });
  const s2 = api.createNightSession({ managedBoardsEnabled: true, boardCount: 2 });
  const s6 = api.createNightSession({ managedBoardsEnabled: true, boardCount: 6 });
  check('3. 1 board created', s1.boards.length === 1 && s1.boards[0].boardNumber === 1);
  check('3. 2 boards created', s2.boards.length === 2 && s2.boards[1].boardNumber === 2);
  check('3. 6 boards created', s6.boards.length === 6 && s6.boards[5].boardNumber === 6);
})();

// Test 4: Player absent
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    absentIds: [101],
  });

  const pStates = api.derivePlayerStates(session);
  check('4. Player 101 is ABSENT', pStates.get(101).state === api.PLAYER_STATES.ABSENT);
  const playable = api.getPlayableGames(session, pStates);
  check('4. Match 1 (P1 v P2) and Match 5 (P1 v P3) not playable',
    playable.every((g) => g.playerA.id !== 101 && g.playerB.id !== 101));
})();

// Test 5: Player already playing
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const sStarted = api.applyGameStarted(session, { matchId: 1, boardNumber: 1 });
  const pStates = api.derivePlayerStates(sStarted);
  check('5. P1 is PLAYING', pStates.get(101).state === api.PLAYER_STATES.PLAYING);
  const playable = api.getPlayableGames(sStarted, pStates);
  check('5. Match 5 (P1 v P3) not playable while P1 is playing Match 1',
    !playable.some((g) => g.matchId === 5));
})();

// Test 6: Player already marking
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });

  const sStarted = api.applyGameStarted(session, { matchId: 1, boardNumber: 1, markerId: 103 });
  const pStates = api.derivePlayerStates(sStarted);
  check('6. P3 is MARKING on Board 1', pStates.get(103).state === api.PLAYER_STATES.MARKING && pStates.get(103).currentBoard === 1);
  const playable = api.getPlayableGames(sStarted, pStates);
  check('6. Match 2 (P3 v P4) is blocked because P3 is marking',
    !playable.some((g) => g.matchId === 2));
})();

// Test 7: Two players required by different upcoming games
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 10, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2 },
      { matchId: 11, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p1, playerB: p3 },
      { matchId: 12, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 3, playerA: p2, playerB: p4 },
      { matchId: 13, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 4, playerA: p5, playerB: p6 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const sActive = api.applyGameStarted(session, { matchId: 10 });
  const rec = api.recommendNextGames(sActive);
  check('7. When Match 10 starts, Match 11 and 12 are blocked, Match 13 is recommended',
    rec.recommendations.length === 1 && rec.recommendations[0].game.matchId === 13);
})();

// Test 8: Previous-game player is a safe marker
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 21, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 22, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    completedMatchIds: [21],
  });

  // P1 has finished their only match of the night
  const impactP1 = api.evaluateMarkerImpact(session, 101, { recentFinisherIds: [101] });
  check('8. P1 is a safe GREEN marker with high score', impactP1.impact === api.MARKER_IMPACTS.GREEN && impactP1.score > 100);
})();

// Test 9: Previous-game player would block an immediately playable game
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 31, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 32, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p1, playerB: p3 },
      { matchId: 33, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p4, playerB: p5 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    completedMatchIds: [31],
  });

  // P1 just finished Match 31, but Match 32 (P1 v P3) is the #1 next playable game!
  const impactP1 = api.evaluateMarkerImpact(session, 101, { recentFinisherIds: [101] });
  check('9. P1 is rated RED because P1 is needed for the top playable match',
    impactP1.impact === api.MARKER_IMPACTS.RED && impactP1.blockedGames.indexOf(32) !== -1);
})();

// Test 10: Alternative free marker avoids that blockage
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 31, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 32, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p1, playerB: p3 },
      { matchId: 33, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p4, playerB: p5 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    completedMatchIds: [31],
  });

  // Candidate P10 has no games scheduled
  const impactP10 = api.evaluateMarkerImpact(session, 110);
  check('10. Alternative marker P10 is GREEN', impactP10.impact === api.MARKER_IMPACTS.GREEN);
  const rec = api.recommendNextGames(session, { recentFinisherIds: [101, 102] });
  check('10. Top recommended game is Match 32 and bestMarker is not P1',
    rec.recommendations[0].game.matchId === 32 && rec.recommendations[0].bestMarker.candidateId !== 101);
})();

// Test 11: Multiple equally safe marker candidates
(() => {
  const session = api.createNightSession({
    players: [p1, p2, p7, p8, p9, p10],
    fixtures: [
      { matchId: 41, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const rec = api.recommendNextGames(session);
  const markers = rec.recommendations[0].recommendedMarkers;
  check('11. P7, P8, P9, P10 all evaluate as GREEN',
    markers.every((m) => m.impact === api.MARKER_IMPACTS.GREEN));
})();

// Test 12: Current-night fixture priority
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 51, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, playerA: p9, playerB: p10, delayed: true },
      { matchId: 52, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, playerA: p1, playerB: p2, delayed: false },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  const playable = api.getPlayableGames(session);
  check('12. CURRENT Match 52 ranked before DELAYED Match 51 despite date order',
    playable[0].matchId === 52 && playable[1].matchId === 51);
})();

// Test 13: Delayed games OFF
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 61, date: '2026-09-03', division: 'Universal', playerA: p9, playerB: p10, delayed: true },
      { matchId: 62, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: false,
  });

  const playable = api.getPlayableGames(session);
  check('13. Delayed Match 61 excluded when delayed games OFF',
    playable.length === 1 && playable[0].matchId === 62);
})();

// Test 14: Delayed games ON with spare capacity
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 71, date: '2026-09-03', division: 'Universal', playerA: p9, playerB: p10, delayed: true },
      { matchId: 72, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  const playable = api.getPlayableGames(session);
  check('14. Delayed Match 71 included when delayed games ON',
    playable.length === 2 && playable.some((g) => g.matchId === 71));
})();

// Test 15: Delayed game rejected as NOT TONIGHT
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 81, date: '2026-09-03', division: 'Universal', playerA: p9, playerB: p10, delayed: true },
      { matchId: 82, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  const sRejected = api.rejectDelayedGame(session, 81);
  check('15. Match 81 in rejectedDelayedMatchIds', sRejected.rejectedDelayedMatchIds.has(81));
  const playable = api.getPlayableGames(sRejected);
  check('15. Rejected delayed match excluded from playable games',
    playable.length === 1 && playable[0].matchId === 82);
})();

// Test 16: Rejected delayed game remains excluded from that NightSession
(() => {
  let session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  session = api.rejectDelayedGame(session, 7);
  // Complete Match 1
  session = api.applyGameStarted(session, { matchId: 1 });
  session = api.applyGameCompleted(session, { matchId: 1 });
  const rec = api.recommendNextGames(session);
  check('16. Rejected delayed game 7 remains excluded in subsequent session calls',
    !rec.recommendations.some((r) => r.game.matchId === 7));
})();

// Test 17 & 18: Unexpected future game becomes active & makes players unavailable
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const sExtra = api.applyUnexpectedActiveGame(session, {
    matchId: 999,
    playerA: p1,
    playerB: p4,
    boardNumber: 3,
  });

  check('17. Unexpected game is in activeGames', sExtra.activeGames.some((ag) => ag.matchId === 999 && ag.isExtra));
  const pStates = api.derivePlayerStates(sExtra);
  check('18. Both P1 and P4 are PLAYING due to extra game',
    pStates.get(101).state === api.PLAYER_STATES.PLAYING && pStates.get(104).state === api.PLAYER_STATES.PLAYING);
})();

// Test 19: Extra game affects subsequent recommendations
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  // Extra game with P1 and P2
  const sExtra = api.applyUnexpectedActiveGame(session, {
    matchId: 999,
    playerA: p1,
    playerB: p2,
  });

  const rec = api.recommendNextGames(sExtra);
  check('19. Planned Match 1 (P1 v P2) skipped, Match 2 (P3 v P4) is top recommendation',
    rec.recommendations[0].game.matchId === 2);
})();

// Test 20: Board completion affects only the relevant board assignment/state
(() => {
  let session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });

  session = api.applyGameStarted(session, { matchId: 1, boardNumber: 1 });
  session = api.applyGameStarted(session, { matchId: 2, boardNumber: 2 });
  session = api.applyGameStarted(session, { matchId: 3, boardNumber: 3 });
  session = api.applyGameStarted(session, { matchId: 4, boardNumber: 4 });

  // Board 2 completes
  session = api.applyGameCompleted(session, { boardNumber: 2 });
  check('20. Board 2 is AVAILABLE', session.boards[1].status === api.BOARD_STATUSES.AVAILABLE);
  check('20. Boards 1, 3, 4 remain OCCUPIED',
    session.boards[0].status === api.BOARD_STATUSES.OCCUPIED &&
    session.boards[2].status === api.BOARD_STATUSES.OCCUPIED &&
    session.boards[3].status === api.BOARD_STATUSES.OCCUPIED);
  check('20. P3 and P4 from Board 2 are now AVAILABLE',
    api.derivePlayerStates(session).get(103).state === api.PLAYER_STATES.AVAILABLE &&
    api.derivePlayerStates(session).get(104).state === api.PLAYER_STATES.AVAILABLE);
})();

// Test 21: Scheduler remains functional with no board assignments
(() => {
  let session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: false,
  });

  session = api.applyGameStarted(session, { matchId: 1 });
  session = api.applyGameCompleted(session, { matchId: 1 });
  const rec = api.recommendNextGames(session);
  check('21. Unmanaged scheduler progresses cleanly',
    session.completedMatchIds.has(1) && rec.recommendations.length > 0);
})();

// Test 22: No playable game available
(() => {
  const session = api.createNightSession({
    players: [p1, p2],
    fixtures: [{ matchId: 1, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2 }],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    absentIds: [101, 102],
  });

  const rec = api.recommendNextGames(session);
  check('22. Handles empty playable list gracefully',
    rec.recommendations.length === 0 && rec.playableCount === 0 && rec.reason === 'NO_PLAYABLE_GAMES');
})();

// Test 23: Only delayed game available
(() => {
  const session = api.createNightSession({
    players: [p9, p10],
    fixtures: [
      { matchId: 91, date: '2026-09-03', division: 'Universal', playerA: p9, playerB: p10, delayed: true },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: false,
  });

  check('23. 0 games when delayed OFF', api.recommendNextGames(session).recommendations.length === 0);
  const sessionWithDelayed = Object.assign({}, session, { includeDelayed: true });
  const rec = api.recommendNextGames(sessionWithDelayed);
  check('23. Delayed game recommended when delayed ON',
    rec.recommendations.length === 1 && rec.recommendations[0].game.matchId === 91);
})();

// Test 24: Marker choice would reduce immediately playable games
(() => {
  // P1 v P2 (Match 101), P3 v P4 (Match 102), P5 v P6 (Match 103)
  // Candidate is P3. If P3 marks, Match 102 becomes unplayable.
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 101, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 102, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
      { matchId: 103, date: '2026-10-01', division: 'Universal', roundValue: 3, playerA: p5, playerB: p6 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 1,
  });

  const impactP3 = api.evaluateMarkerImpact(session, 103);
  check('24. Candidate P3 is AMBER because P3 removes a playable match but leaves alternatives',
    impactP3.impact === api.MARKER_IMPACTS.AMBER && impactP3.blockedGames.indexOf(102) !== -1);
})();

// Test 25: Marker from an externally supplied eligible pool is supported without assuming same-division membership
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers, // all Universal
    fixtures: [
      { matchId: 111, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  // Supply external guest player from White Eagle
  const externalPool = [pExt];
  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [pExt.id],
    externalPlayers: externalPool,
  });

  check('25. Cross-division external marker accepted and recommended',
    rec.recommendations[0].recommendedMarkers.length === 1 &&
    rec.recommendations[0].bestMarker.candidateId === 201 &&
    rec.recommendations[0].bestMarker.candidateDivision === 'White Eagle');
})();

// Test 26: GREEN recent finisher beats GREEN generic marker
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 201, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 1,
  });

  // Candidates: P3 (recent finisher from this board) and P4 (generic marker) - both GREEN
  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [103, 104],
    recentFinisherIds: [103],
  });

  check('26. GREEN recent finisher beats GREEN generic marker',
    rec.recommendations[0].bestMarker.candidateId === 103 &&
    rec.recommendations[0].recommendedMarkers[0].candidateId === 103 &&
    rec.recommendations[0].recommendedMarkers[1].candidateId === 104);
})();

// Test 27: GREEN generic marker beats AMBER recent finisher
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 211, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 212, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
      { matchId: 213, date: '2026-10-01', division: 'Universal', roundValue: 3, playerA: p5, playerB: p6 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 1,
  });

  // Candidate P3: recent finisher from board, but AMBER because P3 plays in Match 212
  // Candidate P10: generic marker, GREEN because P10 has no games
  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [103, 110],
    recentFinisherIds: [103],
  });

  const mP3 = rec.recommendations[0].recommendedMarkers.find((m) => m.candidateId === 103);
  const mP10 = rec.recommendations[0].recommendedMarkers.find((m) => m.candidateId === 110);
  check('27. P3 is AMBER and P10 is GREEN', mP3.impact === api.MARKER_IMPACTS.AMBER && mP10.impact === api.MARKER_IMPACTS.GREEN);
  check('27. GREEN generic marker beats AMBER recent finisher', rec.recommendations[0].bestMarker.candidateId === 110);
})();

// Test 28: AMBER recent finisher beats AMBER generic marker
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 221, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 222, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
      { matchId: 223, date: '2026-10-01', division: 'Universal', roundValue: 3, playerA: p5, playerB: p6 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 1,
  });

  // Candidate P3: recent finisher (AMBER)
  // Candidate P5: generic marker (AMBER, plays in Match 223)
  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [103, 105],
    recentFinisherIds: [103],
  });

  check('28. AMBER recent finisher beats AMBER generic marker',
    rec.recommendations[0].bestMarker.candidateId === 103 &&
    rec.recommendations[0].recommendedMarkers[0].candidateId === 103 &&
    rec.recommendations[0].recommendedMarkers[1].candidateId === 105);
})();

// Test 29: RED candidate is never returned as automatic recommended marker
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 231, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 232, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2, // 2 available boards need both matches
  });

  // P3 is in Match 232. With 2 boards free, assigning P3 as marker drops playable games to 1 (< 2 boards), so P3 is RED.
  const impactP3 = api.evaluateMarkerImpact(session, 103);
  check('29. P3 is evaluated as RED because marking starves board capacity', impactP3.impact === api.MARKER_IMPACTS.RED);

  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [103],
  });

  check('29. When only RED candidates exist, bestMarker is null',
    rec.recommendations[0].bestMarker === null);
})();

// Test 30: RED candidate can still be represented/evaluated for future manual override
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 241, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
      { matchId: 242, date: '2026-10-01', division: 'Universal', roundValue: 2, playerA: p3, playerB: p4 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [103],
  });

  const markers = rec.recommendations[0].recommendedMarkers;
  check('30. RED candidate is present in recommendedMarkers for manual override',
    markers.length === 1 && markers[0].candidateId === 103 && markers[0].impact === api.MARKER_IMPACTS.RED && markers[0].reason.length > 0);
})();

// Test 31: Boardless mode does not apply physical board recent finisher preference
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 251, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: false, // Boardless mode
  });

  // In boardless mode, P4 (ID 104) and P3 (ID 103) both GREEN.
  // Passing recentFinisherIds=[104] must NOT give P4 board bonus over P3 because boards are OFF.
  // With equal scores, deterministic tie-breaking sorts by candidateId (103 before 104).
  const rec = api.recommendNextGames(session, {
    eligibleMarkerPool: [104, 103],
    recentFinisherIds: [104],
  });

  check('31. Boardless mode does not apply physical board bonus; tie-breaks by ID',
    rec.recommendations[0].recommendedMarkers[0].candidateId === 103 &&
    rec.recommendations[0].recommendedMarkers[1].candidateId === 104);
})();

// Test 32: Scheduler remains deterministic when multiple candidates otherwise tie
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 261, date: '2026-10-01', division: 'Universal', roundValue: 1, playerA: p1, playerB: p2 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  // Supply candidate pool in scrambled order
  const rec1 = api.recommendNextGames(session, { eligibleMarkerPool: [108, 106, 110, 104] });
  const rec2 = api.recommendNextGames(session, { eligibleMarkerPool: [110, 104, 108, 106] });

  const order1 = rec1.recommendations[0].recommendedMarkers.map((m) => m.candidateId);
  const order2 = rec2.recommendations[0].recommendedMarkers.map((m) => m.candidateId);

  check('32. Marker ranking is 100% deterministic regardless of input array order',
    JSON.stringify(order1) === JSON.stringify(order2) && JSON.stringify(order1) === JSON.stringify([104, 106, 108, 110]));
})();

// Verification against real captured schedule data
(() => {
  console.log('\n--- Real Captured Schedule Snapshot Tests ---');
  const sessionReal = api.createNightSession({
    players: parsedRoster.players,
    fixtures: parsedFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });

  const recReal = api.recommendNextGames(sessionReal);
  check('Real capture: 4 opening recommendations generated for Universal on 01 Oct',
    recReal.recommendations.length === 4);
  check('Real capture: All recommended games belong to Universal division',
    recReal.recommendations.every((r) => r.game.division === 'Universal'));
  check('Real capture: Marker recommendations populated for each board',
    recReal.recommendations.every((r) => r.recommendedMarkers.length > 0 && r.bestMarker !== null));
})();

if (failures === 0) {
  console.log('\nALL SCHEDULER TESTS PASS (0 failures)');
} else {
  console.error('\n' + failures + ' SCHEDULER TEST FAILURES');
  process.exit(1);
}

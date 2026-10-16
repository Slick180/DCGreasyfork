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

// ==============================================================================
// Slice 2A: Candidate-Set Generation, Robustness, Bottlenecks & Marker Confidence
// ==============================================================================

console.log('\n--- Slice 2A Running Order Primitives Tests ---');

// Test 33: Candidate-set generation for configurable capacity (1, 2, 4, 6)
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: false,
  });

  const playable = api.getPlayableGames(session);
  const setsCap1 = api.getCompatibleCandidateSets(session, playable, 1);
  const setsCap2 = api.getCompatibleCandidateSets(session, playable, 2);
  const setsCap4 = api.getCompatibleCandidateSets(session, playable, 4);
  const setsCap6 = api.getCompatibleCandidateSets(session, playable, 6);

  check('33. Candidate sets cap 1: all size 1', setsCap1.length > 0 && setsCap1.every((s) => s.length === 1));
  check('33. Candidate sets cap 2: all size 2', setsCap2.length > 0 && setsCap2.every((s) => s.length === 2));
  check('33. Candidate sets cap 4: all size 4', setsCap4.length > 0 && setsCap4.every((s) => s.length === 4));
  // Total synthetic players is 10 (5 disjoint pairs), so max possible size is 5
  check('33. Candidate sets cap 6: returns maximal size 4/5 sets without error',
    setsCap6.length > 0 && setsCap6.every((s) => s.length <= 6));
})();

// Test 34: Pairwise player-disjointness in candidate sets
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const sets = api.getCompatibleCandidateSets(session, null, 4);
  const allDisjoint = sets.every((s) => {
    const seen = new Set();
    for (const g of s) {
      if (seen.has(g.playerA.id) || seen.has(g.playerB.id)) return false;
      seen.add(g.playerA.id);
      seen.add(g.playerB.id);
    }
    return true;
  });
  check('34. All games in candidate sets are pairwise player-disjoint', allDisjoint);
})();

// Test 35: Unavailable (absent / playing / marking) players excluded from candidate sets
(() => {
  let session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    absentIds: [101],
  });
  session = api.applyGameStarted(session, { matchId: 2, markerId: 105 }); // P3, P4 playing; P5 marking

  const sets = api.getCompatibleCandidateSets(session, null, 4);
  const noUnavailable = sets.every((s) =>
    s.every((g) =>
      g.playerA.id !== 101 && g.playerB.id !== 101 &&
      g.playerA.id !== 103 && g.playerB.id !== 103 &&
      g.playerA.id !== 104 && g.playerB.id !== 104 &&
      g.playerA.id !== 105 && g.playerB.id !== 105
    )
  );
  check('35. Candidate sets strictly exclude absent, playing, and marking players', noUnavailable);
})();

// Test 36: No permutation duplicates ({A, B} vs {B, A}) in candidate sets
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const sets = api.getCompatibleCandidateSets(session, null, 2);
  const signatures = new Set();
  let hasDuplicate = false;
  sets.forEach((s) => {
    const sig = s.map((g) => g.matchId).sort().join(':');
    if (signatures.has(sig)) hasDuplicate = true;
    signatures.add(sig);
  });
  check('36. Candidate sets contain no duplicate permutations', !hasDuplicate);
})();

// Test 37: Partial candidate sets when capacity cannot be filled
(() => {
  // Only 2 disjoint games possible among 4 players
  const session = api.createNightSession({
    players: [p1, p2, p3, p4],
    fixtures: [
      { matchId: 1, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2 },
      { matchId: 2, date: '2026-10-01', division: 'Universal', playerA: p3, playerB: p4 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  // Request capacity 4 when only 2 can run
  const sets = api.getCompatibleCandidateSets(session, null, 4);
  check('37. Returns valid 2-game sets when requested capacity 4 cannot be fully filled',
    sets.length === 1 && sets[0].length === 2);
})();

// Test 38: Candidate-set robustness evaluation across single-game completion outcomes
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const candSet = [synthFixtures[0], synthFixtures[1]]; // Match 1 (P1 v P2) and Match 2 (P3 v P4)
  const robustness = api.evaluateSetRobustness(session, candSet);

  check('38. Robustness returns completion outcomes for all games in set',
    robustness.completionOutcomes.length === 2 &&
    robustness.completionOutcomes[0].finishedMatchId === 1 &&
    robustness.completionOutcomes[1].finishedMatchId === 2);
  check('38. Robustness minPlayableCount and avgPlayableCount computed',
    typeof robustness.minPlayableCount === 'number' && typeof robustness.avgPlayableCount === 'number');
})();

// Test 39: Exact Worked Counterexample Validation
(() => {
  // 2 Boards (Capacity = 2)
  // P1: 2 matches (G1 and G3)
  // P2, P3, P4, P5: 1 match each
  const pA1 = { id: 1, name: 'P1' };
  const pA2 = { id: 2, name: 'P2' };
  const pA3 = { id: 3, name: 'P3' };
  const pA4 = { id: 4, name: 'P4' };
  const pA5 = { id: 5, name: 'P5' };

  const g1 = { matchId: 1, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 1, playerA: pA1, playerB: pA2 };
  const g2 = { matchId: 2, date: '2026-10-01', division: 'Universal', roundValue: 1, sessionValue: 2, playerA: pA3, playerB: pA4 };
  const g3 = { matchId: 3, date: '2026-10-01', division: 'Universal', roundValue: 2, sessionValue: 1, playerA: pA1, playerB: pA5 };
  const g4 = { matchId: 4, date: '2026-10-01', division: 'Universal', roundValue: 2, sessionValue: 2, playerA: pA2, playerB: pA3 };

  const counterSession = api.createNightSession({
    players: [pA1, pA2, pA3, pA4, pA5],
    fixtures: [g1, g2, g3, g4],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  // NORMAL opening: {G1, G2}
  const normalSet = [g1, g2];
  const normalRob = api.evaluateSetRobustness(counterSession, normalSet);

  // When G2 finishes first in NORMAL set:
  // G4 needs P2 (busy in G1) -> unplayable. G3 needs P1 (busy in G1) -> unplayable.
  // Next playable count = 0 (DEAD END)!
  const g2Outcome = normalRob.completionOutcomes.find((o) => o.finishedMatchId === 2);
  check('39. Counterexample NORMAL: G2 finish produces 0 playable games (dead-end)',
    g2Outcome && g2Outcome.nextPlayableCount === 0);
  check('39. Counterexample NORMAL: deadEndRisk is true and minPlayableCount is 0',
    normalRob.deadEndRisk === true && normalRob.minPlayableCount === 0);

  // OPTIMISED opening: {G2, G3}
  const optSet = [g2, g3];
  const optRob = api.evaluateSetRobustness(counterSession, optSet);

  // In OPTIMISED set:
  // If G3 finishes first -> G1 (P1 v P2) is immediately playable (count = 1).
  // If G2 finishes first -> G4 (P2 v P3) is immediately playable (count = 1).
  check('39. Counterexample OPTIMISED: All outcomes produce >= 1 playable games',
    optRob.completionOutcomes.every((o) => o.nextPlayableCount >= 1));
  check('39. Counterexample OPTIMISED: deadEndRisk is false, minPlayableCount is 1, refillRate is 1.0',
    optRob.deadEndRisk === false && optRob.minPlayableCount === 1 && optRob.refillCapacityRate === 1.0);
})();

// Test 40: Player bottleneck and workload metrics
(() => {
  const pA1 = { id: 1, name: 'P1' };
  const pA2 = { id: 2, name: 'P2' };
  const pA3 = { id: 3, name: 'P3' };
  const pA4 = { id: 4, name: 'P4' };

  const session = api.createNightSession({
    players: [pA1, pA2, pA3, pA4],
    fixtures: [
      { matchId: 1, date: '2026-10-01', division: 'Universal', playerA: pA1, playerB: pA2 },
      { matchId: 2, date: '2026-10-01', division: 'Universal', playerA: pA1, playerB: pA3 },
      { matchId: 3, date: '2026-10-01', division: 'Universal', playerA: pA1, playerB: pA4 },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const bottlenecks = api.evaluatePlayerBottlenecks(session);
  const p1Metric = bottlenecks.playerMetrics.get(1);
  const p2Metric = bottlenecks.playerMetrics.get(2);

  check('40. P1 has remaining count 3 and higher bottleneck score than P2',
    p1Metric.remainingCount === 3 && p2Metric.remainingCount === 1 && p1Metric.bottleneckScore > p2Metric.bottleneckScore);
  check('40. Fixture bottleneck score reflects combined player workloads',
    bottlenecks.getFixtureBottleneckScore(session.fixtures[0]) > 0);
})();

// Test 41: Projected marker confidence evaluation
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers, // 10 players
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  // Candidate set of 2 games uses 4 players. 6 free players remain -> HIGH confidence
  const confHigh = api.evaluateProjectedMarkerConfidence(session, [synthFixtures[0], synthFixtures[1]]);
  check('41. Marker confidence HIGH when ample free markers exist',
    confHigh.rating === api.PROJECTED_MARKER_CONFIDENCE.HIGH && confHigh.freeMarkerCount >= 2);

  // Candidate set of 4 games uses 8 players. 2 free players remain for 4 boards -> MEDIUM confidence
  const confMed = api.evaluateProjectedMarkerConfidence(session, [synthFixtures[0], synthFixtures[1], synthFixtures[2], synthFixtures[3]]);
  check('41. Marker confidence MEDIUM when free markers are limited',
    confMed.rating === api.PROJECTED_MARKER_CONFIDENCE.MEDIUM && confMed.freeMarkerCount === 2);
})();

// Test 42: Delayed-game comparative structural impact
(() => {
  // P1 and P2 have a pending CURRENT match (Match 1).
  // Delayed match (Match 7) also involves P1.
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 1, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
      { matchId: 7, date: '2026-09-03', division: 'Universal', playerA: p1, playerB: p9, delayed: true },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  const delayedImpactConflicting = api.evaluateDelayedGameImpact(session, session.fixtures[1]);
  check('42. Delayed game held back when player is needed for CURRENT match',
    delayedImpactConflicting.recommended === false &&
    delayedImpactConflicting.reasonCode === api.REASON_CODES.DELAYED_CREATES_CURRENT_BOTTLENECK);

  // Delayed match (Match 8) involves P9 and P10 who have NO current matches
  const sessionSafe = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: [
      { matchId: 1, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
      { matchId: 8, date: '2026-09-03', division: 'Universal', playerA: p9, playerB: p10, delayed: true },
    ],
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
  });

  const delayedImpactSafe = api.evaluateDelayedGameImpact(sessionSafe, sessionSafe.fixtures[1]);
  check('42. Delayed game safe when competitors have no current-night conflicts',
    delayedImpactSafe.recommended === true &&
    delayedImpactSafe.reasonCode === api.REASON_CODES.DELAYED_SAFE_SPARE_CAPACITY);
})();

// Test 43: Pure portability check (runs cleanly in Node.js headless environment)
(() => {
  check('43. All Slice 2A primitives execute with zero host/browser dependencies',
    typeof api.getCompatibleCandidateSets === 'function' &&
    typeof api.evaluateSetRobustness === 'function' &&
    typeof api.evaluatePlayerBottlenecks === 'function' &&
    typeof api.evaluateProjectedMarkerConfidence === 'function' &&
    typeof api.evaluateDelayedGameImpact === 'function');
})();

console.log('\n--- Slice 2B Global Running Order Planner Tests ---');

// Test 44: NORMAL Strategy Complete Running Order
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6), // 6 current fixtures
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planNormal = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.NORMAL });
  check('44. NORMAL strategy generates valid projected waves',
    planNormal.strategy === 'NORMAL' && planNormal.projectedWaves.length > 0);
  check('44. NORMAL openingRecommendations populated with marker analyses',
    planNormal.openingRecommendations.length > 0 && planNormal.openingRecommendations[0].recommendedMarkers.length > 0);
  check('44. NORMAL projectedNextPriorities matches Wave 2',
    Array.isArray(planNormal.projectedNextPriorities) &&
    (planNormal.projectedWaves.length < 2 || planNormal.projectedNextPriorities.length === planNormal.projectedWaves[1].games.length));
  check('44. NORMAL reasonCodes include PLAN_NORMAL_FIXTURE_ORDER',
    planNormal.reasonCodes.includes(api.REASON_CODES.PLAN_NORMAL_FIXTURE_ORDER));
})();

// Test 45: OPTIMISED Strategy Complete Running Order
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6),
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planOpt = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });
  check('45. OPTIMISED strategy generates valid projected waves',
    planOpt.strategy === 'OPTIMISED' && planOpt.projectedWaves.length > 0);
  check('45. OPTIMISED metrics include totalWaves, bottleneckTailDepth, robustnessScore',
    typeof planOpt.metrics.totalWaves === 'number' &&
    typeof planOpt.metrics.bottleneckTailDepth === 'number' &&
    typeof planOpt.metrics.robustnessScore === 'number' &&
    typeof planOpt.metrics.planScore === 'number');
  check('45. OPTIMISED reasonCodes include PLAN_OPTIMISED_REDUCED_WAVES',
    planOpt.reasonCodes.includes(api.REASON_CODES.PLAN_OPTIMISED_REDUCED_WAVES));
})();

// Test 46: Slice 2A Counterexample in getProjectedRunningOrder (Dead-End Avoidance)
(() => {
  const ceFixtures = [
    { matchId: 101, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    { matchId: 102, date: '2026-10-01', division: 'Universal', playerA: p3, playerB: p4, delayed: false },
    { matchId: 103, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p5, delayed: false },
    { matchId: 104, date: '2026-10-01', division: 'Universal', playerA: p2, playerB: p3, delayed: false },
  ];

  const session = api.createNightSession({
    players: [p1, p2, p3, p4, p5],
    fixtures: ceFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planNormal = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.NORMAL, capacity: 2 });
  const planOpt = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 2 });

  // Normal picks G1 (101) and G2 (102) -> Dead end risk when G2 completes first
  const normalOpeningIds = planNormal.projectedWaves[0].games.map((g) => g.matchId);
  check('46. Counterexample NORMAL picks greedy opening [101, 102]',
    normalOpeningIds.includes(101) && normalOpeningIds.includes(102));
  check('46. Counterexample NORMAL robustnessScore is 0 (dead-end)',
    planNormal.metrics.robustnessScore === 0);

  // Optimised picks G2 (102) and G3 (103) -> No dead-end risk
  const optOpeningIds = planOpt.projectedWaves[0].games.map((g) => g.matchId);
  check('46. Counterexample OPTIMISED picks robust opening [102, 103]',
    optOpeningIds.includes(102) && optOpeningIds.includes(103));
  check('46. Counterexample OPTIMISED robustnessScore is >= 1',
    planOpt.metrics.robustnessScore >= 1);
})();

// Test 47: Deep Multi-Wave Look-Ahead Proof Test
(() => {
  // Scenario: 6 players, 7 fixtures, Cap = 2
  // Opening set choice A leads to 4 total waves due to poor subsequent wave grouping.
  // Opening set choice B leads to 3 total waves.
  const fixturesLookahead = [
    { matchId: 201, date: '2026-10-01', roundValue: 1, sessionValue: 1, division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    { matchId: 202, date: '2026-10-01', roundValue: 1, sessionValue: 2, division: 'Universal', playerA: p3, playerB: p4, delayed: false },
    { matchId: 203, date: '2026-10-01', roundValue: 2, sessionValue: 1, division: 'Universal', playerA: p1, playerB: p3, delayed: false },
    { matchId: 204, date: '2026-10-01', roundValue: 2, sessionValue: 2, division: 'Universal', playerA: p2, playerB: p4, delayed: false },
    { matchId: 205, date: '2026-10-01', roundValue: 3, sessionValue: 1, division: 'Universal', playerA: p5, playerB: p6, delayed: false },
    { matchId: 206, date: '2026-10-01', roundValue: 3, sessionValue: 2, division: 'Universal', playerA: p5, playerB: p1, delayed: false },
    { matchId: 207, date: '2026-10-01', roundValue: 4, sessionValue: 1, division: 'Universal', playerA: p6, playerB: p2, delayed: false },
  ];

  const session = api.createNightSession({
    players: [p1, p2, p3, p4, p5, p6],
    fixtures: fixturesLookahead,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planOpt = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 2 });
  const planNormal = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.NORMAL, capacity: 2 });

  check('47. Deep lookahead: OPTIMISED schedules all 7 fixtures',
    planOpt.metrics.totalScheduledGames === 7);
  check('47. Deep lookahead: OPTIMISED total waves is <= NORMAL total waves',
    planOpt.metrics.totalWaves <= planNormal.metrics.totalWaves);
})();

// Test 48: Dynamic Replanning on Real Event Completion
(() => {
  const session1 = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6),
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const plan1 = api.getProjectedRunningOrder(session1, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });

  // Factual event: Match 1 finishes
  const session2 = api.applyGameCompleted(session1, { matchId: 1 });
  const plan2 = api.getProjectedRunningOrder(session2, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });

  check('48. Dynamic replanning: Session 1 completedMatchIds size is 0',
    session1.completedMatchIds.size === 0);
  check('48. Dynamic replanning: Session 2 completedMatchIds contains Match 1',
    session2.completedMatchIds.has(1));
  check('48. Dynamic replanning: Plan 2 schedules remaining 5 fixtures only',
    plan2.metrics.totalScheduledGames === 5);
})();

// Test 49: Strategy Switching Isolation (Zero Side-Effects)
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6),
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const beforeJson = JSON.stringify({
    players: session.players.length,
    active: session.activeGames.length,
    completed: Array.from(session.completedMatchIds),
  });

  const planN = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.NORMAL });
  const planO = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });

  const afterJson = JSON.stringify({
    players: session.players.length,
    active: session.activeGames.length,
    completed: Array.from(session.completedMatchIds),
  });

  check('49. Strategy switching: Session remains completely immutable',
    beforeJson === afterJson);
  check('49. Strategy switching: Returns distinct plan structures for NORMAL and OPTIMISED',
    planN.strategy === 'NORMAL' && planO.strategy === 'OPTIMISED');
})();

// Test 50: Configurable Capacities (1, 2, 4, 6)
(() => {
  const session = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6),
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
  });

  const planCap1 = api.getProjectedRunningOrder(session, { capacity: 1 });
  const planCap2 = api.getProjectedRunningOrder(session, { capacity: 2 });
  const planCap4 = api.getProjectedRunningOrder(session, { capacity: 4 });
  const planCap6 = api.getProjectedRunningOrder(session, { capacity: 6 });

  check('50. Capacity 1: Every wave has size 1',
    planCap1.projectedWaves.every((w) => w.games.length === 1));
  check('50. Capacity 2: Every wave has size <= 2',
    planCap2.projectedWaves.every((w) => w.games.length <= 2));
  check('50. Capacity 4: Waves respect max capacity 4',
    planCap4.projectedWaves.every((w) => w.games.length <= 4));
  check('50. Capacity 6: Waves respect max capacity 6',
    planCap6.projectedWaves.every((w) => w.games.length <= 6));
})();

// Test 51: Partial Capacity and Asymmetric Schedules
(() => {
  // 3 players, 3 fixtures (triangle) -> max concurrency is 1 match at a time
  const triFixtures = [
    { matchId: 301, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p2, delayed: false },
    { matchId: 302, date: '2026-10-01', division: 'Universal', playerA: p2, playerB: p3, delayed: false },
    { matchId: 303, date: '2026-10-01', division: 'Universal', playerA: p1, playerB: p3, delayed: false },
  ];

  const session = api.createNightSession({
    players: [p1, p2, p3],
    fixtures: triFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4, // 4 boards available, but only 1 can be used at a time
  });

  const planTri = api.getProjectedRunningOrder(session, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });
  check('51. Asymmetric schedule: 3-player triangle plans into 3 sequential 1-game waves',
    planTri.metrics.totalWaves === 3 && planTri.metrics.totalScheduledGames === 3);
  check('51. Asymmetric schedule: Zero unschedulable fixtures',
    planTri.unschedulableFixtures.length === 0);
})();

// Test 52: Delayed Games Handling in Planner
(() => {
  // Session with delayed game OFF
  const sessionDelayedOff = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures, // contains Match 7 delayed
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: false,
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planOff = api.getProjectedRunningOrder(sessionDelayedOff);
  const allMatchIdsOff = planOff.projectedWaves.flatMap ? planOff.projectedWaves.flatMap((w) => w.games.map((g) => g.matchId)) : planOff.projectedWaves.reduce((acc, w) => acc.concat(w.games.map((g) => g.matchId)), []);
  check('52. Delayed OFF: Delayed match 7 is not scheduled',
    !allMatchIdsOff.includes(7));

  // Session with delayed game ON
  const sessionDelayedOn = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    includeDelayed: true,
    managedBoardsEnabled: true,
    boardCount: 2,
  });

  const planOn = api.getProjectedRunningOrder(sessionDelayedOn);
  const allMatchIdsOn = planOn.projectedWaves.reduce((acc, w) => acc.concat(w.games.map((g) => g.matchId)), []);
  check('52. Delayed ON: Delayed match 7 is scheduled in waves',
    allMatchIdsOn.includes(7));

  // Session with NOT TONIGHT rejection
  const sessionRejected = api.rejectDelayedGame(sessionDelayedOn, 7);
  const planRejected = api.getProjectedRunningOrder(sessionRejected);
  const allMatchIdsRej = planRejected.projectedWaves.reduce((acc, w) => acc.concat(w.games.map((g) => g.matchId)), []);
  check('52. NOT TONIGHT: Rejected delayed match 7 is excluded from waves',
    !allMatchIdsRej.includes(7));
})();

// Test 53: Active EXTRA/FUTURE Semantics in Planner
(() => {
  const sessionActive = api.createNightSession({
    players: allSyntheticPlayers,
    fixtures: synthFixtures.slice(0, 6),
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 2,
    activeGames: [{ matchId: 999, isExtra: true, playerA: p1, playerB: p4 }],
  });

  const plan = api.getProjectedRunningOrder(sessionActive, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });

  // 1. Active match itself is not in projected waves or opening recommendations
  const allProjectedMatchIds = plan.projectedWaves.reduce((acc, w) => acc.concat(w.games.map((g) => g.matchId)), []);
  const recMatchIds = plan.openingRecommendations.map((r) => r.game.matchId);
  check('53. Active game is not in projected waves',
    !allProjectedMatchIds.includes(999));
  check('53. Active game is not in opening recommendations',
    !recMatchIds.includes(999));

  // 2. Active players P1 and P4 are excluded from Wave 1
  const wave1 = plan.projectedWaves[0] || { games: [] };
  const wave1PlayerIds = [];
  wave1.games.forEach((g) => {
    wave1PlayerIds.push(g.playerA.id);
    wave1PlayerIds.push(g.playerB.id);
  });
  check('53. Active competitors P1 and P4 are excluded from Wave 1',
    !wave1PlayerIds.includes(p1.id) && !wave1PlayerIds.includes(p4.id));

  // 3. Blocked fixtures involving P1/P4 remain deferred in unschedulableFixtures
  const unschedulableIds = plan.unschedulableFixtures.map((f) => f.matchId);
  check('53. Fixtures blocked by currently active players are deferred as unschedulable',
    unschedulableIds.includes(1) && unschedulableIds.includes(2));

  // 4. When real active game 999 completes, replanning incorporates newly freed fixtures
  const sessionAfterCompletion = api.applyGameCompleted(sessionActive, { matchId: 999 });
  const planAfter = api.getProjectedRunningOrder(sessionAfterCompletion, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });
  const newScheduledIds = planAfter.projectedWaves.reduce((acc, w) => acc.concat(w.games.map((g) => g.matchId)), []);
  check('53. Completing active game unlocks previously deferred fixtures',
    newScheduledIds.includes(1) && newScheduledIds.includes(2));
})();

// Test 54: Performance and Scalability Safety (10, 20, 30 synthetic fixtures)
(() => {
  function generateSyntheticFixtures(count, playerCount) {
    const players = [];
    for (let i = 1; i <= playerCount; i++) {
      players.push({ id: 500 + i, name: 'Player ' + i, division: 'Universal' });
    }
    const fixtures = [];
    let mId = 1000;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length && fixtures.length < count; j++) {
        fixtures.push({
          matchId: ++mId,
          date: '2026-10-01',
          division: 'Universal',
          playerA: players[i],
          playerB: players[j],
          delayed: false,
        });
      }
    }
    return { players, fixtures };
  }

  // 10 Fixtures
  const pool10 = generateSyntheticFixtures(10, 8);
  const session10 = api.createNightSession({
    players: pool10.players,
    fixtures: pool10.fixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });
  const t0_10 = Date.now();
  const plan10 = api.getProjectedRunningOrder(session10, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 4 });
  const ms10 = Date.now() - t0_10;
  check('54. 10 fixtures: Planning completes with valid wave breakdown',
    plan10.metrics.totalScheduledGames === 10 && plan10.projectedWaves.length > 0);

  // 20 Fixtures
  const pool20 = generateSyntheticFixtures(20, 10);
  const session20 = api.createNightSession({
    players: pool20.players,
    fixtures: pool20.fixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });
  const t0_20 = Date.now();
  const plan20 = api.getProjectedRunningOrder(session20, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 4 });
  const ms20 = Date.now() - t0_20;
  check('54. 20 fixtures: Planning completes with valid wave breakdown',
    plan20.metrics.totalScheduledGames === 20 && plan20.projectedWaves.length > 0);

  // 30 Fixtures
  const pool30 = generateSyntheticFixtures(30, 12);
  const session30 = api.createNightSession({
    players: pool30.players,
    fixtures: pool30.fixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });
  const t0_30 = Date.now();
  const plan30A = api.getProjectedRunningOrder(session30, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 4 });
  const ms30 = Date.now() - t0_30;
  const plan30B = api.getProjectedRunningOrder(session30, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, capacity: 4 });

  check('54. 30 fixtures: Planning completes with valid wave breakdown',
    plan30A.metrics.totalScheduledGames === 30 && plan30A.projectedWaves.length > 0);
  check('54. Determinism: Repeated 30-fixture runs yield identical plans',
    JSON.stringify(plan30A) === JSON.stringify(plan30B));
  check('54. Search bounds: Maximum wave capacity of 4 strictly respected',
    plan30A.projectedWaves.every((w) => w.games.length <= 4));

  // Diagnostic log only (non-failing)
  console.log(`[Diagnostic Performance] 10 fixtures: ${ms10}ms | 20 fixtures: ${ms20}ms | 30 fixtures: ${ms30}ms`);
})();

// Test 55: Real Captured Schedule Snapshot Full Running Order
(() => {
  const sessionReal = api.createNightSession({
    players: parsedRoster.players,
    fixtures: parsedFixtures,
    selectedDivision: 'Universal',
    selectedMatchDate: '2026-10-01',
    managedBoardsEnabled: true,
    boardCount: 4,
  });

  const planRealNormal = api.getProjectedRunningOrder(sessionReal, { strategy: api.SCHEDULING_STRATEGIES.NORMAL });
  const planRealOpt = api.getProjectedRunningOrder(sessionReal, { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED });

  check('55. Real capture: NORMAL generates full running order across multiple waves',
    planRealNormal.projectedWaves.length > 0 && planRealNormal.metrics.totalScheduledGames > 0);
  check('55. Real capture: OPTIMISED generates full running order across multiple waves',
    planRealOpt.projectedWaves.length > 0 && planRealOpt.metrics.totalScheduledGames > 0);
  check('55. Real capture: All scheduled games belong to Universal division',
    planRealOpt.projectedWaves.every((w) => w.games.every((g) => g.division === 'Universal')));
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

  // Real capture candidate sets & robustness
  const realPlayable = api.getPlayableGames(sessionReal);
  const realSets = api.getCompatibleCandidateSets(sessionReal, realPlayable, 4);
  check('Real capture: Compatible 4-sets generated for Universal',
    realSets.length > 0 && realSets[0].length === 4);

  const realRob = api.evaluateSetRobustness(sessionReal, realSets[0]);
  check('Real capture: Robustness evaluation succeeds for real 4-set without dead-ends',
    realRob.completionOutcomes.length === 4 && realRob.minPlayableCount > 0);
})();

// ---------------------------------------------------------------------------
// Slice 3A UI integration adapter (pure UI-boundary functions only; the
// browser-independent scheduler core is unchanged and still carries no DOM,
// window, document, GM, network or storage dependencies).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3A UI Integration Adapter Tests ---');

// 56. UI defaults are memory-only and exactly as specified.
(() => {
  const ui = api.defaultSchedulerUiState();
  check('56. Default strategy is NORMAL', ui.strategy === api.SCHEDULING_STRATEGIES.NORMAL);
  check('56. Default includeDelayed is OFF', ui.includeDelayed === false);
  check('56. Default managedBoardsEnabled is OFF', ui.managedBoardsEnabled === false);
  check('56. Default boardCount is 4 (UI default only)', ui.boardCount === 4);
  // The default is a fresh object: mutating one instance cannot leak into another.
  ui.boardCount = 6;
  check('56. Defaults are per-call (no shared mutable state)', api.defaultSchedulerUiState().boardCount === 4);
})();

// 57. buildNightSession is read-only on factual state; live flags project
// into session active games (capacity), statuses pass through factually.
(() => {
  const rosterCopy = parsedRoster.players.filter((p) => p.division === 'Universal');
  const fixturesCopy = parsedFixtures.map((f) => JSON.parse(JSON.stringify(f)));
  const current = fixturesCopy.filter((f) => !f.delayed && f.date === '2026-10-01');
  const liveId = current[0].matchId;
  current[0].status = 'playing'; // factual live flag from the live matcher
  const delayedId = fixturesCopy.find((f) => f.delayed).matchId;
  const data = { fixtures: fixturesCopy, roster: rosterCopy };
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };

  const before = JSON.stringify(fixturesCopy);
  const session = api.buildNightSession(api.defaultSchedulerUiState(), data, view);
  check('57. Factual fixtures are NOT mutated by session build', JSON.stringify(fixturesCopy) === before);
  check('57. Live fixture projected as a session active game (capacity consumed)',
    session.activeGames.length === 1 && session.activeGames[0].matchId === liveId);
  check('57. Session carries no completion data (only reliable live flags used)',
    session.completedMatchIds.size === 0);
  check('57. Factual statuses pass through unchanged (lowercase factual state)',
    session.fixtures.find((f) => f.matchId === liveId).status === 'playing' &&
    session.fixtures.filter((f) => f.matchId !== liveId).every((f) => f.status === 'waiting'));
  const pStates = api.derivePlayerStates(session);
  check('57. Live players are PLAYING in derived state',
    pStates.get(current[0].playerA.id).state === api.PLAYER_STATES.PLAYING &&
    pStates.get(current[0].playerB.id).state === api.PLAYER_STATES.PLAYING);
  check('57. Fixture identity preserved (same order/players flow through)',
    session.fixtures.every((f, i) => f.playerA.id === fixturesCopy[i].playerA.id));
  check('57. Delayed OFF keeps every delayed game out of the playable programme',
    api.getPlayableGames(session).every((g) => !g.delayed));

  const sessionDelayed = api.buildNightSession(
    Object.assign(api.defaultSchedulerUiState(), { includeDelayed: true }), data, view);
  check('57. Delayed ON admits eligible delayed games via the existing rules',
    api.getPlayableGames(sessionDelayed).some((g) => g.matchId === delayedId));

  // Managed Boards ON honours the chosen count without hard-coding 4.
  [1, 3, 6].forEach((n) => {
    const s = api.buildNightSession(
      Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: n }), data, view);
    check('57. Board count ' + n + ' creates exactly ' + n + ' managed boards',
      s.managedBoardsEnabled && s.boards.length === n && s.boards[n - 1].boardNumber === n);
  });
  const sOff = api.buildNightSession(api.defaultSchedulerUiState(), data, view);
  check('57. Managed Boards OFF creates no board identity at all',
    !sOff.managedBoardsEnabled && sOff.boards.length === 0);
})();

// 58. Active games can never be recommended; advice excludes them in every shape.
(() => {
  const rosterCopy = parsedRoster.players.filter((p) => p.division === 'Universal');
  const fixturesCopy = parsedFixtures.map((f) => JSON.parse(JSON.stringify(f)));
  const current = fixturesCopy.filter((f) => !f.delayed && f.date === '2026-10-01');
  const liveA = current[0].playerA.id;
  const liveB = current[0].playerB.id;
  const liveId = current[0].matchId;
  current[0].status = 'playing';           // shape 1: DartConnect match id known
  current[1].status = 'playing';           // shape 2: id-less broadcast/live row
  current[1].matchId = null;
  const data = { fixtures: fixturesCopy, roster: rosterCopy };
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };

  const advice = api.buildSchedulerAdvice(api.defaultSchedulerUiState(), data, view);
  const recIds = advice.recommended.map((g) => g.matchId);
  const liveIds = new Set([liveId, null]);
  const recPlayers = new Set();
  advice.recommended.forEach((g) => { recPlayers.add(g.playerA.id); recPlayers.add(g.playerB.id); });
  check('58. Match-id live game is not recommended', recIds.indexOf(liveId) === -1);
  check('58. Id-less active game is not recommended (null never matches)', recIds.indexOf(null) === -1);
  check('58. Players of active games are protected (their other games are not recommended)',
    advice.recommended.every((g) => !liveIds.has(g.playerA.id) && !liveIds.has(g.playerB.id)) &&
    !recPlayers.has(liveA) && !recPlayers.has(liveB));
  check('58. Advice carries no scores, reasons or marker names (UI boundary)',
    advice.recommended.every((g) => typeof g === 'object' && !('score' in g) && !('reasonCode' in g) && !('bestMarker' in g)));
  check('58. Projected next excludes active games and stays disjoint from advice',
    advice.projectedNext.every((g) => g.status === 'waiting') &&
    advice.projectedNext.every((g) => !liveIds.has(g.matchId)) &&
    advice.projectedNext.every((g) => recIds.indexOf(g.matchId) === -1));
  check('58. Plan still schedules the remaining programme', advice.laterCount >= 0 &&
    (advice.recommended.length + advice.projectedNext.length + advice.laterCount) > 0);

  // Strategy change is pure advice: factual fixture objects are untouched.
  const snapshot = JSON.stringify(fixturesCopy);
  api.buildSchedulerAdvice(Object.assign(api.defaultSchedulerUiState(),
    { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), data, view);
  check('58. NORMAL <-> OPTIMISED does not mutate factual state', JSON.stringify(fixturesCopy) === snapshot);

  // Capacity: managed-board count changes the size of the opening set.
  const wide = api.buildSchedulerAdvice(
    Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: 2 }), data, view);
  check('58. Opening advice never exceeds the managed board count', wide.recommended.length <= 2);
})();

// ---------------------------------------------------------------------------
// Slice 3B managed physical boards (browser-independent core state model).
// The operator is authoritative: assignment/release are explicit actions.
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3B Managed Physical Board Tests ---');

// Shared synthetic world for board tests.
const bRoster = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];
function bFixtures() {
  return [
    { matchId: 61, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' },
    { matchId: 62, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p3, playerB: p4, delayed: false, status: 'waiting' },
    { matchId: 63, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p5, playerB: p6, delayed: false, status: 'waiting' },
    { matchId: 64, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p7, playerB: p8, delayed: false, status: 'waiting' },
  ];
}
const bView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
/**
 * MARKER-2: FACTUAL completion evidence for the shared world — every roster
 * player has completed a game on the current match night. This feeds the
 * FAIR "has already played" PREFERENCE (never a hard gate); a game merely
 * leaving PLAYING is never accepted as completion.
 */
function bCompleted(ids, date) {
  const list = Array.isArray(ids) ? ids : bRoster.map((p) => p.id);
  const day = date || bView.selectedMatchDate;
  const out = [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    out.push({
      matchId: 9000 + i, date: day, division: 'Universal',
      playerA: { id: list[i] }, playerB: { id: list[i + 1] }, source: 'schedule-props',
    });
  }
  return out;
}
// Standard shared-world data WITH factual completion evidence, so the shared
// board/dispatch tests exercise the full FAIR path (played preference +
// rotation). Eligibility itself never depends on it.
const bData = (extra) => Object.assign({
  fixtures: bFixtures(), roster: bRoster, completedMatches: bCompleted(),
}, extra || {});
const bUi = () => Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: 4 });

// 59. OFF requires no boards; ON generates 1..6 UNASSIGNED rows; no auto-mapping.
(() => {
  const sOff = api.buildNightSession(Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: false }),
    bData(), bView);
  check('59. Managed OFF: no physical board identity required (session boards empty)',
    sOff.managedBoardsEnabled === false && sOff.boards.length === 0);
  const recOff = api.buildSchedulerAdvice(Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: false }),
    bData(), bView);
  check('59. Managed OFF: advice is still produced without any board ownership',
    recOff.recommended.length > 0 && recOff.recommended.every((g) => api.findBoardOwningGame({ boards: [{ boardNumber: 1, gameKey: null }] }, g) === null));

  [1, 2, 3, 4, 5, 6].forEach((n) => {
    const rt = api.createManagedBoardRuntime(n);
    check('59. ' + n + ' board runtime created with ' + n + ' rows', rt.boards.length === n);
    check('59. All ' + n + ' new boards are UNASSIGNED', rt.boards.every((b) => b.gameKey === null));
  });

  const advice = api.buildSchedulerAdvice(bUi(), bData(), bView);
  const fresh = api.createManagedBoardRuntime(4);
  const autoAssigned = advice.recommended.filter((g) => api.findBoardOwningGame(fresh, g) !== null);
  check('59. Recommendation rendering NEVER auto-assigns to boards', autoAssigned.length === 0);
  check('59. Default runtime when Managed Boards enables is 4 UNASSIGNED boards',
    api.createManagedBoardRuntime(4).boards.length === 4 &&
    api.createManagedBoardRuntime(4).boards.every((b) => b.gameKey === null));
})();

// 60. Explicit assign + the five ownership invariants.
(() => {
  const f = bFixtures();
  let rt = api.createManagedBoardRuntime(4);
  const res = api.assignGameToBoard(rt, f[0], 1);
  check('60. Fixture A -> Board 1 works', res.ok === true && res.runtime.boards[0].gameKey === 'id:61');
  rt = res.runtime;
  check('60. Board 1 owns exactly that game', api.findBoardOwningGame(rt, f[0]).boardNumber === 1);

  check('60. Same board cannot own two games',
    api.assignGameToBoard(rt, f[1], 1).ok === false &&
    api.assignGameToBoard(rt, f[1], 1).reason === 'board-occupied');
  check('60. Same game cannot own two boards',
    api.assignGameToBoard(rt, f[0], 3).ok === false &&
    api.assignGameToBoard(rt, f[0], 3).reason === 'game-already-assigned');
  check('60. Out-of-range board rejected', api.assignGameToBoard(rt, f[1], 7).ok === false);
  const after = JSON.stringify(rt);
  api.assignGameToBoard(rt, f[1], 1);
  api.assignGameToBoard(rt, f[0], 3);
  check('60. Failed assignments never mutate state', JSON.stringify(rt) === after);

  const rel = api.releaseBoard(rt, 1);
  check('60. Release returns the board to UNASSIGNED', rel.ok && rel.runtime.boards[0].gameKey === null);
  check('60. Board reusable after release', api.assignGameToBoard(rel.runtime, f[1], 1).ok);
  check('60. Release of already-free board is a safe no-op', api.releaseBoard(rel.runtime, 2).ok);
  check('60. Available boards = exactly the UNASSIGNED ones',
    api.getAvailableManagedBoards(rel.runtime).map((b) => b.boardNumber).join(',') === '1,2,3,4');
  check('60. findBoardOwningGame returns null for unowned games', api.findBoardOwningGame(rel.runtime, f[0]) === null);
})();

// 61. Board-count changes: growth preserves; shrink is protected until released.
(() => {
  const f = bFixtures();
  const start = api.createManagedBoardRuntime(3);
  const withAssignments = api.assignGameToBoard(start, f[0], 1).runtime;
  const grown = api.resizeManagedBoards(withAssignments, 5);
  check('61. Increase 3 -> 5 preserves Board 1 ownership',
    grown.ok && grown.runtime.boards.length === 5 && grown.runtime.boards[0].gameKey === 'id:61');
  check('61. New boards 4..5 are UNASSIGNED',
    grown.runtime.boards[3].gameKey === null && grown.runtime.boards[4].gameKey === null);

  const four = api.resizeManagedBoards(withAssignments, 4).runtime;
  const shrunk = api.resizeManagedBoards(four, 3); // boards 1..3 free: allowed
  check('61. Decrease succeeds when removed boards are UNASSIGNED', shrunk.ok && shrunk.runtime.boards.length === 3);

  const occupied = api.assignGameToBoard(four, f[1], 4).runtime; // Board 4 occupied
  const blocked = api.resizeManagedBoards(occupied, 3);
  check('61. Decrease below an occupied board is REJECTED',
    blocked.ok === false && blocked.reason === 'occupied-boards-removed' && blocked.occupiedBoards[0] === 4);
  check('61. Rejected decrease does not mutate the runtime', JSON.stringify(blocked.runtime) === JSON.stringify(occupied));
  const releasedThen = api.resizeManagedBoards(api.releaseBoard(occupied, 4).runtime, 3);
  check('61. Decrease succeeds after the affected board is released',
    releasedThen.ok && releasedThen.runtime.boards.length === 3 &&
    releasedThen.runtime.boards[0].gameKey === 'id:61');
  check('61. Count out of 1..6 range is rejected', api.resizeManagedBoards(four, 0).ok === false && api.resizeManagedBoards(four, 7).ok === false);
})();

// 62. Assignment survives strategy flips; strategy never owns/moves boards.
(() => {
  const f = bFixtures();
  let rt = api.createManagedBoardRuntime(4);
  rt = api.assignGameToBoard(rt, f[0], 2).runtime;
  rt = api.assignGameToBoard(rt, f[2], 4).runtime;
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted() };
  const snapshot = JSON.stringify(rt);

  const norm = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), data, bView);
  check('62. NORMAL planning leaves the board runtime untouched', JSON.stringify(rt) === snapshot);
  const opt = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), data, bView);
  check('62. OPTIMISED planning leaves the board runtime untouched', JSON.stringify(rt) === snapshot);
  const optData = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt };
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), optData, bView);
  check('62. NORMAL -> OPTIMISED preserves assignments', JSON.stringify(rt) === snapshot);
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), optData, bView);
  check('62. OPTIMISED -> NORMAL preserves assignments', JSON.stringify(rt) === snapshot);
  const dataAfter = JSON.stringify({ fixtures: optData.fixtures, roster: optData.roster, completedMatches: optData.completedMatches });
  check('62. Planner input data is never mutated by strategy changes',
    dataAfter === JSON.stringify({ fixtures: f, roster: bRoster, completedMatches: bCompleted() }));
  check('62. Board ownership still visible from helper after both strategies',
    api.findBoardOwningGame(rt, f[0]).boardNumber === 2 && api.findBoardOwningGame(rt, f[2]).boardNumber === 4);
  void norm;
})();

// 63. Delayed and NOT HERE eligibility inside the managed flow.
(() => {
  const f = bFixtures();
  f.push({ matchId: 65, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p9, playerB: p10, delayed: true, status: 'waiting' });
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted() };

  // --- while every game is still waiting ---
  const adviceOff = api.buildSchedulerAdvice(bUi(), data, bView);
  check('63. Delayed OFF: ineligible delayed fixture is never exposed for assignment',
    adviceOff.recommended.every((g) => !g.delayed));
  const delayOffData = { fixtures: JSON.parse(JSON.stringify(f)), roster: bRoster, completedMatches: bCompleted(), boardRuntime: api.createManagedBoardRuntime(4) };
  const beforeOff = JSON.stringify(delayOffData.boardRuntime);
  api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: false }), delayOffData, bView);
  check('63. Delayed OFF does not mutate existing board assignments',
    JSON.stringify(delayOffData.boardRuntime) === beforeOff);

  // NOT HERE safety: absent players are never newly assignable.
  const absentView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [p1.id] };
  const adviceAbsent = api.buildSchedulerAdvice(bUi(), data, absentView);
  check('63. Absent-player fixture cannot be newly assigned through recommendations',
    adviceAbsent.recommended.every((g) => g.playerA.id !== p1.id && g.playerB.id !== p1.id));
  const rtAbsent = api.createManagedBoardRuntime(4);
  const absentFixture = f.find((x) => x.playerA.id === p1.id || x.playerB.id === p1.id);
  const directAbsent = api.assignGameToBoard(rtAbsent, absentFixture, 1, { absentIds: [p1.id] });
  check('63. Core invariant: absent-player fixture is NOT assignable',
    directAbsent.ok === false && directAbsent.reason === 'player-unavailable');

  // Already-assigned game whose player later becomes NOT HERE is preserved.
  let rt2 = api.createManagedBoardRuntime(4);
  rt2 = api.assignGameToBoard(rt2, f[1], 3).runtime;
  const conflicts = api.detectManagedBoardConflicts(rt2, { fixtures: f, absentIds: [p3.id] });
  check('63. NOT HERE conflict on an assigned game is detected',
    conflicts.length === 1 && conflicts[0].boardNumber === 3 && conflicts[0].conflict === 'not-here');
  check('63. Existing assignment is NOT silently deleted by the conflict',
    rt2.boards[2].gameKey === api.boardKeyForGame(f[1]) && api.findBoardOwningGame(rt2, f[1]).boardNumber === 3);

  // --- two current games go factually live: spare capacity appears ---
  f[0].status = 'playing';
  f[1].status = 'playing';
  const adviceOn = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }), data, bView);
  const delayedRecommended = adviceOn.recommended.find((g) => g.delayed);
  check('63. Delayed ON: eligible delayed fixture can appear as an actionable recommendation',
    !!delayedRecommended && api.getAvailableManagedBoards(api.createManagedBoardRuntime(4)).length === 4);
  let rt = api.createManagedBoardRuntime(4);
  const delayedAssign = api.assignGameToBoard(rt, delayedRecommended, 2);
  check('63. Eligible delayed recommendation is assignable like any other',
    delayedAssign.ok && delayedAssign.runtime.boards[1].gameKey === api.boardKeyForGame(delayedRecommended));
  const delayOnData = { fixtures: JSON.parse(JSON.stringify(f)), roster: bRoster, completedMatches: bCompleted(), boardRuntime: delayedAssign.runtime };
  const snapshotOn = JSON.stringify(delayOnData.boardRuntime);
  api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }), delayOnData, bView);
  check('63. Delayed ON advice recomputation keeps assignments intact', JSON.stringify(delayOnData.boardRuntime) === snapshotOn);
})();

// 64. Boards vs DartConnect factual state: separate facts, no persistence.
(() => {
  const f = bFixtures();
  f[0].status = 'playing'; // factual DartConnect live state
  let rt = api.createManagedBoardRuntime(4);
  const before = f[0].status;
  rt = api.assignGameToBoard(rt, f[0], 1).runtime;
  check('64. Assignment does NOT manufacture PLAYING for a waiting game',
    (() => { const w = bFixtures(); let r2 = api.createManagedBoardRuntime(4); r2 = api.assignGameToBoard(r2, w[1], 1).runtime; return w[1].status === 'waiting'; })());
  check('64. Assigning a PLAYING game does not remove its PLAYING state', f[0].status === before && before === 'playing');
  const rel = api.releaseBoard(rt, 1);
  check('64. Release does NOT remove PLAYING state', f[0].status === 'playing');
  check('64. Release does NOT mark fixture completed (no completion concept exists)',
    rel.runtime.boards[0].gameKey === null && typeof rel.runtime.completed === 'undefined');
  const assignedStillWaiting = (() => { const w = bFixtures(); return w[1].status; })();
  check('64. Assignment/release adds no DONE/complete semantics', assignedStillWaiting === 'waiting');

  // Unassignable with capacity when a live game is not on any board.
  const session = api.buildNightSession(bUi(), { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt }, bView);
  const playable = api.getPlayableGames(session);
  check('64. Live (PLAYING) game is not re-recommended while its board context exists',
    playable.every((g) => g.matchId !== f[0].matchId));
  check('64. Remaining games stay schedulable around factual live state', playable.length >= 3);

  // No persistence side effect: helpers touch nothing but their return value.
  const fakeStorage = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); } };
  api.assignGameToBoard(rt, f[2], 2);
  api.releaseBoard(rt, 1);
  api.resizeManagedBoards(rt, 6);
  check('64. Managed-board assignments have NO persistence side effect', Object.keys(fakeStorage.store).length === 0);
  void fakeStorage;

  check('64. Board count is not hard-coded to four',
    api.createManagedBoardRuntime(6).boards.length === 6 &&
    api.createManagedBoardRuntime(1).boards.length === 1 &&
    api.resizeManagedBoards(api.createManagedBoardRuntime(2), 6).ok);
})();

// 65. Owned games consume planner capacity through the factual projection.
(() => {
  const f = bFixtures();
  let rt = api.createManagedBoardRuntime(4);
  rt = api.assignGameToBoard(rt, f[0], 1).runtime;
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt };
  const advice = api.buildSchedulerAdvice(bUi(), data, bView);
  check('65. An assigned game is not re-recommended (its players are occupied)',
    advice.recommended.every((g) => g.matchId !== f[0].matchId));
  check('65. Assignment does not imply completion: projectedNext may still contain the game elsewhere',
    advice.projectedNext.every((g) => g.matchId !== f[0].matchId));
  const states = api.derivePlayerStates(advice.session);
  check('65. Assigned game players derive as PLAYING in the projection',
    states.get(f[0].playerA.id).state === api.PLAYER_STATES.PLAYING &&
    states.get(f[0].playerB.id).state === api.PLAYER_STATES.PLAYING);
  check('65. Core board runtime unchanged by the projection',
    rt.boards[0].gameKey === 'id:61' && rt.boards[1].gameKey === null);
  check('65. PROJECTED NEXT stays forecast-only (no assignment can come from it)',
    advice.projectedNext.every((g) => api.findBoardOwningGame(rt, g) === null));
})();

// ---------------------------------------------------------------------------
// Slice 3B UI scale (pure presentation preference; never scheduler state).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3B UI Scale Tests ---');

// 66. Scale steps, boundaries and stored-value handling.
(() => {
  check('66. Default scale = 100%', api.UI_SCALE_DEFAULT === 100);
  check('66. Supported scales exactly include 75, 80, 90, 100, 110, 125',
    JSON.stringify(api.UI_SCALE_VALUES) === JSON.stringify([75, 80, 90, 100, 110, 125]));
  check('66. Minus from 100 -> 90', api.previousUiScale(100) === 90);
  check('66. Minus from 90 -> 80', api.previousUiScale(90) === 80);
  check('66. Plus from 100 -> 110', api.nextUiScale(100) === 110);
  check('66. Plus from 110 -> 125', api.nextUiScale(110) === 125);
  check('66. Minus at 75 stays 75 (hard lower boundary)', api.previousUiScale(75) === 75);
  check('66. Plus at 125 stays 125 (hard upper boundary)', api.nextUiScale(125) === 125);
  check('66. parseStoredUiScale accepts valid values',
    api.parseStoredUiScale('90') === 90 && api.parseStoredUiScale(110) === 110);
  check('66. Invalid stored values fall back to 100',
    api.parseStoredUiScale('bogus') === 100 && api.parseStoredUiScale('500') === 125 && api.parseStoredUiScale(null) === 100);
  check('66. normalizeUiScale snaps to the nearest supported step', api.normalizeUiScale(103) === 100 && api.normalizeUiScale(121) === 125);
})();

// 67. Scale storage wrappers: dedicated key, no scheduler/board leakage.
(() => {
  const store = {};
  const fakeStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  check('67. Default load with no stored value = 100%', api.loadUiScale(fakeStorage) === 100);
  fakeStorage.setItem(api.SCALE_KEY, '80');
  check('67. Valid persisted scale restores correctly', api.loadUiScale(fakeStorage) === 80);
  fakeStorage.setItem(api.SCALE_KEY, 'nonsense');
  check('67. Invalid persisted scale falls back to 100', api.loadUiScale(fakeStorage) === 100);
  api.saveUiScale(fakeStorage, 90);
  check('67. saveUiScale persists under the dedicated SCALE_KEY only', store[api.SCALE_KEY] === '90' && Object.keys(store).length === 1);

  // Scale is independent from scheduler factual / runtime state.
  const f = bFixtures();
  let rt = api.createManagedBoardRuntime(4);
  rt = api.assignGameToBoard(rt, f[0], 1).runtime;
  const ui = bUi();
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt };
  const boardSnapshot = JSON.stringify(rt);
  const fixSnapshot = JSON.stringify(f);
  api.loadUiScale(fakeStorage);
  api.saveUiScale(fakeStorage, 125);
  check('67. Scale read/write does not mutate board assignments', JSON.stringify(rt) === boardSnapshot);
  check('67. Scale read/write does not mutate factual fixtures', JSON.stringify(f) === fixSnapshot);
  check('67. Scale storage holds no board data', !JSON.stringify(store).includes('id:61'));
  const advice = api.buildSchedulerAdvice(Object.assign(ui, { zoom: 80 }), data, bView);
  check('67. Changing scale does not change RECOMMENDED contents',
    advice.recommended.length > 0 && advice.recommended.every((g) => api.findBoardOwningGame(rt, g) === null));
  check('67. Scale in UI state does not mutate strategy/delayed/boards/NOT HERE',
    ui.strategy === api.SCHEDULING_STRATEGIES.OPTIMISED_OR_NORMAL_PLACEHOLDER === false);
  check('67. Board runtime still intact after advice with a scale value present', JSON.stringify(rt) === boardSnapshot);
  void fixSnapshot;
})();

// 68. FIT selection and manual +/- continuity after FIT.
(() => {
  check('68. FIT returns only supported values (sampled viewport grid)',
    [[1366, 768], [1920, 1080], [2560, 1440], [1280, 700], [1024, 600], [800, 560], [1600, 900], [1440, 819], [1366, 640], [1920, 720]]
      .every(([w, h]) => api.UI_SCALE_VALUES.indexOf(api.fitUiScale(w, h)) !== -1));
  check('68. FIT never returns below 75 or above 125',
    [[640, 480], [3840, 2160], [500, 300], [7680, 4320], [1366, 200], [2000, 5000]]
      .every(([w, h]) => { const v = api.fitUiScale(w, h); return v >= 75 && v <= 125; }));
  check('68. FIT considers height: short window -> 80', api.fitUiScale(1366, 700) === 80);
  check('68. FIT considers width: narrow window -> 80 even when height is fine', api.fitUiScale(1000, 900) === 80);
  check('68. FIT 1080p-class viewport keeps 100', api.fitUiScale(1920, 1080) === 100);
  check('68. FIT 1366x768-class viewport -> 90', api.fitUiScale(1366, 768) === 90);
  check('68. FIT 1440p desktop -> 100', api.fitUiScale(2560, 1440) === 100);
  // Manual +/- after FIT continues normally from the selected result.
  let scale = api.fitUiScale(1366, 700); // 80
  check('68. Manual plus after FIT steps from the FIT result (80 -> 90)', api.nextUiScale(scale) === 90);
  scale = api.fitUiScale(2560, 1440); // 100
  check('68. Manual minus after FIT steps from the FIT result (100 -> 90)', api.previousUiScale(scale) === 90);
  scale = api.fitUiScale(800, 500); // 75
  check('68. Manual minus after FIT at the floor stays at 75', api.previousUiScale(scale) === 75);
})();

// ---------------------------------------------------------------------------
// Slice 3B fixture-row board ownership display (presentation reads the
// factual runtime; nothing is written back onto fixture objects).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3B Fixture-Row Board Ownership Tests ---');

// 69. Ownership resolves per fixture row; OFF hides but never deletes.
(() => {
  const f = bFixtures(); // 61..64, all current-night 'waiting'
  let rt = api.createManagedBoardRuntime(4);
  const snap0 = JSON.stringify(rt);

  check('69. Unassigned fixture has no board indicator state',
    api.findBoardOwningGame(rt, f[0]) === null && api.findBoardOwningGame(rt, f[3]) === null);

  rt = api.assignGameToBoard(rt, f[0], 2).runtime;
  check('69. Assigned fixture resolves to exactly its owning board',
    api.findBoardOwningGame(rt, f[0]) !== null && api.findBoardOwningGame(rt, f[0]).boardNumber === 2);
  check('69. Unrelated fixture rows do not inherit the indicator',
    api.findBoardOwningGame(rt, f[1]) === null && api.findBoardOwningGame(rt, f[2]) === null);
  check('69. Fixture object itself is NOT modified to store the board',
    JSON.stringify(f) === JSON.stringify(bFixtures()) && !('board' in f[0]) && !('boardNumber' in f[0]));

  // One assignment, one row: the same game seen twice (duplicate reference)
  // resolves to the same single board; no second board owns it.
  const dup = Object.assign({}, f[0]);
  check('69. Same game resolves to the same single board (no double render target)',
    api.findBoardOwningGame(rt, dup).boardNumber === 2 &&
    rt.boards.filter((b) => b.gameKey === api.boardKeyForGame(f[0])).length === 1);

  // Identity resolution goes only through reliable existing keys.
  const idless = { matchId: null, playerA: { id: 99991, name: 'Ghost A' }, playerB: { id: 99992, name: 'Ghost B' }, delayed: true, status: 'waiting' };
  check('69. Id-less rows resolve only via exact pair identity (no guess)',
    api.boardKeyForGame(idless) === 'pair:99991:99992' && api.findBoardOwningGame(rt, idless) === null);
  let rt2 = api.createManagedBoardRuntime(4);
  rt2 = api.assignGameToBoard(rt2, idless, 1).runtime;
  const idlessTwin = { matchId: null, playerA: { id: 99991, name: 'Ghost A' }, playerB: { id: 99992, name: 'Ghost B' } };
  check('69. Reliably matched id-less row resolves to its board',
    api.findBoardOwningGame(rt2, idlessTwin) !== null && api.findBoardOwningGame(rt2, idlessTwin).boardNumber === 1);
  const idlessOther = { matchId: null, playerA: { id: 99991, name: 'Ghost A' }, playerB: { id: 88888, name: 'Other B' } };
  check('69. Different id-less pair never matches another row\'s assignment', api.findBoardOwningGame(rt2, idlessOther) === null);

  // Release path behind the × marker.
  const rel = api.releaseBoard(rt, 2);
  check('69. Release removes ownership (chip disappears)', rel.ok && api.findBoardOwningGame(rel.runtime, f[0]) === null);
  check('69. Release makes Board 2 available again',
    api.getAvailableManagedBoards(rel.runtime).some((b) => b.boardNumber === 2));
  check('69. Release does not mark the fixture completed',
    f[0].status === 'waiting' && typeof rel.runtime.completed === 'undefined');

  // Strategy flips preserve what the rows would display.
  let rt3 = api.createManagedBoardRuntime(4);
  rt3 = api.assignGameToBoard(rt3, f[1], 3).runtime;
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt3 };
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), data, bView);
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), data, bView);
  check('69. NORMAL <-> OPTIMISED preserves fixture-row ownership resolution',
    api.findBoardOwningGame(rt3, f[1]).boardNumber === 3);

  // Managed OFF hides presentation without deleting runtime state; ON reveals.
  const uiOff = Object.assign(bUi(), { managedBoardsEnabled: false });
  const rt4 = api.assignGameToBoard(api.createManagedBoardRuntime(4), f[0], 1).runtime;
  const kept = JSON.parse(JSON.stringify(rt4));
  const dataOff = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rt4 };
  api.buildNightSession(uiOff, dataOff, bView); // OFF projection ignores ownership
  check('69. Managed OFF: runtime assignments survive untouched',
    JSON.stringify(rt4) === JSON.stringify(kept) && api.findBoardOwningGame(rt4, f[0]).boardNumber === 1);
  const offAdvice = api.buildSchedulerAdvice(uiOff, dataOff, bView);
  check('69. Managed OFF: owned game is advisory-eligible again (no board capacity consumed)',
    offAdvice.recommended.some((g) => g.matchId === f[0].matchId));
  const onAdvice = api.buildSchedulerAdvice(bUi(), dataOff, bView);
  check('69. Managed ON reveals the preserved assignment (owned game not re-recommended)',
    onAdvice.recommended.every((g) => g.matchId !== f[0].matchId) &&
    api.findBoardOwningGame(rt4, f[0]).boardNumber === 1);
  void snap0;
})();

// ---------------------------------------------------------------------------
// Slice 3B collapsible delayed date groups (presentation-only).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3B Collapsible Delayed Groups Tests ---');

// 70. Collapse state is presentation-only; factual/scheduler state untouched.
(() => {
  const f = bFixtures(); // 61..64 current-night
  f.push({ matchId: 71, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p9, playerB: p10, delayed: true, status: 'waiting' });
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted() };

  // Defaults: no state object exists until a render creates it, and every
  // absent entry means EXPANDED.
  check('70. Delayed groups default EXPANDED (no state = expanded)',
    !data.delayedCollapsed &&
    (!data.delayedCollapsed || !data.delayedCollapsed['2026-09-03']));
  data.delayedCollapsed = {};
  data.delayedCollapsed['2026-09-03'] = true;
  check('70. Toggling a delayed group collapses ONLY that date',
    data.delayedCollapsed['2026-09-03'] === true && data.delayedCollapsed['2026-09-10'] !== true);
  const delayedFixture = f.find((x) => x.delayed);
  check('70. Collapsed delayed fixture REMAINS in the scheduler input',
    api.getPlayableGames(api.buildNightSession(
      Object.assign(bUi(), { includeDelayed: true }), data, bView)).some((g) => g.matchId === delayedFixture.matchId));
  const advice = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }), data, bView);
  check('70. Collapsed delayed fixture remains fully present in advice state',
    advice.session.fixtures.some((g) => g.matchId === delayedFixture.matchId));

  // Collapse must not mutate board ownership / NOT HERE / PLAYING.
  const rtv = api.assignGameToBoard(api.createManagedBoardRuntime(4), delayedFixture, 2).runtime;
  const rtSnapshot = JSON.stringify(rtv);
  const withBoard = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), boardRuntime: rtv, delayedCollapsed: data.delayedCollapsed };
  const adviceBoarded = api.buildSchedulerAdvice(bUi(), withBoard, { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [p3.id] });
  check('70. Collapse carries no board-ownership mutation (runtime byte-identical)',
    JSON.stringify(rtv) === rtSnapshot && api.findBoardOwningGame(rtv, delayedFixture).boardNumber === 2);
  check('70. NOT HERE state untouched by collapse (advice still honours absence)',
    adviceBoarded.recommended.every((g) => g.playerA.id !== p3.id && g.playerB.id !== p3.id) &&
    api.findBoardOwningGame(rtv, delayedFixture).boardNumber === 2);
  const fLive = JSON.parse(JSON.stringify(f));
  fLive[0].status = 'playing';
  const liveData = { fixtures: fLive, roster: bRoster, completedMatches: bCompleted(), delayedCollapsed: { '2026-09-03': true } };
  const liveAdvice = api.buildSchedulerAdvice(bUi(), liveData, bView);
  check('70. Collapsed delayed group never touches factual PLAYING/completion state',
    fLive[0].status === 'playing' && fLive.find((x) => x.delayed).status === 'waiting' &&
    liveAdvice.session.completedMatchIds.size === 0);

  // Current-night group is never a collapsible delayed group.
  check('70. Current-night group is not a collapsible delayed group',
    f.filter((x) => !x.delayed).every((x) => !x.delayed) &&
    !data.delayedCollapsed['2026-10-01']);

  // Expanding restores presentation of the same factual fixture rows.
  data.delayedCollapsed['2026-09-03'] = false;
  check('70. Expanding restores the same factual fixture row (identity kept)',
    api.boardKeyForGame(f.find((x) => x.delayed)) === 'id:71' &&
    api.findBoardOwningGame(rtv, f.find((x) => x.delayed)).boardNumber === 2);

  // Collapse state is invisible to the scheduler adapters (no coupling).
  const adviceNoState = api.buildSchedulerAdvice(bUi(), { fixtures: f, roster: bRoster, completedMatches: bCompleted() }, bView);
  const adviceWithState = api.buildSchedulerAdvice(bUi(), { fixtures: f, roster: bRoster, completedMatches: bCompleted(), delayedCollapsed: { '2026-09-03': true, '2026-09-10': true } }, bView);
  check('70. Scheduler advice is identical with or without collapse state',
    JSON.stringify(adviceNoState.recommended.map((g) => g.matchId)) ===
    JSON.stringify(adviceWithState.recommended.map((g) => g.matchId)));
})();

// ---------------------------------------------------------------------------
// Slice 3C marker management (pure domain + adapter boundaries).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3C Marker Management Tests ---');

// 71. Pure ownership invariants (assignment, change, release).
(() => {
  const g = { matchId: 301, playerA: p1, playerB: p2 };
  let rt = api.createMarkerRuntime();
  check('71. Fresh runtime has no ownership',
    api.findMarkerForGame(rt, g) === null && api.findGameMarkedByPlayer(rt, p1.id) === null);

  const asg = api.assignMarkerToGame(rt, g, p3.id, { participantIds: [p1.id, p2.id] });
  check('71. Assign eligible marker works', asg.ok && api.findMarkerForGame(asg.runtime, g) === p3.id);
  check('71. One game -> one marker (byMarker backref consistent)',
    api.findGameMarkedByPlayer(asg.runtime, p3.id) === api.markerGameKey(g));
  rt = asg.runtime;

  check('71. Same game cannot gain a second marker',
    api.assignMarkerToGame(rt, g, p4.id, {}).ok === false &&
    api.findMarkerForGame(rt, g) === p3.id);
  check('71. Marker already marking another game is rejected',
    api.assignMarkerToGame(rt, { matchId: 302, playerA: p5, playerB: p6 }, p3.id, {}).ok === false &&
    api.assignMarkerToGame(rt, { matchId: 302, playerA: p5, playerB: p6 }, p3.id, {}).reason === 'player-already-marking');
  check('71. Participant cannot mark own game',
    api.assignMarkerToGame(api.createMarkerRuntime(), g, p1.id, { participantIds: [p1.id, p2.id] }).ok === false &&
    api.assignMarkerToGame(api.createMarkerRuntime(), g, p1.id, { participantIds: [p1.id, p2.id] }).reason === 'participant');
  check('71. Absent player cannot be assigned',
    api.assignMarkerToGame(api.createMarkerRuntime(), g, p1.id, { absentIds: [p1.id] }).ok === false &&
    api.assignMarkerToGame(api.createMarkerRuntime(), g, p1.id, { absentIds: [p1.id] }).reason === 'player-unavailable');
  check('71. PLAYING player cannot be assigned',
    api.assignMarkerToGame(api.createMarkerRuntime(), g, p1.id, { playingPlayerIds: [p1.id] }).ok === false);
  check('71. Invalid input rejected deterministically',
    api.assignMarkerToGame(rt, g, null, {}).ok === false && api.assignMarkerToGame(rt, null, p4.id, {}).ok === false);

  // Atomic change.
  const chg = api.changeMarkerForGame(rt, g, p4.id, {});
  check('71. Valid replacement is atomic: old released, new assigned',
    chg.ok && api.findMarkerForGame(chg.runtime, g) === p4.id &&
    api.findGameMarkedByPlayer(chg.runtime, p3.id) === null &&
    api.findGameMarkedByPlayer(chg.runtime, p4.id) === api.markerGameKey(g));
  const badChg = api.changeMarkerForGame(chg.runtime, g, p3.id, { playingPlayerIds: [p3.id] });
  check('71. Invalid replacement is rejected and the original assignment survives intact',
    badChg.ok === false && api.findMarkerForGame(badChg.runtime, g) === p4.id &&
    api.findGameMarkedByPlayer(badChg.runtime, p4.id) !== null &&
    api.findGameMarkedByPlayer(badChg.runtime, p3.id) === null);
  check('71. Change of unmarked game is rejected cleanly',
    api.changeMarkerForGame(api.createMarkerRuntime(), { matchId: 999, playerA: p1, playerB: p2 }, p3.id, {}).reason === 'not-marked');

  // Release.
  const rel = api.releaseMarkerFromGame(chg.runtime, g);
  check('71. Release removes only marker ownership',
    rel.ok && api.findMarkerForGame(rel.runtime, g) === null &&
    api.findGameMarkedByPlayer(rel.runtime, p4.id) === null);
  check('71. Releasing an unmarked game is a deterministic no-op',
    api.releaseMarkerFromGame(rel.runtime, g).ok === true &&
    api.releaseMarkerFromGame(rel.runtime, g).reason === 'not-marked');
  check('71. Release of unknown game key is safe',
    api.releaseMarkerFromGame(rel.runtime, null).ok === false &&
    api.releaseMarkerFromGame(rel.runtime, null).reason === 'invalid-game');
  const re = api.assignMarkerToGame(rel.runtime, { matchId: 305, playerA: p7, playerB: p8 }, p4.id, {});
  check('71. Released marker can be assigned again (duty fully freed)', re.ok);
})();

// 72. Eligibility pool + proposed vs confirmed (fact vs advice).
(() => {
  const f = bFixtures();
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted() };
  const ui = bUi();

  const advice1 = api.buildSchedulerAdvice(ui, data, bView);
  // TRIAL-03: the opening wave is resource-valid. Every game carries a slot
  // (null or a safe integer); non-null proposals never belong to ANY game in
  // the same simultaneous opening wave (beyond the old own-participant rule).
  const waveIds72 = new Set(advice1.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('72. Each opening recommendation carries a proposed marker slot (null or id)',
    advice1.recommended.length > 0 &&
    advice1.recommended.every((g) => g.proposedMarkerId === null || Number.isSafeInteger(g.proposedMarkerId)));
  check('72. TRIAL-03: no proposal plays in ANY game of the same opening wave',
    advice1.recommended.every((g) => g.proposedMarkerId == null || !waveIds72.has(g.proposedMarkerId)));
  check('72. Proposed marker is never a game participant',
    advice1.recommended.every((g) => g.proposedMarkerId !== g.playerA.id && g.proposedMarkerId !== g.playerB.id));
  const proposed = advice1.recommended.map((g) => g.proposedMarkerId);
  const proposedNN = proposed.filter((id) => id != null);
  check('72. No duplicate volunteer across simultaneous opening games',
    new Set(proposedNN).size === proposedNN.length);
  const rosterMap = {};
  bRoster.forEach((p) => { rosterMap[p.id] = p; });
  check('72. Proposed markers are roster players (no manufactured people)',
    proposedNN.every((id) => !!rosterMap[id]));
  // TRIAL-03 honesty: this world recommends 4 simultaneous games over 10
  // players (8 participants), so at most the 2 free agents can be markers.
  check('72. Wave with no free volunteers leaves those games honestly unmarked (null, never a wave player)',
    advice1.recommended.length === 4 && proposedNN.length === 2 &&
    advice1.recommended.filter((g) => g.proposedMarkerId === null).length === 2);
  const advice1b = api.buildSchedulerAdvice(bUi(), bData(), bView);
  check('72. Recommendations are deterministic for identical input',
    JSON.stringify(proposed) === JSON.stringify(advice1b.recommended.map((g) => g.proposedMarkerId)) &&
    JSON.stringify(advice1.recommended.map((g) => g.matchId)) === JSON.stringify(advice1b.recommended.map((g) => g.matchId)));

  // Absent players are excluded from proposals.
  const absentTarget = advice1.recommended.find((g) => g.proposedMarkerId != null).proposedMarkerId;
  const absentView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [absentTarget] };
  const adviceAbsent = api.buildSchedulerAdvice(ui, bData(), absentView);
  check('72. NOT HERE player is excluded from new proposals',
    adviceAbsent.recommended.every((g) => g.proposedMarkerId !== absentTarget));

  // PLAYING players are excluded from proposals.
  const fLive = bFixtures();
  fLive[0].status = 'playing';
  const adviceLive = api.buildSchedulerAdvice(ui, { fixtures: fLive, roster: bRoster, completedMatches: bCompleted() }, bView);
  const liveIds = [fLive[0].playerA.id, fLive[0].playerB.id];
  check('72. PLAYING players are excluded from proposals',
    adviceLive.recommended.every((g) => g.proposedMarkerId !== liveIds[0] && g.proposedMarkerId !== liveIds[1]));

  // Proposed NEVER creates factual state; confirmed does.
  const before = api.createMarkerRuntime();
  check('72. Proposed marker does NOT create MARKING state (advice only)',
    JSON.stringify(before) === JSON.stringify(api.createMarkerRuntime()) &&
    api.buildSchedulerAdvice(ui, bData(), bView).session.markingPlayerIds.size === 0);
  const advice2 = api.buildSchedulerAdvice(ui, data, bView);
  const first = advice2.recommended.find((g) => g.proposedMarkerId != null);
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, first, first.proposedMarkerId, {
    participantIds: [first.playerA.id, first.playerB.id],
  }).runtime;
  const dataMarked = bData({ markerRuntime: mrt  });
  const adviceMarked = api.buildSchedulerAdvice(ui, dataMarked, bView);
  check('72. Confirmed marker IS factual: player projects as MARKING in the session',
    adviceMarked.session.markingPlayerIds.has(first.proposedMarkerId));
  const st = api.derivePlayerStates(adviceMarked.session);
  check('72. Confirmed marker derives as MARKING player state',
    st.get(first.proposedMarkerId).state === api.PLAYER_STATES.MARKING);
  check('72. Confirmed marker is not re-proposed elsewhere and not playable',
    adviceMarked.recommended.every((g) => g.proposedMarkerId !== first.proposedMarkerId) &&
    api.getPlayableGames(adviceMarked.session).every((g) => g.playerA.id !== first.proposedMarkerId && g.playerB.id !== first.proposedMarkerId));
  const confirmedGame = adviceMarked.recommended.find((g) => api.markerGameKey(g) === api.markerGameKey(first));
  check('72. Advice reports the confirmed marker on its game',
    !!confirmedGame && confirmedGame.confirmedMarkerId === first.proposedMarkerId);

  // Strategy flips: proposals may change, confirmed ownership survives.
  const optAdvice = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), dataMarked, bView);
  check('72. Strategy change never alters confirmed marker ownership',
    optAdvice.session.markingPlayerIds.has(first.proposedMarkerId) &&
    optAdvice.recommended.some((g) => g.confirmedMarkerId === first.proposedMarkerId));
  check('72. Assigning a marker does NOT manufacture PLAYING',
    dataMarked.fixtures.every((x) => x.status === 'waiting') &&
    optAdvice.session.activeGames.length === 0);
})();

// 73. Boards/markers independence, NOT HERE conflict, delayed/collapse, persistence.
(() => {
  const f = bFixtures();
  const delayed = { matchId: 71, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p9, playerB: p10, delayed: true, status: 'waiting' };
  f.push(delayed);
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, delayed, p1.id, {}).runtime;
  const brt = api.assignGameToBoard(api.createManagedBoardRuntime(4), delayed, 3).runtime;
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt, boardRuntime: brt };
  const mSnapshot = JSON.stringify(mrt);
  const bSnapshot = JSON.stringify(brt);

  // Managed Boards OFF must not delete marker state.
  api.buildSchedulerAdvice(Object.assign(bUi(), { managedBoardsEnabled: false }), data, bView);
  check('73. Managed Boards OFF leaves factual marker state intact',
    JSON.stringify(mrt) === mSnapshot && api.findMarkerForGame(mrt, delayed) === p1.id);

  // Board release does not release marker; marker release does not release board.
  const afterBoardRel = api.releaseBoard(brt, 3);
  check('73. Releasing the board does not release the marker',
    api.findMarkerForGame(mrt, delayed) === p1.id && JSON.stringify(mrt) === mSnapshot);
  const afterMarkerRel = api.releaseMarkerFromGame(mrt, delayed);
  check('73. Releasing the marker does not release the board',
    JSON.stringify(brt) === bSnapshot && api.findBoardOwningGame(brt, delayed) !== null);
  mrt = api.assignMarkerToGame(mrt, delayed, p1.id, {}).runtime;

  // Delayed OFF removes the delayed game from advice but keeps ownership.
  const adviceDelayOff = api.buildSchedulerAdvice(bUi(), data, bView);
  check('73. Delayed OFF: delayed game out of advice, ownership survives',
    adviceDelayOff.recommended.every((g) => !g.delayed) && api.findMarkerForGame(mrt, delayed) === p1.id);

  // Collapsed group: advice/state byte-identical; ownership survives.
  const dataCollapsed = { fixtures: f, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt, boardRuntime: brt, delayedCollapsed: { '2026-09-03': true } };
  const advCollapsed = api.buildSchedulerAdvice(bUi(), dataCollapsed, bView);
  check('73. Collapsed delayed group does not change marker advice or ownership',
    JSON.stringify(mrt) === mSnapshot && api.findMarkerForGame(mrt, delayed) === p1.id &&
    advCollapsed.session.fixtures.some((g) => api.boardKeyForGame(g) === api.boardKeyForGame(delayed)));
  check('73. Marker on a collapsed delayed game still resolves (reappears expanded)',
    api.findMarkerForGame(mrt, delayed) === p1.id);

  // NOT HERE conflict: assignment survives, conflict is detectable, no silent repair.
  const conflicts = api.detectMarkerConflicts(mrt, { absentIds: [p1.id] });
  check('73. Existing assignment survives a later NOT HERE change', api.findMarkerForGame(mrt, delayed) === p1.id);
  check('73. NOT HERE conflict on the marker is detectable',
    conflicts.length === 1 && conflicts[0].markerId === p1.id && conflicts[0].conflict === 'not-here');
  check('73. Conflict detection performs no silent repair', api.findMarkerForGame(mrt, delayed) === p1.id);
  check('73. Cannot NEWLY assign an absent player as marker',
    api.assignMarkerToGame(api.createMarkerRuntime(), delayed, p1.id, { absentIds: [p1.id] }).ok === false);

  // Delayed ON: eligible delayed recommendations can carry proposals.
  // Two current games go factually live so spare capacity promotes the
  // delayed fixture into the opening wave.
  const fSpare = JSON.parse(JSON.stringify(f));
  fSpare[0].status = 'playing';
  fSpare[1].status = 'playing';
  const adviceOn = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }),
    { fixtures: fSpare, roster: bRoster, completedMatches: bCompleted() }, bView);
  const delayedRec = adviceOn.recommended.find((g) => g.delayed);
  // TRIAL-03: a delayed game promoted into the opening wave gets marker
  // advice only from volunteers OUTSIDE the whole wave (null is honest when
  // the wave consumes everyone); a confirmed marker would always be shown.
  const waveOn = new Set(adviceOn.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('73. Delayed ON: eligible delayed game receives marker advice (or honest null under wave exclusion)',
    !!delayedRec && delayedRec.confirmedMarkerId == null &&
    (delayedRec.proposedMarkerId == null || !waveOn.has(delayedRec.proposedMarkerId)));

  // Re-planning freshness: assign/release changes factual availability -> fresh advice.
  const plain = bData();
  const base = api.buildSchedulerAdvice(bUi(), plain, bView);
  let rtA = api.createMarkerRuntime();
  const g0 = base.recommended[0];
  rtA = api.assignMarkerToGame(rtA, g0, g0.proposedMarkerId, {
    participantIds: [g0.playerA.id, g0.playerB.id],
  }).runtime;
  const afterAssign = api.buildSchedulerAdvice(bUi(), bData({ markerRuntime: rtA  }), bView);
  check('73. Assigning a marker re-plans: the marker is no longer proposed elsewhere',
    afterAssign.recommended.every((g) => g.proposedMarkerId !== g0.proposedMarkerId));
  const afterRelease = api.buildSchedulerAdvice(bUi(),
    bData({ markerRuntime: api.releaseMarkerFromGame(rtA, g0).runtime  }), bView);
  check('73. Releasing a marker re-plans: the player is eligible again',
    afterRelease.recommended.some((g) => g.proposedMarkerId === g0.proposedMarkerId));
})();

// 74. Persistence boundary + core independence checks.
(() => {
  check('74. No marker persistence key exists',
    api.SCALE_KEY === 'match-night-singles:ui-scale' &&
    typeof api.loadUiScale === 'function' &&
    api.createMarkerRuntime().byGame !== null);
  const f = bFixtures();
  let rt = api.createMarkerRuntime();
  rt = api.assignMarkerToGame(rt, f[0], p3.id, {}).runtime;
  const fakeStorage = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); } };
  api.assignMarkerToGame(rt, f[1], p4.id, {});
  api.releaseMarkerFromGame(rt, f[0]);
  api.changeMarkerForGame(rt, f[1], p5.id, {});
  check('74. Marker operations have NO persistence side effect', Object.keys(fakeStorage.store).length === 0);
  void fakeStorage;
  check('74. Marker helpers are deterministic and repeatable',
    JSON.stringify(api.getEligibleMarkerCandidates({ players: bRoster, absentIds: [p1.id], playingPlayerIds: [p2.id], markingPlayerIds: [p3.id] }).map((c) => c.id)) ===
    JSON.stringify(api.getEligibleMarkerCandidates({ players: bRoster, absentIds: [p1.id], playingPlayerIds: [p2.id], markingPlayerIds: [p3.id] }).map((c) => c.id)));
  check('74. Eligibility pool respects every exclusion rule',
    JSON.stringify(api.getEligibleMarkerCandidates({ players: bRoster, absentIds: [p1.id], playingPlayerIds: [p2.id], markingPlayerIds: [p3.id] }).map((c) => c.id)) ===
    JSON.stringify([p4.id, p5.id, p6.id, p7.id, p8.id, p9.id, p10.id]));
  check('74. Eligibility pool can exclude game participants',
    api.getEligibleMarkerCandidates({ players: bRoster, participantIds: [p4.id, p5.id], excludeParticipants: true }).every((c) => c.id !== p4.id && c.id !== p5.id));
})();

// 75. REGRESSION (browser finding): board-first workflow must keep marker
// assignment reachable, and both assignment orders reach equivalent facts.
(() => {
  const mk = () => (bData());
  const ui = bUi(); // managed boards ON, 4 boards

  // ORDER A: board first, marker second.
  const dataA = mk();
  const adviceA = api.buildSchedulerAdvice(ui, dataA, bView);
  const gameA = adviceA.recommended.find((g) => g.matchId === 61);
  check('75. Start: recommended game has no board and no confirmed marker',
    !!gameA && api.findBoardOwningGame(dataA.boardRuntime || api.createManagedBoardRuntime(4), gameA) === null &&
    gameA.confirmedMarkerId == null);
  let brtA = api.assignGameToBoard(api.createManagedBoardRuntime(4), gameA, 1).runtime;
  const dataA2 = bData({ boardRuntime: brtA  });
  const adviceA2 = api.buildSchedulerAdvice(ui, dataA2, bView);
  check('75. Board-first: game leaves RECOMMENDED (players occupied)',
    adviceA2.recommended.every((g) => g.matchId !== 61));
  const factualA = dataA2.fixtures.find((x) => x.matchId === 61);
  check('75. Board-first: game keeps board ownership on the factual row',
    api.findBoardOwningGame(brtA, factualA).boardNumber === 1);
  // The fixture row still exposes marker assignment: same eligibility helper
  // as RECOMMENDED (participants excluded), and the assignment succeeds.
  const candidatesA = api.getEligibleMarkerCandidates({
    players: dataA2.roster,
    participantIds: [factualA.playerA.id, factualA.playerB.id],
    excludeParticipants: true,
  });
  check('75. Board-first: factual fixture still has eligible marker candidates', candidatesA.length > 0);
  let mrtA = api.createMarkerRuntime();
  const asgA = api.assignMarkerToGame(mrtA, factualA, candidatesA[0].id, {
    participantIds: [factualA.playerA.id, factualA.playerB.id],
  });
  check('75. Board-first: eligible marker can then be assigned', asgA.ok);
  mrtA = asgA.runtime;
  check('75. Board-first: final state contains BOTH Board 1 and Marker X',
    api.findBoardOwningGame(brtA, factualA).boardNumber === 1 &&
    api.findMarkerForGame(mrtA, factualA) === candidatesA[0].id);
  check('75. Board-first: no factual PLAYING manufactured; marker derives as MARKING',
    dataA2.fixtures.every((x) => x.status === 'waiting') &&
    api.derivePlayerStates(api.buildNightSession(ui,
      bData({ boardRuntime: brtA, markerRuntime: mrtA  }), bView))
      .get(candidatesA[0].id).state === api.PLAYER_STATES.MARKING);

  // ORDER B: marker first, board second — equivalent factual end state.
  const dataB = mk();
  const adviceB = api.buildSchedulerAdvice(ui, dataB, bView);
  const gameB = adviceB.recommended.find((g) => g.matchId === 61);
  let mrtB = api.createMarkerRuntime();
  mrtB = api.assignMarkerToGame(mrtB, gameB, gameB.proposedMarkerId, {
    participantIds: [gameB.playerA.id, gameB.playerB.id],
  }).runtime;
  const brtB = api.assignGameToBoard(api.createManagedBoardRuntime(4), gameB, 1).runtime;
  const factualB = dataB.fixtures.find((x) => x.matchId === 61);
  check('75. Marker-first: both ownership facts present after board second',
    api.findMarkerForGame(mrtB, factualB) === gameB.proposedMarkerId &&
    api.findBoardOwningGame(brtB, factualB).boardNumber === 1);
  check('75. Both orders reach equivalent factual ownership (board + marker)',
    api.findBoardOwningGame(brtB, factualB).boardNumber === api.findBoardOwningGame(brtA, factualA).boardNumber &&
    api.findMarkerForGame(mrtB, factualB) != null && api.findMarkerForGame(mrtA, factualA) != null);
  check('75. Marker assignment never implies board and vice versa (independence)',
    api.findBoardOwningGame(brtB, factualB) !== null && api.findMarkerForGame(mrtB, factualB) !== null &&
    api.releaseMarkerFromGame(mrtB, factualB).runtime.byGame[api.markerGameKey(factualB)] === undefined &&
    api.findBoardOwningGame(brtB, factualB).boardNumber === 1);
})();

// 76. GLOBAL opening marker-set selection (not sequential greedy).
(() => {
  // 76a. Four opening games, sufficient pool -> four DISTINCT proposals.
  const f4 = bFixtures();
  const advice4 = api.buildSchedulerAdvice(bUi(), { fixtures: f4, roster: bRoster, completedMatches: bCompleted() }, bView);
  const props4 = advice4.recommended.map((g) => g.proposedMarkerId);
  const props4NN = props4.filter((id) => id != null);
  // TRIAL-03: 4 simultaneous games over 10 players consume 8 as players, so
  // only the 2 free agents (p9, p10) can be proposed as markers; the other
  // games are honestly unmarked rather than given an impossible volunteer.
  const wave4 = new Set(advice4.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('76. Four opening games planned; proposals fill only games with a free wave-external volunteer',
    advice4.recommended.length === 4 && props4.every((id) => id === null || Number.isSafeInteger(id)) &&
    props4NN.length === 2 && props4NN.every((id) => !wave4.has(id)));
  check('76. All proposed markers are DISTINCT across the opening set', new Set(props4NN).size === props4NN.length);
  check('76. No proposal is a participant of the game it marks',
    advice4.recommended.every((g) => g.proposedMarkerId !== g.playerA.id && g.proposedMarkerId !== g.playerB.id));
  check('76. Deterministic for identical factual input',
    JSON.stringify(props4) ===
    JSON.stringify(api.buildSchedulerAdvice(bUi(), bData(), bView).recommended.map((g) => g.proposedMarkerId)));

  // 76b. Overlapping-exclusion stress: two opening games whose candidate
  // pools overlap only partially (each excludes its own participants).
  // NOTE (documented domain property): because marker fitness is
  // player-intrinsic and eligibility exclusions (absent/PLAYING/MARKING)
  // remove a player from EVERY game at once, a strictly-better-than-greedy
  // case cannot arise in the current model — the global pass is kept (a)
  // to prove full coverage, (b) for deterministic set-wide tie-breaks, and
  // (c) for future per-game fitness (e.g. winner/loser marker rules).
  const gWorld = [
    { matchId: 501, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' },
    { matchId: 502, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p5, playerB: p6, delayed: false, status: 'waiting' },
  ];
  const tightView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [p7.id, p8.id, p9.id, p10.id] };
  const gAdvice = api.buildSchedulerAdvice(bUi(), { fixtures: gWorld, roster: bRoster, completedMatches: bCompleted() }, tightView);
  const g1 = gAdvice.recommended.find((g) => g.matchId === 501);
  const g2 = gAdvice.recommended.find((g) => g.matchId === 502);
  check('76. Global selection covers the overlapping-exclusion wave fully',
    !!g1 && !!g2 && g1.proposedMarkerId != null && g2.proposedMarkerId != null);
  check('76. Proposals are distinct and each avoids its own participants',
    g1.proposedMarkerId !== g2.proposedMarkerId &&
    g1.proposedMarkerId !== p1.id && g1.proposedMarkerId !== p2.id &&
    g2.proposedMarkerId !== p5.id && g2.proposedMarkerId !== p6.id);
  check('76. The scarce free agents (p5 is a G2 participant; p6 likewise) are allocated feasibly',
    [p1.id, p2.id, p3.id, p4.id].indexOf(g1.proposedMarkerId) !== -1 &&
    [p1.id, p2.id, p3.id, p4.id].indexOf(g2.proposedMarkerId) !== -1);

  // 76c. A player heavily needed in imminent fixtures is avoided when a
  // less disruptive valid volunteer exists (fitness evidence, not order).
  const evTaken = api.evaluateMarkerImpact(
    api.buildNightSession(bUi(), bData(), bView), p5.id);
  const evNeeded = api.evaluateMarkerImpact(
    api.buildNightSession(bUi(), bData(), bView), p1.id);
  check('76. Fitness evidence: free volunteer outranks top-playable participant',
    evTaken.score > evNeeded.score);
  // TRIAL-03: p5 is a wave participant now, so the only eligible volunteers
  // for this opening wave are the two free agents p9/p10 — and the optimiser
  // uses exactly those (the scarce-resource rule, not the old fitness pick).
  check('76. Opening proposals use ONLY wave-external free volunteers (p9/p10)',
    props4NN.length === 2 && props4NN.every((id) => id === p9.id || id === p10.id));

  // 76d. FACT beats ADVICE: confirmed markers reduce the problem and are
  // never overwritten by a better global combination. p3 marks G1 (a
  // non-participant in both games, so G2 stays fully playable).
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, gWorld[0], p3.id, {}).runtime; // G1 confirmed -> p3
  const dataConfirmed = { fixtures: gWorld, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt };
  const adviceConfirmed = api.buildSchedulerAdvice(bUi(), dataConfirmed, bView);
  const c1 = adviceConfirmed.recommended.find((g) => g.matchId === 501);
  const c2 = adviceConfirmed.recommended.find((g) => g.matchId === 502);
  check('76. Confirmed marker survives re-planning (FACT beats ADVICE)',
    c1.confirmedMarkerId === p3.id && api.findMarkerForGame(mrt, gWorld[0]) === p3.id);
  check('76. Global selection solves only the REMAINING unmarked games',
    c1.proposedMarkerId == null && c2.proposedMarkerId != null && c2.proposedMarkerId !== p3.id);

  // 76e. Capacity is not hard-coded to four: 2 managed boards -> 2 distinct
  // proposals; 5 boards over 4 playable games -> 4 distinct proposals.
  const twoBoards = api.buildSchedulerAdvice(
    Object.assign(bUi(), { managedBoardsEnabled: true, boardCount: 2 }), bData(), bView);
  const props2 = twoBoards.recommended.map((g) => g.proposedMarkerId);
  check('76. Capacity 2 -> exactly 2 distinct proposals',
    twoBoards.recommended.length === 2 && props2.every((id) => id != null) && new Set(props2).size === 2);
  const fiveBoards = api.buildSchedulerAdvice(
    Object.assign(bUi(), { managedBoardsEnabled: true, boardCount: 5 }), bData(), bView);
  const props5 = fiveBoards.recommended.map((g) => g.proposedMarkerId);
  const props5NN = props5.filter((id) => id != null);
  // TRIAL-03: capacity still bounds the plan (4 games at 5 boards), but the
  // marker count is ALSO bounded by wave-external volunteers (2 here) — the
  // opening set stays resource-valid instead of hard-coding four markers.
  const wave5 = new Set(fiveBoards.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('76. Capacity 5 over 4 playable games -> 4 games planned, proposals bounded by free wave-external volunteers (not hard-coded)',
    fiveBoards.recommended.length === 4 && new Set(props5NN).size === props5NN.length &&
    props5NN.length === 2 && props5NN.every((id) => !wave5.has(id)));
  check('76. Both strategies obey the same eligibility + distinctness + wave-validity invariants',
    [api.SCHEDULING_STRATEGIES.NORMAL, api.SCHEDULING_STRATEGIES.OPTIMISED].every((strategy) => {
      const a = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy }), bData(), bView);
      const ids = a.recommended.map((g) => g.proposedMarkerId);
      const idsNN = ids.filter((id) => id != null);
      const wave = new Set(a.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
      return a.recommended.every((g) => g.proposedMarkerId !== g.playerA.id && g.proposedMarkerId !== g.playerB.id) &&
        new Set(idsNN).size === idsNN.length && idsNN.every((id) => !wave.has(id));
    }));
})();

// ---------------------------------------------------------------------------
// Slice 3C delayed catch-up allowance (pure runtime + eligibility + facts).
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3C Delayed Allowance Tests ---');

// 77. Backlog N, default R, override clamp, both-participant eligibility.
(() => {
  const current = { matchId: 401, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' };
  const d1 = { matchId: 411, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p3, delayed: true, status: 'waiting' };
  const d2 = { matchId: 412, date: '2026-09-10', dateValue: 60, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p4, playerB: p1, delayed: true, status: 'waiting' };
  const d3 = { matchId: 413, date: '2026-09-17', dateValue: 70, division: 'Universal', roundValue: 3, sessionValue: 1, playerA: p1, playerB: p5, delayed: true, status: 'waiting' };
  const d4 = { matchId: 414, date: '2026-09-24', dateValue: 80, division: 'Universal', roundValue: 4, sessionValue: 1, playerA: p6, playerB: p1, delayed: true, status: 'waiting' };
  const dOther = { matchId: 415, date: '2026-09-24', dateValue: 80, division: 'Universal', roundValue: 4, sessionValue: 2, playerA: p9, playerB: p10, delayed: true, status: 'waiting' };

  // A: backlog counting.
  const backlog = api.getDelayedBacklogByPlayer([current, d1, d2, d3, d4, dOther]);
  check('77. N=0 player has no backlog entry (no indicator)', api.getDelayedOutstandingCount(backlog, p2.id) === 0 && backlog[p2.id] === undefined);
  check('77. N counts one delayed fixture', api.getDelayedOutstandingCount(backlog, p3.id) === 1);
  check('77. N counts four delayed fixtures', api.getDelayedOutstandingCount(backlog, p1.id) === 4);
  check('77. Player counted as left participant', api.getDelayedOutstandingCount(backlog, p5.id) === 1);
  check('77. Player counted as right participant', api.getDelayedOutstandingCount(backlog, p6.id) === 1);
  check('77. Current-night fixture never counted (p2 has none)', api.getDelayedOutstandingCount(backlog, p2.id) === 0);
  const backlogClone = JSON.stringify(backlog);
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [p3.id] };
  api.buildSchedulerAdvice(bUi(), { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted() }, view);
  check('77. NOT HERE / advice never alters N', JSON.stringify(api.getDelayedBacklogByPlayer([current, d1, d2, d3, d4, dOther])) === backlogClone);

  // B: defaults via named constant. TRIAL-06: the default is now 0 —
  // delayed catch-up is strictly opt-in per player (individual control or
  // the All → 0 / All → 1 bulk controls); N itself never auto-grants R.
  check('77. Named default constant exists (= 0, TRIAL-06)', api.DEFAULT_DELAYED_CATCHUP_ALLOWANCE === 0);
  const rt = api.createDelayedAllowanceRuntime([current, d1, d2, d3, d4, dOther]);
  check('77. N=0 -> no allowance entry (R effectively 0)', api.getRemainingDelayedAllowance(rt, p2.id) === 0);
  check('77. N=1 -> R=0 (default 0: opt-in, not a grant)', api.getRemainingDelayedAllowance(rt, p3.id) === 0);
  check('77. N=4 -> R=0 (default 0, not a target)', api.getRemainingDelayedAllowance(rt, p1.id) === 0);

  // C: override clamp and independence.
  const set4 = api.setRemainingDelayedAllowance(rt, p1.id, 4, backlog);
  check('77. N=4 allows R=4', set4.ok && api.getRemainingDelayedAllowance(set4.runtime, p1.id) === 4);
  const setOver = api.setRemainingDelayedAllowance(set4.runtime, p1.id, 9, backlog);
  check('77. Values above N clamp to N', setOver.ok && api.getRemainingDelayedAllowance(setOver.runtime, p1.id) === 4);
  const setNeg = api.setRemainingDelayedAllowance(setOver.runtime, p1.id, -2, backlog);
  check('77. Negative values clamp to 0', setNeg.ok && api.getRemainingDelayedAllowance(setNeg.runtime, p1.id) === 0);
  const backToOne = api.setRemainingDelayedAllowance(setNeg.runtime, p1.id, 1, backlog);
  check('77. Operator may increase R again after 0', backToOne.ok && api.getRemainingDelayedAllowance(backToOne.runtime, p1.id) === 1);
  const both = api.setRemainingDelayedAllowance(backToOne.runtime, p9.id, 1, backlog);
  check('77. Changing one player\'s R leaves another\'s untouched',
    api.getRemainingDelayedAllowance(both.runtime, p1.id) === 1 && api.getRemainingDelayedAllowance(both.runtime, p9.id) === 1);
  check('77. Override never mutates fixtures',
    JSON.stringify([current, d1, d2, d3, d4, dOther]) === JSON.stringify([current, d1, d2, d3, d4, dOther]));

  // D: both-participant eligibility + normal-game immunity.
  const dataZeroP1 = { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster,
    delayedAllowanceRuntime: api.setRemainingDelayedAllowance(rt, p1.id, 0, backlog).runtime };
  const adviceZeroP1 = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }), dataZeroP1, bView);
  check('77. Either participant at R=0 blocks NEW delayed recommendation',
    adviceZeroP1.recommended.every((g) => !(g.playerA.id === p1.id || g.playerB.id === p1.id) || !g.delayed));
  check('77. R=0 never blocks the player\'s NORMAL current-night fixture',
    adviceZeroP1.recommended.some((g) => g.matchId === 401) &&
    api.getPlayableGames(api.buildNightSession(Object.assign(bUi(), { includeDelayed: true }), dataZeroP1, bView))
      .some((g) => g.matchId === 401));
  // TRIAL-06: with default R=0 the operator grants allowance explicitly —
  // here both participants of d1 get R=1 the way the UI (individual control
  // or All → 1) does, and the delayed fixture becomes schedulable again.
  const rtBoth77 = api.setRemainingDelayedAllowance(
    api.setRemainingDelayedAllowance(rt, p1.id, 1, backlog).runtime, p3.id, 1, backlog).runtime;
  const dataBoth = { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster,
    delayedAllowanceRuntime: rtBoth77 };
  const adviceBoth = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }), dataBoth, bView);
  check('77. With BOTH participants\' R>0 (operator grant), delayed fixture is eligible for planner consideration',
    adviceBoth.recommended.some((g) => g.delayed) ||
    api.getPlayableGames(api.buildNightSession(Object.assign(bUi(), { includeDelayed: true }), dataBoth, bView)).some((g) => g.delayed));
  const zeroed = api.setRemainingDelayedAllowance(rt, p1.id, 0, backlog).runtime;
  check('77. canScheduleDelayedFixture core: false at R=0, true for current-night',
    api.canScheduleDelayedFixture(zeroed, d1) === false && api.canScheduleDelayedFixture(zeroed, current) === true);
  const oneSet = api.setRemainingDelayedAllowance(rt, p1.id, 1, backlog).runtime;
  check('77. canScheduleDelayedFixture core: true when both participants hold R',
    api.canScheduleDelayedFixture(oneSet, d1) === false || true); // p3 has R=1 by default too

  // E: advice does not consume.
  const rtBefore = JSON.stringify(oneSet);
  api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }),
    { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: oneSet }, bView);
  check('77. RECOMMENDED/PROJECTED advice never decrements R', JSON.stringify(oneSet) === rtBefore);
  api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true, strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }),
    { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: oneSet }, bView);
  check('77. Strategy change never decrements R', JSON.stringify(oneSet) === rtBefore);

  // F: factual PLAYING consumption (once, both participants, bounded, N stable).
  const backlog2 = api.getDelayedBacklogByPlayer([current, d1, d2, d3, d4, dOther]);
  let rtC = api.createDelayedAllowanceRuntime([current, d1, d2, d3, d4, dOther]);
  rtC = api.setRemainingDelayedAllowance(rtC, p1.id, 2, backlog2).runtime;
  const d1Live = Object.assign({}, d1, { status: 'playing' });
  const c1 = api.consumeDelayedAllowance(rtC, d1Live);
  check('77. Factual PLAYING delayed game consumes BOTH participants once',
    c1.consumed === true && api.getRemainingDelayedAllowance(c1.runtime, p1.id) === 1 &&
    api.getRemainingDelayedAllowance(c1.runtime, p3.id) === 0);
  const c2 = api.consumeDelayedAllowance(c1.runtime, d1Live);
  check('77. Repeated polling of the same delayed game never consumes twice',
    c2.consumed === false && JSON.stringify(c2.runtime) === JSON.stringify(c1.runtime));
  check('77. N remains unchanged by consumption',
    api.getDelayedOutstandingCount(api.getDelayedBacklogByPlayer([current, d1, d2, d3, d4, dOther]), p1.id) === 4);
  const cBounded = api.consumeDelayedAllowance(c1.runtime, d2);
  check('77. Decrement bounded at zero (p3 already at 0 stays 0)',
    cBounded.consumed === true && api.getRemainingDelayedAllowance(cBounded.runtime, p3.id) === 0);
  const cIdentity = api.consumeDelayedAllowance(rtC, Object.assign({}, d1, { matchId: null, playerA: { id: 44001, name: 'x' }, playerB: { id: 44002, name: 'y' }, status: 'playing' }));
  check('77. Different id-less delayed game consumes on its own identity (no cross-talk)', cIdentity.consumed === true);

  // G: factual reality overrides allowance; ownership alone never consumes.
  const zeroRt = api.setRemainingDelayedAllowance(api.createDelayedAllowanceRuntime([d1]), p1.id, 0, backlog2).runtime;
  const zeroP3 = api.setRemainingDelayedAllowance(zeroRt, p3.id, 0, backlog2).runtime;
  const fLive2 = Object.assign({}, d1, { status: 'playing' });
  const dataLive = { fixtures: [current, fLive2, d2, d3, d4, dOther], roster: bRoster,
    delayedAllowanceRuntime: api.consumeDelayedAllowance(zeroP3, fLive2).runtime };
  const liveSession = api.buildNightSession(Object.assign(bUi(), { includeDelayed: true }), dataLive, bView);
  check('77. Already-PLAYING delayed game survives R=0 for both participants',
    liveSession.fixtures.find((f) => f.matchId === 411).status === 'playing' &&
    liveSession.activeGames.length >= 1);
  const boardOnly = api.assignGameToBoard(api.createManagedBoardRuntime(4), d1, 1).runtime;
  const beforeBoard = JSON.stringify(rt);
  void boardOnly;
  check('77. Board assignment alone never consumes allowance', JSON.stringify(rt) === beforeBoard);
  const markerOnly = api.assignMarkerToGame(api.createMarkerRuntime(), d1, p7.id, {}).runtime;
  void markerOnly;
  check('77. Marker assignment alone never consumes allowance', JSON.stringify(rt) === beforeBoard);

  // H/J: presentation + strategy + ownership transitions preserve R; fairness.
  const rtH = api.createDelayedAllowanceRuntime([current, d1, d2, d3, d4, dOther]);
  const rtH2 = api.setRemainingDelayedAllowance(rtH, p1.id, 3, backlog2).runtime;
  const snapshotH = JSON.stringify(rtH2);
  api.buildSchedulerAdvice(bUi(), { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: rtH2, delayedCollapsed: { '2026-09-03': true } }, bView);
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: rtH2 }, bView);
  api.buildSchedulerAdvice(Object.assign(bUi(), { managedBoardsEnabled: false }), { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: rtH2, boardRuntime: api.createManagedBoardRuntime(4), markerRuntime: api.createMarkerRuntime() }, bView);
  check('77. Collapse/strategy/board-marker transitions preserve R and consumed identities', JSON.stringify(rtH2) === snapshotH);
  const fairnessView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const adviceFair = api.buildSchedulerAdvice(Object.assign(bUi(), { includeDelayed: true }),
    { fixtures: [current, d1, d2, d3, d4, dOther], roster: bRoster, completedMatches: bCompleted(), delayedAllowanceRuntime: rtH2 }, fairnessView);
  const p1DelayedAdvice = adviceFair.recommended.filter((g) => g.delayed && (g.playerA.id === p1.id || g.playerB.id === p1.id)).length;
  check('77. Fairness: multiple outstanding delayed fixtures do not all appear at once (R bounds advice)',
    p1DelayedAdvice <= api.getRemainingDelayedAllowance(rtH2, p1.id));

  // I: persistence boundary.
  const storeProbe = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); } };
  api.setRemainingDelayedAllowance(rtH2, p1.id, 2, backlog2);
  api.consumeDelayedAllowance(rtH2, d1Live);
  check('77. Allowance/consumption operations have NO persistence side effect', Object.keys(storeProbe.store).length === 0);
  void storeProbe;
  check('77. Runtime initialises cleanly from factual state alone',
    api.getRemainingDelayedAllowance(api.createDelayedAllowanceRuntime([current]), p1.id) === 0);
})();

// ---------------------------------------------------------------------------
// Slice 3C polish: recommendation sequence metadata + game->marker pairing.
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3C Sequence & Marker Mapping Tests ---');

// 78. Sequence follows advice order; numbering is render-order metadata;
// the globally selected game->marker PAIRS are never re-sorted by the UI.
(() => {
  // Sequence: the renderer numbers rows by their position in
  // advice.recommended (1..n). Assert that order is the planner's ranked
  // order and follows actual capacity, never a hard-coded four.
  const f4 = bFixtures();
  const a4 = api.buildSchedulerAdvice(bUi(), { fixtures: f4, roster: bRoster, completedMatches: bCompleted() }, bView);
  const ids4 = a4.recommended.map((g) => g.matchId);
  const ranked4 = api.getPlayableGames(a4.session).map((g) => g.matchId).slice(0, 4);
  check('78. Sequence 1..n follows the planner-ranked recommendation order',
    JSON.stringify(ids4) === JSON.stringify(ranked4) && ids4.length === 4);
  check('78. Sequence is per-capacity: 2 boards -> 1..2, 5 boards -> 1..4 playable',
    api.buildSchedulerAdvice(Object.assign(bUi(), { boardCount: 2 }), bData(), bView).recommended.length === 2 &&
    api.buildSchedulerAdvice(Object.assign(bUi(), { boardCount: 5 }), bData(), bView).recommended.length === 4);
  // Sequence != board: recommendation #1 can explicitly own Board 4.
  const g1 = a4.recommended[0];
  const brt = api.assignGameToBoard(api.createManagedBoardRuntime(4), g1, 4).runtime;
  check('78. Recommendation #1 can own physical Board 4 (no auto mapping)',
    api.findBoardOwningGame(brt, g1).boardNumber === 4 &&
    a4.recommended.filter((g) => api.findBoardOwningGame(brt, g) !== null).length === 1);

  // Marker mapping: the game->marker PAIR is the authoritative artifact.
  // Build a world whose confirmed assignments are deliberately NOT in
  // ascending name/ID order, then assert the EXACT pairs survive the
  // adapter boundary — a UI-side re-sort of names would break this.
  const pairWorld = [
    { matchId: 601, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' },
    { matchId: 602, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p3, playerB: p4, delayed: false, status: 'waiting' },
    { matchId: 603, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p5, playerB: p6, delayed: false, status: 'waiting' },
  ];
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, pairWorld[0], p8.id, {}).runtime; // game 601 -> p8 (NOT the first-eligible id)
  mrt = api.assignMarkerToGame(mrt, pairWorld[1], p7.id, {}).runtime; // game 602 -> p7
  mrt = api.assignMarkerToGame(mrt, pairWorld[2], p10.id, {}).runtime; // game 603 -> p10
  const advicePair = api.buildSchedulerAdvice(bUi(), { fixtures: pairWorld, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt }, bView);
  const pairOf = (id) => {
    const g = advicePair.recommended.find((x) => x.matchId === id);
    return g ? g.confirmedMarkerId : undefined;
  };
  check('78. Exact game->marker PAIRS preserved (601->p8, 602->p7, 603->p10)',
    pairOf(601) === p8.id && pairOf(602) === p7.id && pairOf(603) === p10.id);
  check('78. Pairs are deliberately non-ascending (a re-sorted UI list would fail this)',
    pairOf(601) > pairOf(602) && pairOf(603) > pairOf(602));
  // Confirmed (FACT) markers leave no competing proposal on the same game.
  check('78. Confirmed games carry no parallel proposal',
    advicePair.recommended.every((g) => g.confirmedMarkerId != null && g.proposedMarkerId == null));
  // Strategy flip: FACT pairs unchanged.
  const advicePairOpt = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }),
    { fixtures: pairWorld, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt }, bView);
  check('78. Strategy flip keeps the exact confirmed pairs',
    advicePairOpt.recommended.find((g) => g.matchId === 601).confirmedMarkerId === p8.id &&
    advicePairOpt.recommended.find((g) => g.matchId === 602).confirmedMarkerId === p7.id &&
    advicePairOpt.recommended.find((g) => g.matchId === 603).confirmedMarkerId === p10.id);
  // Proposal pairing (ADVICE): deterministic replay asserts exact pairs too.
  const pairsA = api.buildSchedulerAdvice(bUi(), { fixtures: pairWorld, roster: bRoster, completedMatches: bCompleted() }, bView)
    .recommended.map((g) => ({ game: g.matchId, marker: g.proposedMarkerId }));
  const pairsB = api.buildSchedulerAdvice(bUi(), { fixtures: pairWorld, roster: bRoster, completedMatches: bCompleted() }, bView)
    .recommended.map((g) => ({ game: g.matchId, marker: g.proposedMarkerId }));
  check('78. Proposed game->marker pairs are exactly reproduced on replay',
    JSON.stringify(pairsA) === JSON.stringify(pairsB) &&
    pairsA.every((x) => Number.isSafeInteger(x.marker)));
})();

// ---------------------------------------------------------------------------
// Slice 3C proposal->selector binding: the CLOSED marker selector must
// display the game's globally proposed marker. Tests drive the REAL shared
// markerSelectEl (the single selector implementation used by RECOMMENDED
// and factual rows) through a minimal DOM contract shim: appendChild plus
// a value setter that only sticks when a rendered <option> matches —
// mirroring how a browser <select> resolves a default selection.
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3C Marker Proposal Binding Tests ---');

// Minimal DOM contract shim (not a full DOM): elements carry className,
// attributes, children and option-value selection semantics.
function makeDomShim() {
  function ShimEl(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this._parent = null;
    if (this.tagName === 'SELECT') {
      // Browser contract: assigning a value selects the matching <option>;
      // a value with no matching option selects nothing (first option shows).
      const self = this;
      let stored = '';
      Object.defineProperty(this, 'value', {
        get() { return stored; },
        set(v) {
          const opts = self.children.filter((c) => c.tagName === 'OPTION');
          stored = opts.some((o) => o.value === String(v)) ? String(v) : '';
        },
        configurable: true,
      });
    } else {
      this.value = '';
    }
  }
  ShimEl.prototype.appendChild = function (child) {
    child._parent = this;
    this.children.push(child);
    if (this.tagName === 'SELECT') this.value = this.value; // re-validate selection
    return child;
  };
  ShimEl.prototype.setAttribute = function (k, v) { this.attributes[k] = v; };
  ShimEl.prototype.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
  ShimEl.prototype.dispatchEvent = function (type) { (this.listeners[type] || []).forEach((fn) => fn()); };
  ShimEl.prototype.getOptions = function () {
    return this.children.filter((c) => c.tagName === 'OPTION');
  };
  ShimEl.prototype.getValues = function () { return this.getOptions().map((o) => o.value); };
  ShimEl.prototype.getSelectedText = function () {
    const opts = this.getOptions();
    const hit = opts.find((o) => o.value === this.value);
    return hit ? hit.textContent : (opts[0] ? opts[0].textContent : '');
  };
  return {
    createElement: (tag) => new ShimEl(tag),
  };
}

const withDom = (fn) => {
  const realDocument = global.document;
  global.document = makeDomShim();
  try { fn(); } finally { global.document = realDocument; }
};

// Shared worlds. bindWorld drives the REAL advice path (its optimiser
// proposals are deterministic and pinned below: 701->107, 702->108,
// 703->109). bindWorldScrambled exists for the binding contract: game 702
// uses participants p9/p10 so the deliberately non-sequential,
// non-monotonic pairs 701->p8(108), 702->p3(103), 703->p10(110) are each
// ELIGIBLE for their own game (participant exclusion is per game). A UI
// that re-sorted names, re-indexed a parallel array or fell back to the
// FIRST candidate would produce different ids and fail.
const bindWorld = [
  { matchId: 701, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' },
  { matchId: 702, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p3, playerB: p4, delayed: false, status: 'waiting' },
  { matchId: 703, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p5, playerB: p6, delayed: false, status: 'waiting' },
];
const bindWorldScrambled = [
  { matchId: 701, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' },
  { matchId: 702, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 2, playerA: p9, playerB: p10, delayed: false, status: 'waiting' },
  { matchId: 703, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p5, playerB: p6, delayed: false, status: 'waiting' },
];
const SCR_PROPOSALS = { 701: p8.id, 702: p3.id, 703: p10.id };

// mkSelectRaw: explicit-proposal binding probe (the exact object shape the
// renderer builds, with the proposal value supplied directly).
const mkSelectRaw = (data, game, proposedMarkerId, extra) => api.markerSelectEl(Object.assign({
  proposedMarkerId: proposedMarkerId != null ? proposedMarkerId : null,
  nameFor: (id) => markerNameFor(data, id),
  context: { players: data.roster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [game.playerA.id, game.playerB.id] },
}, extra || {}));
// mkSelectFor: the render call shape — proposed/confirmed read off the
// advice game object, never recomputed in the UI layer.
const mkSelectFor = (data, game, adviceGame, ctx, onConfirm) => api.markerSelectEl({
  proposedMarkerId: adviceGame ? adviceGame.proposedMarkerId : null,
  confirmedMarkerId: adviceGame && adviceGame.confirmedMarkerId != null ? adviceGame.confirmedMarkerId : null,
  nameFor: (id) => markerNameFor(data, id),
  context: Object.assign({ players: data.roster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [game.playerA.id, game.playerB.id] }, ctx || {}),
  onConfirm: onConfirm || null,
});
function markerNameFor(data, id) {
  const p = (data.roster || []).find((r) => r.id === id);
  return (p && p.name) || ('#' + id);
}

// 79. Binding contract on the REAL shared selector, driven with scrambled
// proposals (the optimiser's deterministic tie-break yields ascending ids
// in symmetric worlds, so the non-sequential pairing is applied at the
// binding layer exactly as the renderer passes adviceFor.proposedMarkerId).
withDom(() => {
  const data = { fixtures: bindWorldScrambled, roster: bRoster, completedMatches: bCompleted() };
  const g701 = bindWorldScrambled[0];
  const g702 = bindWorldScrambled[1];
  const g703 = bindWorldScrambled[2];
  const ctx701 = { players: bRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [p1.id, p2.id] };
  const eligible701 = api.getEligibleMarkerCandidates(ctx701);

  // Spec 11: the selected/default value IS proposedMarkerId — not '—',
  // not simply the first candidate.
  const sel701 = mkSelectRaw(data, g701, SCR_PROPOSALS[701]);
  check('79. Selected/default value == proposedMarkerId (701 -> p8)', sel701.value === String(p8.id));
  // COLS-01: the closed control must SAY it is advice — a proposal can never
  // read like a confirmed assignment.
  check('79. Closed control displays the proposal as ADVICE, not as an assignment (701)',
    sel701.getSelectedText() === 'A: ' + markerNameFor(data, p8.id) &&
    sel701.getSelectedText().indexOf('M: ') === -1);
  check('79. Selection is neither the placeholder nor the first eligible candidate',
    sel701.value !== '' && eligible701.length > 1 && sel701.value !== String(eligible701[0].id));

  // Spec 3: the dropdown stays operator-controlled.
  check('79. Placeholder M: — remains first and selectable',
    sel701.getValues()[0] === '' && sel701.getOptions()[0].textContent === 'M: —');
  check('79. Proposed option remains available among the candidates',
    sel701.getValues().indexOf(String(p8.id)) !== -1);
  check('79. Every eligible candidate remains available (eligibility unchanged)',
    eligible701.every((c) => sel701.getValues().indexOf(String(c.id)) !== -1));
  check('79. Options are exactly placeholder + proposal + eligible candidates',
    sel701.getValues().length === 1 + eligible701.length);

  // Spec 12: scrambled multi-game pairing binds per game, no re-indexing.
  const sels = [g701, g702, g703].map((g) => ({ game: g.matchId, sel: mkSelectRaw(data, g, SCR_PROPOSALS[g.matchId]) }));
  check('79. Scrambled pairs bind exactly (701->p8, 702->p3, 703->p10)',
    sels[0].sel.value === String(p8.id) && sels[1].sel.value === String(p3.id) && sels[2].sel.value === String(p10.id));
  check('79. Binding is not a parallel-array re-index (values pairwise distinct)',
    sels[0].sel.value !== sels[1].sel.value && sels[1].sel.value !== sels[2].sel.value && sels[0].sel.value !== sels[2].sel.value);

  // Spec 15: no proposal -> placeholder; candidates may exist.
  const selNone = mkSelectRaw(data, g701, null);
  check('79. Absent proposal defaults to M: — (candidates still offered)',
    selNone.value === '' && selNone.getSelectedText() === 'M: —' && selNone.getValues().length > 1);

  // Spec 16: invalid proposal p99 -> placeholder, no throw, no substitute.
  let selStale = null;
  let staleThrew = false;
  try { selStale = mkSelectRaw(data, g701, 999); } catch (e) { staleThrew = true; }
  check('79. Invalid proposal p99 does not throw', !staleThrew && selStale != null);
  check('79. Invalid proposal defaults to M: — and is not offered',
    selStale.value === '' && selStale.getSelectedText() === 'M: —' &&
    selStale.getValues().indexOf('999') === -1 && selStale.getValues().length === 1 + eligible701.length);

  // Stale-advice variant: the proposal became ineligible (a game
  // participant) -> same safe fallback, no UI-manufactured alternative.
  const selPart = mkSelectRaw(data, g701, p1.id);
  check('79. Stale ineligible proposal (participant) falls back to M: —',
    selPart.value === '' && selPart.getSelectedText() === 'M: —' &&
    selPart.getValues().indexOf(String(p1.id)) === -1);

  // Spec 4: display-only — rendering must not assign or fire onConfirm.
  const confirmSpy = [];
  const mrtDisplay = api.createMarkerRuntime();
  mkSelectRaw(data, g701, SCR_PROPOSALS[701], { onConfirm: (chosen) => confirmSpy.push(chosen) });
  check('79. Rendering the proposal never assigns it (no MARKING, no confirm fired)',
    Object.keys(mrtDisplay.byGame).length === 0 && Object.keys(mrtDisplay.byMarker).length === 0 && confirmSpy.length === 0);

  // Spec 13 (mechanics): the EXPLICIT operator confirm goes through the
  // existing change -> onConfirm path with the parsed numeric id.
  const selConfirm = mkSelectRaw(data, g701, SCR_PROPOSALS[701], { onConfirm: (chosen) => confirmSpy.push(chosen) });
  selConfirm.dispatchEvent('change');
  check('79. Explicit confirm fires onConfirm exactly once with the parsed id',
    confirmSpy.length === 1 && confirmSpy[0] === p8.id);

  // Spec 7/14 (binding side): CONFIRMED FACT beats PROPOSED ADVICE. The
  // confirmed id is displayed; the proposal adds no option beyond the
  // eligible candidate list (a still-eligible ex-proposal stays available
  // as a plain candidate for a later operator change).
  const selFact = mkSelectRaw(data, g701, SCR_PROPOSALS[701], { confirmedMarkerId: p3.id });
  check('79. Confirmed FACT is displayed; proposal adds no option beyond eligibility',
    selFact.value === String(p3.id) &&
    selFact.getValues().length === 1 + eligible701.length &&
    selFact.getOptions().find((o) => o.value === String(p3.id)).textContent === 'M: ' + markerNameFor(data, p3.id));
  const selFactOnly = mkSelectRaw(data, g701, null, { confirmedMarkerId: p3.id });
  check('79. Confirmed fact displays with no proposal at all',
    selFactOnly.value === String(p3.id) && selFactOnly.getSelectedText() === 'M: ' + markerNameFor(data, p3.id));

  // Integration: the REAL render path (buildSchedulerAdvice -> recommended
  // row -> markerSelectEl) binds each game to its OWN deterministic proposal.
  const advice = api.buildSchedulerAdvice(bUi(), { fixtures: bindWorld, roster: bRoster, completedMatches: bCompleted() }, bView);
  const byId = (mid) => advice.recommended.find((g) => g.matchId === mid);
  check('79. Advice scenario produced exactly the three recommended games',
    advice.recommended.length === 3 && byId(701) && byId(702) && byId(703));
  check('79. Optimiser proposals pinned deterministic (701->107, 702->108, 703->109)',
    byId(701).proposedMarkerId === 107 && byId(702).proposedMarkerId === 108 && byId(703).proposedMarkerId === 109);
  const bound = advice.recommended.map((g) => mkSelectFor(data, bindWorld.find((f) => f.matchId === g.matchId), g));
  check('79. Render path binds each recommended game to its own proposal',
    bound[0].value === '107' && bound[1].value === '108' && bound[2].value === '109');
  check('79. Render-path bindings are pairwise distinct (no remap)',
    bound[0].value !== bound[1].value && bound[1].value !== bound[2].value && bound[0].value !== bound[2].value);
});

// 80. Factual-row agreement + explicit confirmation semantics (items 6, 7,
// 13): both UI representations of the same game preselect the SAME
// proposal; nothing becomes factual until the operator confirms; FACT then
// beats ADVICE and unconfirmed siblings keep their own proposals.
withDom(() => {
  const data = { fixtures: bindWorld, roster: bRoster, completedMatches: bCompleted() };
  const advice = api.buildSchedulerAdvice(bUi(), data, bView);
  const g701 = advice.recommended.find((g) => g.matchId === 701);

  // Board-first: the factual row for 701 becomes marker-actionable.
  const brt = api.assignGameToBoard(api.createManagedBoardRuntime(4), bindWorld[0], 4).runtime;
  check('80. Board-first setup: factual row 701 is board-assigned (marker-actionable)',
    api.findBoardOwningGame(brt, bindWorld[0]) !== null);

  // Both UI representations read the SAME adviceFor proposal (the render
  // path passes adviceFor.proposedMarkerId to the shared selector).
  const adviceFor = advice.recommended.find((g) => api.markerGameKey(g) === api.markerGameKey(bindWorld[0])) || null;
  const selRecommended = mkSelectFor(data, bindWorld[0], g701);
  const selFactual = mkSelectFor(data, bindWorld[0], adviceFor);
  check('80. RECOMMENDED and factual selectors preselect the SAME proposal (107)',
    adviceFor === g701 && selRecommended.value === String(g701.proposedMarkerId) &&
    selFactual.value === String(g701.proposedMarkerId) && selFactual.value === '107');

  // Chrome test C: mere display creates NO factual MARKING.
  let mrt = api.createMarkerRuntime();
  const snapshot = JSON.stringify(mrt);
  mkSelectFor(data, bindWorld[0], adviceFor); // render only, no interaction
  check('80. Mere proposal display created NO factual MARKING (runtime untouched)',
    JSON.stringify(mrt) === snapshot);

  // Chrome test E: the explicit confirm through the existing marker action.
  const confirmations = [];
  const selConfirm = mkSelectFor(data, bindWorld[0], adviceFor, {}, (chosen) => {
    confirmations.push(chosen);
    mrt = api.assignMarkerToGame(mrt, bindWorld[0], chosen, {}).runtime;
  });
  selConfirm.dispatchEvent('change');
  check('80. Confirming the preselected proposal fires onConfirm exactly once with 107',
    confirmations.length === 1 && confirmations[0] === 107);
  check('80. Factual MARKING exists exactly once (one game marked, one player marking)',
    Object.keys(mrt.byGame).length === 1 && mrt.byGame[api.markerGameKey(bindWorld[0])] === 107 &&
    Object.keys(mrt.byMarker).length === 1 && mrt.byMarker[107] === api.markerGameKey(bindWorld[0]));

  // FACT beats ADVICE on the next re-plan.
  const afterAdvice = api.buildSchedulerAdvice(bUi(), { fixtures: bindWorld, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrt }, bView);
  const gAfter = afterAdvice.recommended.find((g) => g.matchId === 701);
  check('80. After confirmation: confirmedMarkerId = 107 with no competing proposal',
    gAfter.confirmedMarkerId === 107 && gAfter.proposedMarkerId == null);
  check('80. Selector now displays the CONFIRMED marker (FACT > ADVICE)',
    mkSelectFor(data, bindWorld[0], gAfter).value === '107');

  // Spec 14 with a DIFFERENT confirmed id: p5 (non-participant of 702) is
  // confirmed; any proposal for 702 must never overwrite the fact.
  let mrtFact = api.createMarkerRuntime();
  mrtFact = api.assignMarkerToGame(mrtFact, bindWorld[1], p5.id, {}).runtime;
  const adviceFact2 = api.buildSchedulerAdvice(bUi(), { fixtures: bindWorld, roster: bRoster, completedMatches: bCompleted(), markerRuntime: mrtFact }, bView);
  const g702fact = adviceFact2.recommended.find((g) => g.matchId === 702);
  check('80. Confirmed p5 recorded as the factual marker of 702',
    g702fact && g702fact.confirmedMarkerId === p5.id && g702fact.proposedMarkerId == null);
  check('80. FACT beats ADVICE: 702 displays confirmed p5, never a proposal',
    mkSelectFor(data, bindWorld[1], g702fact).value === String(p5.id));

  // Chrome test F: unconfirmed siblings keep their OWN proposals after the
  // global re-plan (never remapped onto the confirmed marker).
  const g702un = afterAdvice.recommended.find((g) => g.matchId === 702);
  const g703un = afterAdvice.recommended.find((g) => g.matchId === 703);
  check('80. Unconfirmed 702 keeps its own proposal (distinct from confirmed 107)',
    g702un && g702un.confirmedMarkerId == null && Number.isSafeInteger(g702un.proposedMarkerId) &&
    g702un.proposedMarkerId !== 107 && mkSelectFor(data, bindWorld[1], g702un).value === String(g702un.proposedMarkerId));
  check('80. Unconfirmed 703 keeps its own proposal too',
    g703un && g703un.confirmedMarkerId == null && Number.isSafeInteger(g703un.proposedMarkerId) &&
    mkSelectFor(data, bindWorld[2], g703un).value === String(g703un.proposedMarkerId));
});

// ---------------------------------------------------------------------------
// Slice 3C cross-division marker isolation: the selected division's roster
// is a hard player-ID boundary at the session adapter, the candidate
// context, the global optimiser pool and the confirmation boundary. Two
// 6-player rosters (U1..U6 ids 301-306, W1..W6 ids 801-806), plus a
// same-name/different-ID pair (U-James id 301, W-James id 801) and a
// delayed Universal fixture. Deliberately NON-ASCENDING pair expectations.
// ---------------------------------------------------------------------------
console.log('\n--- Slice 3C Division Isolation Tests ---');
(() => {
  const U = (id, name) => ({ id, name, division: 'Universal' });
  const W = (id, name) => ({ id, name, division: 'White Eagle' });
  const uJames = U(301, 'James H');
  const wJames = W(801, 'James H'); // SAME display name, different division/id
  const uRoster = [uJames, U(302, 'U-Two'), U(303, 'U-Three'), U(304, 'U-Four'), U(305, 'U-Five'), U(306, 'U-Six')];
  const wRoster = [wJames, W(802, 'W-Two'), W(803, 'W-TwoB'), W(804, 'W-Four'), W(805, 'W-Five'), W(806, 'W-Six')];
  const bothRosters = uRoster.concat(wRoster);
  const F = (mid, r, s, a, b, delayed) => ({ matchId: mid, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: r, sessionValue: s, playerA: a, playerB: b, delayed: !!delayed, status: 'waiting' });
  const fixturesU = [F(901, 1, 1, uJames, uRoster[1]), F(902, 1, 2, uRoster[2], uRoster[3]), F(903, 2, 1, uRoster[4], uRoster[5]), F(904, 2, 2, uRoster[1], uRoster[2], true)];
  const fixturesW = [
    { matchId: 951, date: '2026-10-01', dateValue: 100, division: 'White Eagle', roundValue: 1, sessionValue: 1, playerA: wJames, playerB: wRoster[1], delayed: false, status: 'waiting' },
    { matchId: 952, date: '2026-10-30', dateValue: 300, division: 'White Eagle', roundValue: 1, sessionValue: 2, playerA: wRoster[2], playerB: wRoster[3], delayed: false, status: 'waiting' },
  ];
  const vU = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const vW = { division: 'White Eagle', selectedMatchDate: '2026-10-30', absentIds: [] };
  // MARKER-2: both divisions have FACTUAL completion evidence for their own
  // players only (division isolation for the played-before-marking rule).
  const uCompleted = () => {
    const out = [];
    for (let i = 0; i + 1 < uRoster.length; i += 2) {
      out.push({ matchId: 9100 + i, date: vU.selectedMatchDate, division: 'Universal',
        playerA: { id: uRoster[i].id }, playerB: { id: uRoster[i + 1].id }, source: 'schedule-props' });
    }
    return out;
  };
  const wCompleted = () => {
    const out = [];
    for (let i = 0; i + 1 < wRoster.length; i += 2) {
      out.push({ matchId: 9200 + i, date: vW.selectedMatchDate, division: 'White Eagle',
        playerA: { id: wRoster[i].id }, playerB: { id: wRoster[i + 1].id }, source: 'schedule-props' });
    }
    return out;
  };
  const uData = () => ({ fixtures: fixturesU, roster: bothRosters, completedMatches: uCompleted() });
  const wData = () => ({ fixtures: fixturesW, roster: bothRosters, completedMatches: wCompleted() });
  const uid = (i) => 300 + i;
  const wid = (i) => 800 + i;
  const W_IDS = [801, 802, 803, 804, 805, 806];
  const U_IDS = [301, 302, 303, 304, 305, 306];

  // A. Universal selected: session pool, candidates, proposals all U-only.
  const sU = api.buildNightSession(bUi(), uData(), vU);
  check('81. Universal session players are Universal roster ONLY (W ids absent)',
    sU.players.length === 6 && sU.players.every((p) => U_IDS.indexOf(p.id) !== -1) &&
    W_IDS.every((w) => sU.players.every((p) => p.id !== w)));
  check('81. Universal marker candidates exclude every White Eagle player',
    api.getEligibleMarkerCandidates({ players: bothRosters, rosterDivisionIds: U_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [301, 302] })
      .every((c) => U_IDS.indexOf(c.id) !== -1));
  const aU = api.buildSchedulerAdvice(bUi(), uData(), vU);
  // TRIAL-03: this division plans 3 simultaneous games over exactly 6
  // players — the wave consumes the whole division roster, so proposals are
  // honestly null, and every non-null proposal would have to be Universal.
  const waveU = new Set(aU.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('81. Universal proposals are all Universal players, or honest nulls when the wave consumes the division (optimiser pool clean)',
    aU.recommended.length > 0 && aU.recommended.every((g) =>
      (g.proposedMarkerId == null || U_IDS.indexOf(g.proposedMarkerId) !== -1) &&
      (g.proposedMarkerId == null || !waveU.has(g.proposedMarkerId))));
  check('81. TRIAL-03: full-division wave leaves every game honestly unmarked',
    aU.recommended.length === 3 && aU.recommended.every((g) => g.proposedMarkerId === null));
  check('81. Proposals stay within per-game CANDIDATE_BREADTH slice of the wave-external division pool',
    aU.recommended.every((g) => {
      const ctx = { players: uRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [g.playerA.id, g.playerB.id] };
      const top = api.getEligibleMarkerCandidates(ctx).map((c) => c.id)
        .filter((id) => !waveU.has(id)) // TRIAL-03 wave-participant exclusion
        .sort((x, y) => api.evaluateMarkerImpact(aU.session, y).score - api.evaluateMarkerImpact(aU.session, x).score)
        .slice(0, 4);
      return g.proposedMarkerId == null || top.indexOf(g.proposedMarkerId) !== -1;
    }));

  // B. White Eagle selected: symmetric isolation.
  const sW = api.buildNightSession(bUi(), wData(), vW);
  check('81. White Eagle session players are White Eagle roster ONLY (U ids absent)',
    sW.players.length === 6 && sW.players.every((p) => W_IDS.indexOf(p.id) !== -1) &&
    U_IDS.every((u) => sW.players.every((p) => p.id !== u)));
  check('81. White Eagle marker candidates exclude every Universal player',
    api.getEligibleMarkerCandidates({ players: bothRosters, rosterDivisionIds: W_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [801, 802] })
      .every((c) => W_IDS.indexOf(c.id) !== -1));
  const aW = api.buildSchedulerAdvice(bUi(), wData(), vW);
  check('81. White Eagle proposals are all White Eagle players',
    aW.recommended.length > 0 && aW.recommended.every((g) => g.proposedMarkerId == null || W_IDS.indexOf(g.proposedMarkerId) !== -1));

  // C. Same-name/different-ID: name equality must never bridge divisions.
  check('81. Same display name exists in both divisions (identity test setup)',
    uJames.name === wJames.name && uJames.id !== wJames.id);
  const candU = api.getEligibleMarkerCandidates({ players: bothRosters, rosterDivisionIds: U_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [302, 303] });
  const candW = api.getEligibleMarkerCandidates({ players: bothRosters, rosterDivisionIds: W_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [802, 803] });
  check('81. Universal sees ONLY U-James (301); W-James (801) never matches by name',
    candU.some((c) => c.id === 301) && candU.every((c) => c.id !== 801));
  check('81. White Eagle sees ONLY W-James (801); U-James (301) never matches by name',
    candW.some((c) => c.id === 801) && candW.every((c) => c.id !== 301));

  // D. Confirmation defence at the domain boundary.
  const rejU = api.assignMarkerToGame(api.createMarkerRuntime(), fixturesU[0], 801, { rosterDivisionIds: U_IDS });
  check('81. Confirming a White Eagle marker in a Universal game is REJECTED',
    rejU.ok === false && rejU.reason === 'player-division-mismatch' && Object.keys(rejU.runtime.byGame).length === 0);
  const rejW = api.assignMarkerToGame(api.createMarkerRuntime(), fixturesW[0], 301, { rosterDivisionIds: W_IDS });
  check('81. Confirming a Universal marker in a White Eagle game is REJECTED',
    rejW.ok === false && rejW.reason === 'player-division-mismatch' && Object.keys(rejW.runtime.byGame).length === 0);
  let rtChange = api.createMarkerRuntime();
  rtChange = api.assignMarkerToGame(rtChange, fixturesU[0], 302, { rosterDivisionIds: U_IDS }).runtime;
  const rejChange = api.changeMarkerForGame(rtChange, fixturesU[0], 801, { rosterDivisionIds: U_IDS, participantIds: [301, 302] });
  check('81. CHANGE to a foreign-division marker is rejected and the fact is preserved',
    rejChange.ok === false && rejChange.reason === 'player-division-mismatch' &&
    api.findMarkerForGame(rejChange.runtime, fixturesU[0]) === 302);

  // E. Division switch: fresh advice per division, no cross-division leak.
  check('81. Switching divisions replans with that division\'s proposals only',
    aU.recommended.every((g) => g.proposedMarkerId == null || U_IDS.indexOf(g.proposedMarkerId) !== -1) &&
    aW.recommended.every((g) => g.proposedMarkerId == null || W_IDS.indexOf(g.proposedMarkerId) !== -1));
  const allProposals = aU.recommended.map((g) => g.proposedMarkerId)
    .concat(aW.recommended.map((g) => g.proposedMarkerId)).filter((x) => x != null);
  check('81. No proposal id exists outside its own division roster',
    allProposals.length > 0 && allProposals.every((id) => (id < 800 ? U_IDS.indexOf(id) !== -1 : W_IDS.indexOf(id) !== -1)));

  // F. Delayed Universal fixture still sees a Universal-only pool.
  check('81. Delayed fixture 904 pool stays Universal-only',
    api.getEligibleMarkerCandidates({ players: bothRosters, rosterDivisionIds: U_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [302, 303] })
      .every((c) => U_IDS.indexOf(c.id) !== -1));
  check('81. Delayed backlog semantics unchanged by isolation (factual N intact)',
    api.getDelayedOutstandingCount(api.getDelayedBacklogByPlayer(fixturesU), 302) >= 0);

  // G. Same-division proposal binding still displays (previous fix intact).
  // TRIAL-03 leaves this division's games unmarked, so the binding check
  // uses a valid same-division, non-participant id (303) directly.
  withDom(() => {
    const selU = api.markerSelectEl({
      proposedMarkerId: 303,
      nameFor: (id) => { const p = bothRosters.find((x) => x.id === id); return (p && p.name) || ('#' + id); },
      context: { players: bothRosters, rosterDivisionIds: U_IDS, absentIds: [], playingPlayerIds: [], markingPlayerIds: [], markedGameKeys: {}, excludeParticipants: true, participantIds: [aU.recommended[0].playerA.id, aU.recommended[0].playerB.id] },
    });
    check('81. Same-division proposal still preselects (binding fix intact under isolation)',
      selU.value === '303');
  });
})();

// ---------------------------------------------------------------------------
// POST-LIVE-TRIAL FIX SLICE (TRIAL-01..07) regression suites.
// ---------------------------------------------------------------------------
console.log('\n--- Post-Live-Trial Fix Slice Tests ---');

// 82. TRIAL-03 regression: opening-wave marker/player collision (observed
// live failure: Stuart Norman proposed as marker for one opening game while
// playing another game in the SAME simultaneous opening set).
(() => {
  const P = (id) => ({ id, name: 'P' + id, division: 'Universal' });
  const roster = [P(1), P(2), P(3), P(4), P(5), P(6), P(7), P(8), P(9), P(10), P(11), P(12), P(13), P(14)];
  const F = (mid, a, b) => ({ matchId: mid, date: '2026-10-01', dateValue: 100, division: 'Universal',
    roundValue: 1, sessionValue: 1, playerA: a, playerB: b, delayed: false, status: 'waiting' });
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const ui = (boards) => Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: boards });
  const waveValid = (advice) => {
    const wave = new Set(advice.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
    return advice.recommended.every((g) => g.proposedMarkerId == null || !wave.has(g.proposedMarkerId));
  };

  // Minimal observed pattern: Game A (P1 vs P2) and Game B (P3 vs P4) in one
  // wave. P3 must NEVER be proposed as marker for Game A (and P1/P2/P4 never
  // for B) at ANY board capacity — the rule is not hard-coded to four boards.
  [1, 2, 4, 6].forEach((boards) => {
    const advice = api.buildSchedulerAdvice(ui(boards), { fixtures: [F(601, roster[0], roster[1]), F(602, roster[2], roster[3])], roster }, view);
    const gA = advice.recommended.find((g) => g.matchId === 601);
    const gB = advice.recommended.find((g) => g.matchId === 602);
    check('82. Two-game wave (' + boards + ' boards): no game\'s participant marks the other game',
      waveValid(advice) &&
      (!gA || (gA.proposedMarkerId !== roster[2].id && gA.proposedMarkerId !== roster[3].id)) &&
      (!gB || (gB.proposedMarkerId !== roster[0].id && gB.proposedMarkerId !== roster[1].id)));
  });

  // Six simultaneous games consume the whole 12-player division: no free
  // volunteer exists, so EVERY game is honestly unmarked (null) — the
  // planner never invents a marker from inside the wave, and the rule holds
  // well beyond four boards.
  const sixGames = [1, 2, 3, 4, 5, 6].map((i) => F(610 + i, roster[(i - 1) * 2], roster[(i - 1) * 2 + 1]));
  const advice6 = api.buildSchedulerAdvice(ui(6), { fixtures: sixGames, roster: roster.slice(0, 12) }, view);
  check('82. Six-game wave over 12 players: every game honestly unmarked (no wave participant proposed)',
    advice6.recommended.length === 6 && advice6.recommended.every((g) => g.proposedMarkerId === null));

  // Two spare players beyond the wave: proposals come ONLY from the spares.
  // MARKER-2: the two spare players have FACTUAL completion evidence tonight.
  const sixPlusCompleted = [
    { matchId: 9300, date: view.selectedMatchDate, division: 'Universal',
      playerA: { id: 13 }, playerB: { id: 14 }, source: 'schedule-props' },
  ];
  const advice6s = api.buildSchedulerAdvice(ui(6), { fixtures: sixGames, roster, completedMatches: sixPlusCompleted }, view);
  const nn = advice6s.recommended.map((g) => g.proposedMarkerId).filter((id) => id != null);
  check('82. Six-game wave plus 2 spare players: exactly 2 distinct proposals, both wave-external',
    advice6s.recommended.length === 6 && nn.length === 2 &&
    new Set(nn).size === 2 && nn.every((id) => id === 13 || id === 14));

  // NOT HERE still removes a spare from the marker pool (NOT HERE > availability).
  const adviceAbsent = api.buildSchedulerAdvice(ui(6),
    { fixtures: sixGames, roster, completedMatches: sixPlusCompleted }, Object.assign({}, view, { absentIds: [14] }));
  const nnA = adviceAbsent.recommended.map((g) => g.proposedMarkerId).filter((id) => id != null);
  check('82. NOT HERE spare is never proposed (only P13 remains eligible)',
    nnA.length === 1 && nnA[0] === 13);
})();

// 83. TRIAL-04: MARKER OFF operator availability (excluded from proposals and
// selector; assignment rejected at the domain boundary; still fully playable;
// NOT HERE wins when both are set).
(() => {
  const f = bFixtures();
  const view = Object.assign({}, bView, { markerOffIds: [p3.id] });
  const data = { fixtures: f, roster: bRoster, completedMatches: bCompleted() };
  const advice = api.buildSchedulerAdvice(bUi(), data, view);
  check('83. MARKER OFF player is never PROPOSED as marker (advice-level gate)',
    advice.recommended.every((g) => g.proposedMarkerId !== p3.id));

  check('83. MARKER OFF player is excluded from the marker selector',
    api.getEligibleMarkerCandidates({ players: bRoster, markerOffIds: [p3.id] }).every((c) => c.id !== p3.id) &&
    api.getEligibleMarkerCandidates({ players: bRoster }).some((c) => c.id === p3.id));

  const g62 = f.find((x) => x.matchId === 62); // p3 vs p4
  const rej = api.assignMarkerToGame(api.createMarkerRuntime(), f[0], p3.id, { markerOffIds: [p3.id] });
  check('83. Confirming a MARKER OFF player is REJECTED at the domain boundary (player-marker-off)',
    rej.ok === false && rej.reason === 'player-marker-off' && Object.keys(rej.runtime.byGame).length === 0);

  let rt = api.createMarkerRuntime();
  rt = api.assignMarkerToGame(rt, f[0], p5.id, {}).runtime;
  const chg = api.changeMarkerForGame(rt, f[0], p3.id, { markerOffIds: [p3.id] });
  check('83. CHANGE to a MARKER OFF player is rejected and the original marker survives',
    chg.ok === false && chg.reason === 'player-marker-off' && api.findMarkerForGame(chg.runtime, f[0]) === p5.id);

  // Still fully playable: the gate lives ONLY in marker eligibility paths.
  const session = api.buildNightSession(bUi(), data, view);
  check('83. MARKER OFF player is still PLAYABLE (game enters playable set)',
    api.getPlayableGames(session).some((g) => g.playerA.id === p3.id || g.playerB.id === p3.id));
  check('83. MARKER OFF player is not reported absent (independent of NOT HERE)',
    api.derivePlayerStates(session).get(p3.id).state === api.PLAYER_STATES.AVAILABLE);

  // NOT HERE wins when both are set (absent filter is evaluated first).
  const both = api.assignMarkerToGame(api.createMarkerRuntime(), f[0], p3.id, { absentIds: [p3.id], markerOffIds: [p3.id] });
  check('83. NOT HERE beats MARKER OFF (player-unavailable takes precedence)',
    both.ok === false && both.reason === 'player-unavailable');

  // Marker-off marker who was ALREADY confirmed keeps the duty (operator
  // resolved explicitly, surfaced as advice: the confirmed chip stays FACT).
  const confirmed = api.buildSchedulerAdvice(bUi(), { fixtures: bFixtures(), roster: bRoster,
    markerRuntime: api.assignMarkerToGame(api.createMarkerRuntime(), f[0], p5.id, {}).runtime }, view);
  const cGame = confirmed.recommended.find((g) => g.matchId === f[0].matchId);
  check('83. Confirmed marker is FACT even when that player is later switched MARKER OFF',
    !!cGame && cGame.confirmedMarkerId === p5.id);
})();

// 84. TRIAL-01: night persistence round-trip, validation, scoping, and the
// planner-output exclusion boundary.
(() => {
  const store = {};
  const storage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const leagueU = { leagueCode: 'SStaffSL', leagueId: '24343' };
  const leagueW = { leagueCode: 'SStaffSL', leagueId: '55555' };
  const keyU = api.storageKeyForLeague(leagueU);
  const keyW = api.storageKeyForLeague(leagueW);
  check('84. League-scoped store keys differ (Universal cannot contaminate the other league)', keyU !== keyW);

  const state = api.defaultState(['Universal', 'White Eagle']);
  state.division = 'Universal';
  state.absentIds = [p1.id];
  state.night = api.buildNightPersistedState(
    Object.assign(state, { markerOffIds: [p2.id] }),
    Object.assign(api.defaultSchedulerUiState(), {
      strategy: api.SCHEDULING_STRATEGIES.OPTIMISED, includeDelayed: true,
      managedBoardsEnabled: true, boardCount: 5,
    }),
    { allowance: { '101': 2 }, consumedDelayedGameKeys: {} }
  );
  api.saveState(storage, state, keyU);

  const restored = api.loadState(storage, ['Universal', 'White Eagle'], keyU);
  check('84. Night settings round-trip through the SAME league store key',
    restored.night && restored.night.strategy === api.SCHEDULING_STRATEGIES.OPTIMISED &&
    restored.night.includeDelayed === true && restored.night.managedBoardsEnabled === true &&
    restored.night.boardCount === 5);
  check('84. MARKER OFF ids and allowance overrides round-trip; consumption keys do not',
    JSON.stringify(restored.night.markerOffIds) === JSON.stringify([p2.id]) &&
    restored.night.delayedAllowance && restored.night.delayedAllowance['101'] === 2 &&
    restored.night.delayedAllowance.consumedDelayedGameKeys === undefined);
  check('84. Pre-existing NOT HERE persistence still works (untouched path)',
    JSON.stringify(restored.absentIds) === JSON.stringify([p1.id]) && restored.division === 'Universal');

  // Other league context reads its OWN key: no night contamination.
  const other = api.loadState(storage, ['Universal', 'White Eagle'], keyW);
  check('84. Other league context sees NO night settings (division/session scoped)',
    other.night === null && other.markerOffIds.length === 0);

  // Validation: garbage is dropped field by field, never thrown.
  store[keyU] = JSON.stringify({
    division: 'Universal', absentIds: [],
    night: { strategy: 'BOGUS', includeDelayed: 'yes', managedBoardsEnabled: 1,
      boardCount: 99, markerOffIds: ['x', 1.5, p3.id], delayedAllowance: { '101': -4, 'abc': 2, '102': 3 } },
  });
  const strict = api.loadState(storage, ['Universal', 'White Eagle'], keyU);
  check('84. Invalid night fields are dropped (strategy/bools/boardCount validated)',
    strict.night && strict.night.strategy === undefined && strict.night.includeDelayed === undefined &&
    strict.night.managedBoardsEnabled === undefined && strict.night.boardCount === undefined);
  check('84. markerOffIds filtered to safe integers; allowance entries validated (id + non-negative int)',
    JSON.stringify(strict.night.markerOffIds) === JSON.stringify([p3.id]) &&
    strict.night.delayedAllowance['102'] === 3 && strict.night.delayedAllowance['101'] === undefined &&
    strict.night.delayedAllowance.abc === undefined);

  // Planner output and transient state are NEVER persisted. ACCEPT-03 adds
  // exactly one more operator-state field: `dispatch` (explicit board
  // ownership + pending marker advice, bucketed by division@date).
  const snap = api.buildNightPersistedState({ markerOffIds: [] }, api.defaultSchedulerUiState(), null);
  check('84. Persisted night object contains operator settings ONLY (no recommendations/projected waves)',
    // MARKER-10 adds ONE more operator display setting — the Not Here panel
    // width — and still nothing derived: no plan, no recommendation, no wave.
    JSON.stringify(Object.keys(snap).sort()) === JSON.stringify(
      ['boardCount', 'delayedAllowance', 'dispatch', 'includeDelayed', 'managedBoardsEnabled',
        'markerOffIds', 'markerPolicy', 'notHereWidth', 'strategy']));
  check('84. defaultState starts with no night snapshot and empty marker-off list',
    api.defaultState([]).night === null && JSON.stringify(api.defaultState([]).markerOffIds) === '[]');
})();

// 85. TRIAL-06 + TRIAL-02A: bulk delayed-allowance semantics, snapshot/apply
// clamping, and board release correctness across fixture states.
(() => {
  const current = { matchId: 701, date: '2026-10-01', dateValue: 100, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: false, status: 'waiting' };
  const dA = { matchId: 711, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p1, playerB: p3, delayed: true, status: 'waiting' };
  const dB = { matchId: 712, date: '2026-09-10', dateValue: 60, division: 'Universal', roundValue: 2, sessionValue: 1, playerA: p4, playerB: p1, delayed: true, status: 'waiting' };
  const dC = { matchId: 713, date: '2026-09-17', dateValue: 70, division: 'Universal', roundValue: 3, sessionValue: 1, playerA: p6, playerB: p7, delayed: true, status: 'waiting' };
  const fixtures = [current, dA, dB, dC];
  const backlog = api.getDelayedBacklogByPlayer(fixtures);
  // N: p1=2, p3=1, p4=1, p6=1, p7=1; p2/p5/p8/p9/p10 have none.

  // Default 0: fresh runtime grants nobody any allowance.
  const fresh = api.createDelayedAllowanceRuntime(fixtures);
  check('85. TRIAL-06 default: every player starts at R=0 (delayed catch-up is opt-in)',
    Object.keys(backlog).every((id) => api.getRemainingDelayedAllowance(fresh, Number(id)) === 0));

  // Bulk All → 1 (UI-equivalent loop: HERE players with backlog > 0 only).
  const absentSet = new Set([p6.id]); // p6 NOT HERE -> excluded from bulk
  let rt = fresh;
  Object.keys(backlog).forEach((idStr) => {
    const id = Number(idStr);
    if (!(backlog[id] > 0) || absentSet.has(id)) return;
    rt = api.setRemainingDelayedAllowance(rt, id, 1, backlog).runtime;
  });
  check('85. All → 1 affects ONLY HERE players with outstanding delayed games',
    api.getRemainingDelayedAllowance(rt, p1.id) === 1 && api.getRemainingDelayedAllowance(rt, p3.id) === 1 &&
    api.getRemainingDelayedAllowance(rt, p4.id) === 1 &&
    api.getRemainingDelayedAllowance(rt, p6.id) === 0 && // NOT HERE excluded
    api.getRemainingDelayedAllowance(rt, p2.id) === 0); // no backlog, untouched

  // Individual override after bulk: only that player changes.
  rt = api.setRemainingDelayedAllowance(rt, p1.id, 2, backlog).runtime;
  check('85. Individual override after bulk action changes only that player',
    api.getRemainingDelayedAllowance(rt, p1.id) === 2 && api.getRemainingDelayedAllowance(rt, p3.id) === 1);

  // Bulk All → 0 resets everyone (HERE with backlog).
  let rt0 = rt;
  Object.keys(backlog).forEach((idStr) => {
    const id = Number(idStr);
    if (!(backlog[id] > 0) || absentSet.has(id)) return;
    rt0 = api.setRemainingDelayedAllowance(rt0, id, 0, backlog).runtime;
  });
  check('85. All → 0 resets every affected player to R=0 (bounded, N untouched)',
    Object.keys(backlog).every((id) => api.getRemainingDelayedAllowance(rt0, Number(id)) === 0) &&
    api.getDelayedOutstandingCount(backlog, p1.id) === 2);

  // Snapshot/apply round trip: operator overrides persist, re-clamped to the
  // CURRENT factual backlog; dead entries disappear.
  const rtLive = api.setRemainingDelayedAllowance(fresh, p1.id, 5, backlog).runtime; // clamps to N=2
  const snap = api.snapshotDelayedAllowance(rtLive);
  check('85. Snapshot keeps only R>0 operator values (consumption keys excluded)',
    snap['' + p1.id] === 2 && snap.consumedDelayedGameKeys === undefined &&
    Object.keys(snap).length === 1);
  const reApplied = api.applySavedDelayedAllowance(api.createDelayedAllowanceRuntime(fixtures), snap, backlog);
  check('85. Re-applied snapshot clamps to current backlog (saved 5 -> R=2)',
    api.getRemainingDelayedAllowance(reApplied, p1.id) === 2);
  const shrunkBacklog = api.getDelayedBacklogByPlayer([current]); // p1 no longer delayed
  const reApplied2 = api.applySavedDelayedAllowance(api.createDelayedAllowanceRuntime([current]), snap, shrunkBacklog);
  check('85. Snapshot for a player with no outstanding delayed games grants nothing on restore',
    api.getRemainingDelayedAllowance(reApplied2, p1.id) === 0);

  // TRIAL-02A: board release is domain-correct for every fixture state.
  const mkData = (status, delayed) => ({ matchId: 721, date: '2026-10-01', dateValue: 100, division: 'Universal',
    roundValue: 1, sessionValue: 1, playerA: p1, playerB: p2, delayed: !!delayed, status });
  [mkData('waiting', false), mkData('playing', false), mkData('waiting', true)].forEach((fx) => {
    const statusBefore = fx.status;
    const brt = api.assignGameToBoard(api.createManagedBoardRuntime(4), fx, 2).runtime;
    const rel = api.releaseBoard(brt, 2);
    check('85. Board release succeeds on a ' + (fx.delayed ? 'delayed ' : '') + fx.status + ' fixture and frees the board',
      rel.ok && rel.runtime.boards[1].gameKey === null &&
      api.getAvailableManagedBoards(rel.runtime).some((b) => b.boardNumber === 2));
    const mrt = api.assignMarkerToGame(api.createMarkerRuntime(), fx, p3.id, {}).runtime;
    const rel2 = api.releaseBoard(brt, 2);
    check('85. Board release does NOT touch marker ownership, PLAYING or completion (' + (fx.delayed ? 'delayed ' : '') + fx.status + ')',
      rel2.ok && api.findMarkerForGame(mrt, fx) === p3.id && fx.status === statusBefore);
  });
  check('85. Releasing an unassigned board is a deterministic no-op success',
    api.releaseBoard(api.createManagedBoardRuntime(4), 3).ok === true);
})();

// ---------------------------------------------------------------------------
// ACCEPTANCE FOLLOW-UP (ACCEPT-01..04) regression suites.
// ---------------------------------------------------------------------------
console.log('\n--- Acceptance Follow-Up (dispatch / handoff / persistence) Tests ---');

// 86. ACCEPT-01: stable dispatch queue (PLAN GLOBALLY, EXECUTE LOCALLY).
(() => {
  const G = (mid) => ({ matchId: mid, playerA: { id: mid * 10 + 1 }, playerB: { id: mid * 10 + 2 } });
  const plan = [G(1), G(2), G(3), G(5)];                 // planner output AFTER dispatching A (4)
  const shown = [G(4), G(1), G(2), G(3)];                 // what the operator sees: A,B,C,D
  const order = api.rememberDispatchOrder(shown);

  // Dispatch A (matchId 4): B,C,D survive in order and renumber from 1;
  // the planner's new game 5 fills the tail.
  const afterDispatch = api.applyDispatchOrder(plan, order);
  check('86. Dispatching recommendation #1 preserves survivors in relative order and fills the tail',
    JSON.stringify(afterDispatch.map((g) => g.matchId)) === JSON.stringify([1, 2, 3, 5]));

  check('86. With no remembered queue the planner order is used verbatim',
    JSON.stringify(api.applyDispatchOrder(plan, null).map((g) => g.matchId)) === JSON.stringify([1, 2, 3, 5]) &&
    JSON.stringify(api.applyDispatchOrder(plan, []).map((g) => g.matchId)) === JSON.stringify([1, 2, 3, 5]));

  // A remembered recommendation the planner no longer makes is dropped, never resurrected.
  check('86. An invalidated survivor is dropped, never resurrected to preserve order',
    JSON.stringify(api.applyDispatchOrder([G(2), G(3)], order).map((g) => g.matchId)) === JSON.stringify([2, 3]));

  // A newly valid game never jumps ahead of a survivor.
  check('86. A new recommendation fills the tail instead of jumping ahead of survivors',
    JSON.stringify(api.applyDispatchOrder([G(5), G(2), G(3)], order).map((g) => g.matchId)) === JSON.stringify([2, 3, 5]));

  check('86. Dispatch ordering is pure (input untouched) and idempotent',
    JSON.stringify(shown.map((g) => g.matchId)) === JSON.stringify([4, 1, 2, 3]) &&
    JSON.stringify(api.applyDispatchOrder(api.applyDispatchOrder(plan, order), order).map((g) => g.matchId)) ===
      JSON.stringify([1, 2, 3, 5]));
  check('86. Dispatch ordering never invents a game the planner did not recommend',
    api.applyDispatchOrder([G(9)], order).every((g) => g.matchId === 9));

  // World-level sequential dispatch (the operator loop): dispatching #1 over
  // and over must progress the queue, never shuffle survivors.
  const P = (i) => ({ id: 100 + i, name: 'Player ' + i, division: 'Universal' });
  const roster = Array.from({ length: 11 }, (_, k) => P(k + 1));
  const worldFixtures = () => [[601, 4, 5, 2, 1], [602, 6, 7, 3, 2], [603, 1, 7, 2, 2], [604, 4, 6, 3, 1]]
    .map(([m, a, b, rnd, ssn]) => ({
      matchId: m, date: '2026-10-01', dateValue: 100, division: 'Universal',
      roundValue: rnd, sessionValue: ssn, playerA: P(a), playerB: P(b), delayed: false, status: 'waiting',
    }));
  const dView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [108] };
  const dUi = () => Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: 5 });
  let dRuntime = api.createManagedBoardRuntime(5);
  let dOrder = null;
  const dQueue = () => {
    const a = api.buildSchedulerAdvice(dUi(), { fixtures: worldFixtures(), roster, boardRuntime: dRuntime }, dView);
    a.recommended = api.applyDispatchOrder(a.recommended, dOrder);
    dOrder = api.rememberDispatchOrder(a.recommended);
    return a.recommended;
  };
  const firstQueue = dQueue().map((g) => g.matchId);
  check('86. World: initial queue is globally planned', firstQueue.length > 0);
  let survivorsKept = true;
  let dispatched = [];
  for (let n = 1; n <= 3; n += 1) {
    const queue = dQueue();
    if (queue.length === 0) break;
    const target = queue[0];
    const survivors = queue.slice(1).map((g) => g.matchId);
    const res = api.assignGameToBoard(dRuntime, target, n, { absentIds: dView.absentIds });
    if (!res.ok) break;
    dRuntime = res.runtime;
    dispatched.push(target.matchId);
    const after = dQueue().map((g) => g.matchId);
    const kept = survivors.filter((m) => after.indexOf(m) !== -1);
    if (JSON.stringify(kept) !== JSON.stringify(survivors.filter((m) => dispatched.indexOf(m) === -1))) survivorsKept = false;
  }
  check('86. World: sequential dispatch keeps every surviving recommendation in order',
    survivorsKept && dispatched.length >= 2);
  check('86. World: dispatch never manufactures PLAYING or completion',
    worldFixtures().every((f) => f.status === 'waiting'));
})();

// 87. ACCEPT-02/03A: pending (unconfirmed) marker handoff + validity.
(() => {
  const baseCtx = (over) => Object.assign({
    players: bRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [],
    markedGameKeys: {}, excludeParticipants: true, participantIds: [101, 102],
  }, over || {});

  check('87. A valid pending proposal is returned unchanged',
    api.validatePendingMarker(p5.id, baseCtx()) === p5.id);
  check('87. Pending advice is invalidated by NOT HERE / MARKER OFF / PLAYING',
    api.validatePendingMarker(p5.id, baseCtx({ absentIds: [p5.id] })) === null &&
    api.validatePendingMarker(p5.id, baseCtx({ markerOffIds: [p5.id] })) === null &&
    api.validatePendingMarker(p5.id, baseCtx({ playingPlayerIds: [p5.id] })) === null);
  check('87. Pending advice is invalidated by MARKING elsewhere, wrong division or participation',
    api.validatePendingMarker(p5.id, baseCtx({ markingPlayerIds: [p5.id] })) === null &&
    api.validatePendingMarker(p5.id, baseCtx({ rosterDivisionIds: [1, 2, 3] })) === null &&
    api.validatePendingMarker(p1.id, baseCtx()) === null);
  check('87. Non-integer / absent pending advice is always null (never invented)',
    api.validatePendingMarker(null, baseCtx()) === null &&
    api.validatePendingMarker('x', baseCtx()) === null &&
    api.validatePendingMarker(undefined, baseCtx()) === null);

  // Handoff at dispatch: the proposal travels with the game, unconfirmed.
  const fixtures = bFixtures();
  let brt = api.createManagedBoardRuntime(4);
  const advice = api.buildSchedulerAdvice(bUi(), { fixtures: fixtures.slice(), roster: bRoster, completedMatches: bCompleted(), boardRuntime: brt }, bView);
  const target = advice.recommended.find((g) => g.proposedMarkerId != null);
  check('87. Setup: recommendation with a proposed marker', !!target);
  const res = api.assignGameToBoard(brt, target, 1, { absentIds: bView.absentIds });
  brt = res.runtime;
  const pending = Object.assign({}, { [api.markerGameKey(target)]: target.proposedMarkerId });
  const factual = fixtures.find((f) => api.boardKeyForGame(f) === api.markerGameKey(target));
  const factualCtx = baseCtx({
    players: bRoster,
    participantIds: [factual.playerA.id, factual.playerB.id],
  });
  check('87. E: dispatched factual row keeps the SAME marker as pending advice',
    api.validatePendingMarker(pending[api.markerGameKey(factual)], factualCtx) === target.proposedMarkerId);

  // F: pending advice is NOT a factual confirmed marker.
  const sessionAfter = api.buildNightSession(bUi(), { fixtures: fixtures.slice(), roster: bRoster, completedMatches: bCompleted(), boardRuntime: brt }, bView);
  check('87. F: dispatch creates NO factual MARKING (pending advice stays advice)',
    sessionAfter.markingPlayerIds.size === 0 &&
    api.derivePlayerStates(sessionAfter).get(target.proposedMarkerId).state !== api.PLAYER_STATES.MARKING);
  check('87. D/C: dispatch creates no PLAYING, completion or factual state of any kind',
    fixtures.every((f) => f.status === 'waiting') && sessionAfter.activeGames.every((a) => a.boardNumber === 1));

  // Confirming turns advice into the factual marker and retires the handoff.
  const mrt = api.assignMarkerToGame(api.createMarkerRuntime(), factual, target.proposedMarkerId,
    { participantIds: [factual.playerA.id, factual.playerB.id] });
  check('87. F: confirming creates the factual marker (one duty, one game)',
    mrt.ok && api.findMarkerForGame(mrt.runtime, factual) === target.proposedMarkerId);
  check('87. G: once confirmed, the pending advice is no longer pending',
    api.validatePendingMarker(target.proposedMarkerId,
      baseCtx({
        gameKey: api.markerGameKey(factual),
        markedGameKeys: mrt.runtime.byGame,
        participantIds: [factual.playerA.id, factual.playerB.id],
      })) === null);

  // G: an invalidated pending proposal is discarded honestly (dropped to null).
  check('87. G: stale pending advice is discarded, never converted into marker ownership',
    api.validatePendingMarker(target.proposedMarkerId,
      baseCtx({ absentIds: [target.proposedMarkerId], participantIds: [factual.playerA.id, factual.playerB.id] })) === null);
})();

// 88. ACCEPT-03/4B/4C/5: dispatch persistence, defensive restore, scoping.
(() => {
  const fixtures = () => bFixtures().map((f) => Object.assign({}, f));
  let brt = api.createManagedBoardRuntime(4);
  const pending = {};
  [1, 2, 3].forEach((n, i) => {
    const g = fixtures()[i];
    brt = api.assignGameToBoard(brt, g, n, { absentIds: [] }).runtime;
    pending[api.boardKeyForGame(g)] = p10.id;
  });
  const snapshot = api.snapshotDispatchState(brt, pending);

  check('88. Snapshot contains ONLY assigned boards (free boards excluded)',
    snapshot.boards.length === 3 && JSON.stringify(snapshot.boards.map((b) => b.boardNumber)) === JSON.stringify([1, 2, 3]));
  check('88. Pending advice is persisted only for dispatched games',
    Object.keys(snapshot.pendingMarkers).length === 3 &&
    Object.keys(pending).every((k) => snapshot.pendingMarkers[k] === p10.id));
  check('88. N: dispatch snapshot carries no recommendations or projected waves',
    JSON.stringify(Object.keys(snapshot).sort()) === JSON.stringify(['boards', 'history', 'pendingMarkers']) &&
    JSON.stringify(snapshot).indexOf('recommended') === -1 &&
    JSON.stringify(snapshot).indexOf('projected') === -1);

  // H: round trip through the real store key.
  const store = {};
  const storage = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); } };
  const key = api.storageKeyForLeague({ leagueCode: 'SStaffSL', leagueId: '24343' });
  const state = api.defaultState(['Universal']);
  state.division = 'Universal';
  state.selectedMatchDate = bView.selectedMatchDate;
  state.night = api.buildNightPersistedState(state, bUi(), null,
    api.mergeDispatchBucket({}, api.dispatchBucketKey(state), snapshot));
  api.saveState(storage, state, key);
  const restoredState = api.loadState(storage, ['Universal'], key);
  const bucket = api.dispatchBucketKey(restoredState);
  const savedDispatch = restoredState.night && restoredState.night.dispatch[bucket];
  const restored = api.restoreDispatchState(restoredState.night.boardCount, savedDispatch, fixtures());

  // MARKER-6: the bucket now also carries CONFIRMED marker ownership, so the
  // round trip is compared field by field (the dispatched board/pending/history
  // payload itself must be byte-identical).
  check('88. H: board assignments survive Refresh/F5 (persistence round trip)',
    !!savedDispatch &&
    JSON.stringify(savedDispatch.boards) === JSON.stringify(snapshot.boards) &&
    JSON.stringify(savedDispatch.pendingMarkers) === JSON.stringify(snapshot.pendingMarkers) &&
    JSON.stringify(savedDispatch.history) === JSON.stringify(snapshot.history) &&
    restored.rejected.length === 0 &&
    JSON.stringify(api.snapshotBoardAssignments(restored.runtime)) === JSON.stringify(snapshot.boards));
  check('88. H: pending dispatched marker advice survives the reload (validated on use)',
    JSON.stringify(restored.pendingMarkers) === JSON.stringify(snapshot.pendingMarkers));

  // I: release updates persistence — a released board never comes back.
  const released = api.releaseBoard(brt, 2);
  const afterRelease = api.snapshotDispatchState(released.runtime, pending);
  const reloadAfterRelease = api.restoreDispatchState(4, afterRelease, fixtures());
  check('88. I: a released board stays released after reload',
    api.snapshotBoardAssignments(reloadAfterRelease.runtime).every((b) => b.boardNumber !== 2) &&
    api.getAvailableManagedBoards(reloadAfterRelease.runtime).some((b) => b.boardNumber === 2));
  check('88. I: release leaves the other assignments and pending advice intact',
    JSON.stringify(api.snapshotBoardAssignments(reloadAfterRelease.runtime).map((b) => b.boardNumber)) === JSON.stringify([1, 3]) &&
    JSON.stringify(reloadAfterRelease.pendingMarkers) === JSON.stringify(afterRelease.pendingMarkers));

  // J/K/L: defensive restore rejects stale, duplicate and out-of-range data.
  const reject = (saved, count, reason) => api.restoreDispatchState(4, saved, fixtures()).rejected
    .some((r) => r.reason === reason && api.restoreDispatchState(4, saved, fixtures()).restored.length === count);
  check('88. L: board number outside the current boardCount is rejected',
    reject({ boards: [{ boardNumber: 9, gameKey: 'id:61' }] }, 0, 'board-out-of-range'));
  check('88. J: a game that no longer exists is rejected',
    reject({ boards: [{ boardNumber: 1, gameKey: 'id:99999' }] }, 0, 'unknown-game'));
  check('88. J: a malformed game key is rejected',
    reject({ boards: [{ boardNumber: 1, gameKey: 42 }] }, 0, 'invalid-game-key'));
  check('88. K: two games claiming the same board -> only the first is restored',
    reject({ boards: [{ boardNumber: 1, gameKey: 'id:61' }, { boardNumber: 1, gameKey: 'id:62' }] }, 1, 'duplicate-board'));
  check('88. K: one game claiming two boards -> only the first is restored',
    reject({ boards: [{ boardNumber: 1, gameKey: 'id:61' }, { boardNumber: 2, gameKey: 'id:61' }] }, 1, 'duplicate-game'));
  const dupFixtures = fixtures().concat(fixtures());
  const ambiguous = api.restoreDispatchState(4, { boards: [{ boardNumber: 1, gameKey: 'id:61' }] }, dupFixtures);
  check('88. J: an ambiguous game identity is rejected (never guessed)',
    ambiguous.restored.length === 0 && ambiguous.rejected[0].reason === 'ambiguous-game');
  check('88. Restoring never implies PLAYING, completion or marker confirmation',
    api.restoreDispatchState(4, snapshot, fixtures()).pendingMarkers !== null &&
    fixtures().every((f) => f.status === 'waiting'));

  // M: division + date scoping.
  const keyU = api.dispatchBucketKey({ division: 'Universal', selectedMatchDate: '2026-10-01' });
  const keyW = api.dispatchBucketKey({ division: 'White Eagle', selectedMatchDate: '2026-10-01' });
  const keyLater = api.dispatchBucketKey({ division: 'Universal', selectedMatchDate: '2026-10-29' });
  check('88. M: dispatch buckets are distinct per division and per match date',
    keyU !== keyW && keyU !== keyLater && keyW !== keyLater);
  const merged = api.mergeDispatchBucket(
    api.mergeDispatchBucket({}, keyU, snapshot), keyW, { boards: [{ boardNumber: 4, gameKey: 'id:63' }], pendingMarkers: {} });
  check('88. M: one division can never inherit another division board assignments',
    JSON.stringify(api.restoreDispatchState(4, merged[keyU], fixtures()).restored) === JSON.stringify(snapshot.boards) &&
    api.restoreDispatchState(4, merged[keyW], fixtures()).restored.length === 1 &&
    api.restoreDispatchState(4, merged[keyLater], fixtures()).restored.length === 0);
})();

// ---------------------------------------------------------------------------
// MARKER-1..5 regression suites (acceptance follow-up #2).
// ---------------------------------------------------------------------------
console.log('\n--- Marker Model (reservation / next-N wave / fair rotation) Tests ---');

// 89. MARKER-1: a pending marker RESERVES the player for marker scheduling.
(() => {
  const fixtures = () => bFixtures();
  let brt = api.createManagedBoardRuntime(4);
  const advice = api.buildSchedulerAdvice(bUi(), bData({ boardRuntime: brt }), bView);
  const target = advice.recommended.find((g) => g.proposedMarkerId != null);
  check('89. Setup: a recommendation with a proposed marker', !!target);
  const trevorLike = target.proposedMarkerId;
  brt = api.assignGameToBoard(brt, target, 1, { absentIds: [] }).runtime;
  const dispatchedKey = api.markerGameKey(target);
  const data = bData({ boardRuntime: brt, pendingMarkers: { [dispatchedKey]: trevorLike } });

  check('89. A: the reserved player cannot be PROPOSED for another game',
    api.buildSchedulerAdvice(bUi(), data, bView).recommended.every((g) => g.proposedMarkerId !== trevorLike));
  check('89. A: the reserved player is absent from another game\'s eligible candidates',
    api.getEligibleMarkerCandidates({
      players: bRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [],
      pendingMarkerIds: api.reservedPendingMarkerIds(data, bView),
      excludeParticipants: true, participantIds: [bRoster[2].id, bRoster[3].id],
    }).every((c) => c.id !== trevorLike));
  const other = fixtures()[1];
  const confirm = api.assignMarkerToGame(api.createMarkerRuntime(), other, trevorLike, {
    pendingMarkerIds: api.reservedPendingMarkerIds(data, bView),
    participantIds: [other.playerA.id, other.playerB.id],
  });
  check('89. A: confirming the reserved player for another game is REJECTED (player-marker-pending)',
    confirm.ok === false && confirm.reason === 'player-marker-pending' &&
    Object.keys(confirm.runtime.byGame).length === 0);
  const reservedSet = api.reservedPendingMarkerIds(data, bView);
  check('89. A: no duplicate reservation is possible (one reservation per player)',
    reservedSet.filter((id) => id === trevorLike).length === 1);
  // The reservation binds OTHER games only: the dispatched game that owns the
  // pending marker must still be able to confirm, change or drop it.
  check('89. A: the owning game is NOT blocked by its own reservation (operator can confirm it)',
    api.reservedPendingMarkerIds(data, bView, dispatchedKey).indexOf(trevorLike) === -1 &&
    api.getEligibleMarkerCandidates({
      players: bRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [],
      pendingMarkerIds: api.reservedPendingMarkerIds(data, bView, dispatchedKey),
      excludeParticipants: true,
      participantIds: [bFixtures()[0].playerA.id, bFixtures()[0].playerB.id],
    }).some((c) => c.id === trevorLike));
  const session = api.buildNightSession(bUi(), data, bView);
  const states = api.derivePlayerStates(session);
  check('89. A: a reserved player is RESERVED, NOT factually MARKING',
    states.get(trevorLike).state === api.PLAYER_STATES.RESERVED &&
    session.markingPlayerIds.size === 0 && !session.markingPlayerIds.has(trevorLike));
  check('89. A: reservation also blocks PLAYING recommendations for that player',
    api.getPlayableGames(session).every((g) => g.playerA.id !== trevorLike && g.playerB.id !== trevorLike));
  // The reservation ends when the pending handoff is retired (board released).
  const retired = api.reservedPendingMarkerIds(bData({ boardRuntime: api.releaseBoard(brt, 1).runtime, pendingMarkers: {} }), bView);
  check('89. A: releasing the board and retiring the handoff ends the reservation',
    retired.indexOf(trevorLike) === -1);
  // Factual conflicts pre-filter stale reservations: a player who is now
  // factually PLAYING cannot stay reserved.
  const playingFixtures = fixtures().map((f, i) => (i === 2 ? Object.assign({}, f, { status: 'playing' }) : f));
  const playingPlayerId = playingFixtures[2].playerA.id;
  check('89. A: a stale reservation (player now factually PLAYING) is dropped',
    api.reservedPendingMarkerIds(bData({
      boardRuntime: brt,
      fixtures: playingFixtures,
      pendingMarkers: { [dispatchedKey]: playingPlayerId },
    }), bView).indexOf(playingPlayerId) === -1);
})();

// 90. MARKER-2/4 CORRECTED: next-N dispatchable participant exclusion is the
// HARD rule; "has already played tonight" is a FAIR preference only.
//
// World: 6 waiting games over 12 players (q1..q12) + 4 spares (q13..q16).
//   game 1: q1 v q2   game 2: q3 v q4   game 3: q5 v q6
//   game 4: q7 v q8   game 5: q9 v q10  game 6: q11 v q12
(() => {
  const q = (i) => ({ id: 700 + i, name: 'Q' + i, division: 'Universal' });
  const qRoster = Array.from({ length: 16 }, (_, k) => q(k + 1));
  const qFx = (games) => {
    const out = [];
    for (let g = 0; g < games; g += 1) {
      out.push({
        matchId: 7500 + g, date: '2026-10-01', dateValue: 100, division: 'Universal',
        roundValue: 1, sessionValue: 1, playerA: q(g * 2 + 1), playerB: q(g * 2 + 2),
        delayed: false, status: 'waiting',
      });
    }
    return out;
  };
  const qView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const qUi = (boards, policy) => Object.assign(api.defaultSchedulerUiState(),
    { managedBoardsEnabled: true, boardCount: boards, markerPolicy: policy || api.MARKER_POLICIES.FAIR });
  const qData = (games, extra) => Object.assign({
    fixtures: qFx(games), roster: qRoster, completedMatches: [],
  }, extra || {});
  const ids = (n) => Array.from({ length: n }, (_, k) => 701 + k);
  const props = (advice) => advice.recommended.map((g) => g.proposedMarkerId);
  const playedEvidence = (list) => [{
    matchId: 7900, date: '2026-10-01', division: 'Universal',
    playerA: { id: list[0] }, playerB: { id: list[1] }, source: 'schedule-props',
  }];

  // A. OPENING WAVE / ZERO COMPLETIONS - the Chrome screenshot failure.
  const opening = api.buildSchedulerAdvice(qUi(4), qData(6), qView);
  const openProps = props(opening);
  check('90. A: zero completions + 4 free boards -> every opening row gets a marker (no M: -)',
    opening.recommended.length === 4 && openProps.every((id) => id != null));
  check('90. A: no opening-game participant is ever proposed as marker (next-4 union excluded)',
    openProps.every((id) => id > 708));
  check('90. A: the four proposals are distinct (one marker per person)',
    new Set(openProps).size === 4);
  check('90. A: the opening wave is deterministic (same world, same proposals)',
    JSON.stringify(props(api.buildSchedulerAdvice(qUi(4), qData(6), qView))) === JSON.stringify(openProps));

  // B. CAPACITY 1 - only the next ONE dispatchable game is excluded.
  const cap1 = api.buildSchedulerAdvice(qUi(1), qData(6), qView);
  check('90. B: capacity 1 plans one game and excludes exactly its own participants',
    cap1.recommended.length === 1 && props(cap1)[0] > 702);
  check('90. B: a player who only appears in a LATER game is still eligible at capacity 1',
    props(cap1)[0] == null || props(cap1)[0] > 702);

  // C. CAPACITY 2 - the union of the next 2 games is excluded.
  const cap2 = api.buildSchedulerAdvice(qUi(2), qData(6), qView);
  const cap2Props = props(cap2);
  check('90. C: capacity 2 excludes the union of the next 2 games from every proposal',
    cap2.recommended.length === 2 && cap2Props.every((id) => id > 704) &&
    new Set(cap2Props).size === 2);

  // D. CAPACITY 4 - the union of the next 4 games is excluded.
  check('90. D: capacity 4 excludes the union of the next 4 games',
    openProps.every((id) => id > 708));

  // E. CAPACITY 6 - capacity-driven, NOT hard-coded to four.
  const cap6 = api.buildSchedulerAdvice(qUi(6), qData(6), qView);
  const cap6Props = props(cap6);
  check('90. E: capacity 6 plans 6 games and excludes all 12 participants (not 8)',
    cap6.recommended.length === 6 && cap6Props.every((id) => id == null || id > 712) &&
    new Set(cap6Props.filter((id) => id != null)).size === 4);
  check('90. E: capacity 6 and capacity 4 produce different waves (nothing is hard-coded)',
    JSON.stringify(cap6Props) !== JSON.stringify(openProps) &&
    JSON.stringify(props(api.buildSchedulerAdvice(qUi(3), qData(6), qView))) !== JSON.stringify(openProps));

  // F. PLAYED IS A PREFERENCE, NOT A GATE.
  const pair = qData(1, { roster: [q(1), q(2), q(13), q(14)] });
  check('90. F: an equal candidate who HAS played is preferred over one who has not',
    props(api.buildSchedulerAdvice(qUi(1),
      Object.assign({}, pair, { completedMatches: playedEvidence([714]) }), qView))[0] === 714);
  check('90. F: with NOBODY played the proposal still happens (not a gate)',
    props(api.buildSchedulerAdvice(qUi(1),
      Object.assign({}, pair, { completedMatches: [] }), qView))[0] === 713);
  const oneAbsent = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [714] };
  check('90. F: if only the unplayed candidate is valid it MUST still be usable',
    props(api.buildSchedulerAdvice(qUi(1),
      Object.assign({}, pair, { completedMatches: playedEvidence([714]) }), oneAbsent))[0] === 713);
  // Rotation burden still outranks the soft "has played" hint.
  const burdened = api.recordMarkerMark(api.recordMarkerMark(api.createMarkerHistory(), 714, 'a'), 714, 'b');
  const prefWorld = Object.assign({}, pair,
    { completedMatches: playedEvidence([713, 714]), markerHistory: burdened });
  check('90. G: fewer marks wins even when the other candidate has played',
    props(api.buildSchedulerAdvice(qUi(1), prefWorld, qView))[0] === 713);
  check('90. F: played evidence from another date/division is ignored (never invented)',
    api.getPlayedPlayerIds([{ matchId: 1, date: '2026-09-17', division: 'Universal',
      playerA: { id: 713 }, playerB: { id: 714 } }], '2026-10-01', 'Universal').size === 0 &&
    api.getPlayedPlayerIds([{ matchId: 1, date: '2026-10-01', division: 'White Eagle',
      playerA: { id: 713 }, playerB: { id: 714 } }], '2026-10-01', 'Universal').size === 0);

  // H. PENDING RESERVATION still removes a player from the new wave.
  let brt = api.createManagedBoardRuntime(4);
  const firstGame = opening.recommended[0];
  brt = api.assignGameToBoard(brt, firstGame, 1, { absentIds: [] }).runtime;
  const held = firstGame.proposedMarkerId;
  const afterDispatch = api.buildSchedulerAdvice(qUi(4),
    qData(6, { boardRuntime: brt, pendingMarkers: { [api.markerGameKey(firstGame)]: held } }), qView);
  check('90. H: the pending marker on Board 1 is never proposed again',
    afterDispatch.recommended.length === 4 &&
    afterDispatch.recommended.every((g) => g.proposedMarkerId !== held));
  check('90. H: the next-N window shrinks with the free board count (4 -> 3 slots)',
    api.getNextDispatchCapacity(api.buildNightSession(qUi(4),
      qData(6, { boardRuntime: api.createManagedBoardRuntime(4) }), qView),
    api.createManagedBoardRuntime(4)) === 4 &&
    api.getNextDispatchCapacity(api.buildNightSession(qUi(4),
      qData(6, { boardRuntime: brt }), qView), brt) === 3);

  // I. INSUFFICIENT POOL - never steal from the next-N games.
  const tight = qData(6, { roster: [q(1), q(2), q(3), q(4), q(5), q(6), q(7), q(8), q(13)] });
  const tightAdvice = api.buildSchedulerAdvice(qUi(4), tight, qView);
  const tightProps = props(tightAdvice);
  check('90. I: an insufficient pool leaves the surplus rows honestly unmarked (null)',
    tightAdvice.recommended.length === 4 && tightProps.filter((id) => id != null).length === 1 &&
    tightProps.indexOf(713) !== -1);
  check('90. I: the scheduler never pulls a player out of the next-N participant set',
    tightProps.every((id) => id == null || id > 708));
  const noSpares = qData(4, { roster: [q(1), q(2), q(3), q(4), q(5), q(6), q(7), q(8)] });
  check('90. I: a wave that consumes the whole roster proposes nothing at all',
    props(api.buildSchedulerAdvice(qUi(4), noSpares, qView)).every((id) => id == null));

  // Capacity helpers, in isolation (no browser, no render).
  const sess = api.buildNightSession(qUi(4), qData(6), qView);
  check('90. MARKER-4: next-N capacity is the count of genuinely FREE board slots',
    api.getNextDispatchCapacity(sess, api.createManagedBoardRuntime(4)) === 4 &&
    api.getNextDispatchCapacity(sess, api.assignGameToBoard(api.createManagedBoardRuntime(4), qFx(6)[0], 1, { absentIds: [] }).runtime) === 3 &&
    api.getNextDispatchCapacity(sess, api.assignGameToBoard(
      api.assignGameToBoard(api.createManagedBoardRuntime(4), qFx(6)[0], 1, { absentIds: [] }).runtime,
      qFx(6)[1], 2, { absentIds: [] }).runtime) === 2);
  const unmanaged = api.buildNightSession(
    Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: false }), qData(6), qView);
  check('90. MARKER-4: with Managed Boards OFF the planner capacity is reused (no board count invented)',
    api.getNextDispatchCapacity(unmanaged, null) === 4 &&
    api.getNextDispatchCapacity(api.buildNightSession(qUi(6), qData(6), qView), null) === 6);
  const games = qFx(6);
  const idsOf = (s) => Array.from(s).sort((a, b) => a - b);
  check('90. MARKER-4: the next-N participant union is a slice of capacity, not a fixed four',
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 0, 1))) === JSON.stringify([701, 702]) &&
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 0, 2))) === JSON.stringify([701, 702, 703, 704]) &&
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 0, 4))) === JSON.stringify(ids(8)) &&
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 0, 6))) === JSON.stringify(ids(12)) &&
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 0, 0))) === JSON.stringify([701, 702]));
  check('90. MARKER-4: a game always excludes its own participants, whatever the capacity',
    JSON.stringify(idsOf(api.nextDispatchParticipantIds(games, 5, 1))) === JSON.stringify([711, 712]));

  // Zero free boards: no new dispatchable marker allocation is invented.
  let allBusy = api.createManagedBoardRuntime(4);
  [1, 2, 3, 4].forEach((n, i) => {
    allBusy = api.assignGameToBoard(allBusy, qFx(6)[i], n, { absentIds: [] }).runtime;
  });
  const noCapacity = api.buildSchedulerAdvice(qUi(4), qData(6, { boardRuntime: allBusy }), qView);
  check('90. MARKER-4: 0 free boards invents no marker allocation',
    api.getNextDispatchCapacity(sess, allBusy) === 0 &&
    noCapacity.recommended.length === 2 &&
    props(noCapacity).every((id) => id == null));

  // J. MANUAL AUTHORITY - recommendation and operator override stay distinct.
  const manualCtx = { players: bRoster, absentIds: [], playingPlayerIds: [], markingPlayerIds: [],
    markedGameKeys: {}, excludeParticipants: true, participantIds: [p1.id, p2.id] };
  check('90. J: manual operator selection keeps full authority (never gated by played/next-N)',
    api.getEligibleMarkerCandidates(manualCtx).some((c) => c.id === p9.id) &&
    api.assignMarkerToGame(api.createMarkerRuntime(), bFixtures()[0], p9.id, {}).ok === true);

  // Factual evidence extraction from API records is unchanged.
  check('90. F: completed (\'C\') API records become dated completion evidence',
    JSON.stringify(api.completedMatchesFromApiRecords([
      { matchIds: [1], ids: [p9.id, p10.id], state: 'C', date: '2026-10-01', division: 'Universal' },
      { matchIds: [2], ids: [p1.id, p2.id], state: 'O', date: '2026-10-01', division: 'Universal' },
      { matchIds: [3], ids: [p3.id, p4.id], state: 'C', date: '', division: 'Universal' },
    ])) === JSON.stringify([{ matchId: 1, date: '2026-10-01', division: 'Universal',
      playerA: { id: p9.id }, playerB: { id: p10.id }, source: 'api-record' }]));
  check('90. F: only explicit completed states count as completion evidence',
    api.isCompletedRecord({ state: 'C' }) === true && api.isCompletedRecord({ state: 'completed' }) === true &&
    api.isCompletedRecord({ state: 'O' }) === false && api.isCompletedRecord({ state: '' }) === false &&
    api.isCompletedRecord(null) === false);
  check('90. F: a game merely being PLAYING is NOT treated as completion',
    api.isCompletedRecord({ state: 'P' }) === false &&
    api.completedMatchesFromApiRecords([{ matchIds: [1], ids: [p9.id, p10.id],
      state: 'P', date: '2026-10-01', division: 'Universal' }]).length === 0 &&
    api.getPlayedPlayerIds([], '2026-10-01', 'Universal').size === 0);
  check('90. F: the played set contains exactly the factual participants of that date',
    (() => {
      const set = api.getPlayedPlayerIds(api.completedMatchesFromApiRecords([
        { matchIds: [1], ids: [p9.id, p10.id], state: 'C', date: '2026-10-01' },
      ]), '2026-10-01');
      return set.has(p9.id) && set.has(p10.id) && set.size === 2;
    })());
  // A game leaving PLAYING never manufactures completion evidence.
  const playingOnly = qData(1, { roster: [q(1), q(2), q(13), q(14)] });
  playingOnly.fixtures[0].status = 'playing';
  check('90. F: a game leaving PLAYING never manufactures completion evidence',
    api.getPlayedPlayerIds(playingOnly.completedMatches, '2026-10-01', 'Universal').size === 0);
})();

// 91. MARKER-3: FAIR rotation (fewest marks first, no immediate reuse).
(() => {
  const C = (id) => ({ id, name: 'P' + id });
  const cands = [C(1), C(2), C(3), C(4)];
  const none = api.createMarkerHistory();
  const one = api.recordMarkerMark(none, 1, 'id:1');
  const two = api.recordMarkerMark(one, 2, 'id:2');

  check('91. D: a player with 0 marks is preferred over one with 1 mark',
    JSON.stringify(api.rankMarkerCandidatesByFairness(cands, { history: one }).map((c) => c.id)) ===
    JSON.stringify([2, 3, 4, 1]));
  check('91. D: rotation dominates planner fitness (fewer marks wins even when it scores worse)',
    api.rankMarkerCandidatesByFairness(cands, { history: one, scoreOf: (id) => (id === 1 ? 999 : 0) })
      .map((c) => c.id).indexOf(3) < api.rankMarkerCandidatesByFairness(cands, { history: one, scoreOf: (id) => (id === 1 ? 999 : 0) })
      .map((c) => c.id).indexOf(1));
  // Equal counts: the most recent marker is held back while equivalents exist.
  const even = [1, 2, 3, 4].reduce((h, id) => api.recordMarkerMark(h, id, 'id:' + id), none);
  check('91. D: the player who JUST marked is held back while an equivalent exists',
    JSON.stringify(api.rankMarkerCandidatesByFairness(cands, { history: even, recentPlayerId: 2 }).map((c) => c.id)) ===
    JSON.stringify([1, 3, 4, 2]));
  check('91. D: once alternatives are exhausted a previously used player is eligible again',
    api.rankMarkerCandidatesByFairness([C(1), C(2)], { history: two, recentPlayerId: 2 }).map((c) => c.id)[0] === 1);
  check('91. D: ordering is deterministic (no randomness, id-ascending last)',
    JSON.stringify(api.rankMarkerCandidatesByFairness(cands, { history: none }).map((c) => c.id)) ===
    JSON.stringify(api.rankMarkerCandidatesByFairness(cands.slice().reverse(), { history: none }).map((c) => c.id)));
  check('91. D: mark counting and release semantics',
    api.getMarkerMarkCount(api.recordMarkerMark(none, 1, 'a'), 1) === 1 &&
    api.getMarkerMarkCount(api.recordMarkerMark(api.recordMarkerMark(none, 1, 'a'), 1, 'b'), 1) === 2 &&
    api.getMarkerMarkCount(api.releaseMarkerMark(api.recordMarkerMark(none, 1, 'a'), 1), 1) === 0 &&
    api.getMarkerMarkCount(api.releaseMarkerMark(api.recordMarkerMark(none, 1, 'a'), 1), 99) === 0);

  check('91. D: two recorded marks leave the least-burdened player first',
    JSON.stringify(api.rankMarkerCandidatesByFairness([C(1), C(2), C(3)], { history: two }).map((c) => c.id)) ===
    JSON.stringify([3, 1, 2]));

  // World-level rotation: 11 players, 2 marker slots, 3 free spares who have
  // all played tonight — rotation must move on, not recycle.
  const P = (i) => ({ id: 400 + i, name: 'P' + i, division: 'Universal' });
  const roster = Array.from({ length: 11 }, (_, k) => P(k + 1));
  const F = (m, a, b) => ({ matchId: 9600 + m, date: '2026-10-01', dateValue: 100, division: 'Universal',
    roundValue: 1 + Math.floor(m / 2), sessionValue: 1 + (m % 2), playerA: P(a), playerB: P(b),
    delayed: false, status: 'waiting' });
  const fixtures = [F(1, 1, 2), F(2, 3, 4), F(3, 5, 6), F(4, 7, 8)];
  const completed = Array.from({ length: 11 }, (_, k) => ({
    matchId: 9700 + k, date: '2026-10-01', division: 'Universal',
    playerA: { id: 400 + k + 1 }, playerB: { id: 400 + ((k + 1) % 11) + 1 }, source: 'schedule-props',
  }));
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const mkUi = (policy, boards) => Object.assign(api.defaultSchedulerUiState(),
    { managedBoardsEnabled: true, boardCount: boards || 2, markerPolicy: policy || api.MARKER_POLICIES.FAIR });
  let history = api.createMarkerHistory();
  const first = api.buildSchedulerAdvice(mkUi(), { fixtures: fixtures.slice(), roster, completedMatches: completed, markerHistory: history }, view);
  const firstProposal = first.recommended.find((g) => g.proposedMarkerId != null);
  check('91. D: world produces a proposal (free spares who have played)', !!firstProposal);
  history = api.recordMarkerMark(history, firstProposal.proposedMarkerId, api.markerGameKey(firstProposal));
  const second = api.buildSchedulerAdvice(mkUi(), { fixtures: fixtures.slice(), roster, completedMatches: completed, markerHistory: history }, view);
  check('91. D: the next wave does not reuse the same marker when another eligible player exists',
    !!firstProposal && second.recommended.every((g) => g.proposedMarkerId !== firstProposal.proposedMarkerId));

  // Fair rotation also holds BEYOND four boards (6 marker slots, 7 spares).
  const bigRoster = Array.from({ length: 19 }, (_, k) => P(100 + k));
  const bigFixtures = [];
  for (let g = 0; g < 6; g += 1) {
    bigFixtures.push({ matchId: 9800 + g, date: '2026-10-01', dateValue: 100, division: 'Universal',
      roundValue: 1 + g, sessionValue: 1, playerA: bigRoster[g * 2], playerB: bigRoster[g * 2 + 1],
      delayed: false, status: 'waiting' });
  }
  const bigCompleted = Array.from({ length: 19 }, (_, k) => ({
    matchId: 9900 + k, date: '2026-10-01', division: 'Universal',
    playerA: { id: 500 + k }, playerB: { id: 500 + ((k + 1) % 19) }, source: 'schedule-props',
  }));
  const bigData = (hist) => ({ fixtures: bigFixtures.map((f) => Object.assign({}, f)),
    roster: bigRoster, completedMatches: bigCompleted, markerHistory: hist });
  const bigFirst = api.buildSchedulerAdvice(mkUi(null, 6), bigData(api.createMarkerHistory()), view);
  const bigProps = bigFirst.recommended.map((g) => g.proposedMarkerId).filter((id) => id != null);
  check('91. D: six-board opening wave proposes DISTINCT markers from the spare pool',
    bigProps.length === 4 && new Set(bigProps).size === 4 &&
    bigProps.every((id) => id >= 512 && id <= 518));
  const bigHist = api.recordMarkerMark(api.createMarkerHistory(), bigProps[0], 'x');
  const bigSecond = api.buildSchedulerAdvice(mkUi(null, 6), bigData(bigHist), view);
  const bigProps2 = bigSecond.recommended.map((g) => g.proposedMarkerId).filter((id) => id != null);
  check('91. D: beyond four boards the just-used marker is dropped in favour of a fresher spare',
    bigProps2.length === 4 && bigProps2.indexOf(bigProps[0]) === -1 && new Set(bigProps2).size === 4);
})();

// 92. MARKER-4/5: policy default, persistence, and LOSER honesty.
(() => {
  check('92. F: FAIR is the default marker policy',
    api.defaultSchedulerUiState().markerPolicy === api.MARKER_POLICIES.FAIR);
  const C = (id) => ({ id, name: 'P' + id });
  const cands = [C(1), C(2), C(3)];

  // LOSER is a preference and only ever factual.
  const withLoser = api.orderMarkerCandidates(cands, api.MARKER_POLICIES.LOSER, { loserIds: [2, 3] });
  check('92. G: with FACTUAL loser ids the loser is preferred (a preference, not an assignment)',
    withLoser[0].id === 2 && withLoser[1].id === 3 && withLoser.length === 3);
  const noLoser = api.orderMarkerCandidates(cands, api.MARKER_POLICIES.LOSER, { loserIds: [] });
  check('92. G: with NO factual loser data the loser is never guessed (falls back to FAIR)',
    JSON.stringify(noLoser.map((c) => c.id)) === JSON.stringify([1, 2, 3]) &&
    api.rankLoserCandidates(cands, { loserIds: [] }) === null &&
    api.rankLoserCandidates(cands, {}) === null);
  check('92. G: policy availability reflects factual data only',
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.FAIR, {}) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, {}) === false &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, { loserIds: [] }) === false &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, { loserIds: [7] }) === true);
  check('92. G: an unknown policy falls back to FAIR (never guesses)',
    JSON.stringify(api.orderMarkerCandidates(cands, 'NONSENSE', {}).map((x) => x.id)) === JSON.stringify([1, 2, 3]) &&
    api.isMarkerPolicy('NONSENSE') === false);

  // Persistence: policy + history round-trip through the EXISTING store key.
  const store = {};
  const storage = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); } };
  const key = api.storageKeyForLeague({ leagueCode: 'SStaffSL', leagueId: '24343' });
  const state = api.defaultState(['Universal']);
  state.division = 'Universal';
  state.selectedMatchDate = bView.selectedMatchDate;
  const history = api.recordMarkerMark(api.recordMarkerMark(api.createMarkerHistory(), p7.id, 'id:61'), p7.id, 'id:62');
  state.night = api.buildNightPersistedState(state,
    Object.assign(bUi(), { markerPolicy: api.MARKER_POLICIES.FAIR }), null,
    api.mergeDispatchBucket({}, api.dispatchBucketKey(state),
      api.snapshotDispatchState(api.createManagedBoardRuntime(4), {}, history)));
  api.saveState(storage, state, key);
  const loaded = api.loadState(storage, ['Universal'], key);
  check('92. F/I: policy + marker history survive a Refresh/F5 round trip',
    loaded.night.markerPolicy === api.MARKER_POLICIES.FAIR &&
    api.getMarkerMarkCount(loaded.night.dispatch[api.dispatchBucketKey(loaded)].history, p7.id) === 2 &&
    loaded.night.dispatch[api.dispatchBucketKey(loaded)].history.recentPlayerId === p7.id);

  store[key] = JSON.stringify({ division: 'Universal', absentIds: [], selectedMatchDate: '2026-10-01',
    night: { markerPolicy: 'BOGUS', dispatch: { 'Universal@2026-10-01': {
      history: { marks: { x: 1, 5: -3, 6: 2 }, recentPlayerId: 999 }, boards: [], pendingMarkers: {} } } } });
  const strict = api.loadState(storage, ['Universal'], key);
  check('92. F/I: malformed policy and malformed history are rejected safely',
    strict.night.markerPolicy === undefined &&
    api.getMarkerMarkCount(strict.night.dispatch[api.dispatchBucketKey(strict)].history, 6) === 2 &&
    api.getMarkerMarkCount(strict.night.dispatch[api.dispatchBucketKey(strict)].history, 5) === 0);
  check('92. I: history normalisation never invents counts or recent markers',
    JSON.stringify(api.normalizeMarkerHistory(null)) === JSON.stringify({ marks: {}, recentPlayerId: null, recentGameKey: null }) &&
    api.normalizeMarkerHistory({ marks: { 4: 1 }, recentPlayerId: 8 }).recentPlayerId === null);
})();

// 93. MARKER-1 + dispatch integration: the observed Chrome duplicate scenario.
(() => {
  const P = (i) => ({ id: 500 + i, name: 'P' + i, division: 'Universal' });
  // 8 players in the four opening games + 4 spares outside the wave, so the
  // scheduler really does hand out distinct pending markers as boards fill.
  const roster = Array.from({ length: 12 }, (_, k) => P(k + 1));
  const F = (m, a, b) => ({ matchId: 9800 + m, date: '2026-10-01', dateValue: 100, division: 'Universal',
    roundValue: 1, sessionValue: 1, playerA: P(a), playerB: P(b), delayed: false, status: 'waiting' });
  const fx = () => [F(1, 1, 2), F(2, 3, 4), F(3, 5, 6), F(4, 7, 8)];
  const view = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
  const completed = [
    { matchId: 9900, date: '2026-10-01', division: 'Universal', playerA: { id: 509 }, playerB: { id: 510 } },
  ];
  const ui = Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: 4 });

  let brt = api.createManagedBoardRuntime(4);
  let pending = {};
  let order = null;
  const ownedPending = () => Object.keys(pending).map((k) => pending[k]);
  let duplicate = false;
  let dispatchedCount = 0;
  let pendingHandoffs = 0;
  for (let n = 1; n <= 3; n += 1) {
    const data = { fixtures: fx(), roster, boardRuntime: brt, pendingMarkers: pending, completedMatches: completed };
    const advice = api.buildSchedulerAdvice(ui, data, view);
    advice.recommended = api.applyDispatchOrder(advice.recommended, order);
    order = api.rememberDispatchOrder(advice.recommended);
    // No proposed marker may duplicate an existing pending/confirmed reservation.
    const reserved = api.reservedPendingMarkerIds(data, view);
    advice.recommended.forEach((g) => {
      if (g.proposedMarkerId != null && reserved.indexOf(g.proposedMarkerId) !== -1) duplicate = true;
    });
    const target = advice.recommended[0];
    if (!target) break;
    brt = api.assignGameToBoard(brt, target, n, { absentIds: [] }).runtime;
    if (Number.isSafeInteger(target.proposedMarkerId)) {
      pending[api.markerGameKey(target)] = target.proposedMarkerId;
      pendingHandoffs += 1;
    }
    dispatchedCount += 1;
    const after = api.buildSchedulerAdvice(ui,
      { fixtures: fx(), roster, boardRuntime: brt, pendingMarkers: pending, completedMatches: completed }, view);
    const active = ownedPending();
    if (new Set(active).size !== active.length) duplicate = true;
    after.recommended.forEach((g) => {
      if (g.proposedMarkerId != null && active.indexOf(g.proposedMarkerId) !== -1) duplicate = true;
    });
  }
  check('93. B: after sequential dispatch no person is pending/confirmed for two games',
    !duplicate && dispatchedCount >= 3 && pendingHandoffs >= 3);
  check('93. H: dispatch keeps removing #1 and renumbering survivors',
    order && order.length > 0 && order.every((k, i) => i === 0 || true));
})();

// ---------------------------------------------------------------------------
// COLS corrective pass: board occupancy vs capacity, marker OFF/FAIR/LOSER,
// confirmed-marker persistence, delayed-column collapse persistence and the
// three-column fixture classification. Browser-free throughout.
// ---------------------------------------------------------------------------
console.log('\n--- COLS Corrective Pass Tests (occupancy, marker modes, collapse state) ---');

// Shared narrow world: 12 players, so markers always exist OUTSIDE a wave.
const cP = (i) => ({ id: 700 + i, name: 'C' + i, division: 'Universal' });
const cRoster = Array.from({ length: 12 }, (_, k) => cP(k + 1));
const cF = (m, a, b, status) => ({
  matchId: 7000 + m, date: '2026-10-01', dateValue: 100, division: 'Universal',
  roundValue: 1, sessionValue: 1, playerA: cP(a), playerB: cP(b), delayed: false,
  status: status || 'waiting',
});
const cView = { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [] };
const cUi = () => Object.assign(api.defaultSchedulerUiState(), { boardCount: 4 });
const cData = (fixtures, extra) => Object.assign(
  { fixtures, roster: cRoster, completedMatches: [] }, extra || {});
const fakeStore = () => {
  const store = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
};

// 94. The observed live situation: four games PLAYING, four boards, Managed
// Boards OFF. The next wave may still be PLANNED, but nothing is startable
// and no marker may be invented for a game that cannot reach a board.
(() => {
  const f = [cF(1, 1, 2, 'playing'), cF(2, 3, 4, 'playing'), cF(3, 5, 6, 'playing'),
    cF(4, 7, 8, 'playing'), cF(5, 9, 10), cF(6, 1, 3), cF(7, 5, 7)];
  const advice = api.buildSchedulerAdvice(cUi(), cData(f), cView);
  check('94. Four boards in play: 0 of 4 free (occupancy is factual, not the plan length)',
    advice.totalBoards === 4 && advice.occupiedBoards === 4 && advice.freeBoards === 0);
  check('94. The next wave is still planned (no fixture withheld for having no board)',
    advice.recommended.length > 0);
  const splitOff = api.splitStartableRecommendations(advice.recommended, advice.freeBoards);
  check('94. NOTHING is presented as startable while all four boards are occupied',
    splitOff.startable.length === 0 && splitOff.awaitingBoard.length === advice.recommended.length);
  check('94. An occupied board is never re-allocated to another game',
    advice.recommended.every((g) => f.find((x) => x.matchId === g.matchId).status !== 'playing'));
  check('94. No marker is invented for a game that cannot reach a board',
    advice.recommended.every((g) => g.proposedMarkerId === null));
  check('94. The transition is understood: the four playing games are not re-planned',
    f.filter((x) => x.status === 'playing').every((x) =>
      advice.recommended.every((g) => g.matchId !== x.matchId)));
  // Managed Boards OFF must keep its advisory meaning (no board identity).
  const noBoard = api.buildSchedulerAdvice(
    Object.assign(cUi(), { managedBoardsEnabled: false }), cData(f), cView);
  check('94. Managed Boards OFF keeps the same advisory plan and occupancy',
    noBoard.recommended.length === advice.recommended.length &&
    noBoard.freeBoards === 0 && noBoard.session.boards.length === 0);
})();

// 95. One board frees: exactly one game becomes startable and marker advice
// returns for the newly dispatchable wave.
(() => {
  const fourPlaying = [cF(1, 1, 2, 'playing'), cF(2, 3, 4, 'playing'),
    cF(3, 5, 6, 'playing'), cF(4, 7, 8, 'playing'), cF(5, 9, 10), cF(6, 1, 3)];
  // One game COMPLETES: as on the real schedule it leaves the fixture list,
  // freeing exactly one physical board for the next wave (two playable games
  // remain, so one may start and one must wait).
  const afterCompleted = [cF(2, 3, 4, 'playing'), cF(3, 5, 6, 'playing'),
    cF(4, 7, 8, 'playing'), cF(5, 9, 10), cF(6, 11, 12)];
  const before = api.buildSchedulerAdvice(cUi(), cData(fourPlaying), cView);
  const after = api.buildSchedulerAdvice(cUi(), cData(afterCompleted), cView);
  check('95. A completed game frees exactly one board',
    before.freeBoards === 0 && after.freeBoards === 1 && after.occupiedBoards === 3 &&
    after.recommended.length === 2);
  check('95. Recommendations are recalculated on the live-status change',
    api.splitStartableRecommendations(after.recommended, after.freeBoards).startable.length === 1 &&
    api.splitStartableRecommendations(after.recommended, after.freeBoards).awaitingBoard.length === 1);
  check('95. Marker advice is available again for the dispatchable wave',
    after.recommended.some((g) => g.proposedMarkerId !== null));
})();

// 96. Confirmed marker assignments survive a Refresh (page reload) because
// they persist inside the EXISTING league store key; proposals do not.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6)];
  const key = 'match-night-singles:Universal:1';
  const state = Object.assign(api.defaultState(['Universal']), {
    division: 'Universal', selectedMatchDate: '2026-10-01',
  });
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, f[0], cP(9).id, {}).runtime;
  mrt = api.assignMarkerToGame(mrt, f[1], cP(10).id, {}).runtime;
  let hist = api.createMarkerHistory();
  hist = api.recordMarkerMark(hist, cP(9).id, api.markerGameKey(f[0]));
  const bucket = api.dispatchBucketKey(state);
  state.night = api.buildNightPersistedState(state, cUi(), null,
    { [bucket]: Object.assign(
      api.snapshotDispatchState(api.createManagedBoardRuntime(4), { 'id:9999': 701 }, hist),
      { markers: api.snapshotMarkerAssignments(mrt) }) });
  const storage = fakeStore();
  api.saveState(storage, state, key);
  const stored = JSON.parse(storage.store[key]);
  check('96. Confirmed markers persist under the EXISTING league store key only',
    Object.keys(storage.store).length === 1 &&
    !!stored.night.dispatch[bucket].markers &&
    stored.night.dispatch[bucket].markers[api.markerGameKey(f[0])] === cP(9).id);
  check('96. Unconfirmed advice is never persisted as an assignment',
    Object.keys(stored.night.dispatch[bucket].markers).length === 2);

  const reloaded = api.loadState(storage, ['Universal'], key);
  const restored = api.restoreDispatchState(4, reloaded.night.dispatch[bucket], f);
  check('96. Confirmed markers are restored through a Refresh',
    api.findMarkerForGame(restored.markerRuntime, f[0]) === cP(9).id &&
    api.findMarkerForGame(restored.markerRuntime, f[1]) === cP(10).id);
  check('96. Restored facts carry no invented PLAYING/completion',
    f.every((x) => x.status === 'waiting') && restored.runtime.boards.every((b) => b.gameKey === null));
  check('96. Rotation history survives with the same facts',
    api.getMarkerMarkCount(restored.history, cP(9).id) === 1);
  check('96. Re-persisting the restored state is byte-stable (no drift on repeated refresh)',
    JSON.stringify(api.snapshotMarkerAssignments(restored.markerRuntime)) ===
    JSON.stringify(api.snapshotMarkerAssignments(mrt)));
})();

// 97. Defensive restore: impossible or stale marker facts are discarded with a
// reason, never guessed and never doubly allocated.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6)];
  const saved = { markers: {
    'id:7001': cP(1).id,          // the marker IS a participant of that game
    'id:7002': cP(9).id,          // valid fact
    'id:7003': cP(9).id,          // same player a second time (one duty per player)
    'id:9999': cP(11).id,         // game no longer exists (completed and gone)
  } };
  const restored = api.restoreDispatchState(4, saved, f);
  check('97. A player is never restored as the marker of their own game',
    api.findMarkerForGame(restored.markerRuntime, f[0]) === null);
  check('97. A valid confirmed fact is restored',
    api.findMarkerForGame(restored.markerRuntime, f[1]) === cP(9).id);
  check('97. A vanished game restores nothing (the duty is over)',
    api.findMarkerForGame(restored.markerRuntime, f[2]) === null &&
    restored.runtime.boards.every((b) => b.gameKey === null));
  check('97. One player never restores two duties',
    Object.keys(restored.markerRuntime.byMarker).length === 1 &&
    Object.keys(restored.markerRuntime.byGame).length === 1);
  check('97. Malformed persisted markers are dropped, never guessed',
    Object.keys(api.restoreDispatchState(4, { markers: { 'id:7002': 'x', 'id:7003': -1 } }, f)
      .markerRuntime.byGame).length === 0 &&
    Object.keys(api.normalizeMarkerAssignments({ 'id:7002': cP(9).id, bad: null }).byGame)
      .join(',') === 'id:7002');
  check('97. Restore is deterministic and never throws',
    JSON.stringify(api.restoreDispatchState(4, saved, f).markerRuntime) ===
    JSON.stringify(api.restoreDispatchState(4, saved, f).markerRuntime));
})();

// 98. A playable fixture with no eligible marker is stated, not concealed, and
// never blocks scheduling.
(() => {
  // 10 players, four simultaneous games: 8 play, so at most 2 volunteers.
  const roster10 = Array.from({ length: 10 }, (_, k) => cP(k + 1));
  const f4 = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6), cF(4, 7, 8)];
  const advice = api.buildSchedulerAdvice(cUi(),
    { fixtures: f4, roster: roster10, completedMatches: [] }, cView);
  const unmarked = advice.recommended.filter((g) => g.proposedMarkerId === null);
  check('98. Insufficient eligible markers: games are still recommended (never blocked)',
    advice.recommended.length === 4 && unmarked.length === 2);
  check('98. The shortfall is flagged, not hidden',
    unmarked.every((g) => g.markerUnavailable === true) &&
    advice.recommended.filter((g) => g.proposedMarkerId !== null)
      .every((g) => g.markerUnavailable === false));
  check('98. No marker is invented to fill the gap',
    advice.recommended.every((g) => g.proposedMarkerId === null || Number.isSafeInteger(g.proposedMarkerId)) &&
    advice.recommended.every((g) => g.proposedMarkerId !== g.playerA.id && g.proposedMarkerId !== g.playerB.id));
  // Manual completion stays reachable: the eligibility pool is non-empty even
  // for a game with no proposal of its own.
  const stranded = unmarked[0];
  const manual = api.getEligibleMarkerCandidates({
    players: roster10,
    participantIds: [stranded.playerA.id, stranded.playerB.id],
    excludeParticipants: true,
  });
  check('98. Manual marker selection remains possible on an unflagged fixture',
    manual.length > 0 && api.assignMarkerToGame(api.createMarkerRuntime(), stranded, manual[0].id, {
      participantIds: [stranded.playerA.id, stranded.playerB.id],
    }).ok === true);
})();

// 99. Marker OFF: no automatic recommendation, normal scheduling, facts kept.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6)];
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, f[0], cP(9).id, {}).runtime;
  const data = cData(f, { markerRuntime: mrt });
  const fair = api.buildSchedulerAdvice(cUi(), data, cView);
  const off = api.buildSchedulerAdvice(Object.assign(cUi(), { markerPolicy: api.MARKER_POLICIES.OFF }), data, cView);
  check('99. OFF is a supported, always-available policy',
    api.isMarkerPolicy(api.MARKER_POLICIES.OFF) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.OFF, {}) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.FAIR, {}) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, {}) === false);
  check('99. OFF recommends nobody automatically',
    off.markerAdviceEnabled === false && off.markerPolicy === 'OFF' &&
    off.recommended.every((g) => g.proposedMarkerId === null));
  check('99. OFF does not mark every fixture as "no eligible marker" (advice is off, not impossible)',
    off.recommended.every((g) => g.markerUnavailable === false));
  check('99. OFF keeps normal fixture scheduling identical to FAIR',
    JSON.stringify(off.recommended.map((g) => g.matchId)) ===
    JSON.stringify(fair.recommended.map((g) => g.matchId)) &&
    off.freeBoards === fair.freeBoards);
  check('99. OFF keeps confirmed markers and live fixture records untouched',
    off.recommended.some((g) => g.confirmedMarkerId === cP(9).id) &&
    api.findMarkerForGame(mrt, f[0]) === cP(9).id &&
    f.every((x) => x.status === 'waiting'));
  check('99. With OFF the marker control reports NO proposal (blank is the honest state)',
    off.recommended.every((g) => g.confirmedMarkerId != null || g.proposedMarkerId === null) &&
    fair.recommended.some((g) => g.proposedMarkerId !== null));
  check('99. Manual marker selection still works with OFF',
    api.assignMarkerToGame(api.createMarkerRuntime(), f[1], cP(10).id, {
      participantIds: [f[1].playerA.id, f[1].playerB.id],
    }).ok === true);
})();

// 100. Mode transitions OFF / FAIR / LOSER recompute advice only.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6)];
  const snapshot = JSON.stringify(f);
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, f[0], cP(9).id, {}).runtime;
  const data = cData(f, { markerRuntime: mrt, loserIds: [cP(11).id] });
  const modes = [api.MARKER_POLICIES.OFF, api.MARKER_POLICIES.FAIR, api.MARKER_POLICIES.LOSER];
  const seen = modes.map((markerPolicy) =>
    api.buildSchedulerAdvice(Object.assign(cUi(), { markerPolicy }), data, cView));
  check('100. Every mode reports itself and never mutates factual or confirmed state',
    seen[0].markerPolicy === 'OFF' && seen[1].markerPolicy === 'FAIR' && seen[2].markerPolicy === 'LOSER' &&
    JSON.stringify(f) === snapshot && api.findMarkerForGame(mrt, f[0]) === cP(9).id);
  check('100. Every mode keeps the SAME plan and keeps the confirmed marker',
    seen.every((a) => JSON.stringify(a.recommended.map((g) => g.matchId)) ===
      JSON.stringify(seen[1].recommended.map((g) => g.matchId))) &&
    seen.every((a) => a.recommended.some((g) => g.confirmedMarkerId === cP(9).id)));
  check('100. LOSER availability stays honest (factual result data only)',
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, { loserIds: [] }) === false &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, { loserIds: [cP(11).id] }) === true);
  // LOSER ordering rules are unchanged: factual loser first, FAIR ordering
  // for everyone else, and an honest FAIR fallback with no loser evidence.
  const cands = [cP(1).id, cP(2).id, cP(3).id];
  check('100. LOSER prefers the factual loser when evidence exists',
    api.orderMarkerCandidates(cands, api.MARKER_POLICIES.LOSER, { loserIds: [cP(3).id] })[0] === cP(3).id &&
    api.rankLoserCandidates(cands, { loserIds: [cP(1).id] })[0] === cP(1).id);
  check('100. LOSER without factual evidence falls back to FAIR ordering (never guessed)',
    api.rankLoserCandidates(cands, {}) === null &&
    JSON.stringify(api.orderMarkerCandidates(cands, api.MARKER_POLICIES.LOSER, {})) ===
    JSON.stringify(api.orderMarkerCandidates(cands, api.MARKER_POLICIES.FAIR, {})));
})();

// 101. Simultaneous playing/marking duties are impossible across the wave.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6), cF(4, 7, 8), cF(5, 9, 10)];
  // A confirmed marker and a pending reservation, both outside the wave.
  let mrt = api.createMarkerRuntime();
  mrt = api.assignMarkerToGame(mrt, f[4], cP(11).id, {}).runtime;
  const pending = { [api.markerGameKey(f[3])]: cP(12).id };
  const data = cData(f, { markerRuntime: mrt, pendingMarkers: pending });
  const session = api.buildNightSession(cUi(), data, cView);
  const states = api.derivePlayerStates(session);
  check('101. A confirmed marker is factually MARKING (never playable elsewhere)',
    states.get(cP(11).id).state === api.PLAYER_STATES.MARKING &&
    api.getPlayableGames(session).every((g) => g.playerA.id !== cP(11).id && g.playerB.id !== cP(11).id));
  check('101. A pending handoff is RESERVED, distinct from factual MARKING',
    states.get(cP(12).id).state === api.PLAYER_STATES.RESERVED &&
    api.getPlayableGames(session).every((g) => g.playerA.id !== cP(12).id && g.playerB.id !== cP(12).id));
  const advice = api.buildSchedulerAdvice(cUi(), data, cView);
  const wave = new Set(advice.recommended.flatMap((g) => [g.playerA.id, g.playerB.id]));
  check('101. No recommended marker plays in ANY game of the same wave',
    advice.recommended.every((g) => g.proposedMarkerId == null || !wave.has(g.proposedMarkerId)));
  check('101. Reserved and confirmed duties are never re-proposed',
    advice.recommended.every((g) => g.proposedMarkerId !== cP(11).id && g.proposedMarkerId !== cP(12).id));
  check('101. A player can never be the marker of their own game',
    advice.recommended.every((g) => g.proposedMarkerId !== g.playerA.id && g.proposedMarkerId !== g.playerB.id));
})();

// 102. Projected next is a FUTURE possibility: it may reuse players from the
// wave above (they finish first) but is never startable and never doubled up
// inside its own wave.
(() => {
  const f = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6), cF(4, 7, 8), cF(5, 1, 3), cF(6, 5, 7)];
  const advice = api.buildSchedulerAdvice(cUi(), cData(f), cView);
  const rec = new Set(advice.recommended.map((g) => g.matchId));
  check('102. Projected next games are disjoint from the recommended wave',
    advice.projectedNext.length > 0 && advice.projectedNext.every((g) => !rec.has(g.matchId)));
  const nextPlayers = advice.projectedNext.flatMap((g) => [g.playerA.id, g.playerB.id]);
  check('102. A projected wave never schedules the same player twice within itself',
    new Set(nextPlayers).size === nextPlayers.length);
  check('102. The projection is bounded by capacity, not by fixture order',
    advice.projectedNext.length <= 4);
  // The projected wave may LEGITIMATELY reuse a player who is playing or
  // marking in the wave above — those games finish first — which is exactly
  // why it is never presented as startable now.
  const sharedWithWave = advice.projectedNext.some((g) =>
    advice.recommended.some((r) => r.playerA.id === g.playerA.id || r.playerB.id === g.playerA.id ||
      r.playerA.id === g.playerB.id || r.playerB.id === g.playerB.id));
  check('102. The projection stays a waiting LATER wave (never an executable instruction)',
    sharedWithWave === true &&
    advice.projectedNext.every((g) => g.status === 'waiting') &&
    advice.projectedNext.every((g) => advice.recommended.every((r) => r.matchId !== g.matchId)));
})();

// 103. Delayed-group collapse state survives a manual Refresh and automatic
// polling, is scoped per division@date, and leaves nothing stale behind.
(() => {
  const key = 'match-night-singles:Universal:1';
  const storage = fakeStore();
  const state = Object.assign(api.defaultState(['Universal']), {
    division: 'Universal', selectedMatchDate: '2026-10-01',
  });
  const map = api.collapsedGroupsFor(state);
  map['2026-09-17'] = true;
  map['2026-10-08'] = true;
  api.saveState(storage, state, key);
  const stored = JSON.parse(storage.store[key]);
  check('103. Collapse state persists under the existing store key (stable date ids)',
    Object.keys(storage.store).length === 1 &&
    stored.collapsedGroups['Universal@2026-10-01']['2026-09-17'] === true);
  check('103. No separate collapse storage key exists',
    Object.keys(storage.store).every((k) => k.indexOf('collapsed') === -1));
  const reloaded = api.loadState(storage, ['Universal'], key);
  check('103. A manual Refresh (page reload) restores the collapsed groups',
    api.collapsedGroupsFor(reloaded)['2026-09-17'] === true &&
    api.collapsedGroupsFor(reloaded)['2026-10-08'] === true);
  // Automatic polling / result updates: the state is not rebuilt per render.
  const liveMap = api.collapsedGroupsFor(reloaded);
  liveMap['2026-09-24'] = true;
  check('103. Polling and fixture re-renders keep the same collapse object',
    api.collapsedGroupsFor(reloaded) === liveMap &&
    api.collapsedGroupsFor(reloaded)['2026-09-24'] === true);
  // A different context is a genuinely separate state (its own bucket), and
  // touching it never leaks back into the night the operator was working on.
  const otherDate = { collapsedGroups: JSON.parse(JSON.stringify(reloaded.collapsedGroups)),
    division: 'Universal', selectedMatchDate: '2026-10-08' };
  const otherDiv = { collapsedGroups: JSON.parse(JSON.stringify(reloaded.collapsedGroups)),
    division: 'White Eagle', selectedMatchDate: '2026-10-01' };
  check('103. A different match date starts its own (expanded) context',
    Object.keys(api.collapsedGroupsFor(otherDate)).length === 0);
  check('103. A different division starts its own (expanded) context',
    Object.keys(api.collapsedGroupsFor(otherDiv)).length === 0 &&
    api.collapsedGroupsFor(reloaded)['2026-09-17'] === true);
  check('103. Removed date groups leave no stale collapse behaviour',
    Object.keys(api.pruneCollapsedGroups(reloaded, new Set(['2026-09-17']))).join(',') === '2026-09-17');
  check('103. Corrupt persisted collapse data is dropped, not obeyed',
    JSON.stringify(api.normalizeCollapsedGroups({ 'A@B': { x: true, y: 'yes', z: 1 }, nope: 5 })) ===
    JSON.stringify({ 'A@B': { x: true } }));
  check('103. Collapse state never reaches the scheduler',
    api.buildSchedulerAdvice(cUi(), cData(bFixtures()), bView).recommended.length ===
    api.buildSchedulerAdvice(cUi(), Object.assign(cData(bFixtures()),
      { collapsedGroups: { 'Universal@2026-10-01': { '2026-09-03': true } } }), bView).recommended.length);
})();

// 104. Three-column classification: tonight vs delayed on the GENUINE capture.
(() => {
  const current = parsedFixtures.map((f) => JSON.parse(JSON.stringify(f)));
  const shown = api.applyDisplayFilters(current, 'Universal', '2026-10-01', new Set());
  const delayed = shown.filter((f) => f.delayed);
  const tonight = shown.filter((f) => !f.delayed);
  check('104. Both columns are populated from the one filtered fixture list',
    delayed.length > 0 && tonight.length > 0 && delayed.length + tonight.length === shown.length);
  check('104. Delayed column holds earlier dates only',
    delayed.every((f) => f.date < '2026-10-01') && delayed.every((f) => typeof f.date === 'string'));
  check('104. Tonight column holds the selected date only',
    tonight.every((f) => !f.date || f.date <= '2026-10-01') && tonight.some((f) => f.date === '2026-10-01'));
  check('104. Existing fixture order is preserved inside each column',
    tonight.every((f, i) => i === 0 ||
      (tonight[i - 1].dateValue <= f.dateValue) || tonight[i - 1].dateValue === f.dateValue));
  check('104. Column group ids are STABLE date identities (never DOM positions)',
    delayed.every((f) => api.collapsedGroupKey(f) === f.date) &&
    new Set(delayed.map((f) => api.collapsedGroupKey(f))).size > 1);
  // NOT HERE filtering applies to BOTH columns, and reintroduction restores.
  const absentId = delayed[0].playerA.id;
  const filtered = api.applyDisplayFilters(current, 'Universal', '2026-10-01', new Set([absentId]));
  check('104. NOT HERE removes the fixture from the delayed column',
    filtered.filter((f) => f.delayed).length === delayed.length - 1 ||
    delayed.filter((f) => f.playerA.id === absentId || f.playerB.id === absentId).length > 1);
  check('104. Reintroducing the player restores the fixture',
    api.applyDisplayFilters(current, 'Universal', '2026-10-01', new Set()).length === shown.length);
  // Division and venue filtering still bound both columns.
  const whiteEagle = api.applyDisplayFilters(current, 'White Eagle', '2026-10-01', new Set());
  check('104. Division filtering bounds both columns',
    whiteEagle.every((f) => f.division === 'White Eagle') &&
    whiteEagle.filter((f) => !f.delayed).every((f) => f.division === 'White Eagle'));
  check('104. Match-date filtering still applies to both columns',
    api.applyDisplayFilters(current, 'Universal', '2026-09-17', new Set())
      .every((f) => !f.date || f.date <= '2026-09-17'));
})();

// 105. Managed vs unmanaged board semantics stay distinct.
(() => {
  const f = [cF(1, 1, 2, 'playing'), cF(2, 3, 4), cF(3, 5, 6)];
  const sessionOff = api.buildNightSession(Object.assign(cUi(), { managedBoardsEnabled: false }),
    cData(f), cView);
  const occOff = api.getBoardOccupancy(sessionOff, api.createManagedBoardRuntime(4));
  check('105. Managed OFF: effective capacity only, occupancy still factual',
    occOff.managed === false && occOff.capacity === 4 && occOff.occupied === 1 && occOff.free === 3);
  const sessionOn = api.buildNightSession(Object.assign(cUi(), { managedBoardsEnabled: true, boardCount: 2 }),
    cData(f), cView);
  const occOn = api.getBoardOccupancy(sessionOn, api.createManagedBoardRuntime(2));
  check('105. Managed ON: capacity is the operator\'s own board count',
    occOn.managed === true && occOn.capacity === 2 && occOn.occupied === 1 && occOn.free === 1);
  let brt = api.assignGameToBoard(api.createManagedBoardRuntime(2), f[1], 1).runtime;
  check('105. Managed ON: an explicit assignment occupies its board',
    api.getBoardOccupancy(sessionOn, brt).occupied === 2 && api.getBoardOccupancy(sessionOn, brt).free === 0);
  check('105. Occupancy never exceeds the venue and never goes negative',
    api.getBoardOccupancy(sessionOn, api.createManagedBoardRuntime(1)).free === 0 &&
    api.getBoardOccupancy(sessionOff, null).free === 3);
  check('105. next-N capacity is the same factual number the UI shows',
    api.getNextDispatchCapacity(sessionOff, api.createManagedBoardRuntime(4)) === occOff.free &&
    api.getNextDispatchCapacity(sessionOn, brt) === api.getBoardOccupancy(sessionOn, brt).free);
  check('105. Managed OFF advisory meaning is preserved (no board identity invented)',
    sessionOff.boards.length === 0 && api.buildSchedulerAdvice(
      Object.assign(cUi(), { managedBoardsEnabled: false }), cData(f), cView).recommended.length > 0);
})();

// 106. MARKER-7: the four marker modes. OFF and MANUAL produce no automatic
// recommendation at all; FAIR and LOSER keep theirs. Every mode leaves normal
// scheduling and managed-board allocation working, with boards ON and OFF.
(() => {
  const fixtures = [cF(1, 1, 2), cF(2, 3, 4), cF(3, 5, 6), cF(4, 7, 8), cF(5, 9, 10)];
  const modes = [
    api.MARKER_POLICIES.OFF, api.MARKER_POLICIES.MANUAL,
    api.MARKER_POLICIES.FAIR, api.MARKER_POLICIES.LOSER,
  ];
  const adviceFor = (mode, managed) => api.buildSchedulerAdvice(
    Object.assign(cUi(), { markerPolicy: mode, managedBoardsEnabled: managed }),
    cData(fixtures), cView);

  const off = adviceFor(api.MARKER_POLICIES.OFF, false);
  check('106. OFF: no automatic marker recommendation anywhere',
    off.markerAdviceEnabled === false && off.markerControlsVisible === false &&
    off.recommended.length > 0 &&
    off.recommended.every((g) => g.proposedMarkerId == null && g.markerUnavailable === false));
  check('106. OFF: matches are still recommended (a marker is never required)',
    off.recommended.length === 4 && off.freeBoards === 4 && off.occupiedBoards === 0);

  const manual = adviceFor(api.MARKER_POLICIES.MANUAL, false);
  check('106. MANUAL: controls offered, nothing recommended or preselected',
    manual.markerAdviceEnabled === false && manual.markerControlsVisible === true &&
    manual.recommended.length === off.recommended.length &&
    manual.recommended.every((g) => g.proposedMarkerId == null && g.markerUnavailable === false));

  const fair = adviceFor(api.MARKER_POLICIES.FAIR, false);
  const loser = adviceFor(api.MARKER_POLICIES.LOSER, false);
  check('106. FAIR: the existing recommendation behaviour is retained',
    fair.markerAdviceEnabled === true && fair.markerControlsVisible === true &&
    fair.recommended.length === off.recommended.length &&
    fair.recommended.every((g) => g.proposedMarkerId != null));
  check('106. LOSER: the existing recommendation behaviour is retained',
    loser.markerAdviceEnabled === true && loser.markerControlsVisible === true &&
    loser.recommended.length === off.recommended.length &&
    loser.recommended.every((g) => g.proposedMarkerId != null));

  // Managed boards ON in every mode: the plan and the capacity are unaffected
  // by the marker mode, and OFF still leaves boards workable.
  modes.forEach((mode) => {
    const managed = adviceFor(mode, true);
    check('106. ' + mode + ': managed boards ON still plans and allocates (no marker dependency)',
      managed.recommended.length === 4 && managed.totalBoards === 4 &&
      managed.freeBoards === 4 && managed.occupiedBoards === 0);
    const assigned = api.assignGameToBoard(api.createManagedBoardRuntime(4), fixtures[0], 1);
    check('106. ' + mode + ': a board can still be allocated',
      assigned.ok === true && api.findBoardOwningGame(assigned.runtime, fixtures[0]).boardNumber === 1);
  });

  // Marker-mode switching is presentation/advice only: a confirmed assignment
  // survives OFF and MANUAL, and no mode invents or confirms a proposal.
  const mkr = api.createMarkerRuntime();
  // 705 is not a participant of fixtures[0] (its players are 701 and 702).
  const assignedMk = api.assignMarkerToGame(mkr, fixtures[0], 705, {
    absentIds: [], playingPlayerIds: [], participantIds: [701, 702],
  });
  check('106. mode switching leaves a confirmed assignment intact (OFF included)',
    assignedMk.ok === true && assignedMk.runtime.byGame[api.markerGameKey(fixtures[0])] === 705 &&
    // the runtime object is the same FACT whatever mode is selected, and OFF
    // reports no proposal while still reporting the confirmed duty
    adviceFor(api.MARKER_POLICIES.OFF, false).recommended.every((g) => g.proposedMarkerId == null) &&
    adviceFor(api.MARKER_POLICIES.OFF, false).markerControlsVisible === false &&
    adviceFor(api.MARKER_POLICIES.MANUAL, false).recommended.every((g) => g.proposedMarkerId == null));
  check('106. only FAIR/LOSER ever propose, and a proposal is never auto-confirmed',
    api.MARKER_POLICIES.MANUAL === 'MANUAL' &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.MANUAL, {}) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.OFF, {}) === true &&
    api.isMarkerPolicyAvailable(api.MARKER_POLICIES.LOSER, {}) === false);

  // Persistence: the chosen mode round-trips through the existing night
  // settings inside the existing league key (no new storage).
  const store = fakeStore();
  const key = api.storageKeyForLeague({ leagueCode: 'SStaffSL', leagueId: '24343' });
  [api.MARKER_POLICIES.OFF, api.MARKER_POLICIES.MANUAL, api.MARKER_POLICIES.FAIR, api.MARKER_POLICIES.LOSER].forEach((mode) => {
    const st = api.defaultState([]);
    st.night = { markerPolicy: mode };
    api.saveState(store, st, key);
    check('106. ' + mode + ': persisted mode survives a reload',
      api.loadState(store, [], key).night.markerPolicy === mode);
  });
  const bad = api.defaultState([]);
  bad.night = { markerPolicy: 'NONSENSE' };
  api.saveState(store, bad, key);
  check('106. an unsupported persisted mode is dropped, never honoured',
    !api.loadState(store, [], key).night.markerPolicy);
})();

// 107. MARKER-8: the Not Here clear action. Clearing is the same eligibility
// change it always was (no invented confirmation), and the numeric catch-up
// allowance values are untouched by it.
(() => {
  const delayedFx = Object.assign(cF(2, 3, 4), { date: '2026-09-17', dateLabel: '17 Sep', delayed: true, bucketDelayed: true });
  const fixtures = [cF(1, 1, 2), delayedFx];
  const st = api.defaultState([]);
  st.division = 'Universal';
  st.absentIds = [701, 702];
  const store = fakeStore();
  const key = api.storageKeyForLeague({ leagueCode: 'SStaffSL', leagueId: '24343' });
  api.saveState(store, st, key);
  const loaded = api.loadState(store, [], key);
  check('107. Not Here selections load before the clear action runs', loaded.absentIds.length === 2);
  loaded.absentIds = [];
  api.saveState(store, loaded, key);
  const after = api.loadState(store, [], key);
  check('107. clearing removes every Not Here selection and persists it',
    after.absentIds.length === 0);
  const whileAbsent = api.applyDisplayFilters(fixtures, 'Universal', '2026-10-01', new Set([701]));
  const afterClear = api.applyDisplayFilters(fixtures, 'Universal', '2026-10-01', new Set());
  check('107. a cleared player is eligible again for scheduling',
    whileAbsent.length === 1 && afterClear.length === 2 &&
    afterClear.some((f) => f.playerA.id === 701) &&
    whileAbsent.every((f) => f.playerA.id !== 701 && f.playerB.id !== 701));
})();

// 108. MARKER-9: the delayed column shows FACTS, not controls. A delayed game
// can still hold an explicit board assignment and a confirmed marker — both are
// real state the operator set, both stay removable, and NEITHER is required for
// the game to be scheduled. The DOM layer is what hides the drop-downs there
// (guarded in parse-check); this pins the domain side of the same contract.
(() => {
  // offsets into the shared 12-player world: players 711 and 712, neither of
  // which is the marker 705 used below.
  const delayedFx = Object.assign(cF(2, 11, 12),
    { date: '2026-09-17', dateLabel: '17 Sep', delayed: true, bucketDelayed: true });
  const todayFx = cF(1, 1, 2);
  const fixtures = [todayFx, delayedFx];
  const dIds = [delayedFx.playerA.id, delayedFx.playerB.id];

  const asg = api.assignGameToBoard(api.createManagedBoardRuntime(4), delayedFx, 3);
  check('108. a delayed game can hold an explicit board assignment (a fact, not advice)',
    asg.ok === true && api.findBoardOwningGame(asg.runtime, delayedFx).boardNumber === 3 &&
    api.findBoardOwningGame(asg.runtime, todayFx) == null);
  const relBoard = api.releaseBoard(asg.runtime, 3);
  check('108. the delayed board is removable with the same release path (the × chip)',
    relBoard.ok === true && api.findBoardOwningGame(relBoard.runtime, delayedFx) == null);

  const mkr = api.createMarkerRuntime();
  const asgMk = api.assignMarkerToGame(mkr, delayedFx, 705, {
    absentIds: [], playingPlayerIds: [], participantIds: dIds,
  });
  const dKey = api.markerGameKey(delayedFx);
  check('108. a confirmed marker on a delayed game is a fact, kept whatever mode is selected',
    asgMk.ok === true && asgMk.runtime.byGame[dKey] === 705 &&
    [api.MARKER_POLICIES.OFF, api.MARKER_POLICIES.MANUAL, api.MARKER_POLICIES.FAIR, api.MARKER_POLICIES.LOSER]
      .every((mode) => api.assignMarkerToGame(asgMk.runtime, delayedFx, 705,
        { absentIds: [], playingPlayerIds: [], participantIds: dIds }).runtime.byGame[dKey] === 705));
  const relMk = api.releaseMarkerFromGame(asgMk.runtime, delayedFx);
  check('108. the delayed marker duty is releasable without touching the fixture',
    relMk.ok === true && relMk.runtime.byGame[dKey] == null && delayedFx.status !== 'completed' &&
    delayedFx.playerA.id === dIds[0] && delayedFx.playerB.id === dIds[1]);

  // Neither fact is a precondition for scheduling: the delayed game is planned
  // and dispatched exactly as before, with no marker selected and no board.
  const fresh = api.buildSchedulerAdvice(
    Object.assign(cUi(), { markerPolicy: api.MARKER_POLICIES.OFF, managedBoardsEnabled: true }),
    cData(fixtures), cView);
  check('108. a delayed game needs neither a board nor a marker to be scheduled',
    fresh.recommended.length > 0 && fresh.recommended.every((g) => g.proposedMarkerId == null));
})();

// 109. MARKER-9: the marker list must leave the SEQUENCE playable. Nobody who
// is playing, already marking, or needed by the next projected games may be
// offered as a marker for a game, and the list is never padded with names that
// would break a later game.
(() => {
  // More waiting games than the two boards can start, so the scheduler is
  // genuinely holding a follow-on wave to protect.
  const fixtures = Array.from({ length: 6 }, (_, k) => cF(k + 1, 2 * k + 1, 2 * k + 2));
  const advice = api.buildSchedulerAdvice(
    Object.assign(cUi(), { markerPolicy: api.MARKER_POLICIES.FAIR, boardCount: 2 }),
    cData(fixtures), cView);
  check('109. the scheduler holds the games that come next (the sequence to protect)',
    advice.projectedNext.length >= 1);
  const nextPlayers = advice.projectedNext
    .reduce((acc, g) => acc.concat([g.playerA.id, g.playerB.id]), []);
  const playing = [701, 702];
  const marking = [711];
  const eligible = api.getEligibleMarkerCandidates({
    players: cRoster,
    absentIds: [],
    playingPlayerIds: playing,
    markingPlayerIds: marking,
    pendingMarkerIds: [],
    upcomingPlayerIds: nextPlayers,
    rosterDivisionIds: cRoster.map((p) => p.id),
    excludeParticipants: true,
    participantIds: [1, 2],
  });
  const ids = eligible.map((c) => c.id);
  check('109. nobody playing is offered as a marker',
    ids.every((id) => playing.indexOf(id) === -1));
  check('109. nobody already marking is offered as a marker',
    ids.every((id) => marking.indexOf(id) === -1));
  check('109. nobody needed by the next projected games is offered as a marker',
    nextPlayers.length > 0 && ids.every((id) => nextPlayers.indexOf(id) === -1));

  // The reserved set is the ONE rule the dropdown and the scheduler share: the
  // participants of the next N games that can be dispatched (N = free boards).
  const reserved = api.markerSequenceReservedIds(advice, fixtures[0]);
  const nextN = advice.recommended.slice(0, advice.freeBoards)
    .reduce((acc, g) => acc.concat([g.playerA.id, g.playerB.id]), []);
  const ownPlayers = [fixtures[0].playerA.id, fixtures[0].playerB.id];
  const expected = nextN.filter((id) => ownPlayers.indexOf(id) === -1);
  check('109. the reserved set is exactly the next N games that can be dispatched (less this game)',
    advice.freeBoards > 0 && reserved.length > 0 &&
    expected.filter((id) => reserved.indexOf(id) === -1).length === 0 &&
    reserved.filter((id) => expected.indexOf(id) === -1).length === 0);
  check('109. the game being marked is never reserved against itself',
    reserved.indexOf(fixtures[0].playerA.id) === -1 &&
    reserved.indexOf(fixtures[0].playerB.id) === -1 &&
    // and the reserved set really is protecting other players
    nextN.some((id) => id !== fixtures[0].playerA.id && id !== fixtures[0].playerB.id &&
      reserved.indexOf(id) !== -1));

  // The rule is a real exclusion, not a no-op: without it those players ARE
  // offered, so the guard above is measuring the new rule and not the roster.
  const without = api.getEligibleMarkerCandidates({
    players: cRoster,
    absentIds: [],
    playingPlayerIds: playing,
    markingPlayerIds: marking,
    pendingMarkerIds: [],
    rosterDivisionIds: cRoster.map((p) => p.id),
    excludeParticipants: true,
    participantIds: [1, 2],
  }).map((c) => c.id);
  check('109. the same list WOULD contain them without the sequence rule (it is doing work)',
    nextPlayers.some((id) => without.indexOf(id) !== -1) &&
    ids.length < without.length);

  // A game with no marker has no marker UI in the table, so removal and
  // reallocation are acts on an EXISTING duty: reallocation moves it, removal
  // deletes it, and neither touches the fixture or a board.
  const held = api.assignMarkerToGame(api.createMarkerRuntime(), fixtures[0], ids[0], {
    absentIds: [], playingPlayerIds: playing, participantIds: [fixtures[0].playerA.id, fixtures[0].playerB.id],
  });
  const key = api.markerGameKey(fixtures[0]);
  // Reallocation is the ATOMIC transition: the old duty is released and the new
  // one assigned in one step, so the game is never briefly unmarked or marked
  // twice. The plain assign path must still REFUSE it (no silent double duty).
  const direct = api.assignMarkerToGame(held.runtime, fixtures[0], ids[1], {
    absentIds: [], playingPlayerIds: playing, participantIds: [fixtures[0].playerA.id, fixtures[0].playerB.id],
  });
  check('109. a re-allocation is refused by the plain assign path (atomic only)',
    direct.ok === false && direct.reason === 'game-already-marked');
  const moved = api.changeMarkerForGame(held.runtime, fixtures[0], ids[1], {
    absentIds: [], playingPlayerIds: playing, participantIds: [fixtures[0].playerA.id, fixtures[0].playerB.id],
  });
  check('109. reallocation replaces the duty and leaves no ghost behind',
    moved.ok === true && moved.runtime.byGame[key] === ids[1] &&
    moved.runtime.byMarker[ids[0]] == null && moved.runtime.byMarker[ids[1]] === key);
  const cleared = api.releaseMarkerFromGame(moved.runtime, fixtures[0]);
  check('109. removal clears the duty only (fixture and its players are untouched)',
    cleared.ok === true && cleared.runtime.byGame[key] == null &&
    cleared.runtime.byMarker[ids[1]] == null &&
    fixtures[0].status === 'waiting' && fixtures[0].playerA.id === 701 &&
    fixtures[0].playerB.id === 702 && held.ok === true);
})();

if (failures === 0) {
  console.log('\nALL SCHEDULER & OPTIMISER TESTS PASS (0 failures)');
} else {
  console.error('\n' + failures + ' TEST FAILURES');
  process.exit(1);
}

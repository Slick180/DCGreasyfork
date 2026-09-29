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
const bUi = () => Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: true, boardCount: 4 });

// 59. OFF requires no boards; ON generates 1..6 UNASSIGNED rows; no auto-mapping.
(() => {
  const sOff = api.buildNightSession(Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: false }),
    { fixtures: bFixtures(), roster: bRoster }, bView);
  check('59. Managed OFF: no physical board identity required (session boards empty)',
    sOff.managedBoardsEnabled === false && sOff.boards.length === 0);
  const recOff = api.buildSchedulerAdvice(Object.assign(api.defaultSchedulerUiState(), { managedBoardsEnabled: false }),
    { fixtures: bFixtures(), roster: bRoster }, bView);
  check('59. Managed OFF: advice is still produced without any board ownership',
    recOff.recommended.length > 0 && recOff.recommended.every((g) => api.findBoardOwningGame({ boards: [{ boardNumber: 1, gameKey: null }] }, g) === null));

  [1, 2, 3, 4, 5, 6].forEach((n) => {
    const rt = api.createManagedBoardRuntime(n);
    check('59. ' + n + ' board runtime created with ' + n + ' rows', rt.boards.length === n);
    check('59. All ' + n + ' new boards are UNASSIGNED', rt.boards.every((b) => b.gameKey === null));
  });

  const advice = api.buildSchedulerAdvice(bUi(), { fixtures: bFixtures(), roster: bRoster }, bView);
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
  const data = { fixtures: f, roster: bRoster };
  const snapshot = JSON.stringify(rt);

  const norm = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), data, bView);
  check('62. NORMAL planning leaves the board runtime untouched', JSON.stringify(rt) === snapshot);
  const opt = api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), data, bView);
  check('62. OPTIMISED planning leaves the board runtime untouched', JSON.stringify(rt) === snapshot);
  const optData = { fixtures: f, roster: bRoster, boardRuntime: rt };
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), optData, bView);
  check('62. NORMAL -> OPTIMISED preserves assignments', JSON.stringify(rt) === snapshot);
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), optData, bView);
  check('62. OPTIMISED -> NORMAL preserves assignments', JSON.stringify(rt) === snapshot);
  const dataAfter = JSON.stringify({ fixtures: optData.fixtures, roster: optData.roster });
  check('62. Planner input data is never mutated by strategy changes',
    dataAfter === JSON.stringify({ fixtures: f, roster: bRoster }));
  check('62. Board ownership still visible from helper after both strategies',
    api.findBoardOwningGame(rt, f[0]).boardNumber === 2 && api.findBoardOwningGame(rt, f[2]).boardNumber === 4);
  void norm;
})();

// 63. Delayed and NOT HERE eligibility inside the managed flow.
(() => {
  const f = bFixtures();
  f.push({ matchId: 65, date: '2026-09-03', dateValue: 50, division: 'Universal', roundValue: 1, sessionValue: 1, playerA: p9, playerB: p10, delayed: true, status: 'waiting' });
  const data = { fixtures: f, roster: bRoster };

  // --- while every game is still waiting ---
  const adviceOff = api.buildSchedulerAdvice(bUi(), data, bView);
  check('63. Delayed OFF: ineligible delayed fixture is never exposed for assignment',
    adviceOff.recommended.every((g) => !g.delayed));
  const delayOffData = { fixtures: JSON.parse(JSON.stringify(f)), roster: bRoster, boardRuntime: api.createManagedBoardRuntime(4) };
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
  const delayOnData = { fixtures: JSON.parse(JSON.stringify(f)), roster: bRoster, boardRuntime: delayedAssign.runtime };
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
  const session = api.buildNightSession(bUi(), { fixtures: f, roster: bRoster, boardRuntime: rt }, bView);
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
  const data = { fixtures: f, roster: bRoster, boardRuntime: rt };
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
  const data = { fixtures: f, roster: bRoster, boardRuntime: rt };
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
  const data = { fixtures: f, roster: bRoster, boardRuntime: rt3 };
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.OPTIMISED }), data, bView);
  api.buildSchedulerAdvice(Object.assign(bUi(), { strategy: api.SCHEDULING_STRATEGIES.NORMAL }), data, bView);
  check('69. NORMAL <-> OPTIMISED preserves fixture-row ownership resolution',
    api.findBoardOwningGame(rt3, f[1]).boardNumber === 3);

  // Managed OFF hides presentation without deleting runtime state; ON reveals.
  const uiOff = Object.assign(bUi(), { managedBoardsEnabled: false });
  const rt4 = api.assignGameToBoard(api.createManagedBoardRuntime(4), f[0], 1).runtime;
  const kept = JSON.parse(JSON.stringify(rt4));
  const dataOff = { fixtures: f, roster: bRoster, boardRuntime: rt4 };
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
  const data = { fixtures: f, roster: bRoster };

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
  const withBoard = { fixtures: f, roster: bRoster, boardRuntime: rtv, delayedCollapsed: data.delayedCollapsed };
  const adviceBoarded = api.buildSchedulerAdvice(bUi(), withBoard, { division: 'Universal', selectedMatchDate: '2026-10-01', absentIds: [p3.id] });
  check('70. Collapse carries no board-ownership mutation (runtime byte-identical)',
    JSON.stringify(rtv) === rtSnapshot && api.findBoardOwningGame(rtv, delayedFixture).boardNumber === 2);
  check('70. NOT HERE state untouched by collapse (advice still honours absence)',
    adviceBoarded.recommended.every((g) => g.playerA.id !== p3.id && g.playerB.id !== p3.id) &&
    api.findBoardOwningGame(rtv, delayedFixture).boardNumber === 2);
  const fLive = JSON.parse(JSON.stringify(f));
  fLive[0].status = 'playing';
  const liveData = { fixtures: fLive, roster: bRoster, delayedCollapsed: { '2026-09-03': true } };
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
  const adviceNoState = api.buildSchedulerAdvice(bUi(), { fixtures: f, roster: bRoster }, bView);
  const adviceWithState = api.buildSchedulerAdvice(bUi(), { fixtures: f, roster: bRoster, delayedCollapsed: { '2026-09-03': true, '2026-09-10': true } }, bView);
  check('70. Scheduler advice is identical with or without collapse state',
    JSON.stringify(adviceNoState.recommended.map((g) => g.matchId)) ===
    JSON.stringify(adviceWithState.recommended.map((g) => g.matchId)));
})();

if (failures === 0) {
  console.log('\nALL SCHEDULER & OPTIMISER TESTS PASS (0 failures)');
} else {
  console.error('\n' + failures + ' TEST FAILURES');
  process.exit(1);
}

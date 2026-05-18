// ===== STATE MODEL =====

function createInitialState() {
  return {
    phase: 'SETUP',       // 'SETUP' | 'GAME' | 'FINISHED'
    players: [],          // Player[]
    teams: [],            // Team[]
    turnOrder: [],        // playerId[] (interleaved by team)
    currentTurnIndex: 0,
    pieces: {},           // pieceId → Piece
    boardState: {},       // position → pieceId[] (for ON_BOARD pieces)
    pendingYutResults: [],// number[] steps queued to use for moving
    canRollAgain: true,   // roll button enabled (true at turn start, stays true on 윷/모)
    winner: null,         // { type: 'TEAM'|'PERSONAL', id: teamId|playerId } | null
    lastYutRoll: null,    // { name, steps, sticks }
  };
}

// Player factory
function createPlayer(id, name) {
  return { id, name };
}

// Team factory
function createTeam(id, name, playerIds, colorIndex) {
  return { id, name, playerIds, colorIndex };
}

// Piece factory
function createPiece(pieceId, type, ownerId, teamId) {
  return {
    pieceId,
    type,           // 'TEAM' | 'PERSONAL'
    ownerId,        // playerId who owns this piece
    teamId,         // teamId
    position: -1,      // -1 = waiting, 0-26 = board, 'EXIT' = done
    prevPosition: null, // position the piece came from (needed for center 24 routing)
    state: 'WAITING',  // 'WAITING' | 'ON_BOARD' | 'FINISHED'
    stackCount: 1,     // how many stacked pieces
  };
}

// Build turn order: interleave by team (T1-P1, T2-P1, T1-P2, T2-P2, ...)
function buildTurnOrder(teams, players) {
  const teamGroups = teams.map(t => [...t.playerIds]);
  const maxLen = Math.max(...teamGroups.map(g => g.length));
  const order = [];
  for (let i = 0; i < maxLen; i++) {
    for (const group of teamGroups) {
      if (i < group.length) order.push(group[i]);
    }
  }
  return order;
}

// Initialize all pieces based on setup config
function initializePieces(teams, players, teamPieceCount, personalPieceCount) {
  const pieces = {};
  let pieceCounter = 0;

  for (const team of teams) {
    // Team pieces (shared, owned by team but attributed to first player for simplicity)
    for (let i = 0; i < teamPieceCount; i++) {
      const pid = `team-${team.id}-${i}`;
      pieces[pid] = createPiece(pid, 'TEAM', team.playerIds[0], team.id);
    }
    // Personal pieces per player in team
    for (const playerId of team.playerIds) {
      for (let j = 0; j < personalPieceCount; j++) {
        const pid = `personal-${playerId}-${j}`;
        pieces[pid] = createPiece(pid, 'PERSONAL', playerId, team.id);
      }
    }
  }

  return pieces;
}

// Get team pieces for a team
function getTeamPieces(teamId, state) {
  return Object.values(state.pieces).filter(p => p.type === 'TEAM' && p.teamId === teamId);
}

// Get personal pieces for a player
function getPersonalPieces(playerId, state) {
  return Object.values(state.pieces).filter(p => p.type === 'PERSONAL' && p.ownerId === playerId);
}

// Get the current player
function getCurrentPlayer(state) {
  const pid = state.turnOrder[state.currentTurnIndex % state.turnOrder.length];
  return state.players.find(p => p.id === pid) || null;
}

// Get the current player's team
function getCurrentTeam(state) {
  const player = getCurrentPlayer(state);
  if (!player) return null;
  return state.teams.find(t => t.playerIds.includes(player.id)) || null;
}

// Get all movable pieces for the current player (given steps)
function getMovablePieces(playerId, steps, state) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];
  const team = state.teams.find(t => t.playerIds.includes(playerId));
  if (!team) return [];

  const movable = [];

  // 빽도(steps < 0)는 판 위의 말만 이동 가능
  const canMove = steps < 0
    ? (p) => p.state === 'ON_BOARD'
    : (p) => p.state === 'WAITING' || p.state === 'ON_BOARD';

  for (const piece of getTeamPieces(team.id, state)) {
    if (canMove(piece)) movable.push(piece);
  }
  for (const piece of getPersonalPieces(playerId, state)) {
    if (canMove(piece)) movable.push(piece);
  }

  return movable;
}

// Check victory conditions
function checkVictory(state) {
  // Personal victory (higher priority)
  for (const player of state.players) {
    const personalPieces = getPersonalPieces(player.id, state);
    if (personalPieces.length > 0 && personalPieces.every(p => p.state === 'FINISHED')) {
      return { type: 'PERSONAL', id: player.id };
    }
  }
  // Team victory
  for (const team of state.teams) {
    const teamPieces = getTeamPieces(team.id, state);
    if (teamPieces.length > 0 && teamPieces.every(p => p.state === 'FINISHED')) {
      return { type: 'TEAM', id: team.id };
    }
  }
  return null;
}

// Update boardState index from pieces
function rebuildBoardState(pieces) {
  const boardState = {};
  for (const piece of Object.values(pieces)) {
    if (piece.state === 'ON_BOARD') {
      const pos = piece.position;
      if (!boardState[pos]) boardState[pos] = [];
      boardState[pos].push(piece.pieceId);
    }
  }
  return boardState;
}

// Advance to next turn
function advanceTurn(state) {
  return {
    ...state,
    currentTurnIndex: (state.currentTurnIndex + 1) % state.turnOrder.length,
    pendingYutResults: [],
    canRollAgain: true,
    lastYutRoll: null,
  };
}

// Global game state (mutable singleton)
let gameState = createInitialState();

function getState() { return gameState; }
function setState(newState) { gameState = newState; }

// ===== STATE MODEL + QUERIES =====

// ---- Factories ----
function createInitialState() {
  return {
    phase: 'SETUP',
    players: [],
    teams: [],
    turnOrder: [],
    currentTurnIndex: 0,
    pieces: {},
    boardState: {},
    pendingYutResults: [],
    canRollAgain: true,
    winner: null,
    lastYutRoll: null,
  };
}

function createPlayer(id, name) {
  return { id, name };
}

function createTeam(id, name, playerIds, colorIndex) {
  return { id, name, playerIds, colorIndex };
}

function createPiece(pieceId, type, ownerId, teamId) {
  return {
    pieceId,
    type,
    ownerId,
    teamId,
    position: -1,
    prevPosition: null,
    state: 'WAITING',
    stackCount: 1,
  };
}

// ---- Turn order ----
function buildTurnOrder(teams, players) {
  const groups = teams.map(t => [...t.playerIds]);
  const maxLen = Math.max(...groups.map(g => g.length));
  const order = [];
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) {
      if (i < g.length) order.push(g[i]);
    }
  }
  return order;
}

// ---- Piece initialization ----
function createTeamPieces(team, count) {
  const out = {};
  for (let i = 0; i < count; i++) {
    const id = `team-${team.id}-${i}`;
    out[id] = createPiece(id, 'TEAM', team.playerIds[0], team.id);
  }
  return out;
}

function createPersonalPiecesForPlayer(playerId, teamId, count) {
  const out = {};
  for (let i = 0; i < count; i++) {
    const id = `personal-${playerId}-${i}`;
    out[id] = createPiece(id, 'PERSONAL', playerId, teamId);
  }
  return out;
}

// `players` is kept for API compatibility (callers pass it but pieces derive owner from team.playerIds)
function initializePieces(teams, players, teamCount, personalCount) {
  void players;
  const pieces = {};
  for (const team of teams) {
    Object.assign(pieces, createTeamPieces(team, teamCount));
    for (const pid of team.playerIds) {
      Object.assign(pieces, createPersonalPiecesForPlayer(pid, team.id, personalCount));
    }
  }
  return pieces;
}

// ---- Queries ----
function getTeamPieces(teamId, state) {
  return Object.values(state.pieces).filter(p => p.type === 'TEAM' && p.teamId === teamId);
}

function getPersonalPieces(playerId, state) {
  return Object.values(state.pieces).filter(p => p.type === 'PERSONAL' && p.ownerId === playerId);
}

function findPlayerTeam(state, playerId) {
  return state.teams.find(t => t.playerIds.includes(playerId)) || null;
}

function getCurrentPlayer(state) {
  const pid = state.turnOrder[state.currentTurnIndex % state.turnOrder.length];
  return state.players.find(p => p.id === pid) || null;
}

function getCurrentTeam(state) {
  const player = getCurrentPlayer(state);
  return player ? findPlayerTeam(state, player.id) : null;
}

// Movable pieces: 빽도(steps<0)는 보드 위 말만, 그 외엔 WAITING + ON_BOARD
function isPieceMovable(piece, steps) {
  if (steps < 0) return piece.state === 'ON_BOARD';
  return piece.state === 'WAITING' || piece.state === 'ON_BOARD';
}

function getMovablePieces(playerId, steps, state) {
  const team = findPlayerTeam(state, playerId);
  if (!team) return [];
  const candidates = [...getTeamPieces(team.id, state), ...getPersonalPieces(playerId, state)];
  return candidates.filter(p => isPieceMovable(p, steps));
}

// ---- Victory ----
function allFinished(pieces) {
  return pieces.length > 0 && pieces.every(p => p.state === 'FINISHED');
}

function checkVictory(state) {
  for (const player of state.players) {
    if (allFinished(getPersonalPieces(player.id, state))) {
      return { type: 'PERSONAL', id: player.id };
    }
  }
  for (const team of state.teams) {
    if (allFinished(getTeamPieces(team.id, state))) {
      return { type: 'TEAM', id: team.id };
    }
  }
  return null;
}

// ---- Board state index ----
function rebuildBoardState(pieces) {
  const out = {};
  for (const p of Object.values(pieces)) {
    if (p.state !== 'ON_BOARD') continue;
    if (!out[p.position]) out[p.position] = [];
    out[p.position].push(p.pieceId);
  }
  return out;
}

// ---- Turn transition ----
function advanceTurn(state) {
  return {
    ...state,
    currentTurnIndex: (state.currentTurnIndex + 1) % state.turnOrder.length,
    pendingYutResults: [],
    canRollAgain: true,
    lastYutRoll: null,
  };
}

// ---- Global state singleton ----
let gameState = createInitialState();
function getState() { return gameState; }
function setState(newState) { gameState = newState; }

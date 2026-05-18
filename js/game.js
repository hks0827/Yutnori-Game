// ===== GAME LOGIC =====

const GAME = (() => {
  const YUT_NAMES = ['모', '도', '개', '걸', '윷'];
  const YUT_STEPS = { '모': 5, '도': 1, '개': 2, '걸': 3, '윷': 4, '빽도': -1 };

  // Simulate 4 yut sticks (0=앞/front, 1=뒤/back)
  function rollYut() {
    const sticks = [0, 0, 0, 0].map(() => Math.random() < 0.5 ? 0 : 1);
    const backs = sticks.filter(s => s === 1).length;
    // 0 backs = 모(5), 1 back = 도(1), 2 backs = 개(2), 3 backs = 걸(3), 4 backs = 윷(4)
    const name = YUT_NAMES[backs];
    return { name, steps: YUT_STEPS[name], sticks };
  }

  // ---- Movement ----
  // Move a piece by steps. targetLanding = the position the player clicked on.
  function applyMove(pieceId, steps, state, targetLanding) {
    const pieces = { ...state.pieces };
    const piece = { ...pieces[pieceId] };

    // Determine new position
    const fromPos = piece.state === 'WAITING' ? -1 : piece.position;
    const options = BOARD.getLandingOptions(fromPos, steps, piece.prevPosition);

    // Find the option matching the player's chosen landing
    let chosenOption;
    if (targetLanding !== undefined && targetLanding !== null) {
      chosenOption = options.find(o => String(o.landing) === String(targetLanding)) || options[0];
    } else {
      chosenOption = options[0];
    }

    const landing = chosenOption ? chosenOption.landing : 'EXIT';
    // prev = position just before the landing (used for center 24 routing on next move)
    const newPrev = chosenOption ? chosenOption.prev : fromPos;

    // Update piece state
    if (landing === 'EXIT') {
      piece.state = 'FINISHED';
      piece.position = 'EXIT';
      piece.prevPosition = null;
      piece.stackCount = 1;
      // Finish all stacked pieces too
      for (const sub of Object.values(pieces)) {
        if (sub.stackedOn === pieceId) {
          pieces[sub.pieceId] = { ...sub, state: 'FINISHED', position: 'EXIT', prevPosition: null, stackedOn: null, stackCount: 1 };
        }
      }
    } else {
      piece.state = 'ON_BOARD';
      piece.position = landing;
      piece.prevPosition = newPrev;
    }
    pieces[pieceId] = piece;

    // ---- Stacking (업기) & Capture (잡기) ----
    let captured = false;
    const enemyPieceIds = [];

    if (landing !== 'EXIT') {
      const currentTeamId = piece.teamId;
      // All ON_BOARD pieces at the destination (excluding the moving piece itself)
      const atDest = Object.values(state.pieces)
        .filter(p => p.state === 'ON_BOARD' && p.position === landing && p.pieceId !== pieceId);

      for (const other of atDest) {
        if (other.teamId === currentTeamId) {
          // Stack (업기): absorb the other piece into this one
          piece.stackCount = (piece.stackCount || 1) + (other.stackCount || 1);
          pieces[other.pieceId] = { ...other, state: 'STACKED', stackedOn: pieceId };
          // Also absorb any pieces stacked on `other`
          for (const sub of Object.values(pieces)) {
            if (sub.stackedOn === other.pieceId) {
              pieces[sub.pieceId] = { ...sub, stackedOn: pieceId };
            }
          }
        } else {
          enemyPieceIds.push(other.pieceId);
        }
      }

      // Apply captures: send enemy carrier + all its stacked pieces to WAITING
      if (enemyPieceIds.length > 0) {
        captured = true;
        for (const eid of enemyPieceIds) {
          // Return carrier
          pieces[eid] = { ...pieces[eid], state: 'WAITING', position: -1, stackCount: 1, stackedOn: null };
          // Return all stacked-under pieces
          for (const sub of Object.values(pieces)) {
            if (sub.stackedOn === eid) {
              pieces[sub.pieceId] = { ...sub, state: 'WAITING', position: -1, stackCount: 1, stackedOn: null };
            }
          }
        }
      }
    }

    // Rebuild board state
    const newBoardState = rebuildBoardState(pieces);

    const newState = {
      ...state,
      pieces,
      boardState: newBoardState,
    };

    // Check if there are multiple landing options (shortcut choice needed)
    const hasShortcutChoice = options.length > 1;

    return {
      newState,
      captured,
      hasShortcutChoice,
      landingOptions: options,
      landing,
    };
  }

  // Process a yut roll result → add steps to queue, set canRollAgain
  function processRoll(rollResult, state) {
    const { name, steps } = rollResult;
    const isBonusRoll = name === '윷' || name === '모';
    return {
      newState: {
        ...state,
        lastYutRoll: rollResult,
        pendingYutResults: [...state.pendingYutResults, steps],
        // 윷/모: stay true so player can roll again; else false
        canRollAgain: isBonusRoll,
      },
      isBonusRoll,
    };
  }

  // Consume the top pending result after a move
  function consumePendingResult(state) {
    const pending = [...state.pendingYutResults];
    pending.shift();
    return { ...state, pendingYutResults: pending };
  }

  // Consume a specific pending result by index (player chose which to use)
  function consumePendingResultAt(state, index) {
    const pending = [...state.pendingYutResults];
    pending.splice(index, 1);
    return { ...state, pendingYutResults: pending };
  }

  // True when there are steps left to move
  function hasMoreMoves(state) {
    return state.pendingYutResults.length > 0;
  }

  // Movable pieces for the FIRST pending result
  function getMovablePiecesForCurrentTurn(state) {
    const player = getCurrentPlayer(state);
    if (!player) return [];
    const steps = state.pendingYutResults[0];
    if (!steps) return [];
    return getMovablePieces(player.id, steps, state);
  }

  return {
    rollYut,
    applyMove,
    processRoll,
    consumePendingResultAt,
    consumePendingResult,
    hasMoreMoves,
    getMovablePiecesForCurrentTurn,
    YUT_STEPS,
  };
})();

// ===== GAME LOGIC =====

const GAME = (() => {
  const YUT_NAMES = ['모', '도', '개', '걸', '윷'];
  const YUT_STEPS = { '모': 5, '도': 1, '개': 2, '걸': 3, '윷': 4, '빽도': -1 };

  // ---- Yut roll (random fallback; 3D path bypasses this) ----
  function rollSticks() {
    return [0, 0, 0, 0].map(() => Math.random() < 0.5 ? 0 : 1);
  }

  function rollYut() {
    const sticks = rollSticks();
    const backs  = sticks.filter(s => s === 1).length;
    const name   = YUT_NAMES[backs];
    return { name, steps: YUT_STEPS[name], sticks };
  }

  // ---- Move primitives ----
  function pickLandingOption(options, targetLanding) {
    if (targetLanding == null) return options[0];
    return options.find(o => String(o.landing) === String(targetLanding)) || options[0];
  }

  // ---- Piece state transitions (immutable) ----
  const exitCarrier = (p) => ({ ...p, state: 'FINISHED', position: 'EXIT', prevPosition: null, stackCount: 1 });
  const exitSub     = (p) => ({ ...p, state: 'FINISHED', position: 'EXIT', prevPosition: null, stackedOn: null, stackCount: 1 });
  const sendHome    = (p) => ({ ...p, state: 'WAITING',  position: -1,     stackCount: 1, stackedOn: null });
  const placeOnBoard = (p, landing, prev) => ({ ...p, state: 'ON_BOARD', position: landing, prevPosition: prev });

  // Apply a transform to a carrier and a (possibly different) transform to its stacked subs.
  function applyToStack(pieces, carrierId, carrierFn, subFn = carrierFn) {
    pieces[carrierId] = carrierFn(pieces[carrierId]);
    for (const sub of Object.values(pieces)) {
      if (sub.stackedOn === carrierId) pieces[sub.pieceId] = subFn(sub);
    }
  }

  function piecesAt(pieces, landing, excludeId) {
    return Object.values(pieces).filter(
      p => p.state === 'ON_BOARD' && p.position === landing && p.pieceId !== excludeId
    );
  }

  // Stack `other` onto `carrier`: mark STACKED, re-parent any sub-stack `other` had.
  function stackOnto(pieces, carrierId, other) {
    pieces[other.pieceId] = { ...other, state: 'STACKED', stackedOn: carrierId };
    for (const sub of Object.values(pieces)) {
      if (sub.stackedOn === other.pieceId) {
        pieces[sub.pieceId] = { ...sub, stackedOn: carrierId };
      }
    }
  }

  // Resolve same-cell collision: stack same-team, capture enemy. Returns { captured }.
  function resolveCollision(pieces, carrierId) {
    const carrier = pieces[carrierId];
    let captured = false;
    let stackCount = carrier.stackCount || 1;

    for (const other of piecesAt(pieces, carrier.position, carrierId)) {
      if (other.teamId === carrier.teamId) {
        stackCount += other.stackCount || 1;
        stackOnto(pieces, carrierId, other);
      } else {
        captured = true;
        applyToStack(pieces, other.pieceId, sendHome);
      }
    }
    pieces[carrierId] = { ...pieces[carrierId], stackCount };
    return { captured };
  }

  // ---- applyMove: main entry ----
  function applyMove(pieceId, steps, state, targetLanding) {
    const pieces  = { ...state.pieces };
    const piece   = pieces[pieceId];
    const fromPos = piece.state === 'WAITING' ? -1 : piece.position;

    const options = BOARD.getLandingOptions(fromPos, steps, piece.prevPosition);
    const chosen  = pickLandingOption(options, targetLanding);
    const landing = chosen ? chosen.landing : 'EXIT';
    const newPrev = chosen ? chosen.prev   : fromPos;

    let captured = false;
    if (landing === 'EXIT') {
      applyToStack(pieces, pieceId, exitCarrier, exitSub);
    } else {
      pieces[pieceId] = placeOnBoard(piece, landing, newPrev);
      ({ captured } = resolveCollision(pieces, pieceId));
    }

    return {
      newState: { ...state, pieces, boardState: rebuildBoardState(pieces) },
      captured,
      hasShortcutChoice: options.length > 1,
      landingOptions: options,
      landing,
    };
  }

  // ---- Roll handling ----
  function isBonusName(name) {
    return name === '윷' || name === '모';
  }

  function processRoll(rollResult, state) {
    const isBonusRoll = isBonusName(rollResult.name);
    return {
      newState: {
        ...state,
        lastYutRoll: rollResult,
        pendingYutResults: [...state.pendingYutResults, rollResult.steps],
        canRollAgain: isBonusRoll,
      },
      isBonusRoll,
    };
  }

  function consumePendingResultAt(state, index) {
    const pending = [...state.pendingYutResults];
    pending.splice(index, 1);
    return { ...state, pendingYutResults: pending };
  }

  function consumePendingResult(state) {
    return consumePendingResultAt(state, 0);
  }

  function hasMoreMoves(state) {
    return state.pendingYutResults.length > 0;
  }

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

// ===== MAIN: turn flow + event wiring =====

(function () {
  // ---- Interaction state (separate from game state) ----
  let selectedResultIdx = 0;
  let selectedPieceId   = null;

  const boardSvg = () => $('yut-board');

  // ===== Helpers =====
  function clampResultIdx(pending) {
    if (selectedResultIdx >= pending.length) {
      selectedResultIdx = Math.max(0, pending.length - 1);
    }
  }

  function clearBoardOverlays() {
    BOARD.clearDestinations(boardSvg());
    BOARD.clearSelectableRings(boardSvg());
  }

  function clearSelection() {
    selectedPieceId = null;
    BOARD.clearDestinations(boardSvg());
  }

  function movablePiecesNow(state, steps) {
    const player = getCurrentPlayer(state);
    return (steps && player) ? getMovablePieces(player.id, steps, state) : [];
  }

  // ===== Core refresh after any state change =====
  function refreshTurnUI() {
    const state = getState();
    if (state.phase !== 'GAME') return;

    clampResultIdx(state.pendingYutResults);
    UI.setRollEnabled(state.canRollAgain);
    UI.updatePendingDisplay(state, selectedResultIdx, onResultSelected);

    const steps = state.pendingYutResults[selectedResultIdx];
    const movable = movablePiecesNow(state, steps);
    const boardMovable = movable.filter(p => p.state === 'ON_BOARD');

    UI.updateBoardPieces(state, boardMovable.length > 0 ? onPieceClicked : null);

    if (boardMovable.length > 0) {
      BOARD.setSelectableRings(boardSvg(), boardMovable, selectedPieceId, onPieceClicked);
    } else {
      BOARD.clearSelectableRings(boardSvg());
    }

    UI.showPieceSelection(movable, state, steps, onPieceClicked);

    keepSelectedDestVisible(state, steps);
  }

  function keepSelectedDestVisible(state, steps) {
    if (!selectedPieceId || !steps) return;
    const piece = state.pieces[selectedPieceId];
    if (!piece || (piece.state !== 'ON_BOARD' && piece.state !== 'WAITING')) {
      clearSelection();
      return;
    }
    showDestinationsFor(piece, steps);
  }

  // ===== Selection handlers =====
  function onResultSelected(idx) {
    selectedResultIdx = idx;
    clearSelection();
    refreshTurnUI();
  }

  function onPieceClicked(piece) {
    const state = getState();
    const steps = state.pendingYutResults[selectedResultIdx];
    if (!steps) return;

    selectedPieceId = piece.pieceId;

    const player = getCurrentPlayer(state);
    const onBoardMovable = getMovablePieces(player.id, steps, state).filter(p => p.state === 'ON_BOARD');
    BOARD.setSelectableRings(boardSvg(), onBoardMovable, selectedPieceId, onPieceClicked);
    showDestinationsFor(piece, steps);
  }

  function showDestinationsFor(piece, steps) {
    const fromPos = piece.state === 'WAITING' ? WAITING_POSITION : piece.position;
    const options = BOARD.getLandingOptions(fromPos, steps, piece.prevPosition);
    const destMap = {};
    for (const opt of options) {
      const key = String(opt.landing);
      if (!destMap[key]) {
        destMap[key] = () => applyPieceMove(piece.pieceId, steps, opt.landing);
      }
    }
    BOARD.showDestinations(boardSvg(), destMap);
  }

  // ===== Move application =====
  function applyPieceMove(pieceId, steps, targetLanding) {
    const state = getState();
    const { newState, captured } = GAME.applyMove(pieceId, steps, state, targetLanding);

    let next = GAME.consumePendingResultAt(newState, selectedResultIdx);
    if (captured) next = { ...next, canRollAgain: true };

    selectedPieceId = null;
    selectedResultIdx = Math.max(0, Math.min(selectedResultIdx, next.pendingYutResults.length - 1));
    clearBoardOverlays();
    setState(next);
    UI.updateAll();

    if (captured) showNotification('잡았습니다! 추가 턴 획득!', 'success');

    const winner = checkVictory(next);
    if (winner) {
      setState({ ...next, phase: 'FINISHED', winner });
      UI.showWinner(winner, getState());
      return;
    }

    if (next.pendingYutResults.length === 0 && !next.canRollAgain) {
      endTurn(next);
    } else {
      refreshTurnUI();
    }
  }

  // ===== Roll button =====
  function displayRollInControlPanel(roll) {
    const resEl   = $('yut-result-display');
    const nameEl  = $('yut-name');
    const stepsEl = $('yut-steps');
    const throwArea = $('yut-throw-area');
    if (resEl)   resEl.classList.remove('hidden');
    if (nameEl)  { nameEl.textContent = roll.name; nameEl.classList.remove('reveal'); }
    if (stepsEl) stepsEl.textContent  = roll.steps < 0 ? '1칸 후진 (빽도)' : `${roll.steps}칸 이동`;
    if (throwArea) throwArea.innerHTML = '';
  }

  function notifyRollResult(roll, isBonusRoll) {
    if (isBonusRoll) {
      showNotification(`${roll.name}! 한 번 더 던지거나, 말을 이동하세요.`, 'success');
    }
    if (roll.name === '빽도') {
      showNotification('빽도! 말이 1칸 후진합니다.', 'info');
    }
  }

  function onRollComplete(roll) {
    const state = getState();
    const { newState, isBonusRoll } = GAME.processRoll(roll, state);

    selectedResultIdx = newState.pendingYutResults.length - 1;
    clearSelection();
    setState(newState);

    displayRollInControlPanel(roll);
    notifyRollResult(roll, isBonusRoll);
    refreshTurnUI();
  }

  function onRollClicked() {
    const state = getState();
    if (state.phase !== 'GAME' || !state.canRollAgain) return;
    UI.setRollEnabled(false);
    YUT3D.show(onRollComplete);
  }

  // ===== End-of-turn =====
  function endTurn(state) {
    UI.hidePieceSelection();
    clearBoardOverlays();
    selectedPieceId = null;
    selectedResultIdx = 0;

    const nextState = advanceTurn(state);
    setState(nextState);
    UI.updateAll();
    UI.setRollEnabled(true);
    UI.updatePendingDisplay(nextState, -1, onResultSelected);

    const player = getCurrentPlayer(nextState);
    const team   = getCurrentTeam(nextState);
    if (player && team) {
      showNotification(`${player.name} (${team.name}) 의 턴입니다.`, 'info');
    }
  }

  // ===== Play again =====
  function resetToSetupScreen() {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    $('step-1').classList.add('active');
    document.querySelectorAll('.step[data-step]').forEach(el => {
      el.classList.remove('active', 'done');
      if (el.dataset.step === '1') el.classList.add('active');
    });
    const res = $('yut-result-display');
    if (res) res.classList.add('hidden');
  }

  function onPlayAgain() {
    setState(createInitialState());
    SETUP.reset();
    selectedResultIdx = 0;
    selectedPieceId = null;
    showScreen('setup');
    resetToSetupScreen();
  }

  // ===== Boot =====
  $('btn-roll-yut').addEventListener('click', onRollClicked);
  $('btn-play-again').addEventListener('click', onPlayAgain);
  SETUP.init();
})();

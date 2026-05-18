// ===== MAIN ENTRY POINT =====

(function () {
  // ---- Turn interaction state (not game logic state) ----
  let selectedResultIdx = 0;   // which pending result badge is active
  let selectedPieceId = null;  // which piece is selected (showing destinations)

  const svgEl = () => document.getElementById('yut-board');

  // ===== CORE REFRESH =====
  // Called after every state change. Syncs all UI to current game state.
  function refreshTurnUI() {
    const state = getState();
    if (state.phase !== 'GAME') return;

    // Clamp selectedResultIdx in case array shrank
    if (selectedResultIdx >= state.pendingYutResults.length) {
      selectedResultIdx = Math.max(0, state.pendingYutResults.length - 1);
    }

    // Roll button: enabled when canRollAgain
    UI.setRollEnabled(state.canRollAgain);

    // Pending result badges (clickable)
    UI.updatePendingDisplay(state, selectedResultIdx, onResultSelected);

    // Get movable pieces for currently selected result
    const steps = state.pendingYutResults[selectedResultIdx];
    const player = getCurrentPlayer(state);
    const movable = (steps && player)
      ? getMovablePieces(player.id, steps, state)
      : [];

    // Re-render board with piece click handlers for ON_BOARD movable pieces
    const boardMovable = movable.filter(p => p.state === 'ON_BOARD');
    UI.updateBoardPieces(state, boardMovable.length > 0
      ? (piece) => onPieceClicked(piece)
      : null
    );

    // Selectable rings on movable ON_BOARD pieces
    if (boardMovable.length > 0) {
      BOARD.setSelectableRings(svgEl(), boardMovable, selectedPieceId, onPieceClicked);
    } else {
      BOARD.clearSelectableRings(svgEl());
    }

    // Waiting pieces panel
    UI.showPieceSelection(movable, state, steps, onPieceClicked);

    // If a piece is already selected, keep showing its destinations
    if (selectedPieceId && steps) {
      const piece = state.pieces[selectedPieceId];
      if (piece && (piece.state === 'ON_BOARD' || piece.state === 'WAITING')) {
        showDestinationsFor(piece, steps);
      } else {
        selectedPieceId = null;
        BOARD.clearDestinations(svgEl());
      }
    }
  }

  // ===== RESULT SELECTION =====
  function onResultSelected(idx) {
    selectedResultIdx = idx;
    selectedPieceId = null;
    BOARD.clearDestinations(svgEl());
    refreshTurnUI();
  }

  // ===== PIECE SELECTION =====
  function onPieceClicked(piece) {
    const state = getState();
    const steps = state.pendingYutResults[selectedResultIdx];
    if (!steps) return;

    selectedPieceId = piece.pieceId;

    // Rebuild selectable rings to show selected state
    const player = getCurrentPlayer(state);
    const movable = getMovablePieces(player.id, steps, state)
      .filter(p => p.state === 'ON_BOARD');
    BOARD.setSelectableRings(svgEl(), movable, selectedPieceId, onPieceClicked);

    // Show destination preview
    showDestinationsFor(piece, steps);
  }

  // Show white dashed destination circles for a piece + steps
  function showDestinationsFor(piece, steps) {
    const fromPos = piece.state === 'WAITING' ? -1 : piece.position;
    // Pass prevPosition so center (24) routing works correctly
    const options = BOARD.getLandingOptions(fromPos, steps, piece.prevPosition);

    // Build map: landing → callback (one entry per unique landing destination)
    const destMap = {};
    for (const opt of options) {
      const key = String(opt.landing);
      if (!destMap[key]) {
        destMap[key] = () => applyPieceMove(piece.pieceId, steps, opt.landing);
      }
    }

    BOARD.showDestinations(svgEl(), destMap);
  }

  // ===== APPLY MOVE =====
  function applyPieceMove(pieceId, steps, targetLanding) {
    const state = getState();
    const { newState, captured } = GAME.applyMove(pieceId, steps, state, targetLanding);

    // Consume the SELECTED result (not always index 0)
    const afterConsume = GAME.consumePendingResultAt(newState, selectedResultIdx);

    // Reset selection
    selectedPieceId = null;
    selectedResultIdx = Math.min(selectedResultIdx, afterConsume.pendingYutResults.length - 1);
    if (selectedResultIdx < 0) selectedResultIdx = 0;

    // Clear board overlays
    BOARD.clearDestinations(svgEl());
    BOARD.clearSelectableRings(svgEl());

    // Capture grants bonus roll
    const withCapture = captured
      ? { ...afterConsume, canRollAgain: true }
      : afterConsume;

    setState(withCapture);
    UI.updateAll();

    if (captured) showNotification('잡았습니다! 추가 턴 획득!', 'success');

    // Victory check
    const winner = checkVictory(withCapture);
    if (winner) {
      setState({ ...withCapture, phase: 'FINISHED', winner });
      UI.showWinner(winner, getState());
      return;
    }

    // End turn if nothing left
    if (withCapture.pendingYutResults.length === 0 && !withCapture.canRollAgain) {
      endTurn(withCapture);
    } else {
      refreshTurnUI();
    }
  }

  // ===== ROLL =====
  document.getElementById('btn-roll-yut').addEventListener('click', () => {
    const state = getState();
    if (state.phase !== 'GAME' || !state.canRollAgain) return;

    UI.setRollEnabled(false);

    // 3D 윷 던지기 오버레이: 물리 결과로 roll 결정
    YUT3D.show((roll) => {
      const { newState, isBonusRoll } = GAME.processRoll(roll, state);

      selectedResultIdx = newState.pendingYutResults.length - 1;
      selectedPieceId   = null;
      BOARD.clearDestinations(svgEl());
      setState(newState);

      // 컨트롤 패널에 결과 표시 (애니메이션 없이 즉시)
      const nameEl  = document.getElementById('yut-name');
      const stepsEl = document.getElementById('yut-steps');
      const resEl   = document.getElementById('yut-result-display');
      if (resEl)   resEl.classList.remove('hidden');
      if (nameEl)  { nameEl.textContent = roll.name; nameEl.classList.remove('reveal'); }
      if (stepsEl) stepsEl.textContent  = roll.steps < 0
        ? '1칸 후진 (빽도)'
        : `${roll.steps}칸 이동`;
      const throwArea = document.getElementById('yut-throw-area');
      if (throwArea) throwArea.innerHTML = '';

      if (isBonusRoll) {
        showNotification(`${roll.name}! 한 번 더 던지거나, 말을 이동하세요.`, 'success');
      }
      if (roll.name === '빽도') {
        showNotification('빽도! 말이 1칸 후진합니다.', 'info');
      }

      refreshTurnUI();
    });
  });

  // ===== END TURN =====
  function endTurn(state) {
    UI.hidePieceSelection();
    BOARD.clearSelectableRings(svgEl());
    BOARD.clearDestinations(svgEl());
    selectedPieceId = null;
    selectedResultIdx = 0;

    const nextState = advanceTurn(state);
    setState(nextState);
    UI.updateAll();
    UI.setRollEnabled(true);
    UI.updatePendingDisplay(nextState, -1, onResultSelected);

    const player = getCurrentPlayer(nextState);
    const team = getCurrentTeam(nextState);
    if (player && team) {
      showNotification(`${player.name} (${team.name}) 의 턴입니다.`, 'info');
    }
  }

  // ===== PLAY AGAIN =====
  document.getElementById('btn-play-again').addEventListener('click', () => {
    setState(createInitialState());
    SETUP.reset();
    selectedResultIdx = 0;
    selectedPieceId = null;
    showScreen('setup');
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    document.querySelectorAll('.step[data-step]').forEach(el => {
      el.classList.remove('active', 'done');
      if (el.dataset.step === '1') el.classList.add('active');
    });
    const res = document.getElementById('yut-result-display');
    if (res) res.classList.add('hidden');
  });

  // ===== SETUP =====
  SETUP.init();
})();

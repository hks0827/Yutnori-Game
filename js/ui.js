// ===== UI CONTROLLER =====

// Shared notification helper (also used by setup.js)
function showNotification(msg, type = 'info', areaId = 'notification-area') {
  let area = document.getElementById(areaId);
  // Fall back to setup notification area if game screen is hidden
  if (!area || !area.offsetParent) {
    area = document.getElementById('setup-notification-area') || area;
  }
  if (!area) { console.warn(msg); return; }
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  area.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');
}

const UI = (() => {
  const TEAM_COLORS = ['var(--team0)', 'var(--team1)', 'var(--team2)', 'var(--team3)'];
  const TEAM_NAMES_KR = ['빨간팀', '파란팀', '노란팀', '초록팀'];

  // ---- Game start: init board + UI ----
  function startGame() {
    const svgEl = document.getElementById('yut-board');
    BOARD.renderBoard(svgEl);
    updateAll();
    setRollEnabled(getState().canRollAgain);
  }

  // ---- Full UI refresh ----
  function updateAll() {
    const state = getState();
    updateTurnInfo(state);
    updateProgressBars(state);
    updateBoardPieces(state);
    // pending display is refreshed separately (needs selectedIdx from main)
  }

  function updateTurnInfo(state) {
    const player = getCurrentPlayer(state);
    const team = getCurrentTeam(state);
    const teamIdx = state.teams.indexOf(team);

    const nameEl = document.getElementById('current-player-name');
    const teamEl = document.getElementById('current-team-name');

    if (nameEl) {
      nameEl.textContent = player ? player.name : '-';
      nameEl.style.color = TEAM_COLORS[teamIdx] || 'var(--text)';
    }
    if (teamEl) teamEl.textContent = team ? team.name : '-';
  }

  function updateProgressBars(state) {
    const teamList = document.getElementById('team-progress-list');
    const personalList = document.getElementById('personal-progress-list');
    if (!teamList || !personalList) return;

    teamList.innerHTML = '';
    personalList.innerHTML = '';

    for (const team of state.teams) {
      const pieces = getTeamPieces(team.id, state);
      const teamIdx = state.teams.indexOf(team);
      const row = makeProgressRow(team.name, pieces, TEAM_COLORS[teamIdx]);
      teamList.appendChild(row);
    }

    for (const player of state.players) {
      const pieces = getPersonalPieces(player.id, state);
      if (pieces.length === 0) continue;
      const team = state.teams.find(t => t.playerIds.includes(player.id));
      const teamIdx = state.teams.indexOf(team);
      const row = makeProgressRow(player.name, pieces, TEAM_COLORS[teamIdx]);
      personalList.appendChild(row);
    }
  }

  function makeProgressRow(label, pieces, color) {
    const row = document.createElement('div');
    row.className = 'piece-progress-row';
    const dots = pieces.map(p => {
      const d = document.createElement('div');
      d.className = 'piece-dot' + (p.state === 'FINISHED' ? ' done' : p.state === 'ON_BOARD' ? ' on-board' : '');
      if (p.state !== 'FINISHED') d.style.background = p.state === 'ON_BOARD' ? color : '';
      return d;
    });
    const dotsEl = document.createElement('div');
    dotsEl.className = 'piece-dots';
    dots.forEach(d => dotsEl.appendChild(d));

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.color = color;

    row.appendChild(lbl);
    row.appendChild(dotsEl);
    return row;
  }

  function updateBoardPieces(state, onPieceClick) {
    const svgEl = document.getElementById('yut-board');
    if (!svgEl || !svgEl.querySelector('#layer-pieces')) return;
    BOARD.renderPieces(svgEl, state.pieces, state.teams, state.players, onPieceClick);
  }

  // selectedIdx: which pending result is active (-1 = none), onSelect: (idx) => void
  function updatePendingDisplay(state, selectedIdx, onSelect) {
    const el = document.getElementById('pending-results');
    if (!el) return;
    el.innerHTML = '';

    if (state.pendingYutResults.length > 0) {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:0.75rem;color:var(--text2);margin-bottom:6px;width:100%;text-align:center;';
      label.textContent = '사용할 결과 선택:';
      el.appendChild(label);
    }

    state.pendingYutResults.forEach((steps, idx) => {
      const name = Object.entries(GAME.YUT_STEPS).find(([, v]) => v === steps)?.[0] || steps;
      const badge = document.createElement('button');
      badge.className = 'pending-badge' + (idx === selectedIdx ? ' selected' : '');
      badge.textContent = `${name} (${steps}칸)`;
      badge.title = `이 결과로 말 이동`;
      badge.addEventListener('click', () => onSelect && onSelect(idx));
      el.appendChild(badge);
    });

    if (state.canRollAgain) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:0.75rem;color:var(--accent3);margin-top:6px;width:100%;text-align:center;';
      hint.textContent = state.pendingYutResults.length > 0
        ? '한 번 더 던지거나, 위 결과로 말을 이동하세요'
        : '윷 던지기 버튼을 눌러 시작하세요';
      el.appendChild(hint);
    }
  }

  // ---- Roll button ----
  function setRollEnabled(enabled) {
    const btn = document.getElementById('btn-roll-yut');
    if (btn) btn.disabled = !enabled;
  }

  // ---- Show yut result (returns Promise that resolves after animation) ----
  function showYutResult(rollResult) {
    return new Promise(resolve => {
      const resultEl = document.getElementById('yut-result-display');
      const throwArea = document.getElementById('yut-throw-area');
      const nameEl   = document.getElementById('yut-name');
      const stepsEl  = document.getElementById('yut-steps');

      if (!resultEl) { resolve(); return; }

      resultEl.classList.remove('hidden');
      throwArea.innerHTML = '';
      nameEl.textContent  = '';
      nameEl.classList.remove('reveal');
      stepsEl.textContent = '';

      // Throw area safe bounds (stick 20×74, area ~240×140)
      const X_RANGE = 82;   // ±px from center
      const Y_RANGE = 22;   // ±px from center

      const easing   = 'cubic-bezier(0.15, 0.5, 0.3, 1)';
      let   maxEnd   = 0;

      rollResult.sticks.forEach((stickVal, i) => {
        const isBack = stickVal === 1;

        // Randomise landing
        const tx      = (Math.random() * 2 - 1) * X_RANGE;
        const ty      = (Math.random() * 2 - 1) * Y_RANGE;
        const tiltZ   = (Math.random() * 2 - 1) * 50;    // final tilt ±50°
        const spins   = 4 + Math.floor(Math.random() * 4); // 4-7 full rotations
        const finalRx = spins * 360 + (isBack ? 180 : 0);
        const delay   = i * 100 + Math.random() * 100;      // 스태거
        const dur     = 4500 + Math.random() * 2700;         // 4500-7200ms (3배, 각각 크게 다름)

        maxEnd = Math.max(maxEnd, delay + dur);

        // Build DOM
        const stick = document.createElement('div');
        stick.className = 'throw-stick';
        const inner = document.createElement('div');
        inner.className = 'stick-inner';
        const front = document.createElement('div');
        front.className = 'stick-face front-face';
        const back = document.createElement('div');
        back.className = 'stick-face back-face';
        inner.appendChild(front);
        inner.appendChild(back);
        stick.appendChild(inner);
        throwArea.appendChild(stick);

        // Arc: 더 높게 (peakY 증가), 더 오래 체공
        const peakX = tx * 0.2;
        const peakY = -130;  // 훨씬 높이 (이전 -62에서 증가)

        // Outer div: translate + Z-tilt
        stick.animate(
          [
            { transform: 'translate(-50%, -50%) rotateZ(0deg)' },
            { transform: `translate(calc(-50% + ${peakX}px), calc(-50% + ${peakY}px)) rotateZ(${tiltZ * 0.3}deg)`, offset: 0.35 },
            { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotateZ(${tiltZ}deg)` },
          ],
          { duration: dur, delay, easing, fill: 'both' }
        );

        // Inner div: X-axis spin (front/back)
        inner.animate(
          [
            { transform: 'rotateX(0deg)' },
            { transform: `rotateX(${finalRx}deg)` },
          ],
          { duration: dur, delay, easing, fill: 'both' }
        );
      });

      // After all sticks land → reveal result text
      setTimeout(() => {
        nameEl.textContent = rollResult.name;
        nameEl.classList.add('reveal');
        stepsEl.textContent = `${rollResult.steps}칸 이동`;
        setTimeout(resolve, 350); // wait for pop animation
      }, maxEnd + 200);
    });
  }

  // ---- Waiting-piece panel: 대기 중인 말만 표시 (보드 위 말은 SVG 클릭으로) ----
  function showPieceSelection(movablePieces, state, steps, onSelect) {
    const area = document.getElementById('piece-selection');
    const list = document.getElementById('movable-pieces-list');
    if (!area || !list) return;

    const waitingPieces = movablePieces.filter(p => p.state === 'WAITING');

    if (waitingPieces.length === 0) {
      area.classList.add('hidden');
      return;
    }

    area.classList.remove('hidden');
    list.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:0.75rem;color:var(--text2);margin-bottom:6px;';
    hdr.textContent = '대기 중인 말 (클릭하면 출발):';
    list.appendChild(hdr);

    for (const piece of waitingPieces) {
      const btn = document.createElement('button');
      btn.className = 'movable-piece-btn';

      const icon = piece.type === 'TEAM' ? '●' : '▲';
      const team = state.teams.find(t => t.id === piece.teamId);
      const teamIdx = state.teams.indexOf(team);
      const color = TEAM_COLORS[teamIdx] || '#888';
      const typeLabel = piece.type === 'TEAM' ? `[팀말] ${team ? team.name : ''}` : `[개인말]`;

      btn.innerHTML = `
        <span class="piece-icon" style="color:${color}">${icon}</span>
        <span class="piece-label">${typeLabel} ${getPieceShortName(piece, state)}</span>
        <span class="piece-pos">대기 중</span>
      `;
      btn.addEventListener('click', () => onSelect(piece));
      list.appendChild(btn);
    }
  }

  function hidePieceSelection() {
    const area = document.getElementById('piece-selection');
    if (area) area.classList.add('hidden');
  }

  function getPieceShortName(piece, state) {
    if (piece.type === 'TEAM') {
      const teamPieces = getTeamPieces(piece.teamId, state);
      const idx = teamPieces.indexOf(piece);
      return `말 ${idx + 1}`;
    } else {
      const playerPieces = getPersonalPieces(piece.ownerId, state);
      const idx = playerPieces.indexOf(piece);
      const player = state.players.find(p => p.id === piece.ownerId);
      return `(${player ? player.name : ''}) 말 ${idx + 1}`;
    }
  }

  // ---- Shortcut choice dialog ----
  function showShortcutChoice(corner, onChoice) {
    // Replace piece-selection area with a choice dialog
    const area = document.getElementById('piece-selection');
    const list = document.getElementById('movable-pieces-list');
    if (!area || !list) return;

    area.classList.remove('hidden');
    list.innerHTML = '';

    const title = document.createElement('div');
    title.style.marginBottom = '10px';
    title.style.fontSize = '0.9rem';
    title.textContent = `코너 ${corner}에 도착! 경로를 선택하세요:`;
    list.appendChild(title);

    const outerBtn = document.createElement('button');
    outerBtn.className = 'movable-piece-btn';
    outerBtn.innerHTML = `<span class="piece-icon">🔄</span><span class="piece-label">외곽 계속</span>`;
    outerBtn.addEventListener('click', () => onChoice(false));
    list.appendChild(outerBtn);

    const diagBtn = document.createElement('button');
    diagBtn.className = 'movable-piece-btn';
    diagBtn.innerHTML = `<span class="piece-icon">⚡</span><span class="piece-label">지름길 (대각선)</span>`;
    diagBtn.addEventListener('click', () => onChoice(true));
    list.appendChild(diagBtn);
  }

  // ---- Winner screen ----
  function showWinner(winner, state) {
    const title = document.getElementById('winner-title');
    const desc = document.getElementById('winner-description');

    if (winner.type === 'PERSONAL') {
      const player = state.players.find(p => p.id === winner.id);
      title.textContent = `${player ? player.name : '?'} 개인 승리!`;
      desc.textContent = '개인 말을 모두 완주했습니다!';
    } else {
      const team = state.teams.find(t => t.id === winner.id);
      title.textContent = `${team ? team.name : '?'} 팀 승리!`;
      desc.textContent = '팀 말을 모두 완주했습니다!';
    }

    showScreen('winner');
  }

  return {
    startGame,
    updateAll,
    updateTurnInfo,
    updateProgressBars,
    updateBoardPieces,
    updatePendingDisplay,
    setRollEnabled,
    showYutResult,
    showPieceSelection,
    hidePieceSelection,
    showShortcutChoice,
    showWinner,
  };
})();

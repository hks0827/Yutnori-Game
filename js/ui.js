// ===== UI CONTROLLER =====

const UI = (() => {
  // ---- Boot ----
  function startGame() {
    BOARD.renderBoard($('yut-board'));
    updateAll();
    setRollEnabled(getState().canRollAgain);
  }

  function updateAll() {
    const state = getState();
    updateTurnInfo(state);
    updateProgressBars(state);
    updateBoardPieces(state);
  }

  // ---- Turn info banner ----
  function updateTurnInfo(state) {
    const player  = getCurrentPlayer(state);
    const team    = getCurrentTeam(state);
    const teamIdx = state.teams.indexOf(team);
    const nameEl  = $('current-player-name');
    const teamEl  = $('current-team-name');

    if (nameEl) {
      nameEl.textContent = player ? player.name : '-';
      nameEl.style.color = teamColor(teamIdx);
    }
    if (teamEl) teamEl.textContent = team ? team.name : '-';
  }

  // ---- Progress bars ----
  function progressDotClass(piece) {
    if (piece.state === 'FINISHED') return 'piece-dot done';
    if (piece.state === 'ON_BOARD') return 'piece-dot on-board';
    return 'piece-dot';
  }

  function makeProgressDot(piece, color) {
    const d = htmlEl('div', { className: progressDotClass(piece) });
    if (piece.state === 'ON_BOARD') d.style.background = color;
    return d;
  }

  function makeProgressRow(label, pieces, color) {
    const row = htmlEl('div', { className: 'piece-progress-row' });
    const dots = htmlEl('div', { className: 'piece-dots' });
    for (const p of pieces) dots.appendChild(makeProgressDot(p, color));
    const lbl = htmlEl('span', { text: label });
    lbl.style.color = color;
    row.appendChild(lbl);
    row.appendChild(dots);
    return row;
  }

  function updateProgressBars(state) {
    const teamList     = $('team-progress-list');
    const personalList = $('personal-progress-list');
    if (!teamList || !personalList) return;

    teamList.innerHTML = '';
    personalList.innerHTML = '';

    state.teams.forEach((team, idx) => {
      const pieces = getTeamPieces(team.id, state);
      teamList.appendChild(makeProgressRow(team.name, pieces, teamColor(idx)));
    });

    for (const player of state.players) {
      const pieces = getPersonalPieces(player.id, state);
      if (pieces.length === 0) continue;
      const team = findPlayerTeam(state, player.id);
      const teamIdx = state.teams.indexOf(team);
      personalList.appendChild(makeProgressRow(player.name, pieces, teamColor(teamIdx)));
    }
  }

  function updateBoardPieces(state, onPieceClick) {
    const svg = $('yut-board');
    if (!svg || !svg.querySelector('#layer-pieces')) return;
    BOARD.renderPieces(svg, state.pieces, state.teams, state.players, onPieceClick);
  }

  // ---- Pending result badges ----
  function makePendingBadge(steps, idx, selectedIdx, onSelect) {
    const name = Object.entries(GAME.YUT_STEPS).find(([, v]) => v === steps)?.[0] || steps;
    const badge = htmlEl('button', {
      className: 'pending-badge' + (idx === selectedIdx ? ' selected' : ''),
      text: `${name} (${steps}칸)`,
      attrs: { title: '이 결과로 말 이동' },
    });
    badge.addEventListener('click', () => onSelect && onSelect(idx));
    return badge;
  }

  function pendingHintText(state) {
    if (state.pendingYutResults.length > 0) return '한 번 더 던지거나, 위 결과로 말을 이동하세요';
    return '윷 던지기 버튼을 눌러 시작하세요';
  }

  function updatePendingDisplay(state, selectedIdx, onSelect) {
    const el = $('pending-results');
    if (!el) return;
    el.innerHTML = '';

    if (state.pendingYutResults.length > 0) {
      const label = htmlEl('div', { text: '사용할 결과 선택:' });
      label.style.cssText = 'font-size:0.75rem;color:var(--text2);margin-bottom:6px;width:100%;text-align:center;';
      el.appendChild(label);
    }

    state.pendingYutResults.forEach((steps, idx) => {
      el.appendChild(makePendingBadge(steps, idx, selectedIdx, onSelect));
    });

    if (state.canRollAgain) {
      const hint = htmlEl('div', { text: pendingHintText(state) });
      hint.style.cssText = 'font-size:0.75rem;color:var(--accent3);margin-top:6px;width:100%;text-align:center;';
      el.appendChild(hint);
    }
  }

  function setRollEnabled(enabled) {
    const btn = $('btn-roll-yut');
    if (btn) btn.disabled = !enabled;
  }

  // ---- Yut throw animation (delegated) ----
  const showYutResult = YUT_ANIM.show;

  // ---- Piece selection panel (waiting pieces only; on-board are clicked via SVG) ----
  function getPieceShortName(piece, state) {
    if (piece.type === 'TEAM') {
      const teamPieces = getTeamPieces(piece.teamId, state);
      return `말 ${teamPieces.indexOf(piece) + 1}`;
    }
    const playerPieces = getPersonalPieces(piece.ownerId, state);
    const idx = playerPieces.indexOf(piece);
    const player = state.players.find(p => p.id === piece.ownerId);
    return `(${player ? player.name : ''}) 말 ${idx + 1}`;
  }

  function makeWaitingPieceBtn(piece, state, onSelect) {
    const icon = piece.type === 'TEAM' ? '●' : '▲';
    const team = state.teams.find(t => t.id === piece.teamId);
    const teamIdx = state.teams.indexOf(team);
    const color = teamColor(teamIdx);
    const typeLabel = piece.type === 'TEAM'
      ? `[팀말] ${team ? team.name : ''}`
      : `[개인말]`;
    const btn = htmlEl('button', {
      className: 'movable-piece-btn',
      html: `
        <span class="piece-icon" style="color:${color}">${icon}</span>
        <span class="piece-label">${typeLabel} ${getPieceShortName(piece, state)}</span>
        <span class="piece-pos">대기 중</span>
      `,
    });
    btn.addEventListener('click', () => onSelect(piece));
    return btn;
  }

  function showPieceSelection(movablePieces, state, _steps, onSelect) {
    const area = $('piece-selection');
    const list = $('movable-pieces-list');
    if (!area || !list) return;

    const waiting = movablePieces.filter(p => p.state === 'WAITING');
    if (waiting.length === 0) { area.classList.add('hidden'); return; }

    area.classList.remove('hidden');
    list.innerHTML = '';

    const hdr = htmlEl('div', { text: '대기 중인 말 (클릭하면 출발):' });
    hdr.style.cssText = 'font-size:0.75rem;color:var(--text2);margin-bottom:6px;';
    list.appendChild(hdr);
    for (const piece of waiting) list.appendChild(makeWaitingPieceBtn(piece, state, onSelect));
  }

  function hidePieceSelection() {
    const area = $('piece-selection');
    if (area) area.classList.add('hidden');
  }

  // ---- Shortcut choice dialog ----
  function makeChoiceButton(icon, label, onClick) {
    const btn = htmlEl('button', {
      className: 'movable-piece-btn',
      html: `<span class="piece-icon">${icon}</span><span class="piece-label">${label}</span>`,
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function showShortcutChoice(corner, onChoice) {
    const area = $('piece-selection');
    const list = $('movable-pieces-list');
    if (!area || !list) return;

    area.classList.remove('hidden');
    list.innerHTML = '';

    const title = htmlEl('div', { text: `코너 ${corner}에 도착! 경로를 선택하세요:` });
    title.style.marginBottom = '10px';
    title.style.fontSize = '0.9rem';
    list.appendChild(title);
    list.appendChild(makeChoiceButton('🔄', '외곽 계속',          () => onChoice(false)));
    list.appendChild(makeChoiceButton('⚡', '지름길 (대각선)',     () => onChoice(true)));
  }

  // ---- Winner screen ----
  function showWinner(winner, state) {
    const title = $('winner-title');
    const desc  = $('winner-description');
    if (winner.type === 'PERSONAL') {
      const player = state.players.find(p => p.id === winner.id);
      title.textContent = `${player ? player.name : '?'} 개인 승리!`;
      desc.textContent  = '개인 말을 모두 완주했습니다!';
    } else {
      const team = state.teams.find(t => t.id === winner.id);
      title.textContent = `${team ? team.name : '?'} 팀 승리!`;
      desc.textContent  = '팀 말을 모두 완주했습니다!';
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

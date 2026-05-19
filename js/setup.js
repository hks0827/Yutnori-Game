// ===== SETUP FLOW (4 steps) =====

const SETUP = (() => {
  const PIECE_LIMITS = { 'team-pieces': [1, 6], 'personal-pieces': [1, 3] };

  let setupData = {
    players: [],
    teams: [],
    teamPieceCount: 2,
    personalPieceCount: 1,
  };

  // ---- Generic number adjuster (used by step 3 +/- buttons) ----
  function adjustNum(spanId, delta) {
    const el = $(spanId);
    const [min, max] = PIECE_LIMITS[spanId] || [1, 9];
    const val = clamp(parseInt(el.textContent, 10) + delta, min, max);
    el.textContent = val;
  }
  window.adjustNum = adjustNum;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---- Player row removal (button onclick) ----
  function removePlayerRow(btn) {
    const rows = document.querySelectorAll('.player-input-row');
    if (rows.length <= MIN_PLAYERS) {
      showNotification(`최소 ${MIN_PLAYERS}명 이상이어야 합니다.`, 'warning');
      return;
    }
    btn.parentElement.remove();
  }
  window.removePlayerRow = removePlayerRow;

  // ---- Step navigation ----
  function goToStep(n) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step[data-step]').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
    const stepEl = $(`step-${n}`);
    if (stepEl) stepEl.classList.add('active');
  }

  // ---- Step 1: collect players ----
  function readPlayerNames() {
    return [...document.querySelectorAll('.player-name')]
      .map(inp => inp.value.trim())
      .filter(n => n.length > 0);
  }

  function collectPlayers() {
    const names = readPlayerNames();
    if (names.length < MIN_PLAYERS) {
      showNotification(`최소 ${MIN_PLAYERS}명 이상 입력하세요.`, 'error');
      return null;
    }
    if (names.length > MAX_PLAYERS) {
      showNotification(`최대 ${MAX_PLAYERS}명까지 가능합니다.`, 'error');
      return null;
    }
    return names.map((name, i) => createPlayer(`p${i}`, name));
  }

  function addPlayerRow() {
    const list = $('player-list');
    const rows = list.querySelectorAll('.player-input-row');
    if (rows.length >= MAX_PLAYERS) {
      showNotification(`최대 ${MAX_PLAYERS}명입니다.`, 'warning');
      return;
    }
    const idx = rows.length + 1;
    const row = htmlEl('div', {
      className: 'player-input-row',
      html: `
        <input type="text" class="player-name" placeholder="플레이어 ${idx} 이름" value="플레이어 ${idx}" />
        <button class="btn-remove-player" onclick="removePlayerRow(this)">✕</button>
      `,
    });
    list.appendChild(row);
  }

  // ---- Step 2: drag-and-drop team assignment ----
  function makeChip(player) {
    const chip = htmlEl('div', {
      className: 'player-chip',
      text: player.name,
      attrs: { 'data-player-id': player.id },
    });
    chip.draggable = true;
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', player.id);
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    return chip;
  }

  function setupDropZone(zone) {
    const highlight = zone.closest('.team-zone') || zone;
    zone.addEventListener('dragover',  e => { e.preventDefault(); highlight.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => highlight.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      highlight.classList.remove('drag-over');
      const playerId = e.dataTransfer.getData('text/plain');
      const chip = document.querySelector(`.player-chip[data-player-id="${playerId}"]`);
      if (chip) zone.appendChild(chip);
    });
  }

  function makeTeamZone(idx) {
    const zone = htmlEl('div', {
      className: 'team-zone',
      attrs: { 'data-team-id': `t${idx}` },
      html: `<h3>${TEAM_EMOJIS[idx]} 팀 ${idx + 1}</h3><div class="drop-zone" data-team="${idx}"></div>`,
    });
    setupDropZone(zone.querySelector('.drop-zone'));
    return zone;
  }

  function buildTeamZones(teamCount, players) {
    const unassigned = $('unassigned-players');
    const teamZonesEl = $('team-zones');

    unassigned.innerHTML = '';
    for (const player of players) unassigned.appendChild(makeChip(player));

    teamZonesEl.innerHTML = '';
    for (let i = 0; i < teamCount; i++) teamZonesEl.appendChild(makeTeamZone(i));

    setupDropZone(unassigned);
  }

  function collectTeams() {
    const teams = [];
    for (const zone of document.querySelectorAll('[data-team]')) {
      const idx = parseInt(zone.dataset.team, 10);
      const chips = zone.querySelectorAll('.player-chip');
      if (chips.length === 0) {
        showNotification(`팀 ${idx + 1}에 플레이어를 배치하세요.`, 'error');
        return null;
      }
      const playerIds = [...chips].map(c => c.dataset.playerId);
      teams.push(createTeam(`t${idx}`, `팀 ${idx + 1}`, playerIds, idx));
    }
    if (document.querySelectorAll('#unassigned-players .player-chip').length > 0) {
      showNotification('모든 플레이어를 팀에 배치하세요.', 'error');
      return null;
    }
    return teams;
  }

  // ---- Step 4: turn order preview ----
  function makeTurnBadge(i, player, team, teamIdx) {
    const color = teamColor(teamIdx);
    return htmlEl('div', {
      className: 'turn-badge',
      style: { borderTop: `3px solid ${color}` },
      html: `
        <div class="turn-num">#${i + 1}</div>
        <div class="turn-player">${player ? player.name : '?'}</div>
        <div class="turn-team" style="color:${color}">${team ? team.name : ''}</div>
      `,
    });
  }

  function buildTurnOrderPreview(turnOrder, players, teams) {
    const container = $('turn-order-preview');
    container.innerHTML = '';

    const cycleLen = turnOrder.length;
    const displayCount = Math.min(cycleLen * 2, 24);
    for (let i = 0; i < displayCount; i++) {
      const playerId = turnOrder[i % cycleLen];
      const player = players.find(p => p.id === playerId);
      const team = teams.find(t => t.playerIds.includes(playerId));
      const teamIdx = teams.indexOf(team);
      container.appendChild(makeTurnBadge(i, player, team, teamIdx));
    }
    if (cycleLen > 0) {
      const note = htmlEl('div', { text: `(${cycleLen}턴 주기로 반복)` });
      note.style.cssText = 'width:100%;text-align:center;font-size:0.8rem;color:var(--text2);margin-top:8px;';
      container.appendChild(note);
    }
  }

  // ---- Game start ----
  function startGameFromSetup() {
    const { players, teams, teamPieceCount, personalPieceCount } = setupData;
    const turnOrder = buildTurnOrder(teams, players);
    const pieces    = initializePieces(teams, players, teamPieceCount, personalPieceCount);

    setState({
      ...createInitialState(),
      phase: 'GAME',
      players, teams, turnOrder, pieces,
      boardState: {},
    });
    showScreen('game');
    UI.startGame();
  }

  // ---- Step handlers ----
  function onStep1Next() {
    const players = collectPlayers();
    if (!players) return;
    setupData.players = players;
    goToStep(2);
    buildTeamZones(parseInt($('team-count').value, 10), players);
  }

  function onGenerateTeams() {
    const count = parseInt($('team-count').value, 10);
    if (count < MIN_TEAMS || count > MAX_TEAMS) return;
    buildTeamZones(count, setupData.players);
  }

  function onStep2Next() {
    const teams = collectTeams();
    if (!teams) return;
    setupData.teams = teams;
    goToStep(3);
  }

  function onStep3Next() {
    setupData.teamPieceCount    = parseInt($('team-pieces').textContent, 10);
    setupData.personalPieceCount = parseInt($('personal-pieces').textContent, 10);
    const order = buildTurnOrder(setupData.teams, setupData.players);
    buildTurnOrderPreview(order, setupData.players, setupData.teams);
    goToStep(4);
  }

  // ---- Init ----
  function init() {
    $('btn-add-player').addEventListener('click', addPlayerRow);
    $('btn-step1-next').addEventListener('click', onStep1Next);
    $('btn-generate-teams').addEventListener('click', onGenerateTeams);
    $('btn-step2-back').addEventListener('click', () => goToStep(1));
    $('btn-step2-next').addEventListener('click', onStep2Next);
    $('btn-step3-back').addEventListener('click', () => goToStep(2));
    $('btn-step3-next').addEventListener('click', onStep3Next);
    $('btn-step4-back').addEventListener('click', () => goToStep(3));
    $('btn-start-game').addEventListener('click', startGameFromSetup);
  }

  function reset() {
    setupData = { players: [], teams: [], teamPieceCount: 2, personalPieceCount: 1 };
    $('team-pieces').textContent = '2';
    $('personal-pieces').textContent = '1';
  }

  return { init, reset, setupData: () => setupData };
})();

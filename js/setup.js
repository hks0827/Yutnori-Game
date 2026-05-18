// ===== SETUP FLOW (4 steps) =====

const SETUP = (() => {
  let currentStep = 1;
  // Temporary storage during setup
  let setupData = {
    players: [],
    teams: [],
    teamPieceCount: 2,
    personalPieceCount: 1,
  };

  // ---- Number adjuster ----
  function adjustNum(spanId, delta) {
    const el = document.getElementById(spanId);
    const limits = { 'team-pieces': [1, 6], 'personal-pieces': [1, 3] };
    const [min, max] = limits[spanId] || [1, 9];
    let val = parseInt(el.textContent) + delta;
    val = Math.max(min, Math.min(max, val));
    el.textContent = val;
  }
  window.adjustNum = adjustNum;

  // ---- Player row removal ----
  function removePlayerRow(btn) {
    const rows = document.querySelectorAll('.player-input-row');
    if (rows.length <= 2) { showNotification('최소 2명 이상이어야 합니다.', 'warning'); return; }
    btn.parentElement.remove();
  }
  window.removePlayerRow = removePlayerRow;

  // ---- Step navigation ----
  function goToStep(n) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step[data-step]').forEach(el => {
      const s = parseInt(el.dataset.step);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
    const stepEl = document.getElementById(`step-${n}`);
    if (stepEl) stepEl.classList.add('active');
    currentStep = n;
  }

  // ---- Step 1 → collect players ----
  function collectPlayers() {
    const names = [...document.querySelectorAll('.player-name')]
      .map(inp => inp.value.trim())
      .filter(n => n.length > 0);
    if (names.length < 2) {
      showNotification('최소 2명 이상 입력하세요.', 'error');
      return null;
    }
    if (names.length > 8) {
      showNotification('최대 8명까지 가능합니다.', 'error');
      return null;
    }
    return names.map((name, i) => createPlayer(`p${i}`, name));
  }

  // ---- Step 2: Team drag-and-drop ----
  function buildTeamZones(teamCount, players) {
    const unassigned = document.getElementById('unassigned-players');
    const teamZonesEl = document.getElementById('team-zones');

    // Populate unassigned pool
    unassigned.innerHTML = '';
    for (const player of players) {
      unassigned.appendChild(makeChip(player));
    }

    // Build team zones
    teamZonesEl.innerHTML = '';
    const TEAM_COLORS = ['🔴', '🔵', '🟡', '🟢'];
    for (let i = 0; i < teamCount; i++) {
      const zone = document.createElement('div');
      zone.className = 'team-zone';
      zone.dataset.teamId = `t${i}`;
      zone.innerHTML = `<h3>${TEAM_COLORS[i]} 팀 ${i + 1}</h3><div class="drop-zone" data-team="${i}"></div>`;
      setupDropZone(zone.querySelector('.drop-zone'));
      teamZonesEl.appendChild(zone);
    }
    setupDropZone(unassigned);
  }

  function makeChip(player) {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.draggable = true;
    chip.dataset.playerId = player.id;
    chip.textContent = player.name;

    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', player.id);
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    return chip;
  }

  function setupDropZone(zone) {
    // Highlight the nearest styled container (team-zone or the zone itself for unassigned pool)
    const highlight = zone.closest('.team-zone') || zone;
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      highlight.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => highlight.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      highlight.classList.remove('drag-over');
      const playerId = e.dataTransfer.getData('text/plain');
      const chip = document.querySelector(`.player-chip[data-player-id="${playerId}"]`);
      if (chip) zone.appendChild(chip);
    });
  }

  // ---- Step 2 → collect teams ----
  function collectTeams(players) {
    const zones = document.querySelectorAll('[data-team]');
    const teams = [];
    let allAssigned = true;

    for (const zone of zones) {
      const idx = parseInt(zone.dataset.team);
      const chips = zone.querySelectorAll('.player-chip');
      if (chips.length === 0) {
        showNotification(`팀 ${idx + 1}에 플레이어를 배치하세요.`, 'error');
        return null;
      }
      const playerIds = [...chips].map(c => c.dataset.playerId);
      teams.push(createTeam(`t${idx}`, `팀 ${idx + 1}`, playerIds, idx));
    }

    // Check unassigned pool
    const unassigned = document.querySelectorAll('#unassigned-players .player-chip');
    if (unassigned.length > 0) {
      showNotification('모든 플레이어를 팀에 배치하세요.', 'error');
      return null;
    }

    return teams;
  }

  // ---- Step 4: Turn order preview ----
  function buildTurnOrderPreview(turnOrder, players, teams) {
    const container = document.getElementById('turn-order-preview');
    container.innerHTML = '';

    const TEAM_COLORS = ['var(--team0)', 'var(--team1)', 'var(--team2)', 'var(--team3)'];

    // Show first full cycle
    const cycleLength = turnOrder.length;
    const displayCount = Math.min(cycleLength * 2, 24);

    for (let i = 0; i < displayCount; i++) {
      const playerId = turnOrder[i % cycleLength];
      const player = players.find(p => p.id === playerId);
      const team = teams.find(t => t.playerIds.includes(playerId));
      const teamIdx = teams.indexOf(team);

      const badge = document.createElement('div');
      badge.className = 'turn-badge';
      badge.style.borderTop = `3px solid ${TEAM_COLORS[teamIdx % TEAM_COLORS.length]}`;
      badge.innerHTML = `
        <div class="turn-num">#${i + 1}</div>
        <div class="turn-player">${player ? player.name : '?'}</div>
        <div class="turn-team" style="color:${TEAM_COLORS[teamIdx % TEAM_COLORS.length]}">${team ? team.name : ''}</div>
      `;
      container.appendChild(badge);
    }
    if (cycleLength > 0) {
      const note = document.createElement('div');
      note.style.cssText = 'width:100%;text-align:center;font-size:0.8rem;color:var(--text2);margin-top:8px;';
      note.textContent = `(${cycleLength}턴 주기로 반복)`;
      container.appendChild(note);
    }
  }

  // ---- Initialize setup event listeners ----
  function init() {
    // Add player button
    document.getElementById('btn-add-player').addEventListener('click', () => {
      const list = document.getElementById('player-list');
      const rows = list.querySelectorAll('.player-input-row');
      if (rows.length >= 8) { showNotification('최대 8명입니다.', 'warning'); return; }
      const idx = rows.length + 1;
      const row = document.createElement('div');
      row.className = 'player-input-row';
      row.innerHTML = `
        <input type="text" class="player-name" placeholder="플레이어 ${idx} 이름" value="플레이어 ${idx}" />
        <button class="btn-remove-player" onclick="removePlayerRow(this)">✕</button>
      `;
      list.appendChild(row);
    });

    // Step 1 → 2
    document.getElementById('btn-step1-next').addEventListener('click', () => {
      const players = collectPlayers();
      if (!players) return;
      setupData.players = players;
      goToStep(2);
      // Trigger team generation with default count
      buildTeamZones(parseInt(document.getElementById('team-count').value), players);
    });

    // Team count + generate button
    document.getElementById('btn-generate-teams').addEventListener('click', () => {
      const count = parseInt(document.getElementById('team-count').value);
      if (count < 2 || count > 4) return;
      buildTeamZones(count, setupData.players);
    });

    // Step 2 back/next
    document.getElementById('btn-step2-back').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-step2-next').addEventListener('click', () => {
      const teams = collectTeams(setupData.players);
      if (!teams) return;
      setupData.teams = teams;
      goToStep(3);
    });

    // Step 3 back/next
    document.getElementById('btn-step3-back').addEventListener('click', () => goToStep(2));
    document.getElementById('btn-step3-next').addEventListener('click', () => {
      setupData.teamPieceCount = parseInt(document.getElementById('team-pieces').textContent);
      setupData.personalPieceCount = parseInt(document.getElementById('personal-pieces').textContent);
      const order = buildTurnOrder(setupData.teams, setupData.players);
      buildTurnOrderPreview(order, setupData.players, setupData.teams);
      goToStep(4);
    });

    // Step 4 back
    document.getElementById('btn-step4-back').addEventListener('click', () => goToStep(3));

    // Start game
    document.getElementById('btn-start-game').addEventListener('click', () => {
      const { players, teams, teamPieceCount, personalPieceCount } = setupData;
      const turnOrder = buildTurnOrder(teams, players);
      const pieces = initializePieces(teams, players, teamPieceCount, personalPieceCount);

      const newState = {
        ...createInitialState(),
        phase: 'GAME',
        players,
        teams,
        turnOrder,
        pieces,
        boardState: {},
      };
      setState(newState);
      showScreen('game');
      UI.startGame();
    });
  }

  function reset() {
    setupData = { players: [], teams: [], teamPieceCount: 2, personalPieceCount: 1 };
    document.getElementById('team-pieces').textContent = '2';
    document.getElementById('personal-pieces').textContent = '1';
  }

  return { init, reset, setupData: () => setupData };
})();

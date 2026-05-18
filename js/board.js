// ===== BOARD GRAPH DEFINITION =====
// Position numbering:
//   0        : start/finish corner (bottom-right)
//   1-4      : right edge (bottom→top)
//   5        : top-right corner
//   6-9      : top edge (right→left)
//   10       : top-left corner
//   11-14    : left edge (top→bottom)
//   15       : bottom-left corner
//   16-19    : bottom edge (left→right)
//   20       : virtual finish landing (same visual as 0; one more step → EXIT)
//   21       : diagonal 1/3 from corner 5 toward center
//   27       : diagonal 2/3 from corner 5 toward center
//   22       : diagonal 1/3 from corner 10 toward center
//   28       : diagonal 2/3 from corner 10 toward center
//   23       : diagonal 1/3 from corner 15 toward center
//   29       : diagonal 2/3 from corner 15 toward center
//   24       : center
//   25       : center→exit step 1
//   26       : center→exit step 2
//  'EXIT'    : finished

const BOARD = (() => {
  const SVG_W = 600, SVG_H = 600;
  const PAD = 60;
  // Corner coordinates
  const C = {
    0:  [SVG_W - PAD, SVG_H - PAD],  // bottom-right (start)
    5:  [SVG_W - PAD, PAD],           // top-right
    10: [PAD, PAD],                   // top-left
    15: [PAD, SVG_H - PAD],          // bottom-left
    24: [SVG_W / 2, SVG_H / 2],      // center
  };

  // Lerp helper
  function lerp([x1,y1], [x2,y2], t) { return [x1+(x2-x1)*t, y1+(y2-y1)*t]; }

  // Generate 4 intermediate positions along an edge
  function edgePositions(from, to) {
    return [1,2,3,4].map(i => lerp(from, to, i/5));
  }

  // All node coordinates (index → [x, y])
  const coords = {};

  coords[0] = C[0];
  // Right edge: 0→5 (positions 1,2,3,4)
  edgePositions(C[0], C[5]).forEach((p,i) => coords[i+1] = p);
  coords[5] = C[5];
  // Top edge: 5→10 (positions 6,7,8,9)
  edgePositions(C[5], C[10]).forEach((p,i) => coords[i+6] = p);
  coords[10] = C[10];
  // Left edge: 10→15 (positions 11,12,13,14)
  edgePositions(C[10], C[15]).forEach((p,i) => coords[i+11] = p);
  coords[15] = C[15];
  // Bottom edge: 15→0 (positions 16,17,18,19)
  edgePositions(C[15], C[0]).forEach((p,i) => coords[i+16] = p);

  // Diagonals: corners → center (2 intermediates each)
  // 5→24: positions 21 (1/3) and 27 (2/3)
  coords[21] = lerp(C[5], C[24], 1/3);
  coords[27] = lerp(C[5], C[24], 2/3);
  // 10→24: positions 22 (1/3) and 28 (2/3)
  coords[22] = lerp(C[10], C[24], 1/3);
  coords[28] = lerp(C[10], C[24], 2/3);
  // 15→24: positions 23 (1/3) and 29 (2/3)
  coords[23] = lerp(C[15], C[24], 1/3);
  coords[29] = lerp(C[15], C[24], 2/3);
  // Center
  coords[24] = C[24];
  // Center→Exit path: 24→0 (position 25, 26)
  coords[25] = lerp(C[24], C[0], 1/3);
  coords[26] = lerp(C[24], C[0], 2/3);
  // Position 20: virtual "finish landing" — same visual spot as position 0 (출발선)
  // A piece here has stepped on 출발 after going around; needs ONE more step to EXIT.
  coords[20] = C[0];

  // ===== GRAPH (adjacency) =====
  // Normal next node for each position (single-step movement)
  const nextMap = {};
  // Outer track: 0→1→…→18→19→20(출발선 착지)→EXIT
  // Position 0 = 출발선 (entry), Position 20 = 출발선 재착지 (finish, one step before exit)
  for (let i = 0; i <= 18; i++) nextMap[i] = [i + 1];
  nextMap[19] = [20]; // 19 → 20 (finish landing on 출발선)
  nextMap[20] = ['EXIT']; // 20 → EXIT (한 칸 더)
  // Shortcuts at corners:
  //   Landing on 5: can continue to 6 OR take diagonal to 21
  //   Landing on 10: can continue to 11 OR take diagonal to 22
  //   Landing on 15: can continue to 16 OR take diagonal to 23
  const shortcuts = { 5: [6, 21], 10: [11, 22] }; // 15 has no shortcut
  // Diagonal paths:
  //   5→21→27→24(center): entry from top-right corner
  nextMap[21] = [27];
  nextMap[27] = [24];
  //   10→22→28→24(center): entry from top-left corner
  nextMap[22] = [28];
  nextMap[28] = [24];
  //   24→29→23→15: from center toward bottom-left (only reachable from center via prev=27)
  nextMap[29] = [23];
  nextMap[23] = [15];
  //   24→25→26→EXIT: center-to-exit arm (also used by 10-side path)
  nextMap[24] = [25]; // default (used as fallback; routing logic overrides this)
  nextMap[25] = [26];
  nextMap[26] = ['EXIT'];

  // ===== PATH CALCULATION =====

  function isShortcutCorner(pos) { return pos in shortcuts; }

  // BFS-based landing options.
  // fromPos: piece position (-1 = WAITING)
  // steps: number of steps to move
  // prevPos: where the piece came from on its last move (needed for center 24 routing)
  // Returns array of { landing, prev, path } — one per unique landing destination.
  // 빽도(steps < 0) 후진 이동 맵
  const backwardMap = {
    // 대각선 경로 역방향
    21: 5,  27: 21,          // corner5 대각선
    22: 10, 28: 22,          // corner10 대각선
    23: 29, 29: 24,          // center→15 역방향
    25: 24, 26: 25,          // center→exit 역방향
    20: 19,                  // 가상 finish → 19
  };

  function getLandingOptions(fromPos, steps, prevPos) {
    // ── 빽도: 후진 이동 ──
    if (steps < 0) {
      const startPos = (fromPos === -1 || fromPos === 0) ? null : fromPos;
      if (!startPos) return []; // 출발선에서는 후진 불가

      let pos = startPos;
      for (let i = 0; i < Math.abs(steps); i++) {
        if (pos >= 1 && pos <= 19) {
          pos = pos - 1; // 외곽 트랙 후진
        } else if (pos === 24 && prevPos) {
          pos = prevPos; // 중앙에서는 왔던 방향으로
        } else if (backwardMap[pos] !== undefined) {
          pos = backwardMap[pos];
        } else {
          return []; // 후진 불가
        }
      }
      return [{ landing: pos, prev: fromPos, path: [pos] }];
    }

    // WAITING (-1) = AT position 0 (출발선); first step → 1
    const startPos = (fromPos === -1) ? 0 : fromPos;
    const startPrev = (prevPos !== undefined && prevPos !== null) ? prevPos : null;

    // BFS state: { cur, prev, stepsLeft, path }
    let queue = [{ cur: startPos, prev: startPrev, stepsLeft: steps, path: [] }];
    const results = [];

    while (queue.length > 0) {
      const next = [];
      for (const { cur, prev, stepsLeft, path } of queue) {
        if (stepsLeft === 0) {
          results.push({ landing: cur, prev, path });
          continue;
        }

        // Determine possible next positions from cur
        let nexts;
        if (cur === 24) {
          // Center: routing depends on which arm the piece arrived from
          // Only branch if STANDING ON center (turn started here); otherwise go straight
          if (cur === startPos) {
            nexts = (prev === 27) ? [29, 25] : [25];
          } else {
            nexts = (prev === 27) ? [29] : [25];
          }
        } else if (cur === startPos && isShortcutCorner(cur)) {
          // At the starting position on a shortcut corner: branch both paths
          nexts = shortcuts[cur]; // [outer, diagonal]
        } else {
          nexts = nextMap[cur];
          if (!nexts || nexts.length === 0) nexts = ['EXIT'];
        }

        for (const nxt of nexts) {
          if (nxt === 'EXIT') {
            results.push({ landing: 'EXIT', prev: cur, path: [...path, 'EXIT'] });
          } else {
            next.push({ cur: nxt, prev: cur, stepsLeft: stepsLeft - 1, path: [...path, nxt] });
          }
        }
      }
      queue = next;
    }

    // Deduplicate by landing (keep first path found)
    const seen = new Set();
    return results.filter(r => {
      const key = String(r.landing);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Compute path for first available option (for animation / display use)
  function computePath(fromPos, steps, prevPos) {
    const opts = getLandingOptions(fromPos, steps, prevPos);
    return opts.length > 0 ? opts[0].path : [];
  }

  // ===== SVG RENDERING =====
  const CORNER_R = 22;
  const NORMAL_R = 13;
  const CENTER_R = 24;

  const SPECIAL = new Set([0, 5, 10, 15, 24]);

  function getRadius(pos) {
    if (pos === 24) return CENTER_R;
    if (SPECIAL.has(pos)) return CORNER_R;
    return NORMAL_R;
  }

  function renderBoard(svgEl) {
    svgEl.innerHTML = '';

    const ns = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      const e = document.createElementNS(ns, tag);
      for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    }

    // Layer order: lines → nodes → rings(선택 표시) → pieces → highlight(목적지)
    const layerLines = el('g', { id: 'layer-lines' });
    const layerNodes = el('g', { id: 'layer-nodes' });
    const layerRings = el('g', { id: 'layer-rings' });
    const layerPieces = el('g', { id: 'layer-pieces' });
    const layerHighlight = el('g', { id: 'layer-highlight' });

    // Draw outer square lines
    const corners = [C[0], C[5], C[10], C[15], C[0]];
    for (let i = 0; i < 4; i++) {
      layerLines.appendChild(el('line', {
        x1: corners[i][0], y1: corners[i][1],
        x2: corners[i+1][0], y2: corners[i+1][1],
        class: 'board-line'
      }));
    }
    // Diagonals
    layerLines.appendChild(el('line', {
      x1: C[0][0], y1: C[0][1], x2: C[10][0], y2: C[10][1], class: 'board-line'
    }));
    layerLines.appendChild(el('line', {
      x1: C[5][0], y1: C[5][1], x2: C[15][0], y2: C[15][1], class: 'board-line'
    }));

    svgEl.appendChild(layerLines);

    // Draw nodes (skip position 20 — visually same as position 0)
    for (const [posStr, [x, y]] of Object.entries(coords)) {
      const pos = isNaN(posStr) ? posStr : Number(posStr);
      if (pos === 20) continue;
      const r = getRadius(pos);
      const isCorner = SPECIAL.has(pos) && pos !== 24;
      const isCenter = pos === 24;
      const cls = isCenter ? 'node-circle center' : isCorner ? 'node-circle corner' : 'node-circle';

      const circle = el('circle', { cx: x, cy: y, r, class: cls, 'data-pos': pos });
      layerNodes.appendChild(circle);

      // Node label: show text only for special positions
      const label = el('text', { x, y: y + r + 11, class: 'node-label', 'data-pos': pos });
      label.textContent = pos === 0 ? '출발' : pos === 24 ? '중앙' : '';
      layerNodes.appendChild(label);
    }

    svgEl.appendChild(layerNodes);
    svgEl.appendChild(layerRings);
    svgEl.appendChild(layerPieces);
    svgEl.appendChild(layerHighlight);
  }

  // ---- Destination preview: 흰색 점선 테두리 ----
  // destMap: { landing_pos: callback } — clicking that circle calls the callback
  function showDestinations(svgEl, destMap) {
    const layer = svgEl.querySelector('#layer-highlight');
    if (!layer) return;
    layer.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    for (const [posStr, cb] of Object.entries(destMap)) {
      const pos = posStr === 'EXIT' ? 'EXIT' : Number(posStr);

      // EXIT → gold ring at position 0
      // Position 20 (finish landing) → gold ring at position 0 with special label
      const isExit = pos === 'EXIT';
      const isFinishLanding = (pos === 20);
      const drawPos = isExit ? 0 : pos;
      if (!coords[drawPos]) continue;
      const [x, y] = coords[drawPos];
      const r = getRadius(0) + 7; // always use corner radius for pos 0 area
      const isGold = isExit || isFinishLanding;

      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('cx', x);
      ring.setAttribute('cy', y);
      ring.setAttribute('r', r);
      ring.setAttribute('fill', isGold ? 'rgba(200,125,14,0.12)' : 'rgba(36,113,163,0.10)');
      ring.setAttribute('stroke', isGold ? '#c87d0e' : '#2471a3');
      ring.setAttribute('stroke-width', '2.5');
      ring.setAttribute('stroke-dasharray', '6 4');
      ring.setAttribute('class', isGold ? 'dest-ring dest-exit' : 'dest-ring');
      ring.style.cursor = 'pointer';
      ring.addEventListener('click', () => cb());
      layer.appendChild(ring);

      // Gold label for finish area
      if (isGold) {
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', x);
        txt.setAttribute('y', y - r - 4);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        txt.setAttribute('fill', '#c87d0e');
        txt.textContent = isExit ? '완주!' : '출발선 도착';
        layer.appendChild(txt);
      }
    }
  }

  function clearDestinations(svgEl) {
    const layer = svgEl.querySelector('#layer-highlight');
    if (layer) layer.innerHTML = '';
  }

  // ---- Selectable piece rings: 선택 가능한 말 표시 ----
  // pieces: array of Piece objects that are ON_BOARD and selectable
  // selectedPieceId: currently selected piece (brighter ring)
  // onPieceClick: (piece) => void
  function setSelectableRings(svgEl, pieces, selectedPieceId, onPieceClick) {
    const layer = svgEl.querySelector('#layer-rings');
    if (!layer) return;
    layer.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    for (const piece of pieces) {
      if (piece.state !== 'ON_BOARD' || !coords[piece.position]) continue;
      const [x, y] = coords[piece.position];
      const r = 15;
      const isSelected = piece.pieceId === selectedPieceId;

      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('cx', x);
      ring.setAttribute('cy', y);
      ring.setAttribute('r', r);
      ring.setAttribute('fill', isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
      ring.setAttribute('stroke', isSelected ? 'white' : 'rgba(255,255,255,0.5)');
      ring.setAttribute('stroke-width', isSelected ? '2.5' : '1.5');
      ring.setAttribute('stroke-dasharray', isSelected ? 'none' : '4 3');
      ring.setAttribute('class', isSelected ? 'piece-select-ring selected' : 'piece-select-ring');
      ring.style.cursor = 'pointer';
      ring.addEventListener('click', () => onPieceClick(piece));
      layer.appendChild(ring);
    }
  }

  function clearSelectableRings(svgEl) {
    const layer = svgEl.querySelector('#layer-rings');
    if (layer) layer.innerHTML = '';
  }

  // Render all pieces onto the SVG board; onPieceClick optional
  function renderPieces(svgEl, pieces, teams, players, onPieceClick) {
    const layerPieces = svgEl.querySelector('#layer-pieces');
    if (!layerPieces) return;
    layerPieces.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    // Group pieces by position (pos 20 groups with pos 0 — same visual location)
    const byPos = {};
    for (const piece of Object.values(pieces)) {
      if (piece.state !== 'ON_BOARD') continue;
      const pos = piece.position === 20 ? 0 : piece.position;
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(piece);
    }

    const TEAM_COLORS = ['var(--team0)', 'var(--team1)', 'var(--team2)', 'var(--team3)'];

    for (const [posStr, piecesAtPos] of Object.entries(byPos)) {
      const pos = Number(posStr);
      if (!coords[pos]) continue;
      const [cx, cy] = coords[pos];
      const count = piecesAtPos.length;

      piecesAtPos.forEach((piece, idx) => {
        // Offset pieces slightly if multiple at same position
        const angle = (idx / Math.max(count, 1)) * 2 * Math.PI;
        const dist = count > 1 ? 8 : 0;
        const px = cx + dist * Math.cos(angle);
        const py = cy + dist * Math.sin(angle);

        // Determine color
        let color = '#888';
        if (piece.type === 'TEAM') {
          const teamIdx = teams.findIndex(t => t.id === piece.teamId);
          color = TEAM_COLORS[teamIdx % TEAM_COLORS.length];
        } else {
          const playerIdx = players.findIndex(p => p.id === piece.ownerId);
          color = TEAM_COLORS[playerIdx % TEAM_COLORS.length];
        }

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'piece-token');
        g.setAttribute('data-piece-id', piece.pieceId);
        if (onPieceClick) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => onPieceClick(piece));
        }

        if (piece.type === 'TEAM') {
          const circle = document.createElementNS(ns, 'circle');
          circle.setAttribute('cx', px);
          circle.setAttribute('cy', py);
          circle.setAttribute('r', 9);
          circle.setAttribute('fill', color);
          circle.setAttribute('stroke', 'white');
          circle.setAttribute('stroke-width', '1.5');
          g.appendChild(circle);
        } else {
          // Personal piece: triangle
          const size = 8;
          const pts = `${px},${py-size} ${px-size},${py+size} ${px+size},${py+size}`;
          const tri = document.createElementNS(ns, 'polygon');
          tri.setAttribute('points', pts);
          tri.setAttribute('fill', color);
          tri.setAttribute('stroke', 'white');
          tri.setAttribute('stroke-width', '1.5');
          g.appendChild(tri);
        }

        // Stack count label
        if (piece.stackCount && piece.stackCount > 1) {
          const txt = document.createElementNS(ns, 'text');
          txt.setAttribute('x', px);
          txt.setAttribute('y', py + 1);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('dominant-baseline', 'middle');
          txt.setAttribute('font-size', '8');
          txt.setAttribute('fill', 'white');
          txt.setAttribute('font-weight', 'bold');
          txt.textContent = piece.stackCount;
          g.appendChild(txt);
        }

        layerPieces.appendChild(g);
      });
    }
  }

  return {
    coords,
    nextMap,
    shortcuts,
    getLandingOptions,
    computePath,
    renderBoard,
    renderPieces,
    showDestinations,
    clearDestinations,
    setSelectableRings,
    clearSelectableRings,
    isShortcutCorner,
    CORNER_R, NORMAL_R, CENTER_R,
  };
})();

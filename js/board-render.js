// ===== BOARD SVG RENDERING =====

const BOARD_RENDER = (() => {
  const { coords } = BOARD_GRAPH;
  const CORNER_R = 22, NORMAL_R = 13, CENTER_R = 24;
  const SPECIAL = new Set([0, 5, 10, 15, 24]);
  const PIECE_R = 9, PIECE_STACK_OFFSET = 8, TRI_SIZE = 8;
  const SELECT_R = 15;

  // Outer-square corner coordinates (for drawing lines)
  const FRAME = [coords[0], [coords[5][0], coords[5][1]], [coords[10][0], coords[10][1]], [coords[15][0], coords[15][1]]];

  function radiusOf(pos) {
    if (pos === 24) return CENTER_R;
    if (SPECIAL.has(pos)) return CORNER_R;
    return NORMAL_R;
  }

  function nodeClass(pos) {
    if (pos === 24) return 'node-circle center';
    if (SPECIAL.has(pos) && pos !== 24) return 'node-circle corner';
    return 'node-circle';
  }

  function nodeLabel(pos) {
    if (pos === 0) return '출발';
    if (pos === 24) return '중앙';
    return '';
  }

  // ---- Layer setup ----
  function makeLayers(svg) {
    svg.innerHTML = '';
    const layers = {};
    for (const id of ['layer-lines', 'layer-nodes', 'layer-rings', 'layer-pieces', 'layer-highlight']) {
      const g = svgEl('g', { id });
      svg.appendChild(g);
      layers[id] = g;
    }
    return layers;
  }

  // ---- Frame: outer square + 2 diagonals ----
  function drawFrame(layer) {
    const [c0, c5, c10, c15] = FRAME;
    const corners = [c0, c5, c10, c15, c0];
    for (let i = 0; i < 4; i++) {
      layer.appendChild(svgEl('line', {
        x1: corners[i][0], y1: corners[i][1],
        x2: corners[i+1][0], y2: corners[i+1][1],
        class: 'board-line',
      }));
    }
    layer.appendChild(svgEl('line', { x1: c0[0],  y1: c0[1],  x2: c10[0], y2: c10[1], class: 'board-line' }));
    layer.appendChild(svgEl('line', { x1: c5[0],  y1: c5[1],  x2: c15[0], y2: c15[1], class: 'board-line' }));
  }

  // ---- Single node: circle + label ----
  function drawNode(layer, pos, x, y) {
    if (pos === 20) return; // pos 20 visually overlaps pos 0
    const r = radiusOf(pos);
    layer.appendChild(svgEl('circle', { cx: x, cy: y, r, class: nodeClass(pos), 'data-pos': pos }));
    layer.appendChild(svgEl('text', {
      x, y: y + r + 11, class: 'node-label', 'data-pos': pos,
    })).textContent = nodeLabel(pos);
  }

  function renderBoard(svg) {
    const layers = makeLayers(svg);
    drawFrame(layers['layer-lines']);
    for (const [posStr, [x, y]] of Object.entries(coords)) {
      const pos = isNaN(posStr) ? posStr : Number(posStr);
      drawNode(layers['layer-nodes'], pos, x, y);
    }
  }

  // ---- Destination preview ring ----
  function makeDestRing(x, y, r, isGold) {
    return svgEl('circle', {
      cx: x, cy: y, r,
      fill:   isGold ? 'rgba(200,125,14,0.12)' : 'rgba(36,113,163,0.10)',
      stroke: isGold ? '#c87d0e' : '#2471a3',
      'stroke-width': '2.5',
      'stroke-dasharray': '6 4',
      class: isGold ? 'dest-ring dest-exit' : 'dest-ring',
    });
  }

  function showDestinations(svg, destMap) {
    const layer = svg.querySelector('#layer-highlight');
    if (!layer) return;
    layer.innerHTML = '';
    for (const [posStr, cb] of Object.entries(destMap)) {
      const pos = posStr === 'EXIT' ? 'EXIT' : Number(posStr);
      const isExit = pos === 'EXIT';
      const isFinishLanding = pos === 20;
      const drawPos = isExit ? 0 : pos;
      if (!coords[drawPos]) continue;
      const [x, y] = coords[drawPos];
      const r = radiusOf(0) + 7;
      const isGold = isExit || isFinishLanding;

      const ring = makeDestRing(x, y, r, isGold);
      ring.style.cursor = 'pointer';
      ring.addEventListener('click', () => cb());
      layer.appendChild(ring);

      if (isGold) {
        const txt = svgEl('text', {
          x, y: y - r - 4, 'text-anchor': 'middle',
          'font-size': '10', fill: '#c87d0e',
        });
        txt.textContent = isExit ? '완주!' : '출발선 도착';
        layer.appendChild(txt);
      }
    }
  }

  function clearDestinations(svg) {
    const layer = svg.querySelector('#layer-highlight');
    if (layer) layer.innerHTML = '';
  }

  // ---- Selectable rings on movable pieces ----
  function makeSelectRing(x, y, isSelected) {
    return svgEl('circle', {
      cx: x, cy: y, r: SELECT_R,
      fill:   isSelected ? 'rgba(255,255,255,0.2)'  : 'rgba(255,255,255,0.06)',
      stroke: isSelected ? 'white'                  : 'rgba(255,255,255,0.5)',
      'stroke-width': isSelected ? '2.5' : '1.5',
      'stroke-dasharray': isSelected ? 'none' : '4 3',
      class: isSelected ? 'piece-select-ring selected' : 'piece-select-ring',
    });
  }

  function setSelectableRings(svg, pieces, selectedPieceId, onPieceClick) {
    const layer = svg.querySelector('#layer-rings');
    if (!layer) return;
    layer.innerHTML = '';
    for (const piece of pieces) {
      if (piece.state !== 'ON_BOARD' || !coords[piece.position]) continue;
      const [x, y] = coords[piece.position];
      const ring = makeSelectRing(x, y, piece.pieceId === selectedPieceId);
      ring.style.cursor = 'pointer';
      ring.addEventListener('click', () => onPieceClick(piece));
      layer.appendChild(ring);
    }
  }

  function clearSelectableRings(svg) {
    const layer = svg.querySelector('#layer-rings');
    if (layer) layer.innerHTML = '';
  }

  // ---- Piece rendering ----
  // Group pieces by visual position (pos 20 visually overlaps pos 0)
  function groupPiecesByPos(pieces) {
    const byPos = {};
    for (const piece of Object.values(pieces)) {
      if (piece.state !== 'ON_BOARD') continue;
      const pos = piece.position === 20 ? 0 : piece.position;
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(piece);
    }
    return byPos;
  }

  function pieceColor(piece, teams, players) {
    if (piece.type === 'TEAM') {
      const idx = teams.findIndex(t => t.id === piece.teamId);
      return teamColor(idx);
    }
    const idx = players.findIndex(p => p.id === piece.ownerId);
    return teamColor(idx);
  }

  function offsetForStack(cx, cy, idx, count) {
    if (count <= 1) return [cx, cy];
    const angle = (idx / count) * 2 * Math.PI;
    return [cx + PIECE_STACK_OFFSET * Math.cos(angle), cy + PIECE_STACK_OFFSET * Math.sin(angle)];
  }

  function drawTeamShape(x, y, color) {
    return svgEl('circle', {
      cx: x, cy: y, r: PIECE_R, fill: color, stroke: 'white', 'stroke-width': '1.5',
    });
  }

  function drawPersonalShape(x, y, color) {
    const points = `${x},${y - TRI_SIZE} ${x - TRI_SIZE},${y + TRI_SIZE} ${x + TRI_SIZE},${y + TRI_SIZE}`;
    return svgEl('polygon', { points, fill: color, stroke: 'white', 'stroke-width': '1.5' });
  }

  function drawStackLabel(x, y, count) {
    const txt = svgEl('text', {
      x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': '8', fill: 'white', 'font-weight': 'bold',
    });
    txt.textContent = count;
    return txt;
  }

  function drawPieceToken(piece, x, y, color) {
    const g = svgEl('g', { class: 'piece-token', 'data-piece-id': piece.pieceId });
    const shape = piece.type === 'TEAM' ? drawTeamShape(x, y, color) : drawPersonalShape(x, y, color);
    g.appendChild(shape);
    if (piece.stackCount > 1) g.appendChild(drawStackLabel(x, y, piece.stackCount));
    return g;
  }

  function renderPieces(svg, pieces, teams, players, onPieceClick) {
    const layer = svg.querySelector('#layer-pieces');
    if (!layer) return;
    layer.innerHTML = '';

    const byPos = groupPiecesByPos(pieces);
    for (const [posStr, group] of Object.entries(byPos)) {
      const pos = Number(posStr);
      if (!coords[pos]) continue;
      const [cx, cy] = coords[pos];
      group.forEach((piece, idx) => {
        const [x, y] = offsetForStack(cx, cy, idx, group.length);
        const color = pieceColor(piece, teams, players);
        const token = drawPieceToken(piece, x, y, color);
        if (onPieceClick) {
          token.style.cursor = 'pointer';
          token.addEventListener('click', () => onPieceClick(piece));
        }
        layer.appendChild(token);
      });
    }
  }

  return {
    renderBoard,
    renderPieces,
    showDestinations,
    clearDestinations,
    setSelectableRings,
    clearSelectableRings,
    CORNER_R, NORMAL_R, CENTER_R,
  };
})();

// ---- Combined BOARD facade (preserves original API) ----
const BOARD = {
  coords:       BOARD_GRAPH.coords,
  nextMap:      BOARD_GRAPH.nextMap,
  shortcuts:    BOARD_GRAPH.shortcuts,
  getLandingOptions:  BOARD_GRAPH.getLandingOptions,
  computePath:        BOARD_GRAPH.computePath,
  isShortcutCorner:   BOARD_GRAPH.isShortcutCorner,
  renderBoard:        BOARD_RENDER.renderBoard,
  renderPieces:       BOARD_RENDER.renderPieces,
  showDestinations:   BOARD_RENDER.showDestinations,
  clearDestinations:  BOARD_RENDER.clearDestinations,
  setSelectableRings: BOARD_RENDER.setSelectableRings,
  clearSelectableRings: BOARD_RENDER.clearSelectableRings,
  CORNER_R: BOARD_RENDER.CORNER_R,
  NORMAL_R: BOARD_RENDER.NORMAL_R,
  CENTER_R: BOARD_RENDER.CENTER_R,
};

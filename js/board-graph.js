// ===== BOARD GRAPH + PATHFINDING =====
// Position numbering:
//   0        : start/finish corner (bottom-right)
//   1-4      : right edge (bottom→top), 5=top-right corner
//   6-9      : top edge,                 10=top-left corner
//   11-14    : left edge,                15=bottom-left corner
//   16-19    : bottom edge,              20=virtual finish landing (same spot as 0)
//   21,27    : diagonal 5→center
//   22,28    : diagonal 10→center
//   23,29    : diagonal 15→center (only reached from 24 via prev=27)
//   24       : center
//   25,26    : center→exit arm
//  'EXIT'    : finished

const BOARD_GRAPH = (() => {
  const SVG_W = 600, SVG_H = 600, PAD = 60;
  const CORNERS = {
    0:  [SVG_W - PAD, SVG_H - PAD],
    5:  [SVG_W - PAD, PAD],
    10: [PAD, PAD],
    15: [PAD, SVG_H - PAD],
    24: [SVG_W / 2, SVG_H / 2],
  };

  const lerp = ([x1,y1], [x2,y2], t) => [x1 + (x2-x1)*t, y1 + (y2-y1)*t];
  const edgePositions = (a, b) => [1,2,3,4].map(i => lerp(a, b, i/5));

  // ---- coords: position → [x, y] ----
  const coords = {};
  coords[0] = CORNERS[0];
  edgePositions(CORNERS[0],  CORNERS[5]).forEach((p,i) => coords[i+1]  = p);
  coords[5] = CORNERS[5];
  edgePositions(CORNERS[5],  CORNERS[10]).forEach((p,i) => coords[i+6]  = p);
  coords[10] = CORNERS[10];
  edgePositions(CORNERS[10], CORNERS[15]).forEach((p,i) => coords[i+11] = p);
  coords[15] = CORNERS[15];
  edgePositions(CORNERS[15], CORNERS[0]).forEach((p,i)  => coords[i+16] = p);
  coords[20] = CORNERS[0]; // virtual finish landing
  coords[21] = lerp(CORNERS[5],  CORNERS[24], 1/3);
  coords[27] = lerp(CORNERS[5],  CORNERS[24], 2/3);
  coords[22] = lerp(CORNERS[10], CORNERS[24], 1/3);
  coords[28] = lerp(CORNERS[10], CORNERS[24], 2/3);
  coords[23] = lerp(CORNERS[15], CORNERS[24], 1/3);
  coords[29] = lerp(CORNERS[15], CORNERS[24], 2/3);
  coords[24] = CORNERS[24];
  coords[25] = lerp(CORNERS[24], CORNERS[0], 1/3);
  coords[26] = lerp(CORNERS[24], CORNERS[0], 2/3);

  // ---- nextMap: normal one-step forward ----
  const nextMap = {};
  for (let i = 0; i <= 18; i++) nextMap[i] = [i + 1];
  nextMap[19] = [20];
  nextMap[20] = ['EXIT'];
  nextMap[21] = [27]; nextMap[27] = [24];
  nextMap[22] = [28]; nextMap[28] = [24];
  nextMap[29] = [23]; nextMap[23] = [15];
  nextMap[24] = [25];
  nextMap[25] = [26]; nextMap[26] = ['EXIT'];

  // ---- Branching corners (shortcut diagonals) ----
  const shortcuts = { 5: [6, 21], 10: [11, 22] };
  const isShortcutCorner = pos => pos in shortcuts;

  // ---- Backward map (for 빽도) ----
  const backwardMap = {
    21: 5,  27: 21,
    22: 10, 28: 22,
    23: 29, 29: 24,
    25: 24, 26: 25,
    20: 19,
  };

  // ---- Forward step: determine successors of `cur` ----
  function forwardNexts(cur, prev, startPos) {
    if (cur === 24) {
      // Center: arm depends on which arm we arrived from.
      // Branch (29 ∨ 25) only if STANDING at center at turn start.
      if (cur === startPos) return (prev === 27) ? [29, 25] : [25];
      return (prev === 27) ? [29] : [25];
    }
    if (cur === startPos && isShortcutCorner(cur)) return shortcuts[cur];
    return nextMap[cur] || ['EXIT'];
  }

  // ---- Backward step (single) ----
  function backwardStep(pos, prevPos) {
    if (pos >= 1 && pos <= 19) return pos - 1;
    if (pos === 24 && prevPos != null) return prevPos;
    return backwardMap[pos];
  }

  // 빽도: 후진 이동 — 출발선/대기 상태는 후진 불가
  function getBackwardLanding(fromPos, steps, prevPos) {
    if (fromPos === -1 || fromPos === 0) return [];
    let pos = fromPos;
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = backwardStep(pos, prevPos);
      if (next === undefined) return [];
      pos = next;
    }
    return [{ landing: pos, prev: fromPos, path: [pos] }];
  }

  // 전진: BFS — 분기(코너 단축, 중앙)를 고려해 가능한 모든 landing을 수집
  function getForwardLandings(fromPos, steps, prevPos) {
    const startPos  = (fromPos === -1) ? 0 : fromPos;
    const startPrev = (prevPos != null) ? prevPos : null;

    let frontier = [{ cur: startPos, prev: startPrev, stepsLeft: steps, path: [] }];
    const results = [];

    while (frontier.length > 0) {
      const next = [];
      for (const node of frontier) {
        if (node.stepsLeft === 0) {
          results.push({ landing: node.cur, prev: node.prev, path: node.path });
          continue;
        }
        const succs = forwardNexts(node.cur, node.prev, startPos);
        for (const n of succs) {
          if (n === 'EXIT') {
            results.push({ landing: 'EXIT', prev: node.cur, path: [...node.path, 'EXIT'] });
          } else {
            next.push({ cur: n, prev: node.cur, stepsLeft: node.stepsLeft - 1, path: [...node.path, n] });
          }
        }
      }
      frontier = next;
    }
    return dedupeByLanding(results);
  }

  function dedupeByLanding(results) {
    const seen = new Set();
    return results.filter(r => {
      const key = String(r.landing);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Public: 모든 가능 landing 옵션 반환
  function getLandingOptions(fromPos, steps, prevPos) {
    if (steps < 0) return getBackwardLanding(fromPos, steps, prevPos);
    return getForwardLandings(fromPos, steps, prevPos);
  }

  function computePath(fromPos, steps, prevPos) {
    const opts = getLandingOptions(fromPos, steps, prevPos);
    return opts.length > 0 ? opts[0].path : [];
  }

  return {
    coords,
    nextMap,
    shortcuts,
    getLandingOptions,
    computePath,
    isShortcutCorner,
  };
})();

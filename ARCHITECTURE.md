# Architecture

전략 윷놀이 (팀 협력 + 개인 경쟁) — 빌드 없이 `index.html`을 브라우저에서 직접 여는 vanilla JS 게임.

## Tech Stack

- 빌드 시스템 없음. `<script>` 태그로 글로벌 객체 노출.
- Three.js (CDN)만 외부 의존성 — 3D 윷 던지기에서만 사용.
- ES6+ (templates, destructuring, arrow, spread), 트랜스파일 안 함.

## File Layout

```
js/
├── constants.js     — 공유 상수 (TEAM_COLORS/EMOJIS, MIN/MAX_PLAYERS, teamColor/teamIndexOf)
├── dom.js           — DOM/SVG 헬퍼 ($/svgEl/htmlEl, showScreen, showNotification)
├── state.js         — 상태 모델 + queries + gameState 싱글톤
├── board-graph.js   — 보드 그래프, 좌표, 경로 계산(BFS, 빽도)
├── board-render.js  — 보드 SVG 렌더링 + BOARD facade
├── game.js          — 윷/이동/스택/잡기 로직 (순수)
├── setup.js         — 4단계 설정 흐름 (드래그앤드롭 포함)
├── yut-anim.js      — 컨트롤 패널용 2D 윷 결과 애니메이션
├── ui.js            — UI 컨트롤러 (turn 표시, progress, piece 선택)
├── yut3d.js         — Three.js 3D 윷 던지기 + 커스텀 물리
└── main.js          — 진입점: turn flow 컨트롤
```

`index.html`에서 위 순서로 로드된다. **의존성은 단방향**: 위쪽 파일은 아래쪽 파일의 식별자를 알지 못한다.

```
constants ──▶ dom ──▶ state ──▶ board-graph ──▶ board-render ──▶ game ──▶ setup
                                                                  │         │
                                                                  ▼         ▼
                                                              yut-anim     ui
                                                                  │         │
                                                                  └────┬────┘
                                                                       ▼
                                                                     yut3d ──▶ main
```

## State Model (`state.js`)

싱글턴 `gameState` — `getState()` / `setState(newState)`로만 접근. 새 상태는 immutable spread로 생성한다 (`{ ...state, ... }`).

```js
{
  phase: 'SETUP' | 'GAME' | 'FINISHED',
  players: [{ id, name }],
  teams:   [{ id, name, playerIds, colorIndex }],
  turnOrder: [playerId],         // 팀별 인터리브
  currentTurnIndex: number,
  pieces: { [pieceId]: Piece },
  boardState: { [position]: [pieceId] },  // ON_BOARD 인덱스
  pendingYutResults: [steps],    // 사용 대기 중인 이동 칸 수
  canRollAgain: boolean,         // 윷/모/잡기 시 true
  winner: null | { type, id },
  lastYutRoll: null | { name, steps, sticks },
}
```

### Piece 상태머신

```
            ┌────────────┐
            │  WAITING   │ position = -1
            └─────┬──────┘
                  │ 이동 클릭
                  ▼
            ┌────────────┐
            │  ON_BOARD  │ position = 0..29
            └─────┬──────┘
              ┌───┴────────┐
              ▼            ▼
        STACKED         FINISHED        EXIT 도달
        (stackedOn)     (position = 'EXIT')
              │
              └─ carrier가 잡히면 같이 WAITING으로 복귀
              └─ carrier가 완주하면 같이 FINISHED
```

- **stackCount**: carrier piece에만 표시되는 누적 마릿수 (sub는 항상 1).
- **stackedOn**: sub만 가짐. carrier ID 참조. carrier 자체에는 키가 없음 (factory에서 미설정).
- **prevPosition**: 중앙(24)에서 분기 결정용. 잡혀서 WAITING 가도 유지된다 (의도적).

## Board Graph (`board-graph.js`)

```
포지션 번호:
  0           : 출발선 (bottom-right)
  1-4         : 우측 변
  5           : 우상 코너 (단축 분기 가능: 6 또는 21)
  6-9         : 상단 변
  10          : 좌상 코너 (단축 분기 가능: 11 또는 22)
  11-14       : 좌측 변
  15          : 좌하 코너 (단축 없음)
  16-19       : 하단 변
  20          : 가상 finish landing (시각적으로 0과 같은 좌표)
  21, 27      : 5→24 대각선
  22, 28      : 10→24 대각선
  23, 29      : 24→15 대각선 (29는 24에서 prev=27일 때만 진입)
  24          : 중앙
  25, 26      : 24→0 완주 경로
  'EXIT'      : 완주
```

### 경로 계산: `getLandingOptions(fromPos, steps, prevPos)`

- `steps > 0`: BFS로 분기 가능한 모든 landing 수집 → `{ landing, prev, path }[]`.
- `steps < 0` (빽도): 단일 후진 경로. `pos=-1` 또는 `pos=0`이면 빈 배열 (대기/출발선에서 후진 불가).
- 코너 5/10에 **착지한 순간**에만 단축(대각선) 옵션이 분기됨. 지나가는 도중엔 분기 없음.
- 중앙(24)에서는 `prevPos === 27`일 때만 29 방향 가능. 그 외엔 25(완주) 방향.

## Yut Results (`game.js`)

| 뒷면 수 | 결과 | steps | 보너스 |
|---|---|---|---|
| 0 | 모 | +5 | ✓ |
| 1 | 도 | +1 |  |
| 2 | 개 | +2 |  |
| 3 | 걸 | +3 |  |
| 4 | 윷 | +4 | ✓ |
| 1 (특수 막대) | 빽도 | -1 |  |

특수 막대(index 0)가 뒷면이고 1개만 뒤면 빽도. 보너스는 한 번 더 던지기 + canRollAgain 유지.

## Module APIs

전역 객체로 노출됨. 모듈 간 직접 호출만 사용 (이벤트 디스패칭 없음).

### `BOARD` (board-graph + board-render facade)
- `coords` `nextMap` `shortcuts` `CORNER_R/NORMAL_R/CENTER_R`
- `getLandingOptions(fromPos, steps, prevPos)` `computePath(...)` `isShortcutCorner(pos)`
- `renderBoard(svg)` `renderPieces(svg, pieces, teams, players, onClick?)`
- `showDestinations(svg, destMap)` `clearDestinations(svg)`
- `setSelectableRings(svg, pieces, selectedId, onClick)` `clearSelectableRings(svg)`

### `GAME`
- `rollYut() → { name, steps, sticks }` (랜덤; 3D 흐름에서는 사용 안 함)
- `applyMove(pieceId, steps, state, targetLanding) → { newState, captured, hasShortcutChoice, landingOptions, landing }`
- `processRoll(roll, state) → { newState, isBonusRoll }`
- `consumePendingResult(state)` `consumePendingResultAt(state, idx)` `hasMoreMoves(state)`
- `getMovablePiecesForCurrentTurn(state)`
- `YUT_STEPS` (이름 → steps 매핑)

### `UI`
- `startGame()` `updateAll()` `updateTurnInfo/ProgressBars/BoardPieces`
- `updatePendingDisplay(state, selectedIdx, onSelect)` `setRollEnabled(bool)`
- `showYutResult(roll) → Promise` (YUT_ANIM.show로 위임)
- `showPieceSelection(movable, state, steps, onSelect)` `hidePieceSelection()`
- `showShortcutChoice(corner, onChoice)` `showWinner(winner, state)`

### `SETUP`
- `init()` `reset()` `setupData()` (getter)

### `YUT3D`
- `show(callback)` — 오버레이 띄우고 hold/release 후 `callback({ name, steps, sticks })` 호출
- `hide()`

### `YUT_ANIM`
- `show(roll) → Promise` — 컨트롤 패널 윷 결과 2D 애니메이션

## Pure Helpers (전역 함수)

`state.js` — `createInitialState/Player/Team/Piece`, `buildTurnOrder`, `initializePieces`, `getTeamPieces`, `getPersonalPieces`, `findPlayerTeam`, `getCurrentPlayer`, `getCurrentTeam`, `isPieceMovable`, `getMovablePieces`, `checkVictory`, `rebuildBoardState`, `advanceTurn`, `getState/setState`.

`constants.js` — `teamColor(idx)`, `teamIndexOf(state, teamId)`.

`dom.js` — `$(id)`, `svgEl(tag, attrs)`, `htmlEl(tag, opts)`, `showScreen(name)`, `showNotification(msg, type, areaId?)`.

## Turn Flow (`main.js`)

```
[윷 던지기 버튼]
   │
   ▼
onRollClicked → UI.setRollEnabled(false) → YUT3D.show(onRollComplete)
                                                    │
                                                    ▼
                                          GAME.processRoll → setState
                                          pending에 steps 추가
                                          (모/윷이면 canRollAgain 유지)
                                                    │
                                                    ▼
                                          refreshTurnUI
                                          (pending badges, movable pieces 표시)

[대기말 클릭 or 보드 piece-select-ring 클릭]
   │
   ▼
onPieceClicked → showDestinationsFor → BOARD.showDestinations
                                       (각 ring에 onClick=applyPieceMove)

[목적지 ring 클릭]
   │
   ▼
applyPieceMove → GAME.applyMove → consumePendingResultAt
              → 잡으면 canRollAgain = true
              → setState, UI.updateAll
              → checkVictory → 승리시 phase=FINISHED
              → pending 비고 canRollAgain false면 endTurn
                                                  │
                                                  ▼
                                        advanceTurn → setState
                                        UI 재갱신, 알림
```

## Conventions

- **Immutable state**: state.js 헬퍼들은 새 state를 반환한다. `setState`로만 교체.
- **Side-effect 분리**: `state.js` / `board-graph.js` / `game.js`는 순수. DOM은 `board-render.js` / `setup.js` / `ui.js` / `yut-anim.js` / `yut3d.js` / `main.js`만.
- **SVG 생성은 `svgEl`로**: `document.createElementNS` 직접 호출 금지. `dom.js` 헬퍼 사용.
- **TEAM_COLORS 직접 작성 금지**: `teamColor(idx)` 사용.
- **함수는 작게**: 각 함수가 한 가지 일만 하도록. 분해해도 무방.
- **새 상수는 `constants.js`로**, 새 DOM 헬퍼는 `dom.js`로 추가.

## Adding a Feature

1. **순수 로직**: state.js / board-graph.js / game.js 중 적절한 곳에 추가. input/output 결정 후 작은 함수로.
2. **렌더링**: board-render.js (보드 위) 또는 ui.js (컨트롤 패널) 중 한 곳.
3. **이벤트 wiring**: main.js의 turn flow 또는 setup.js에 연결.
4. **상수 추가**: constants.js에. 색/엠지/제한값.
5. **검증**: setup → game 1턴 e2e를 Playwright로 돌려본다. 순수 함수는 input/output 동등성으로 테스트.

## Known Quirks

- `initializePieces(teams, players, ...)`의 `players` 인자는 시그니처 호환을 위해 받지만 사용하지 않음. piece의 owner는 `team.playerIds`에서 derive.
- `pos 20` (가상 finish landing)은 시각적으로 `pos 0`과 같은 좌표에 그려진다 — `renderPieces`/`showDestinations`가 그룹핑 처리.
- `prevPosition`은 잡혀서 WAITING 가도 유지된다. 다시 출발할 때 새 prev가 덮어쓴다.
- 잡힘 시 `canRollAgain = true`이지만 pending이 비어있으면 다음 던지기 후 자동 진행. pending이 남아있으면 추가 던지기 vs 이동 선택권.

## Verification

리팩토링/리프레쉬 시 회귀 검증법:
1. 순수 함수: `getLandingOptions`/`applyMove`/`processRoll` 등 input/output을 `mcp__playwright__browser_evaluate`로 캡쳐 → diff로 비교.
2. 렌더: `renderBoard` 후 SVG DOM 노드 수/속성 캡쳐.
3. e2e: setup 4단계를 evaluate 클릭으로 통과 → `getState()` 캡쳐.

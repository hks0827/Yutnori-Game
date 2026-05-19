// ===== SHARED CONSTANTS =====

const TEAM_COLORS = ['var(--team0)', 'var(--team1)', 'var(--team2)', 'var(--team3)'];
const TEAM_EMOJIS = ['🔴', '🔵', '🟡', '🟢'];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MIN_TEAMS = 2;
const MAX_TEAMS = 4;

// ===== BOARD POSITIONS =====
// 자세한 보드 좌표 번호는 ARCHITECTURE.md > Board Graph 참고.
const WAITING_POSITION = -1;         // 아직 보드 진입 전 (대기)
const START_POSITION = 0;            // 출발선
const CENTER_POSITION = 24;          // 중앙
const FINISH_LANDING_POSITION = 20;  // 가상 finish landing — 시각적으로 출발선(0)과 같은 칸

// ===== YUT STICKS =====
const NUM_YUT_STICKS = 4;

function teamColor(index) {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

function teamIndexOf(state, teamId) {
  return state.teams.findIndex(t => t.id === teamId);
}

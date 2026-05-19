// ===== SHARED CONSTANTS =====

const TEAM_COLORS = ['var(--team0)', 'var(--team1)', 'var(--team2)', 'var(--team3)'];
const TEAM_EMOJIS = ['🔴', '🔵', '🟡', '🟢'];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MIN_TEAMS = 2;
const MAX_TEAMS = 4;

function teamColor(index) {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

function teamIndexOf(state, teamId) {
  return state.teams.findIndex(t => t.id === teamId);
}

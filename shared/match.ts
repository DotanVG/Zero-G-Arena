export const MATCH_TEAM_SIZES = [1, 5, 10, 20] as const;

export type MatchTeamSize = (typeof MATCH_TEAM_SIZES)[number];

export interface SoloMatchConfig {
  humanName: string;
  humanTeam: 0 | 1;
  teamSize: MatchTeamSize;
}

export interface SoloBotFill {
  team0Bots: number;
  team1Bots: number;
  totalBots: number;
  totalPlayers: number;
}

export function isMatchTeamSize(value: number): value is MatchTeamSize {
  return MATCH_TEAM_SIZES.includes(value as MatchTeamSize);
}

export function getSoloBotFill(
  teamSize: MatchTeamSize,
  humanTeam: 0 | 1 = 0,
): SoloBotFill {
  const team0Bots = teamSize - (humanTeam === 0 ? 1 : 0);
  const team1Bots = teamSize - (humanTeam === 1 ? 1 : 0);
  return {
    team0Bots,
    team1Bots,
    totalBots: team0Bots + team1Bots,
    totalPlayers: teamSize * 2,
  };
}

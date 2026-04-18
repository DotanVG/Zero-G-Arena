/**
 * Pure helpers for match-level progression (separate from per-round logic).
 *
 * A "match" is a sequence of rounds; the first team to `target` round wins
 * takes the match. Kept here (shared) so solo and server can share rules.
 */

export interface MatchScore {
  team0: number;
  team1: number;
}

/**
 * Given a running match score and the target number of round wins, return
 * the winning team (0 or 1) once a team has reached the target. Returns
 * null while the match is still ongoing.
 *
 * Ties at the target (both teams at target in the same update) favour
 * the team with more wins; if exactly equal, team 0 wins on tiebreak —
 * this branch is only reachable via malformed input, since our flow
 * can only award one round at a time.
 */
export function findMatchWinner(
  score: MatchScore,
  target: number,
): 0 | 1 | null {
  if (target <= 0) return null;
  const t0 = score.team0 >= target;
  const t1 = score.team1 >= target;
  if (!t0 && !t1) return null;
  if (t0 && !t1) return 0;
  if (t1 && !t0) return 1;
  return score.team0 >= score.team1 ? 0 : 1;
}

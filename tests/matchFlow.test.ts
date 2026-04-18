import { describe, expect, it } from "vitest";
import { findMatchWinner } from "../shared/match-flow";

describe("findMatchWinner", () => {
  it("returns null while neither team has reached the target", () => {
    expect(findMatchWinner({ team0: 0, team1: 0 }, 5)).toBeNull();
    expect(findMatchWinner({ team0: 4, team1: 4 }, 5)).toBeNull();
    expect(findMatchWinner({ team0: 2, team1: 3 }, 5)).toBeNull();
  });

  it("returns 0 once team 0 reaches target first", () => {
    expect(findMatchWinner({ team0: 5, team1: 3 }, 5)).toBe(0);
  });

  it("returns 1 once team 1 reaches target first", () => {
    expect(findMatchWinner({ team0: 2, team1: 5 }, 5)).toBe(1);
  });

  it("awards the higher-scoring team if both are at or above target", () => {
    // Normal flow can only award one round at a time so the other team
    // can't jump over the line on the same update, but the helper must
    // still give a deterministic answer if it happens.
    expect(findMatchWinner({ team0: 6, team1: 5 }, 5)).toBe(0);
    expect(findMatchWinner({ team0: 5, team1: 7 }, 5)).toBe(1);
  });

  it("treats target<=0 as an open-ended match (no winner)", () => {
    expect(findMatchWinner({ team0: 10, team1: 0 }, 0)).toBeNull();
    expect(findMatchWinner({ team0: 10, team1: 0 }, -1)).toBeNull();
  });

  it("handles scores above target (multiple late awards) without overflow", () => {
    expect(findMatchWinner({ team0: 100, team1: 0 }, 5)).toBe(0);
  });
});

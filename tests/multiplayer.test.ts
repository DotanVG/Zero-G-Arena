import { describe, expect, it } from "vitest";
import {
  buildBotName,
  canStartLobbyRound,
  getPreferredJoinTeam,
} from "../shared/multiplayer";

describe("getPreferredJoinTeam", () => {
  it("balances new humans onto the less populated side", () => {
    expect(getPreferredJoinTeam([])).toBe(0);
    expect(getPreferredJoinTeam([{ team: 0 }, { team: 1 }])).toBe(0);
    expect(getPreferredJoinTeam([{ team: 0 }, { team: 0 }, { team: 1 }])).toBe(1);
  });
});

describe("canStartLobbyRound", () => {
  it("requires all connected humans to be ready and both teams filled", () => {
    expect(canStartLobbyRound([
      { team: 0, ready: true, isBot: false, connected: true },
      { team: 1, ready: false, isBot: false, connected: true },
      { team: 0, ready: false, isBot: true, connected: true },
      { team: 1, ready: false, isBot: true, connected: true },
    ], 2)).toBe(false);

    expect(canStartLobbyRound([
      { team: 0, ready: true, isBot: false, connected: true },
      { team: 1, ready: true, isBot: false, connected: true },
      { team: 0, ready: false, isBot: true, connected: true },
      { team: 1, ready: false, isBot: true, connected: true },
    ], 2)).toBe(true);
  });
});

describe("buildBotName", () => {
  it("uses readable team-prefixed bot names", () => {
    expect(buildBotName(0, 0)).toBe("CY-BOT-01");
    expect(buildBotName(2, 1)).toBe("MG-BOT-03");
  });
});

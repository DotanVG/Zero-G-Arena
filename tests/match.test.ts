import { describe, expect, it } from "vitest";
import { getSoloBotFill } from "../shared/match";
import { buildHudRosters } from "../client/src/match/rosterView";

describe("getSoloBotFill", () => {
  it("fills a 1v1 skirmish with one enemy bot", () => {
    expect(getSoloBotFill(1, 0)).toEqual({
      team0Bots: 0,
      team1Bots: 1,
      totalBots: 1,
      totalPlayers: 2,
    });
  });

  it("fills larger formats around the human on team 0", () => {
    expect(getSoloBotFill(5, 0)).toEqual({
      team0Bots: 4,
      team1Bots: 5,
      totalBots: 9,
      totalPlayers: 10,
    });
    expect(getSoloBotFill(10, 0).totalBots).toBe(19);
    expect(getSoloBotFill(20, 0).totalBots).toBe(39);
  });
});

describe("buildHudRosters", () => {
  it("keeps the local player first and preserves bot labels", () => {
    const rosters = buildHudRosters("local-player", 0, [
      {
        id: "bot-1",
        name: "UNIT-7",
        team: 1,
        isBot: true,
        kills: 0,
        deaths: 1,
        phase: "FLOATING",
        frozen: false,
        ping: 0,
      },
      {
        id: "local-player",
        name: "Pilot",
        team: 0,
        isBot: false,
        kills: 2,
        deaths: 0,
        phase: "BREACH",
        frozen: false,
        ping: 0,
      },
      {
        id: "bot-2",
        name: "NOVA-5",
        team: 0,
        isBot: true,
        kills: 1,
        deaths: 0,
        phase: "FROZEN",
        frozen: true,
        ping: 0,
      },
    ]);

    expect(rosters.ownTeam[0]).toMatchObject({ id: "local-player", isBot: false });
    expect(rosters.ownTeam[1]).toMatchObject({ id: "bot-2", isBot: true, frozen: true });
    expect(rosters.enemyTeam[0]).toMatchObject({ id: "bot-1", isBot: true });
  });
});

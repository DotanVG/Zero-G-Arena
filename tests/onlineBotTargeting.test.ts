import { describe, expect, it } from "vitest";
import {
  getOnlineActorBreachTeam,
  isOnlineActorTargetableByBot,
} from "../server/src/colyseus/OrbitalLobbyRoom";

const GOAL_SIGNS = { team0: -1 as const, team1: 1 as const };

describe("online bot targeting", () => {
  it("treats actors inside team breach rooms as protected", () => {
    expect(
      getOnlineActorBreachTeam(
        { posX: 0, posY: 0, posZ: -23 },
        "z",
        GOAL_SIGNS,
      ),
    ).toBe(0);

    expect(
      getOnlineActorBreachTeam(
        { posX: 0, posY: 0, posZ: 23 },
        "z",
        GOAL_SIGNS,
      ),
    ).toBe(1);
  });

  it("does not let bots target enemies sheltering in breach", () => {
    expect(
      isOnlineActorTargetableByBot(
        0,
        {
          team: 1,
          frozen: false,
          phase: "BREACH",
          posX: 0,
          posY: 0,
          posZ: 23,
        },
        "z",
        GOAL_SIGNS,
      ),
    ).toBe(false);
  });

  it("still allows arena targets outside breach protection", () => {
    expect(
      isOnlineActorTargetableByBot(
        0,
        {
          team: 1,
          frozen: false,
          phase: "FLOATING",
          posX: 0,
          posY: 0,
          posZ: 0,
        },
        "z",
        GOAL_SIGNS,
      ),
    ).toBe(true);
  });
});

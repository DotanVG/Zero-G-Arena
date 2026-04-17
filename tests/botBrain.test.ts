import { describe, expect, it } from "vitest";
import {
  BotBrain,
  buildBarGraph,
  createBotPersonality,
  pickPreferredBar,
  type BotPersonality,
} from "../client/src/match/botBrain";

const TEST_ARENA = {
  getAllBarGrabPoints: () => [],
  getBreachOpenAxis: () => "z" as const,
  getBreachOpenSign: (team: 0 | 1) => (team === 0 ? -1 : 1) as 1 | -1,
  getBreachRoomCenter: (team: 0 | 1) => ({ x: 0, y: 0, z: team === 0 ? -16 : 16 }),
  getNearestBar: () => null,
  isDeepInBreachRoom: () => false,
  isGoalDoorOpen: () => true,
  isInBreachRoom: () => false,
};

function createTestPersonality(): BotPersonality {
  return {
    aimNoise: 0,
    aimReleaseMax: 0.8,
    aimReleaseMin: 0.7,
    archetype: "hunter",
    barDirectionWeight: 3,
    barDistanceWeight: 1,
    barLateralBias: 0.4,
    barVerticalBias: 0,
    breachForwardBias: 1,
    breachStrafeAmplitude: 0.1,
    breachWeaveSpeed: 1,
    decisionInterval: 0.25,
    enemyFocusBias: 0.8,
    fireCooldown: 0.2,
    fireRange: 30,
    grabDecisionDelay: 0.05,
    launchChargeSeconds: 0.8,
    pathNoise: 0.15,
    routeLengthMax: 3,
    routeLengthMin: 2,
    rngSeed: 99,
    shotSpreadBase: 0.08,
    weaveOffset: 0,
  };
}

describe("pickPreferredBar", () => {
  it("prefers bars aligned with the portal direction", () => {
    const choice = pickPreferredBar(
      { x: 0, y: 0, z: 0 },
      [
        { x: -4, y: 0, z: 0 },
        { x: 0, y: 0, z: -6 },
        { x: 0, y: 0, z: 4 },
      ],
      { x: 0, y: 0, z: -1 },
    );

    expect(choice).toEqual({ x: 0, y: 0, z: -6 });
  });

  it("can bias different bots toward different lanes", () => {
    const leftChoice = pickPreferredBar(
      { x: 0, y: 0, z: 0 },
      [
        { x: -4, y: 0, z: -8 },
        { x: 4, y: 0, z: -8 },
      ],
      { x: 0, y: 0, z: -1 },
      { lateralBias: -2 },
    );
    const rightChoice = pickPreferredBar(
      { x: 0, y: 0, z: 0 },
      [
        { x: -4, y: 0, z: -8 },
        { x: 4, y: 0, z: -8 },
      ],
      { x: 0, y: 0, z: -1 },
      { lateralBias: 2 },
    );

    expect(leftChoice).not.toBeNull();
    expect(rightChoice).not.toBeNull();
    expect(leftChoice).not.toEqual(rightChoice);
  });
});

describe("createBotPersonality", () => {
  it("is deterministic for the same bot id", () => {
    const first = createBotPersonality("bot-magenta-3", 1);
    const second = createBotPersonality("bot-magenta-3", 1);

    expect(first).toEqual(second);
  });

  it("creates materially different behavior profiles across bots", () => {
    const first = createBotPersonality("bot-cyan-0", 0);
    const second = createBotPersonality("bot-cyan-1", 0);

    expect(
      first.archetype === second.archetype
        && first.launchChargeSeconds === second.launchChargeSeconds
        && first.barLateralBias === second.barLateralBias,
    ).toBe(false);
  });
});

describe("BotBrain", () => {
  it("plans a route through bars while floating", () => {
    const graph = buildBarGraph([
      { x: -6, y: 0, z: -4 },
      { x: -2, y: 0, z: -9 },
      { x: 2, y: 0, z: -13 },
      { x: 6, y: 0, z: -18 },
    ]);
    const brain = new BotBrain(createTestPersonality());
    brain.resetForRound(12);

    const command = brain.tick(
      {
        currentBreachTeam: 0,
        damage: { frozen: false, leftArm: false, rightArm: false, legs: false },
        phase: "FLOATING",
        pos: { x: 0, y: 0, z: 0 },
        rot: { yaw: 0, pitch: 0 },
        team: 0,
      },
      TEST_ARENA,
      graph,
      [],
      0.16,
    );

    expect(command.targetBar).not.toBeNull();
    expect(command.grab).toBe(false);
  });

  it("reseeds shot spread between rounds while keeping the same bot identity", () => {
    const graph = buildBarGraph([{ x: 0, y: 0, z: -8 }]);
    const brain = new BotBrain(createTestPersonality());
    const bot = {
      currentBreachTeam: 0 as const,
      damage: { frozen: false, leftArm: false, rightArm: false, legs: false },
      phase: "FLOATING" as const,
      pos: { x: 0, y: 0, z: 0 },
      rot: { yaw: 0, pitch: 0 },
      team: 0 as const,
    };
    const enemies = [{ id: "enemy", phase: "FLOATING" as const, pos: { x: 0, y: 0, z: -12 }, team: 1 as const }];

    brain.resetForRound(1);
    const first = brain.tick(bot, TEST_ARENA, graph, enemies, 0.16);

    brain.resetForRound(2);
    const second = brain.tick(bot, TEST_ARENA, graph, enemies, 0.16);

    expect(first.fireDirection).not.toBeNull();
    expect(second.fireDirection).not.toBeNull();
    expect(first.fireDirection).not.toEqual(second.fireDirection);
  });
});

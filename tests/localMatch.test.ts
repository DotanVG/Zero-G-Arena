import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("../client/src/match/simulatedPlayerAvatar", () => ({
  SimulatedPlayerAvatar: class {
    public constructor() {}
    public dispose(): void {}
    public update(): void {}
  },
}));

vi.mock("../client/src/player", () => ({
  LocalPlayer: class {},
}));

import { LocalMatch, type LocalMatchEvent } from "../client/src/match/localMatch";

interface FakePlayer {
  currentBreachTeam: 0 | 1;
  damage: { frozen: boolean; leftArm: boolean; rightArm: boolean; legs: boolean };
  deaths: number;
  kills: number;
  phase: "BREACH" | "FLOATING" | "FROZEN";
  phys: { vel: THREE.Vector3 };
  resetForNewRound: ReturnType<typeof vi.fn>;
  team: 0 | 1;
  applyHit: ReturnType<typeof vi.fn>;
  getPosition: () => THREE.Vector3;
}

function createFakePlayer(team: 0 | 1 = 0): FakePlayer {
  return {
    currentBreachTeam: team,
    damage: { frozen: false, leftArm: false, rightArm: false, legs: false },
    deaths: 0,
    kills: 0,
    phase: "BREACH",
    phys: { vel: new THREE.Vector3() },
    resetForNewRound: vi.fn(),
    team,
    applyHit: vi.fn(() => false),
    getPosition: () => new THREE.Vector3(0, 0, 0),
  };
}

describe("LocalMatch", () => {
  let events: LocalMatchEvent[];
  let match: LocalMatch;

  beforeEach(() => {
    events = [];
    match = new LocalMatch(new THREE.Scene());
    match.onEvent = (event) => events.push(event);
    match.startNewGame({
      humanName: "Pilot",
      humanTeam: 0,
      teamSize: 1,
    });
  });

  it("awards an immediate round win when the last enemy is frozen", () => {
    const player = createFakePlayer();
    const enemyBot = (match as unknown as { bots: Array<{ id: string; name: string; phys: { pos: THREE.Vector3 } }> }).bots[0];

    match.handleProjectileHit(
      {
        direction: new THREE.Vector3(1, 0, 0),
        impactPoint: enemyBot.phys.pos.clone(),
        ownerId: "local-player",
        targetId: enemyBot.id,
      },
      player as never,
      {} as never,
    );

    expect(events).toEqual([
      {
        type: "hitConfirm",
        team: 0,
      },
      {
        type: "freeze",
        killerName: "Pilot",
        killerTeam: 0,
        victimName: enemyBot.name,
        victimTeam: 1,
      },
      {
        type: "roundWin",
        winningTeam: 0,
        reason: "fullFreeze",
      },
    ]);
    expect(match.getScore()).toEqual({ team0: 1, team1: 0 });
  });

  it("emits a hit confirm when the local player lands a non-freezing hit", () => {
    const player = createFakePlayer();
    const enemyBot = (match as unknown as { bots: Array<{ id: string; phys: { pos: THREE.Vector3 } }> }).bots[0];

    match.handleProjectileHit(
      {
        direction: new THREE.Vector3(1, 0, 0),
        impactPoint: enemyBot.phys.pos.clone().add(new THREE.Vector3(0, -0.7, 0)),
        ownerId: "local-player",
        targetId: enemyBot.id,
      },
      player as never,
      {} as never,
    );

    expect(events).toEqual([
      {
        type: "hitConfirm",
        team: 0,
      },
    ]);
    expect(match.getScore()).toEqual({ team0: 0, team1: 0 });
  });

  it("normalizes round spawn slots onto the breach-room floor", () => {
    const player = createFakePlayer();
    const arena = {
      getAllBarGrabPoints: () => [],
      getBreachOpenAxis: () => "x" as const,
      getBreachOpenSign: (team: 0 | 1) => (team === 0 ? -1 : 1) as 1 | -1,
      getBreachRoomCenter: (team: 0 | 1) => new THREE.Vector3(team === 0 ? -18 : 18, 0, 0),
      getNearestBar: () => null,
      isDeepInBreachRoom: () => false,
      isGoalDoorOpen: () => false,
      isInBreachRoom: () => true,
    };

    match.resetForRound(arena as never, player as never);

    const playerSpawn = player.resetForNewRound.mock.calls[0]?.[1];
    const bots = (match as unknown as { bots: Array<{ phys: { pos: THREE.Vector3 } }> }).bots;

    expect(playerSpawn).toBeDefined();
    expect(playerSpawn.y).toBeCloseTo(-2.12, 4);
    expect(bots.every((bot) => Math.abs(bot.phys.pos.y + 2.12) < 1e-4)).toBe(true);
  });

  it("emits a score event for breach wins", () => {
    (match as unknown as { awardRoundPoint: (team: 0 | 1, scorerName: string, reason: "breach" | "fullFreeze") => void })
      .awardRoundPoint(0, "Pilot", "breach");

    expect(events).toEqual([
      {
        type: "score",
        scorerName: "Pilot",
        scorerTeam: 0,
      },
      {
        type: "roundWin",
        winningTeam: 0,
        reason: "breach",
      },
    ]);
    expect(match.getScore()).toEqual({ team0: 1, team1: 0 });
  });

  it("emits a tie without awarding points on timeout", () => {
    match.handleRoundTimeout();
    match.handleRoundTimeout();

    expect(events).toEqual([{ type: "roundTie" }]);
    expect(match.getScore()).toEqual({ team0: 0, team1: 0 });
  });
});

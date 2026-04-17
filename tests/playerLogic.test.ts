import { describe, expect, it } from "vitest";
import {
  classifyHitZone,
  applyHit,
  generateSpawnPositions,
  maxLaunchPower,
  resolveActorCollisions,
  spawnPosition,
} from "../shared/player-logic";
import { MAX_LAUNCH_SPEED, LEGS_HIT_LAUNCH_FACTOR } from "../shared/constants";

describe("classifyHitZone", () => {
  const playerPos = { x: 0, y: 0, z: 0 };
  const facing = { x: 0, y: 0, z: -1 };

  it("classifies head and legs hits", () => {
    expect(classifyHitZone({ x: 0, y: 0.8, z: 0 }, playerPos, facing)).toBe("head");
    expect(classifyHitZone({ x: 0, y: -0.4, z: 0 }, playerPos, facing)).toBe("legs");
  });

  it("classifies right arm hits relative to facing", () => {
    expect(classifyHitZone({ x: 0.5, y: 0.1, z: 0 }, playerPos, facing)).toBe("rightArm");
  });
});

describe("maxLaunchPower", () => {
  it("drops launch power after leg damage", () => {
    expect(maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, legs: false })).toBe(MAX_LAUNCH_SPEED);
    expect(maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, legs: true })).toBe(
      MAX_LAUNCH_SPEED * LEGS_HIT_LAUNCH_FACTOR,
    );
  });
});

describe("applyHit", () => {
  it("freezes a player on body hits and clears grab state", () => {
    const state = {
      damage: { frozen: false, leftArm: false, rightArm: false, legs: false },
      deaths: 0,
      grabbedBarPos: { x: 1, y: 2, z: 3 },
      launchPower: 5,
      phase: "AIMING" as const,
      vel: { x: 0, y: 0, z: 0 },
    };

    const killed = applyHit(state, "body", { x: 1, y: 0, z: 0 });
    expect(killed).toBe(true);
    expect(state.phase).toBe("FROZEN");
    expect(state.damage.frozen).toBe(true);
    expect(state.grabbedBarPos).toBeNull();
    expect(state.deaths).toBe(1);
  });
});

describe("spawnPosition", () => {
  it("spawns a player at the back of their breach room for round reset", () => {
    const pos = spawnPosition(0, {
      getBreachRoomCenter: () => ({ x: 23, y: 0, z: 0 }),
      getBreachOpenAxis: () => "x",
      getBreachOpenSign: () => -1,
    });

    expect(pos.x).toBeGreaterThan(23);
    expect(pos.y).toBeGreaterThan(-3);
  });
});

describe("generateSpawnPositions", () => {
  it("scatters a full 20-player team without overlap", () => {
    const slots = generateSpawnPositions(0, 20, {
      getBreachRoomCenter: () => ({ x: 12, y: 0, z: -6 }),
      getBreachOpenAxis: () => "x",
      getBreachOpenSign: () => -1,
    }, 1234);

    expect(slots).toHaveLength(20);

    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const dx = slots[i].x - slots[j].x;
        const dy = slots[i].y - slots[j].y;
        const dz = slots[i].z - slots[j].z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        expect(distance).toBeGreaterThanOrEqual(1.6);
      }
    }
  });
});

describe("resolveActorCollisions", () => {
  it("separates overlapping bodies and keeps anchored bodies nearly fixed", () => {
    const bodies = [
      {
        anchored: true,
        pos: { x: 0, y: 0, z: 0 },
        radius: 0.8,
      },
      {
        pos: { x: 0.3, y: 0, z: 0 },
        radius: 0.8,
      },
    ];

    const moved = resolveActorCollisions(bodies, 2);

    expect(moved).toBe(true);
    expect(bodies[0].pos.x).toBeCloseTo(0, 4);
    expect(bodies[1].pos.x).toBeGreaterThanOrEqual(1.59);
  });
});

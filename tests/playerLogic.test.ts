import { describe, expect, it } from "vitest";
import {
  classifyHitZone,
  applyHit,
  generateSpawnPositions,
  maxLaunchPower,
  resolveActorCollisions,
  spawnPosition,
} from "../shared/player-logic";
import {
  BOTH_LEGS_HIT_LAUNCH_FACTOR,
  HITBOX_OFFSET_Y,
  HITBOX_RADIUS,
  MAX_LAUNCH_SPEED,
  ONE_LEG_HIT_LAUNCH_FACTOR,
} from "../shared/constants";

describe("classifyHitZone", () => {
  const playerPos = { x: 0, y: 0, z: 0 };
  const facing = { x: 0, y: 0, z: -1 };

  it("classifies head and leg hits", () => {
    expect(classifyHitZone({ x: 0, y: 0.8, z: 0 }, playerPos, facing)).toBe("head");
    // Right leg — positive x projection on the right vector.
    expect(classifyHitZone({ x: 0.1, y: -0.4, z: 0 }, playerPos, facing)).toBe("rightLeg");
    // Left leg — negative x projection.
    expect(classifyHitZone({ x: -0.1, y: -0.4, z: 0 }, playerPos, facing)).toBe("leftLeg");
  });

  it("classifies right arm hits relative to facing", () => {
    expect(classifyHitZone({ x: 0.5, y: 0.1, z: 0 }, playerPos, facing)).toBe("rightArm");
  });

  it("keeps zone variety when using a tight hit sphere via hitRadius", () => {
    // Tight hit sphere: centre at y = HITBOX_OFFSET_Y, radius = HITBOX_RADIUS.
    // Thresholds scale with hitRadius so head/body/arm/legs stay reachable
    // even though the sphere is much smaller than PLAYER_RADIUS.
    const top = HITBOX_OFFSET_Y + HITBOX_RADIUS;
    const bottom = HITBOX_OFFSET_Y - HITBOX_RADIUS;
    expect(
      classifyHitZone({ x: 0, y: top, z: 0 }, playerPos, facing, HITBOX_OFFSET_Y, HITBOX_RADIUS),
    ).toBe("head");
    expect(
      classifyHitZone({ x: 0, y: HITBOX_OFFSET_Y, z: 0 }, playerPos, facing, HITBOX_OFFSET_Y, HITBOX_RADIUS),
    ).toBe("body");
    // Below the body band now splits into left/right by x projection.
    expect(
      classifyHitZone({ x: 0.05, y: bottom, z: 0 }, playerPos, facing, HITBOX_OFFSET_Y, HITBOX_RADIUS),
    ).toBe("rightLeg");
    expect(
      classifyHitZone({ x: -0.05, y: bottom, z: 0 }, playerPos, facing, HITBOX_OFFSET_Y, HITBOX_RADIUS),
    ).toBe("leftLeg");
    expect(
      classifyHitZone(
        { x: HITBOX_RADIUS * 0.8, y: HITBOX_OFFSET_Y, z: 0 },
        playerPos,
        facing,
        HITBOX_OFFSET_Y,
        HITBOX_RADIUS,
      ),
    ).toBe("rightArm");
  });

  it("hitOffsetY shifts the classification origin so a hit on the alien torso reads as body", () => {
    // With offset -0.35, a shot that lands 0.35 below physics centre
    // is at the sphere centre → y_rel ≈ 0 → body.
    expect(
      classifyHitZone({ x: 0, y: -0.35, z: 0 }, playerPos, facing, -0.35),
    ).toBe("body");
    // A shot that lands on the old "head" yRel > 0.55 but without the
    // offset would still be head; with the offset it becomes even
    // further above the sphere and still classifies as head.
    expect(
      classifyHitZone({ x: 0, y: 0.2, z: 0 }, playerPos, facing, -0.35),
    ).toBe("head");
  });
});

describe("maxLaunchPower", () => {
  it("caps launch power by the number of damaged legs", () => {
    expect(
      maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false }),
    ).toBe(MAX_LAUNCH_SPEED);
    expect(
      maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, leftLeg: true, rightLeg: false }),
    ).toBe(MAX_LAUNCH_SPEED * ONE_LEG_HIT_LAUNCH_FACTOR);
    expect(
      maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: true }),
    ).toBe(MAX_LAUNCH_SPEED * ONE_LEG_HIT_LAUNCH_FACTOR);
    expect(
      maxLaunchPower({ frozen: false, leftArm: false, rightArm: false, leftLeg: true, rightLeg: true }),
    ).toBe(MAX_LAUNCH_SPEED * BOTH_LEGS_HIT_LAUNCH_FACTOR);
  });
});

describe("applyHit", () => {
  it("freezes a player on body hits and clears grab state", () => {
    const state = {
      damage: { frozen: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false },
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

  it("promotes to full freeze when the 4th limb is damaged", () => {
    const state = {
      damage: { frozen: false, leftArm: true, rightArm: true, leftLeg: true, rightLeg: false },
      deaths: 0,
      grabbedBarPos: null,
      launchPower: 0,
      phase: "FLOATING" as const,
      vel: { x: 0, y: 0, z: 0 },
    };

    const killed = applyHit(state, "rightLeg", { x: 0, y: 0, z: 0 });
    expect(killed).toBe(true);
    expect(state.damage.frozen).toBe(true);
    expect(state.phase).toBe("FROZEN");
    expect(state.deaths).toBe(1);
  });

  it("does not freeze on 3 limbs damaged", () => {
    const state = {
      damage: { frozen: false, leftArm: true, rightArm: true, leftLeg: false, rightLeg: false },
      deaths: 0,
      grabbedBarPos: null,
      launchPower: 0,
      phase: "FLOATING" as const,
      vel: { x: 0, y: 0, z: 0 },
    };

    const killed = applyHit(state, "leftLeg", { x: 0, y: 0, z: 0 });
    expect(killed).toBe(false);
    expect(state.damage.frozen).toBe(false);
    expect(state.phase).toBe("FLOATING");
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

  it("cancels approach velocity but preserves tangential momentum", () => {
    // Two bodies on the x axis. A moves +x at 4, B moves -x at 4 (head-on).
    // Tangential component (z) is 2 on A — should survive the collision.
    const a = {
      pos: { x: 0, y: 0, z: 0 },
      radius: 0.5,
      vel: { x: 4, y: 0, z: 2 },
    };
    const b = {
      pos: { x: 0.6, y: 0, z: 0 },
      radius: 0.5,
      vel: { x: -4, y: 0, z: 0 },
    };

    resolveActorCollisions([a, b]);

    // Approach velocity along +x should be cancelled on both bodies.
    expect(a.vel.x).toBeLessThanOrEqual(0.01);
    expect(b.vel.x).toBeGreaterThanOrEqual(-0.01);
    // Tangential (z) velocity on A is preserved — momentum kept.
    expect(a.vel.z).toBeCloseTo(2, 4);
  });

  it("leaves velocities untouched when bodies are already separating", () => {
    const a = {
      pos: { x: 0, y: 0, z: 0 },
      radius: 0.5,
      vel: { x: -3, y: 0, z: 0 },
    };
    const b = {
      pos: { x: 0.6, y: 0, z: 0 },
      radius: 0.5,
      vel: { x: 3, y: 0, z: 0 },
    };

    resolveActorCollisions([a, b]);

    // They overlap — positions get pushed apart — but velocities are already
    // pointing away from each other, so the approach guard should leave them.
    expect(a.vel.x).toBeCloseTo(-3, 4);
    expect(b.vel.x).toBeCloseTo(3, 4);
  });
});

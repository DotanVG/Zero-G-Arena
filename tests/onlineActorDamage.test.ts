import { describe, expect, it } from "vitest";
import { applyHitToOnlineActor, normalizeAuthoritativePhase } from "../server/src/colyseus/actorDamage";

describe("applyHitToOnlineActor", () => {
  it("keeps a single leg hit as limb damage instead of full freeze", () => {
    const actor = {
      deaths: 0,
      frozen: false,
      leftArm: false,
      leftLeg: false,
      phase: "FLOATING",
      rightArm: false,
      rightLeg: false,
      velX: 0,
      velY: 0,
      velZ: 0,
    };

    const frozen = applyHitToOnlineActor(actor, "leftLeg");

    expect(frozen).toBe(false);
    expect(actor.frozen).toBe(false);
    expect(actor.leftLeg).toBe(true);
    expect(actor.phase).toBe("FLOATING");
    expect(actor.deaths).toBe(0);
  });

  it("matches solo behavior when both legs are damaged", () => {
    const actor = {
      deaths: 0,
      frozen: false,
      leftArm: false,
      leftLeg: true,
      phase: "FLOATING",
      rightArm: false,
      rightLeg: false,
      velX: 0,
      velY: 0,
      velZ: 0,
    };

    const frozen = applyHitToOnlineActor(actor, "rightLeg");

    expect(frozen).toBe(false);
    expect(actor.frozen).toBe(false);
    expect(actor.leftLeg).toBe(true);
    expect(actor.rightLeg).toBe(true);
    expect(actor.phase).toBe("FLOATING");
    expect(actor.deaths).toBe(0);
  });
});

describe("normalizeAuthoritativePhase", () => {
  it("keeps frozen players in FROZEN even if client updates say otherwise", () => {
    expect(normalizeAuthoritativePhase("FLOATING", { frozen: true, leftArm: false })).toBe("FROZEN");
  });

  it("kicks left-arm-damaged players out of anchored phases", () => {
    expect(normalizeAuthoritativePhase("AIMING", { frozen: false, leftArm: true })).toBe("FLOATING");
    expect(normalizeAuthoritativePhase("GRABBING", { frozen: false, leftArm: true })).toBe("FLOATING");
  });
});

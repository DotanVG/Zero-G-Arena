import { describe, expect, it } from "vitest";
import { shouldPreserveLocalOnlineGrab } from "../client/src/player/onlineGrabSync";

describe("shouldPreserveLocalOnlineGrab", () => {
  it("preserves a fresh local bar attach while the online snapshot still lags behind", () => {
    expect(shouldPreserveLocalOnlineGrab({
      authoritativePhase: "FLOATING",
      frozen: false,
      leftArmDisabled: false,
      localHasGrab: true,
      localPhase: "GRABBING",
    })).toBe(true);
  });

  it("does not preserve once the authoritative snapshot is also anchored", () => {
    expect(shouldPreserveLocalOnlineGrab({
      authoritativePhase: "AIMING",
      frozen: false,
      leftArmDisabled: false,
      localHasGrab: true,
      localPhase: "GRABBING",
    })).toBe(false);
  });

  it("does not preserve grab state for frozen or left-arm-disabled players", () => {
    expect(shouldPreserveLocalOnlineGrab({
      authoritativePhase: "FLOATING",
      frozen: true,
      leftArmDisabled: false,
      localHasGrab: true,
      localPhase: "GRABBING",
    })).toBe(false);

    expect(shouldPreserveLocalOnlineGrab({
      authoritativePhase: "FLOATING",
      frozen: false,
      leftArmDisabled: true,
      localHasGrab: true,
      localPhase: "AIMING",
    })).toBe(false);
  });
});

import type { PlayerPhase } from "../../../shared/schema";

export interface OnlineGrabSyncInput {
  authoritativePhase: PlayerPhase;
  frozen: boolean;
  leftArmDisabled: boolean;
  localHasGrab: boolean;
  localPhase: PlayerPhase;
}

export function shouldPreserveLocalOnlineGrab(input: OnlineGrabSyncInput): boolean {
  if (input.frozen || input.leftArmDisabled) return false;

  const localAnchored = input.localHasGrab
    && (input.localPhase === "GRABBING" || input.localPhase === "AIMING");
  if (!localAnchored) return false;

  return input.authoritativePhase !== "GRABBING" && input.authoritativePhase !== "AIMING";
}

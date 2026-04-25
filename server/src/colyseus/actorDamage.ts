import { applyHit, type HitZone } from "../../../shared/player-logic";
import type { PlayerPhase } from "../../../shared/schema";

export interface OnlineActorDamageState {
  deaths: number;
  frozen: boolean;
  leftArm: boolean;
  leftLeg: boolean;
  phase: string;
  rightArm: boolean;
  rightLeg: boolean;
  velX: number;
  velY: number;
  velZ: number;
}

const VALID_PHASES = new Set<PlayerPhase>([
  "AIMING",
  "BREACH",
  "FLOATING",
  "FROZEN",
  "GRABBING",
  "RESPAWNING",
]);

export function applyHitToOnlineActor(actor: OnlineActorDamageState, zone: HitZone): boolean {
  const scratch = {
    damage: {
      frozen: actor.frozen,
      leftArm: actor.leftArm,
      leftLeg: actor.leftLeg,
      rightArm: actor.rightArm,
      rightLeg: actor.rightLeg,
    },
    deaths: actor.deaths,
    grabbedBarPos: actor.phase === "GRABBING" || actor.phase === "AIMING"
      ? { x: 0, y: 0, z: 0 }
      : null,
    launchPower: 0,
    phase: normalizePhase(actor.phase),
    vel: {
      x: actor.velX,
      y: actor.velY,
      z: actor.velZ,
    },
  };

  const frozen = applyHit(scratch, zone, { x: 0, y: 0, z: 0 });

  actor.deaths = scratch.deaths;
  actor.frozen = scratch.damage.frozen;
  actor.leftArm = scratch.damage.leftArm;
  actor.leftLeg = scratch.damage.leftLeg;
  actor.phase = scratch.phase;
  actor.rightArm = scratch.damage.rightArm;
  actor.rightLeg = scratch.damage.rightLeg;
  actor.velX = scratch.vel.x;
  actor.velY = scratch.vel.y;
  actor.velZ = scratch.vel.z;

  return frozen;
}

export function normalizeAuthoritativePhase(
  requestedPhase: string,
  actor: Pick<OnlineActorDamageState, "frozen" | "leftArm">,
): PlayerPhase {
  if (actor.frozen) return "FROZEN";
  const phase = normalizePhase(requestedPhase);
  if (actor.leftArm && (phase === "GRABBING" || phase === "AIMING")) {
    return "FLOATING";
  }
  return phase;
}

export function isHitZone(value: unknown): value is HitZone {
  return value === "head"
    || value === "body"
    || value === "leftArm"
    || value === "rightArm"
    || value === "leftLeg"
    || value === "rightLeg";
}

function normalizePhase(phase: string): PlayerPhase {
  return VALID_PHASES.has(phase as PlayerPhase)
    ? phase as PlayerPhase
    : "FLOATING";
}

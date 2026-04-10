/**
 * Shared player logic: hit-zone classification, damage application,
 * and the ServerArenaQuery interface used by both server sim and client prediction.
 * No Three.js dependency.
 */
import { type Vec3, v3 } from './vec3';
import { type DamageState, type PlayerPhase } from './schema';
import { PLAYER_RADIUS, MAX_LAUNCH_SPEED, LEGS_1_LAUNCH_FACTOR, LEGS_2_LAUNCH_FACTOR } from './constants';

// ── Hit zones ─────────────────────────────────────────────────────────────────

export type HitZone = 'head' | 'body' | 'rightArm' | 'leftArm' | 'legs';

/**
 * Classify which zone was hit based on impact point relative to player centre.
 * @param impactPoint   — world-space hit position
 * @param playerPos     — world-space player position
 * @param playerFacing  — normalised yaw-forward direction of the player
 */
export function classifyHitZone(
  impactPoint: Vec3,
  playerPos: Vec3,
  playerFacing: Vec3,
): HitZone {
  const local = v3.sub(impactPoint, playerPos);
  const yRel  = local.y / PLAYER_RADIUS;

  if (yRel > 0.55) return 'head';
  if (yRel > -0.2) {
    // Arms vs body
    const worldUp = { x: 0, y: 1, z: 0 };
    const right = v3.normalize(v3.cross(playerFacing, worldUp));
    const xProj = v3.dot(local, right);
    if (xProj >  0.4) return 'rightArm';
    if (xProj < -0.4) return 'leftArm';
    return 'body';
  }
  return 'legs';
}

// ── Shared player state (used by server; mirrored on client) ──────────────────

export interface SharedPlayerState {
  id:               string;
  pos:              Vec3;
  vel:              Vec3;
  rot:              { yaw: number; pitch: number };
  phase:            PlayerPhase;
  damage:           DamageState;
  launchPower:      number;
  grabbedBarPos:    Vec3 | null;
  grabbedBarNormal: Vec3 | null;
  team:             0 | 1;
  currentBreachTeam: 0 | 1;
  kills:            number;
  deaths:           number;
  respawnTimer:     number;
  onGround:         boolean;
  name:             string;
  connected:        boolean;
  isBot:            boolean;
  ping:             number;
}

export interface BarGrabPoint {
  pos: Vec3;
  normal: Vec3;
}

/** Arena interface needed by the player state machine (implemented by server and client). */
export interface SharedArenaQuery {
  getBreachRoomCenter(team: 0 | 1): Vec3;
  getBreachOpenAxis(team: 0 | 1): 'x' | 'y' | 'z';
  getBreachOpenSign(team: 0 | 1): 1 | -1;
  isGoalDoorOpen(team: 0 | 1): boolean;
  isInBreachRoom(pos: Vec3, team: 0 | 1): boolean;
  isDeepInBreachRoom(pos: Vec3, team: 0 | 1, depth: number): boolean;
  getNearestBar(pos: Vec3, radius: number): BarGrabPoint | null;
  bounceObstacles(pos: Vec3, vel: Vec3): void;
  getGoalAxis(): 'x' | 'y' | 'z';
  getGoalPerpAxis(): 'x' | 'z';
  getPortalFacesOpen(): { positive: boolean; negative: boolean };
}

// ── Damage helpers ────────────────────────────────────────────────────────────

export function maxLaunchPower(damage: DamageState): number {
  if (damage.legs >= 2) return MAX_LAUNCH_SPEED * LEGS_2_LAUNCH_FACTOR;
  if (damage.legs === 1) return MAX_LAUNCH_SPEED * LEGS_1_LAUNCH_FACTOR;
  return MAX_LAUNCH_SPEED;
}

/**
 * Apply a hit to a player state. Returns true if this was a kill (frozen).
 */
export function applyHit(
  state: SharedPlayerState,
  zone: HitZone,
  impulse: Vec3,
): boolean {
  v3.addInPlace(state.vel, impulse);

  switch (zone) {
    case 'head':
    case 'body':
      if (!state.damage.frozen) {
        state.damage.frozen = true;
        state.deaths++;
      }
      state.phase = 'FROZEN';
      state.grabbedBarPos = null;
      state.grabbedBarNormal = null;
      return true;

    case 'rightArm':
      state.damage.rightArm = true;
      return false;

    case 'leftArm':
      state.damage.leftArm = true;
      if (state.phase === 'GRABBING' || state.phase === 'AIMING') {
        state.phase = 'FLOATING';
        state.grabbedBarPos = null;
        state.grabbedBarNormal = null;
      }
      return false;

    case 'legs':
      state.damage.legs = Math.min(2, state.damage.legs + 1) as 0 | 1 | 2;
      if (state.launchPower > maxLaunchPower(state.damage)) {
        state.launchPower = maxLaunchPower(state.damage);
      }
      return false;
  }
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

import { BREACH_ROOM_H, BREACH_ROOM_D, PLAYER_RADIUS as PR } from './constants';

/** Compute spawn position at the back of a team's breach room. */
export function spawnPosition(
  team: 0 | 1,
  arena: Pick<SharedArenaQuery, 'getBreachRoomCenter' | 'getBreachOpenAxis' | 'getBreachOpenSign'>,
): Vec3 {
  const center   = arena.getBreachRoomCenter(team);
  const openAxis = arena.getBreachOpenAxis(team);
  const openSign = arena.getBreachOpenSign(team);
  const floorY   = center.y - BREACH_ROOM_H / 2 + PR + 0.1;
  const spawn    = v3.clone(center);
  spawn.y        = floorY;
  spawn[openAxis] -= openSign * (BREACH_ROOM_D / 2 - PR - 0.5);
  return spawn;
}

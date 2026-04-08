import * as THREE from 'three';
import {
  ARENA_SIZE,
  PLAYER_RADIUS,
  ZERO_G_DAMPING,
  MAX_LAUNCH_SPEED,
  BREACH_GRAVITY,
  BREACH_JUMP_SPEED,
  BREACH_WALK_SPEED,
  BREACH_ROOM_W,
  BREACH_ROOM_H,
  BREACH_ROOM_D,
} from '../../shared/constants';
import { clampMagnitude } from './util/math';

export interface PhysicsState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

/**
 * Zero-G drift integration - near-frictionless momentum.
 * Used by FLOATING, GRABBING (vel clamped to 0 by player), and FROZEN players.
 */
export function integrateZeroG(state: PhysicsState, dt: number): void {
  state.vel.multiplyScalar(ZERO_G_DAMPING);
  clampMagnitude(state.vel, MAX_LAUNCH_SPEED);
  state.pos.addScaledVector(state.vel, dt);
}

/**
 * Bounce off arena cube walls (±ARENA_SIZE/2 on each axis).
 * Used for all players inside the arena.
 */
/**
 * Bounce off arena cube walls (±ARENA_SIZE/2 on each axis).
 * On the portal axis the wall is solid EXCEPT within the portal opening
 * (BREACH_ROOM_W wide × BREACH_ROOM_H tall, centred at origin on that face).
 *
 * @param portalAxis     - goal axis ('x' or 'z'); both ± faces have portal openings
 * @param portalPerpAxis - horizontal axis perpendicular to portalAxis
 */
export function bounceArena(
  state: PhysicsState,
  portalAxis?: 'x' | 'y' | 'z',
  portalPerpAxis?: 'x' | 'z',
  portalFacesOpen?: { positive: boolean; negative: boolean },
): void {
  const limit = ARENA_SIZE / 2 - PLAYER_RADIUS;
  for (const ax of ['x', 'y', 'z'] as const) {
    if (ax === portalAxis && portalPerpAxis !== undefined) {
      // Only allow passthrough when player is within the portal opening
      const inWidth  = Math.abs(state.pos[portalPerpAxis]) < BREACH_ROOM_W / 2;
      const inHeight = Math.abs(state.pos.y)               < BREACH_ROOM_H / 2;
      if (inWidth && inHeight) {
        const withinArena = Math.abs(state.pos[ax]) <= limit;
        const positiveFaceOpen = state.pos[ax] > limit && portalFacesOpen?.positive;
        const negativeFaceOpen = state.pos[ax] < -limit && portalFacesOpen?.negative;
        if (withinArena || positiveFaceOpen || negativeFaceOpen) continue;
      }
      // Outside the opening → fall through to normal bounce
    }
    if (state.pos[ax] > limit) {
      state.pos[ax] = limit;
      if (state.vel[ax] > 0) state.vel[ax] *= -1;
    }
    if (state.pos[ax] < -limit) {
      state.pos[ax] = -limit;
      if (state.vel[ax] < 0) state.vel[ax] *= -1;
    }
  }
}

/**
 * Breach room movement: gravity + WASD walk on XZ plane.
 * Used when player.phase === 'BREACH'.
 */
export function integrateBreachRoom(
  state: PhysicsState,
  walkAxes: { x: number; z: number },
  yawFwd: THREE.Vector3,
  yawRight: THREE.Vector3,
  jumping: boolean,
  onGround: boolean,
  dt: number,
): void {
  // Horizontal: WASD always responsive
  const h = yawRight
    .clone()
    .multiplyScalar(walkAxes.x)
    .add(yawFwd.clone().multiplyScalar(walkAxes.z));
  if (h.length() > 0) h.normalize();
  state.vel.x = h.x * BREACH_WALK_SPEED;
  state.vel.z = h.z * BREACH_WALK_SPEED;

  // Vertical: pure upward jump — no forward force
  if (jumping && onGround) {
    state.vel.y = BREACH_JUMP_SPEED;
  }
  state.vel.y += BREACH_GRAVITY * dt;
  state.pos.addScaledVector(state.vel, dt);
}

/**
 * Clamp player inside breach room AABB, leaving the portal face open.
 *
 * @param openAxis  - which axis the portal faces ('x', 'y', or 'z')
 * @param openSign  - 1 = open on positive side, -1 = open on negative side
 */
export function clampBreachRoom(
  state: PhysicsState,
  center: THREE.Vector3,
  openAxis: 'x' | 'y' | 'z',
  openSign: 1 | -1,
  portalOpen = true,
): void {
  const half = {
    x: BREACH_ROOM_W / 2 - PLAYER_RADIUS,
    y: BREACH_ROOM_H / 2 - PLAYER_RADIUS,
    z: BREACH_ROOM_D / 2 - PLAYER_RADIUS,
  };

  for (const ax of ['x', 'y', 'z'] as const) {
    const lo = center[ax] - half[ax];
    const hi = center[ax] + half[ax];

    // Skip the open (portal-facing) side so player can exit into arena
    if (portalOpen && ax === openAxis && openSign === 1 && state.pos[ax] > hi) continue;
    if (portalOpen && ax === openAxis && openSign === -1 && state.pos[ax] < lo) continue;

    if (state.pos[ax] < lo) {
      state.pos[ax] = lo;
      if (state.vel[ax] < 0) state.vel[ax] = 0;
    }
    if (state.pos[ax] > hi) {
      state.pos[ax] = hi;
      if (state.vel[ax] > 0) state.vel[ax] = 0;
    }
  }

  // Hard floor: absolute stop
  const floor = center.y - half.y;
  if (state.pos.y <= floor) {
    state.pos.y = floor;
    if (state.vel.y < 0) state.vel.y = 0;
  }
}

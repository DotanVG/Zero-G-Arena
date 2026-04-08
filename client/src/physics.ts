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
export function bounceArena(state: PhysicsState): void {
  const limit = ARENA_SIZE / 2 - PLAYER_RADIUS;
  for (const ax of ['x', 'y', 'z'] as const) {
    if (state.pos[ax] > limit) {
      state.pos[ax] = limit;
      if (state.vel[ax] > 0) state.vel[ax] *= -0.6;
    }
    if (state.pos[ax] < -limit) {
      state.pos[ax] = -limit;
      if (state.vel[ax] < 0) state.vel[ax] *= -0.6;
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
  // Horizontal: direct velocity set for responsive feel
  const h = yawRight
    .clone()
    .multiplyScalar(walkAxes.x)
    .add(yawFwd.clone().multiplyScalar(walkAxes.z));
  if (h.length() > 0) h.normalize();
  state.vel.x = h.x * BREACH_WALK_SPEED;
  state.vel.z = h.z * BREACH_WALK_SPEED;

  // Vertical: gravity + jump impulse
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
    if (ax === openAxis && openSign === 1 && state.pos[ax] > hi) continue;
    if (ax === openAxis && openSign === -1 && state.pos[ax] < lo) continue;

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

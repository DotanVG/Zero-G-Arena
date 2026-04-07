import * as THREE from "three";

import {
  ACCEL,
  ARENA_SIZE,
  BOOST,
  DAMPING,
  MAX_SPEED,
  PLAYER_RADIUS,
} from "../../shared/constants";
import { clampMagnitude } from "./util/math";

export interface PhysicsState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

export function integrate(
  state: PhysicsState,
  axes: { x: number; y: number; z: number },
  forward: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  boost: boolean,
  dt: number,
): void {
  const accelDir = right
    .clone()
    .multiplyScalar(axes.x)
    .add(up.clone().multiplyScalar(axes.y))
    .add(forward.clone().multiplyScalar(axes.z));

  state.vel.addScaledVector(accelDir, ACCEL * dt);

  if (boost) {
    state.vel.addScaledVector(forward, BOOST);
  }

  state.vel.multiplyScalar(DAMPING);
  clampMagnitude(state.vel, MAX_SPEED);
  state.pos.addScaledVector(state.vel, dt);
}

export function bounceArena(state: PhysicsState): void {
  const limit = ARENA_SIZE / 2 - PLAYER_RADIUS;

  for (const axis of ["x", "y", "z"] as const) {
    if (state.pos[axis] > limit) {
      state.pos[axis] = limit;
      state.vel[axis] = -Math.abs(state.vel[axis]) * 0.5;
    } else if (state.pos[axis] < -limit) {
      state.pos[axis] = -limit;
      state.vel[axis] = Math.abs(state.vel[axis]) * 0.5;
    }
  }
}

/**
 * Client physics wrapper — delegates to shared/physics.ts.
 * THREE.Vector3 satisfies Vec3 (structural typing), so no conversion needed.
 */
import * as THREE from 'three';
import {
  integrateZeroG as _integrateZeroG,
  bounceArena as _bounceArena,
  integrateBreachRoom as _integrateBreachRoom,
  clampBreachRoom as _clampBreachRoom,
} from '../../shared/physics';

export interface PhysicsState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

export function integrateZeroG(state: PhysicsState, dt: number): void {
  _integrateZeroG(state.pos, state.vel, dt);
}

export function bounceArena(
  state: PhysicsState,
  portalAxis?: 'x' | 'y' | 'z',
  portalPerpAxis?: 'x' | 'z',
  portalFacesOpen?: { positive: boolean; negative: boolean },
): void {
  _bounceArena(state.pos, state.vel, portalAxis, portalPerpAxis, portalFacesOpen);
}

export function integrateBreachRoom(
  state: PhysicsState,
  walkAxes: { x: number; z: number },
  yawFwd: THREE.Vector3,
  yawRight: THREE.Vector3,
  jumping: boolean,
  onGround: boolean,
  dt: number,
): void {
  _integrateBreachRoom(state.pos, state.vel, walkAxes, yawFwd, yawRight, jumping, onGround, dt);
}

export function clampBreachRoom(
  state: PhysicsState,
  center: THREE.Vector3,
  openAxis: 'x' | 'y' | 'z',
  openSign: 1 | -1,
  portalOpen = true,
): void {
  _clampBreachRoom(state.pos, state.vel, center, openAxis, openSign, portalOpen);
}

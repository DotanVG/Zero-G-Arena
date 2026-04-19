import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { integrateBreachRoom } from "../client/src/physics";
import {
  BREACH_GRAVITY,
  BREACH_JUMP_SPEED,
  BREACH_WALK_SPEED,
} from "../shared/constants";

// Helpers
function makeState(x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0) {
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(vx, vy, vz),
  };
}

/** Unit vector pointing in +X (yaw = -Math.PI/2, right = +Z) */
const YAW_RIGHT_X = new THREE.Vector3(1, 0, 0);
const YAW_FWD_NEG_Z = new THREE.Vector3(0, 0, -1);

describe("integrateBreachRoom – carryVelocity integration", () => {
  it("carry velocity is added to horizontal velocity when there is no WASD input", () => {
    const state = makeState();
    const carry = new THREE.Vector3(2, 5, 3); // y should be ignored
    const dt = 0.016;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    expect(state.vel.x).toBeCloseTo(2, 5);
    expect(state.vel.z).toBeCloseTo(3, 5);
  });

  it("carry velocity Y component does not contribute to vel.y", () => {
    const state = makeState();
    const carry = new THREE.Vector3(0, 99, 0);
    const dt = 0.016;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    // Only gravity should have affected vel.y
    expect(state.vel.y).toBeCloseTo(BREACH_GRAVITY * dt, 5);
  });

  it("zero carry velocity leaves WASD-driven horizontal velocity at BREACH_WALK_SPEED", () => {
    const state = makeState();
    const zero = new THREE.Vector3(0, 0, 0);
    const dt = 0.016;

    // Move right (+x direction with yawRight = +X)
    integrateBreachRoom(
      state,
      { x: 1, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      zero,
      dt,
    );

    expect(state.vel.x).toBeCloseTo(BREACH_WALK_SPEED, 5);
    expect(state.vel.z).toBeCloseTo(0, 5);
  });

  it("sums WASD speed and carry velocity on each horizontal axis", () => {
    const state = makeState();
    const carry = new THREE.Vector3(1.5, 0, -0.5);
    const dt = 0.016;

    // Strafe right (+x) with carry
    integrateBreachRoom(
      state,
      { x: 1, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    expect(state.vel.x).toBeCloseTo(BREACH_WALK_SPEED + 1.5, 5);
    expect(state.vel.z).toBeCloseTo(-0.5, 5);
  });

  it("applies gravity regardless of carry velocity", () => {
    const state = makeState(0, 2, 0, 0, 0, 0);
    const carry = new THREE.Vector3(3, 0, 3);
    const dt = 1 / 60;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    expect(state.vel.y).toBeCloseTo(BREACH_GRAVITY * dt, 5);
  });

  it("jump sets vel.y to BREACH_JUMP_SPEED when on ground", () => {
    const state = makeState(0, 0, 0, 0, 0, 0);
    const carry = new THREE.Vector3(0, 0, 0);
    const dt = 0.016;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      true, // jumping
      true, // onGround
      carry,
      dt,
    );

    // After jump: vel.y = BREACH_JUMP_SPEED + BREACH_GRAVITY * dt
    expect(state.vel.y).toBeCloseTo(BREACH_JUMP_SPEED + BREACH_GRAVITY * dt, 5);
  });

  it("jump is ignored when not on ground", () => {
    const state = makeState(0, 2, 0, 0, 0, 0);
    const carry = new THREE.Vector3(0, 0, 0);
    const dt = 0.016;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      true,  // jumping = true but …
      false, // not on ground
      carry,
      dt,
    );

    // No jump boost; only gravity
    expect(state.vel.y).toBeCloseTo(BREACH_GRAVITY * dt, 5);
  });

  it("updates position by vel * dt after applying carry", () => {
    const state = makeState(0, 0, 0, 0, 0, 0);
    const carry = new THREE.Vector3(6, 0, 0);
    const dt = 0.1;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    // vel.x = 0 + 6 = 6; pos.x += 6 * 0.1 = 0.6
    expect(state.pos.x).toBeCloseTo(6 * dt, 5);
  });

  it("negative carry velocity offsets motion in the opposite direction", () => {
    const state = makeState();
    const carry = new THREE.Vector3(-4, 0, -2);
    const dt = 0.016;

    integrateBreachRoom(
      state,
      { x: 0, z: 0 },
      YAW_FWD_NEG_Z,
      YAW_RIGHT_X,
      false,
      false,
      carry,
      dt,
    );

    expect(state.vel.x).toBeCloseTo(-4, 5);
    expect(state.vel.z).toBeCloseTo(-2, 5);
  });
});
/**
 * Pure-math physics functions shared between client and server.
 * No Three.js dependency — operates on plain { x, y, z } Vec3 objects.
 * THREE.Vector3 satisfies Vec3 via structural typing, so client code can
 * pass THREE.Vector3 instances directly.
 */
import { type Vec3, v3 } from './vec3';
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
  REVOLVER_MAX_SPREAD_RAD,
  REVOLVER_MIN_ACCURACY,
} from './constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Yaw-forward direction (XZ plane only, ignores pitch). */
export function yawForwardVec(yaw: number): Vec3 {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}

/** Yaw-right direction (XZ plane only). */
export function yawRightVec(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/** Full camera-forward from yaw + pitch. */
export function cameraForwardVec(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw),   sy = Math.sin(yaw);
  return { x: -sy * cp, y: sp, z: -cy * cp };
}

// ── Zero-G ────────────────────────────────────────────────────────────────────

/**
 * Zero-G drift: near-frictionless momentum.
 * ZERO_G_DAMPING = 1.0 means no velocity bleed at all.
 */
export function integrateZeroG(pos: Vec3, vel: Vec3, dt: number): void {
  v3.scaleInPlace(vel, ZERO_G_DAMPING);
  v3.clampMagnitudeInPlace(vel, MAX_LAUNCH_SPEED);
  v3.addScaledInPlace(pos, vel, dt);
}

/**
 * Bounce off arena cube walls (±ARENA_SIZE/2 on each axis).
 * On the portal axis, the wall is solid EXCEPT inside the portal opening
 * (BREACH_ROOM_W wide × BREACH_ROOM_H tall, centred at origin on that face).
 */
export function bounceArena(
  pos: Vec3,
  vel: Vec3,
  portalAxis?: 'x' | 'y' | 'z',
  portalPerpAxis?: 'x' | 'z',
  portalFacesOpen?: { positive: boolean; negative: boolean },
): void {
  const limit = ARENA_SIZE / 2 - PLAYER_RADIUS;
  for (const ax of ['x', 'y', 'z'] as const) {
    if (ax === portalAxis && portalPerpAxis !== undefined) {
      const inWidth  = Math.abs(pos[portalPerpAxis]) < BREACH_ROOM_W / 2;
      const inHeight = Math.abs(pos.y)               < BREACH_ROOM_H / 2;
      if (inWidth && inHeight) {
        const withinArena      = Math.abs(pos[ax]) <= limit;
        const positiveFaceOpen = pos[ax] >  limit && portalFacesOpen?.positive;
        const negativeFaceOpen = pos[ax] < -limit && portalFacesOpen?.negative;
        if (withinArena || positiveFaceOpen || negativeFaceOpen) continue;
      }
    }
    if (pos[ax] > limit)  { pos[ax] = limit;  if (vel[ax] > 0) vel[ax] *= -1; }
    if (pos[ax] < -limit) { pos[ax] = -limit; if (vel[ax] < 0) vel[ax] *= -1; }
  }
}

// ── Breach room ───────────────────────────────────────────────────────────────

/**
 * Breach room movement: gravity + WASD walk on XZ plane.
 * yawFwd and yawRt are the camera yaw forward/right vectors (XZ only).
 */
export function integrateBreachRoom(
  pos: Vec3,
  vel: Vec3,
  walkAxes: { x: number; z: number },
  yawFwd: Vec3,
  yawRt: Vec3,
  jumping: boolean,
  onGround: boolean,
  dt: number,
): void {
  // Horizontal — WASD
  let hx = yawRt.x * walkAxes.x + yawFwd.x * walkAxes.z;
  let hz = yawRt.z * walkAxes.x + yawFwd.z * walkAxes.z;
  const hlen = Math.sqrt(hx * hx + hz * hz);
  if (hlen > 0) { hx /= hlen; hz /= hlen; }
  vel.x = hx * BREACH_WALK_SPEED;
  vel.z = hz * BREACH_WALK_SPEED;

  // Vertical
  if (jumping && onGround) vel.y = BREACH_JUMP_SPEED;
  vel.y += BREACH_GRAVITY * dt;
  v3.addScaledInPlace(pos, vel, dt);
}

/**
 * Clamp player inside breach room AABB, leaving the portal face open.
 * @param openAxis  — which axis the portal faces
 * @param openSign  — 1 = open on positive side, -1 = open on negative side
 */
export function clampBreachRoom(
  pos: Vec3,
  vel: Vec3,
  center: Vec3,
  openAxis: 'x' | 'y' | 'z',
  openSign: 1 | -1,
  portalOpen = true,
): void {
  const half = {
    x: (openAxis === 'x' ? BREACH_ROOM_D : BREACH_ROOM_W) / 2 - PLAYER_RADIUS,
    y: (openAxis === 'y' ? BREACH_ROOM_D : BREACH_ROOM_H) / 2 - PLAYER_RADIUS,
    z: (openAxis === 'z' ? BREACH_ROOM_D : BREACH_ROOM_W) / 2 - PLAYER_RADIUS,
  };

  for (const ax of ['x', 'y', 'z'] as const) {
    const lo = center[ax] - half[ax];
    const hi = center[ax] + half[ax];
    if (portalOpen && ax === openAxis && openSign ===  1 && pos[ax] > hi) continue;
    if (portalOpen && ax === openAxis && openSign === -1 && pos[ax] < lo) continue;
    if (pos[ax] < lo) { pos[ax] = lo; if (vel[ax] < 0) vel[ax] = 0; }
    if (pos[ax] > hi) { pos[ax] = hi; if (vel[ax] > 0) vel[ax] = 0; }
  }

  // Hard floor
  const floor = center.y - half.y;
  if (pos.y <= floor) { pos.y = floor; if (vel.y < 0) vel.y = 0; }
}

// ── Obstacle collision ────────────────────────────────────────────────────────

/**
 * Bounce player off a single AABB obstacle (inflated by PLAYER_RADIUS).
 * Returns true if a collision occurred.
 */
export function bounceObstacleAABB(
  pos: Vec3,
  vel: Vec3,
  obsMin: Vec3,
  obsMax: Vec3,
): boolean {
  const px = PLAYER_RADIUS;
  const pMin = { x: obsMin.x - px, y: obsMin.y - px, z: obsMin.z - px };
  const pMax = { x: obsMax.x + px, y: obsMax.y + px, z: obsMax.z + px };

  if (pos.x < pMin.x || pos.x > pMax.x) return false;
  if (pos.y < pMin.y || pos.y > pMax.y) return false;
  if (pos.z < pMin.z || pos.z > pMax.z) return false;

  // Find shallowest penetration axis
  const overlaps: { ax: 'x' | 'y' | 'z'; sign: number; val: number }[] = [
    { ax: 'x', sign:  1, val: pMax.x - pos.x },
    { ax: 'x', sign: -1, val: pos.x - pMin.x },
    { ax: 'y', sign:  1, val: pMax.y - pos.y },
    { ax: 'y', sign: -1, val: pos.y - pMin.y },
    { ax: 'z', sign:  1, val: pMax.z - pos.z },
    { ax: 'z', sign: -1, val: pos.z - pMin.z },
  ];
  overlaps.sort((a, b) => a.val - b.val);
  const { ax, sign, val } = overlaps[0];
  pos[ax] += sign * val;
  if (sign > 0 && vel[ax] < 0) vel[ax] *= -0.5;
  if (sign < 0 && vel[ax] > 0) vel[ax] *= -0.5;

  return true;
}

// ── Projectile ────────────────────────────────────────────────────────────────

/** Move a projectile. Returns true if it hit the arena wall and should be destroyed. */
export function tickProjectile(pos: Vec3, vel: Vec3, dt: number): boolean {
  v3.addScaledInPlace(pos, vel, dt);
  const limit = ARENA_SIZE / 2;
  return (
    Math.abs(pos.x) >= limit ||
    Math.abs(pos.y) >= limit ||
    Math.abs(pos.z) >= limit
  );
}

/** accuracy = 1 − 0.25*(1−charge)²  → 0.75 at charge=0, 1.0 at charge=1 */
export function shotAccuracyFromCharge(charge: number): number {
  const t = Math.max(0, Math.min(1, charge));
  return 1 - 0.25 * (1 - t) ** 2;
}

export function applyShotSpread(
  lookDir: Vec3,
  charge: number,
  randA: number,
  randB: number,
): Vec3 {
  const baseDir = v3.normalize(lookDir);
  const accuracy = shotAccuracyFromCharge(charge);
  const spread = Math.max(0, (1 - accuracy) * REVOLVER_MAX_SPREAD_RAD);
  if (spread <= 1e-5) return baseDir;

  const fallbackUp = Math.abs(baseDir.y) < 0.98
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };
  const right = v3.normalize(v3.cross(baseDir, fallbackUp));
  const up = v3.normalize(v3.cross(right, baseDir));

  const radius = Math.sqrt(Math.max(0, randA)) * Math.tan(spread);
  const theta = randB * Math.PI * 2;
  const offset = v3.add(
    v3.scale(right, Math.cos(theta) * radius),
    v3.scale(up, Math.sin(theta) * radius),
  );

  return v3.normalize(v3.add(baseDir, offset));
}

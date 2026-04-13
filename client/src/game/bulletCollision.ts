import * as THREE from 'three';

/**
 * Returns the surface hit point (on the expanded box face) for the bullet's
 * movement segment this frame (oldPos → newPos), or null if no intersection.
 *
 * Algorithm:
 *   1. Expand the box by bulletRadius.
 *   2. If oldPos is inside the expanded box → hit at oldPos (bullet spawned inside obstacle).
 *   3. Primary: Ray from oldPos toward newPos — returns entry point if it hits within dist.
 *   4. Fallback: If newPos is inside the expanded box but the ray test missed (float edge
 *      case), binary-search the segment to find the surface entry point.
 *
 * The returned point lies on or near the expanded box's near face — use it as the
 * flash/effect origin so effects appear on the visible surface, not inside the geometry.
 *
 * Pure function — only Three.js math objects, safe to unit-test in Node.
 */
export function bulletHitPoint(
  oldPos: THREE.Vector3,
  newPos: THREE.Vector3,
  box: THREE.Box3,
  bulletRadius: number,
): THREE.Vector3 | null {
  const expanded = box.clone().expandByScalar(bulletRadius);

  // Bullet already inside at start of frame (e.g. spawned inside obstacle).
  if (expanded.containsPoint(oldPos)) return oldPos.clone();

  const move = new THREE.Vector3().subVectors(newPos, oldPos);
  const dist = move.length();
  if (dist < 1e-6) return expanded.containsPoint(newPos) ? newPos.clone() : null;

  const dir = move.clone().divideScalar(dist);

  // Primary swept ray test — correct for all ordinary cases.
  const ray = new THREE.Ray(oldPos, dir);
  const hitTarget = new THREE.Vector3();
  if (ray.intersectBox(expanded, hitTarget) !== null && hitTarget.distanceTo(oldPos) <= dist) {
    return hitTarget;
  }

  // Fallback: newPos inside box but ray test missed (floating-point degenerate case).
  // Binary-search along the segment to find the surface entry point.
  if (expanded.containsPoint(newPos)) {
    let lo = 0, hi = dist;
    const tp = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      tp.copy(oldPos).addScaledVector(dir, mid);
      if (expanded.containsPoint(tp)) hi = mid; else lo = mid;
    }
    return new THREE.Vector3().copy(oldPos).addScaledVector(dir, (lo + hi) / 2);
  }

  return null;
}

/**
 * Boolean version — delegates to bulletHitPoint.
 * Keeps the existing test-suite API stable.
 */
export function bulletHitsBox(
  oldPos: THREE.Vector3,
  newPos: THREE.Vector3,
  box: THREE.Box3,
  bulletRadius: number,
): boolean {
  return bulletHitPoint(oldPos, newPos, box, bulletRadius) !== null;
}

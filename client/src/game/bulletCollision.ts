import * as THREE from 'three';

/**
 * Swept bullet-box collision test.
 *
 * Tests whether the bullet's movement segment this frame (oldPos → newPos)
 * intersects or penetrates an obstacle box. This correctly handles thin
 * obstacles (1-unit plates/beams) where a naive point test would miss bullets
 * that skip through in a single frame.
 *
 * Algorithm:
 *   1. Expand the box by bulletRadius (proximity surface detection).
 *   2. If oldPos or newPos is already inside the expanded box → hit.
 *   3. Cast a ray from oldPos toward newPos; if it enters the expanded box
 *      within the movement distance → hit.
 *
 * Pure function — takes only Three.js math objects, safe to unit-test in Node.
 */
export function bulletHitsBox(
  oldPos: THREE.Vector3,
  newPos: THREE.Vector3,
  box: THREE.Box3,
  bulletRadius: number,
): boolean {
  const expanded = box.clone().expandByScalar(bulletRadius);

  // Already inside (start or end of frame) — handles slow bullets and sub-pixel cases.
  if (expanded.containsPoint(oldPos) || expanded.containsPoint(newPos)) return true;

  // Swept ray test: catches fast bullets that skip through thin geometry.
  const move = new THREE.Vector3().subVectors(newPos, oldPos);
  const dist = move.length();
  if (dist < 1e-6) return false;

  const ray = new THREE.Ray(oldPos, move.clone().divideScalar(dist));
  const hitPoint = new THREE.Vector3();
  if (ray.intersectBox(expanded, hitPoint) !== null) {
    // Only count intersections that lie within the segment (not behind the ray).
    return hitPoint.distanceTo(oldPos) <= dist;
  }

  return false;
}

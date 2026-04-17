import * as THREE from "three";

export function segmentSphereHitPoint(
  oldPos: THREE.Vector3,
  newPos: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): THREE.Vector3 | null {
  const segment = new THREE.Vector3().subVectors(newPos, oldPos);
  const lengthSq = segment.lengthSq();

  if (lengthSq <= 1e-10) {
    return oldPos.distanceToSquared(center) <= radius * radius ? oldPos.clone() : null;
  }

  const fromCenter = new THREE.Vector3().subVectors(oldPos, center);
  const a = lengthSq;
  const b = 2 * fromCenter.dot(segment);
  const c = fromCenter.lengthSq() - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = [t1, t2].find((candidate) => candidate >= 0 && candidate <= 1);

  if (t === undefined) {
    return null;
  }

  return oldPos.clone().addScaledVector(segment, t);
}

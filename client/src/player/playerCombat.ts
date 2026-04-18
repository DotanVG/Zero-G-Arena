import { PLAYER_RADIUS } from '../../../shared/constants';
import type { HitZone } from './playerTypes';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Pure hit-zone classification.
 *
 * Returns the body zone that a shot at `impactPoint` landed on, relative to a
 * player at `playerPos` facing `playerFacing`. The calculation uses the
 * player-facing vector to project onto a right-vector so head/arm/body/leg
 * classification is orientation-independent.
 *
 * Rules (y-relative to player center, scaled by PLAYER_RADIUS):
 *   y/r > 0.55                → head
 *   -0.2 < y/r ≤ 0.55         → right arm (x·right > 0.4),
 *                              left arm  (x·right < -0.4),
 *                              body      (otherwise)
 *   y/r ≤ -0.2                → legs
 */
export function classifyHitZone(
  impactPoint: Vec3Like,
  playerPos: Vec3Like,
  playerFacing: Vec3Like,
  hitOffsetY = 0,
  hitRadius = PLAYER_RADIUS,
): HitZone {
  const localX = impactPoint.x - playerPos.x;
  const localY = impactPoint.y - playerPos.y - hitOffsetY;
  const localZ = impactPoint.z - playerPos.z;
  const yRel = localY / hitRadius;

  if (yRel > 0.55) {
    return 'head';
  }
  if (yRel > -0.2) {
    // right = cross(facing, worldUp), then normalized. worldUp = (0,1,0).
    // cross((fx,fy,fz),(0,1,0)) = (fy*0 - fz*1, fz*0 - fx*0, fx*1 - fy*0) = (-fz, 0, fx)
    const rx = -playerFacing.z;
    const rz = playerFacing.x;
    const invLen = 1 / Math.max(Math.hypot(rx, rz), 1e-9);
    const nx = rx * invLen;
    const nz = rz * invLen;
    const xProj = localX * nx + localZ * nz;
    const armThreshold = hitRadius * 0.55;
    if (xProj > armThreshold) return 'rightArm';
    if (xProj < -armThreshold) return 'leftArm';
    return 'body';
  }
  return 'legs';
}

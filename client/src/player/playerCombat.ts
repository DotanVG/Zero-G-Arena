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
 * player at `playerPos` facing `playerFacing`. Legs are split into left/right
 * so 1 vs 2 leg hits can throttle launch power independently.
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
  // right = cross(facing, worldUp), then normalized. worldUp = (0,1,0).
  const rx = -playerFacing.z;
  const rz = playerFacing.x;
  const invLen = 1 / Math.max(Math.hypot(rx, rz), 1e-9);
  const nx = rx * invLen;
  const nz = rz * invLen;
  const xProj = localX * nx + localZ * nz;
  if (yRel > -0.2) {
    const armThreshold = hitRadius * 0.55;
    if (xProj > armThreshold) return 'rightArm';
    if (xProj < -armThreshold) return 'leftArm';
    return 'body';
  }
  return xProj >= 0 ? 'rightLeg' : 'leftLeg';
}

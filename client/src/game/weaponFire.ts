import * as THREE from 'three';
import { CameraController } from '../camera';
import { LocalPlayer } from '../player';
import { GunViewModel } from '../render/gun';

export interface FireShot {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  color: number;
}

/**
 * Build the origin/direction/color for a projectile shot. Picks between the
 * first-person muzzle (GunViewModel on the camera) and the third-person
 * muzzle (ThirdPersonGun on the rig) based on `useThirdPersonMuzzle`.
 *
 * Returns null when no finite muzzle position is available AND a fallback
 * cannot be computed (cam quaternion is degenerate) — callers should
 * no-op on null rather than spawning a bad projectile.
 */
export function buildShotFromCamera(
  player: LocalPlayer,
  cam: CameraController,
  gun: GunViewModel,
  useThirdPersonMuzzle: boolean,
): FireShot | null {
  // Aim target and fallback origin are both derived from the eye position so
  // the shot direction matches what the player sees through the crosshair.
  const eyePos = player.getEyePosition();
  const target = eyePos.clone().addScaledVector(cam.getForward(), 60.0);
  const fallbackOrigin = eyePos
    .clone()
    .add(new THREE.Vector3(0.2, -0.22, -0.6).applyQuaternion(cam.getQuaternion()));
  const firstPersonOrigin = gun.getMuzzleWorldPosition();
  const thirdPersonOrigin = player.getThirdPersonGunMuzzleWorldPosition();
  const muzzleOrigin = useThirdPersonMuzzle ? thirdPersonOrigin : firstPersonOrigin;
  const origin = isFiniteVector3(muzzleOrigin) ? muzzleOrigin : fallbackOrigin;
  const direction = target.sub(origin).normalize();
  const color = player.team === 0 ? 0x00ffff : 0xff00ff;
  return { origin, direction, color };
}

function isFiniteVector3(value: THREE.Vector3 | null): value is THREE.Vector3 {
  return value !== null
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

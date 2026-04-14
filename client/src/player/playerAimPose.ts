import * as THREE from 'three';
import type { AnimatedRig } from './playerTypes';

export type DebugTuningTarget = 'Pistol' | 'FloatRightArm' | 'FloatRightPalm' | 'LeftArmHanging';
export type FloatLimbTuningTarget = Exclude<DebugTuningTarget, 'Pistol'>;

export interface FloatArmTuningState {
  target: FloatLimbTuningTarget;
  rotation: THREE.Euler;
}

// ── Float arm tilt ─────────────────────────────────────────────────────────
// When the player is floating/swimming, the captured idle-hold arm is rotated
// so the pistol points upward instead of forward.
// Negative X on UpperArmR swings the right arm upward (mirroring the left arm
// convention used in playerGrabPose.ts where positive X raises the left arm).
const floatArmRotation = new THREE.Euler(5.9516, 0.7330, 14.0150);
const floatPalmRotation = new THREE.Euler(-0.2269, 0.0, -0.0349);
const leftArmHangingRotation = new THREE.Euler(0, 0, 0);
export const DEFAULT_FLOAT_ARM_ROTATION = floatArmRotation.clone();
export const DEFAULT_FLOAT_PALM_ROTATION = floatPalmRotation.clone();
export const DEFAULT_LEFT_ARM_HANGING_ROTATION = leftArmHangingRotation.clone();

/** Dev tuning — set the float limb rotation at runtime (radians). */
export function setFloatLimbRotation(target: FloatLimbTuningTarget, rotation: THREE.Euler): void {
  getRotationRef(target).copy(rotation);
}
export function getFloatLimbRotation(target: FloatLimbTuningTarget): THREE.Euler {
  return getRotationRef(target).clone();
}
export function resetFloatLimbRotation(target: FloatLimbTuningTarget): void {
  getRotationRef(target).copy(getDefaultRotation(target));
}
export function getFloatLimbTuningState(target: FloatLimbTuningTarget): FloatArmTuningState {
  return {
    target,
    rotation: getFloatLimbRotation(target),
  };
}

export function applyFloatArmTilt(rigs: AnimatedRig[]): void {
  const armOffset = new THREE.Quaternion().setFromEuler(floatArmRotation);
  const palmOffset = new THREE.Quaternion().setFromEuler(floatPalmRotation);
  for (const rig of rigs) {
    rig.bones.UpperArmR?.quaternion.multiply(armOffset);
    rig.bones.PalmR?.quaternion.multiply(palmOffset);
  }
}

// ── Shot recoil ────────────────────────────────────────────────────────────
// Briefly kicks the right arm upward each time a shot fires, then decays.
export const RECOIL_DURATION = 0.15;        // seconds from trigger to settled
const RECOIL_PEAK_ANGLE      = 0.30;        // radians (~17°) at peak

/**
 * Apply a recoil kick scaled by normalised time t (1 = just fired, 0 = settled).
 * Call after restoreJumpRightArmPose / applyFloatArmTilt so it sits on top.
 */
export function applyArmRecoil(rigs: AnimatedRig[], t: number): void {
  const angle = RECOIL_PEAK_ANGLE * t;
  const offset = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-angle, 0, 0), // same axis as float tilt → kicks upward
  );
  for (const rig of rigs) {
    rig.bones.UpperArmR?.quaternion.multiply(offset);
  }
}

function getRotationRef(target: FloatLimbTuningTarget): THREE.Euler {
  if (target === 'FloatRightPalm') return floatPalmRotation;
  if (target === 'LeftArmHanging') return leftArmHangingRotation;
  return floatArmRotation;
}

export function getDefaultRotation(target: FloatLimbTuningTarget): THREE.Euler {
  if (target === 'FloatRightPalm') return DEFAULT_FLOAT_PALM_ROTATION.clone();
  if (target === 'LeftArmHanging') return DEFAULT_LEFT_ARM_HANGING_ROTATION.clone();
  return DEFAULT_FLOAT_ARM_ROTATION.clone();
}

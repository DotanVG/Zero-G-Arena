import * as THREE from 'three';
import type { AnimatedRig } from './playerTypes';
import { getFloatLimbRotation } from './playerAimPose';

/**
 * Bar-hold bone offsets. Applied on top of the base Alien_Standing pose so
 * the player visually grips the bar with the left hand while the right
 * arm keeps the pistol raised. Numbers were tuned by eye — do not touch
 * unless re-tuning the grab pose.
 */
const BAR_HOLD_HIPS_OFFSET = new THREE.Euler(-0.42, -0.02, -0.08);
const BAR_HOLD_ABDOMEN_OFFSET = new THREE.Euler(0.56, 0.0, -0.18);
const BAR_HOLD_TORSO_OFFSET = new THREE.Euler(0.44, 0.06, -0.26);
const BAR_HOLD_NECK_OFFSET = new THREE.Euler(-0.12, -0.04, 0.08);
const BAR_HOLD_SHOULDER_OFFSET = new THREE.Euler(-0.42, 0.2, -0.95);
const BAR_HOLD_UPPER_ARM_OFFSET = new THREE.Euler(1.25, 0.18, 0.82);
const BAR_HOLD_LOWER_ARM_OFFSET = new THREE.Euler(1.05, -0.28, 0.18);
const BAR_HOLD_PALM_OFFSET = new THREE.Euler(0.34, 0.34, -0.12);
const BAR_HOLD_UPPER_LEG_LEFT_OFFSET = new THREE.Euler(-0.92, 0.02, -0.26);
const BAR_HOLD_LOWER_LEG_LEFT_OFFSET = new THREE.Euler(0.98, 0.0, 0.08);
const BAR_HOLD_FOOT_LEFT_OFFSET = new THREE.Euler(0.3, 0.0, -0.06);
const BAR_HOLD_UPPER_LEG_RIGHT_OFFSET = new THREE.Euler(-0.74, -0.05, 0.22);
const BAR_HOLD_LOWER_LEG_RIGHT_OFFSET = new THREE.Euler(0.82, 0.0, -0.04);
const BAR_HOLD_FOOT_RIGHT_OFFSET = new THREE.Euler(0.22, 0.0, 0.04);

const LEFT_HAND_GRIP_FINGERTIP_BLEND = 0.64;
const LEFT_HAND_GRIP_THUMB_PULL = 0.16;
const LEFT_HAND_GRIP_FINGER_ADVANCE = 0.01;

export const DEFAULT_LEFT_HAND_GRIP_LOCAL = new THREE.Vector3(-0.27, -0.322, 0.287);

export function applyBarHoldPose(rigs: AnimatedRig[]): void {
  const leftArmHangingOffset = getFloatLimbRotation('LeftArmHanging');
  for (const rig of rigs) {
    applyPoseOffset(rig.bones.Hips, BAR_HOLD_HIPS_OFFSET);
    applyPoseOffset(rig.bones.Abdomen, BAR_HOLD_ABDOMEN_OFFSET);
    applyPoseOffset(rig.bones.Torso, BAR_HOLD_TORSO_OFFSET);
    applyPoseOffset(rig.bones.Neck, BAR_HOLD_NECK_OFFSET);
    applyPoseOffset(rig.bones.ShoulderL, BAR_HOLD_SHOULDER_OFFSET);
    applyPoseOffset(rig.bones.UpperArmL, BAR_HOLD_UPPER_ARM_OFFSET);
    applyPoseOffset(rig.bones.UpperArmL, leftArmHangingOffset);
    applyPoseOffset(rig.bones.LowerArmL, BAR_HOLD_LOWER_ARM_OFFSET);
    applyPoseOffset(rig.bones.PalmL, BAR_HOLD_PALM_OFFSET);
    applyPoseOffset(rig.bones.UpperLegL, BAR_HOLD_UPPER_LEG_LEFT_OFFSET);
    applyPoseOffset(rig.bones.LowerLegL, BAR_HOLD_LOWER_LEG_LEFT_OFFSET);
    applyPoseOffset(rig.bones.FootL, BAR_HOLD_FOOT_LEFT_OFFSET);
    applyPoseOffset(rig.bones.UpperLegR, BAR_HOLD_UPPER_LEG_RIGHT_OFFSET);
    applyPoseOffset(rig.bones.LowerLegR, BAR_HOLD_LOWER_LEG_RIGHT_OFFSET);
    applyPoseOffset(rig.bones.FootR, BAR_HOLD_FOOT_RIGHT_OFFSET);
  }
}

function applyPoseOffset(bone: THREE.Bone | undefined, offset: THREE.Euler): void {
  if (!bone) return;
  const offsetQuat = new THREE.Quaternion().setFromEuler(offset);
  bone.quaternion.multiply(offsetQuat);
}

/**
 * Locate the world-space position where the bar should sit inside the left
 * hand, then convert it back to the rig's local space so the player mesh
 * can be offset such that the grip aligns with the bar.
 *
 * The grip point is a blend across (palm, middle-fingertip, thumb-tip) —
 * tuned so the bar reads as being inside the closed palm rather than the
 * wrist or the fingertips.
 */
export function measureLeftHandGripOffset(root: THREE.Group | null): THREE.Vector3 | null {
  if (!root) return null;

  root.updateMatrixWorld(true);

  const palm = root.getObjectByName('PalmL');
  const fingerTip = root.getObjectByName('MiddleFinger4L');
  if (!palm || !fingerTip) return null;
  const thumbTip = root.getObjectByName('Thumb3L');

  const palmWorld = new THREE.Vector3();
  const fingerTipWorld = new THREE.Vector3();
  palm.getWorldPosition(palmWorld);
  fingerTip.getWorldPosition(fingerTipWorld);

  const gripWorld = new THREE.Vector3().lerpVectors(
    palmWorld,
    fingerTipWorld,
    LEFT_HAND_GRIP_FINGERTIP_BLEND,
  );
  if (thumbTip) {
    const thumbTipWorld = new THREE.Vector3();
    thumbTip.getWorldPosition(thumbTipWorld);
    gripWorld.lerp(thumbTipWorld, LEFT_HAND_GRIP_THUMB_PULL);
  }

  const fingerDir = fingerTipWorld.clone().sub(palmWorld).normalize();
  gripWorld.addScaledVector(fingerDir, LEFT_HAND_GRIP_FINGER_ADVANCE);
  const gripInRoot = root.worldToLocal(gripWorld.clone());
  return gripInRoot.applyMatrix4(root.matrix);
}

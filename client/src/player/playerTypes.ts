import * as THREE from 'three';

export type HitZone = 'head' | 'body' | 'rightArm' | 'leftArm' | 'legs';

export type PoseBoneName =
  | 'Hips'
  | 'Abdomen'
  | 'Torso'
  | 'Neck'
  | 'ShoulderR'
  | 'UpperArmR'
  | 'LowerArmR'
  | 'PalmR'
  | 'ShoulderL'
  | 'UpperArmL'
  | 'LowerArmL'
  | 'PalmL'
  | 'UpperLegL'
  | 'LowerLegL'
  | 'FootL'
  | 'UpperLegR'
  | 'LowerLegR'
  | 'FootR';

export type BreathingBoneName = 'Abdomen' | 'Torso' | 'Neck';

export type RightArmPoseBoneName = 'ShoulderR' | 'UpperArmR' | 'LowerArmR' | 'PalmR';

export interface AnimatedRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  bones: Partial<Record<PoseBoneName, THREE.Bone>>;
  breathingBasePositions: Partial<Record<BreathingBoneName, THREE.Vector3>>;
  frozenJumpRightArmPose: Partial<Record<RightArmPoseBoneName, THREE.Quaternion>>;
  floatReferenceRightArmPose: Partial<Record<RightArmPoseBoneName, THREE.Quaternion>>;
}

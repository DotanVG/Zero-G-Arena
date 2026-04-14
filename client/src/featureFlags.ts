export type DebugTuningTarget = 'Pistol' | 'FloatRightArm' | 'FloatRightPalm' | 'LeftArmHanging';

export const FEATURE_FLAGS = {
  thirdPersonLookBehind: true,
  debugTuning: {
    enabled: false as boolean,
    target: 'LeftArmHanging' as DebugTuningTarget,
  },
} as const;

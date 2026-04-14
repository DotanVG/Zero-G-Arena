# Player Character Alignment Research Handoff

Generated on 2026-04-14 for Claude Code.

Scope:
- Local player only. There is no remote GLTF player pipeline yet.
- Focused on first-person, third-person, selfie/grab/aim alignment, plus the files/assets Claude should inspect first.
- No code changes were made in this pass.

## Executive Summary

The player presentation is split across four independent systems:
- `LocalPlayer` owns the body + helmet GLBs, player phase state, and the body/root transform.
- `CameraController` owns gravity-mode, zero-G, first-person, third-person, and selfie camera placement.
- `GunViewModel` is a separate first-person weapon rig parented to the camera.
- `ThirdPersonGun` is a separate third-person weapon rig parented to the alien right hand.

The biggest likely alignment issues are:
- The first-person camera sits at the player root, not at a head/eye anchor.
- The character body also sits under that same root, so 1P and 3P are not driven from a shared anatomical anchor.
- First-person and third-person guns are tuned independently with different offsets/scales and no shared muzzle anchor logic.
- Both gun systems miss the real muzzle node name (`Muzzle005`) and fall back to bounding-box muzzle estimation.
- Third-person shot direction is built from `player.getPosition() + cam.forward * 60`, not from an actual screen-center raycast or a shared aim target.

## Asset Inventory

### `client/public/models/Alien.glb`

- Scene root after `GLTFLoader`: `Scene > AlienArmature > ...`
- Body mesh name after sanitization: `Cylinder002`
- Material names: `Main`, `Stripe`, `Eyes`, `Nails`, `White`
- Animation clips:
  - `Alien_Clapping`
  - `Alien_Death`
  - `Alien_Idle`
  - `Alien_IdleHold`
  - `Alien_Jump`
  - `Alien_Punch`
  - `Alien_Roll`
  - `Alien_Run`
  - `Alien_RunHold`
  - `Alien_RunningJump`
  - `Alien_Sitting`
  - `Alien_Standing`
  - `Alien_Swimming`
  - `Alien_SwordSlash`
  - `Alien_Walk`
- Important sanitized bone/object names the code actually depends on:
  - `Hips`, `Abdomen`, `Torso`, `Neck`, `Head`
  - `ShoulderL`, `UpperArmL`, `LowerArmL`, `PalmL`
  - `ShoulderR`, `UpperArmR`, `LowerArmR`, `PalmR`
  - `MiddleFinger4L`, `Thumb3L`
  - `UpperLegL`, `LowerLegL`, `FootL`
  - `UpperLegR`, `LowerLegR`, `FootR`

### `client/public/models/Alien_Helmet.glb`

- Same skeleton layout and same 15 animation clips as `Alien.glb`
- Extra material: `Glass`
- Code makes only `Glass` translucent

### `client/public/models/Ray Gun.glb`

- No animation clips
- Scene hierarchy after `GLTFLoader`:
  - `Scene`
  - `RayGun`
  - `Muzzle005`
  - `Muzzle005_1`
  - `Muzzle005_2`
  - `Muzzle005_3`
- Material names: `Main`, `Main2`, `Detail`, `Muzzle`

Important note:
- The real muzzle mesh name is `Muzzle005`, not `Muzzle.005`.
- Both gun systems currently search for `Muzzle.005` / `Muzzle` / `muzzle`, then only do a shallow `root.children.find(...)`.
- Result: neither 1P nor 3P uses the true muzzle node right now.

## Runtime Transform Facts

### Body and Helmet transform

From `client/src/player/localPlayer.ts`:
- Scale: `0.2`
- Position: `y = -PLAYER_RADIUS * 0.8`, `z = 0.3`
- Rotation: `y = Math.PI`

Measured on the loaded alien after those transforms:
- `Head` is roughly `[0, -0.270, 0.311]` relative to the player root
- `Neck` is roughly `[0, -0.307, 0.311]`
- `PalmL` is roughly `[-0.215, -0.320, 0.304]`
- `PalmR` is roughly `[0.215, -0.320, 0.304]`

Implication:
- The camera is applied at `player.getPosition()`.
- The head is below and in front of that root, so current first-person view is not eye-aligned.

### Left-hand grip data

From `client/src/player/playerGrabPose.ts` and direct measurement:
- `DEFAULT_LEFT_HAND_GRIP_LOCAL = (-0.27, -0.322, 0.287)`
- Measured idle/bind grip on the loaded alien is about `(-0.285, -0.323, 0.275)`
- Measured grip after `Alien_Standing` + `applyBarHoldPose(...)` is about `(-0.234, -0.442, 0.417)`

Implication:
- Bar alignment already depends on a pose-specific measured grip point.
- If Claude changes model scale/root offsets/bone pose, grab alignment must be re-measured too.

### First-person gun transform

From `client/src/render/gun.ts`:
- Offset: `(0.1, -0.3, -0.15)`
- Scale: `0.15`
- Rotation: `(0, -0.1, 0)`

Measured muzzle world position relative to camera origin:
- Current fallback logic: about `(0.120, -0.228, -0.616)`
- True `Muzzle005` lookup: about `(0.139, -0.228, -0.537)`

### Third-person gun transform

From `client/src/player/playerThirdPersonGun.ts`:
- Offset: `(0.02, 0.03, -0.08)`
- Scale: `0.28`
- Rotation: `(-17.72, 0.0, 1.31)`
- Parent bone: first match of `PalmR`, `Palm.R`, `HandR`, `Hand.R`, `LowerArmR`, `LowerArm.R`

Measured player-local muzzle position:
- Current fallback logic: about `(0.292, -0.350, 0.199)`
- True `Muzzle005` lookup: about `(0.361, -0.376, 0.275)`

Implication:
- 1P and 3P guns are not only visually separate; they also currently compute different estimated muzzle points.

## Mode Matrix

### First-person normal play

- Camera mode is first-person when `thirdPerson === false` and selfie is not held.
- Camera position is exactly `player.getPosition()`.
- Camera rotation is `CameraController.getQuaternion()`.
- First-person gun is visible.
- Third-person gun is hidden.
- Body mesh is still present in the scene.

### Third-person toggle

- Toggle key is `H` when `FEATURE_FLAGS.thirdPersonLookBehind` is enabled.
- Camera is placed `3.0` units behind plus `0.5` units up from the player along the full camera quaternion.
- Third-person gun becomes visible.
- First-person gun hides.
- Projectile origin switches to `LocalPlayer.getThirdPersonGunMuzzleWorldPosition()`.

### Selfie mode

- Hold key is `B` when `FEATURE_FLAGS.thirdPersonLookBehind` is enabled.
- Camera is placed `3.0` units in front of the player.
- Camera quaternion is `quat * Y-180deg`.
- Third-person gun remains visible.
- Projectile origin still uses third-person muzzle logic.

### Breach mode

- `player.phase === 'BREACH'`
- Gravity movement with `integrateBreachRoom(...)`
- Camera is in yaw/pitch gravity mode
- Animation picks between `Alien_IdleHold`, `Alien_RunHold`, `Alien_Jump`
- Shooting is blocked because `tickWeaponFire()` only fires in `FLOATING`, `GRABBING`, or `AIMING`

### Floating mode

- `player.phase === 'FLOATING'`
- Camera is free quaternion zero-G mode
- Body quaternion copies the full camera quaternion
- Animation falls back to `Alien_IdleHold`
- There is no dedicated floating/drift animation yet

### Grabbing / Aiming mode

- `player.phase === 'GRABBING'` or `AIMING`
- Animation snaps to `Alien_Standing`, then `applyBarHoldPose(...)`
- Body orientation stops following full camera quaternion
- `computeVisualQuaternion(...)` flattens camera forward to XZ and applies only smoothed yaw
- `lockGripToBar(...)` offsets the whole player root so the left-hand grip point lands on the bar tip

Implication:
- Grab/aim alignment is intentionally using a different body-orientation rule from normal floating/first-person play.

## File Inventory and Fix Surfaces

### Highest-priority files

- `client/src/player/localPlayer.ts`
  - Constructor loads body + helmet and applies root transforms
  - `update(...)`
  - `updateBreach(...)`
  - `updateFloating(...)`
  - `updateGrabbing(...)`
  - `updateAiming(...)`
  - `updateAnimation(...)`
  - `lockGrabPose(...)`
  - `computeVisualQuaternion(...)`
  - `lockGripToBar(...)`
  - Also exposes 3P gun visibility/tuning helpers

- `client/src/camera.ts`
  - `setZeroGMode(...)`
  - `applyMouseDelta(...)`
  - `getQuaternion()`
  - `getForward()`
  - `getYawForward()`
  - `apply(position, isThirdPerson, isSelfie)`
  - `resetForBreachSpawn(...)`
  - This file controls all 1P/3P/selfie camera placement

- `client/src/render/gun.ts`
  - First-person gun viewmodel
  - `computeMuzzleLocal(...)`
  - `findMuzzleNode(...)`

- `client/src/player/playerThirdPersonGun.ts`
  - Third-person gun parenting, transform tuning, and muzzle lookup
  - `attachTo(...)`
  - `computeMuzzleLocal(...)`
  - `findMuzzleNode(...)`

- `client/src/game/weaponFire.ts`
  - Builds shot origin/direction
  - Currently mixes muzzle origin with a target derived from `player.getPosition()` and `cam.getForward()`

### Secondary but relevant files

- `client/src/player/playerAnimationController.ts`
  - Registers the body and helmet rigs
  - Crossfades animations
  - Captures/restores right-arm pose during jump

- `client/src/player/playerGrabPose.ts`
  - Hard-coded grab-pose Euler offsets
  - Grip-point measurement logic

- `client/src/input.ts`
  - `H` toggles 3P
  - `B` holds selfie
  - `P` toggles 3P gun tuning
  - `Backspace` resets tuning
  - `Enter` prints tuning
  - Arrow/Page keys + IJKLUO adjust tuning

- `client/src/game/gameApp.ts`
  - Calls `cam.apply(...)`
  - Switches shot origin between 1P and 3P
  - Shows/hides the 1P and 3P guns

- `client/src/player/playerSpawn.ts`
  - Only affects spawn placement, but not camera/body anatomical alignment

- `client/src/physics.ts`
  - Defines the breach-vs-zero-G movement rules that change which animation/camera mode is active

- `client/src/arena/bar.ts`
  - `getGrabPoint()` returns the bar-tip anchor the left hand is aligned to

- `shared/schema.ts`
  - Defines phase names: `BREACH`, `FLOATING`, `GRABBING`, `AIMING`, `FROZEN`, `RESPAWNING`

### Low-value for this task

- `server/src/player.ts`
- `server/src/sim.ts`

These only track gameplay state and yaw/pitch, not client-side visual alignment.

## Concrete Issues Claude Should Verify First

1. Muzzle-node lookup bug
- `Ray Gun.glb` exposes `Muzzle005`
- Code looks for `Muzzle.005`
- `findMuzzleNode(...)` is not recursive
- Affects both `client/src/render/gun.ts` and `client/src/player/playerThirdPersonGun.ts`

2. Camera-root vs. head-anchor mismatch
- First-person camera is applied at the player root
- Alien head is not at that root
- If Claude wants true 1P alignment, the camera needs a head/eye anchor or the body needs a different root offset strategy

3. Two completely separate gun rigs
- 1P gun and 3P gun each load their own copy of `Ray Gun.glb`
- Different scales, offsets, rotations, visibility rules, and muzzle calculations
- Any fix done to only one side will leave the other mode misaligned

4. Shot direction is not built from a unified aim target
- `buildShotFromCamera(...)` uses:
  - origin = 1P or 3P muzzle
  - target = `player.getPosition() + cam.getForward() * 60`
- In third-person this is not the same as a true camera-center raycast target

5. Grab/aim orientation intentionally strips pitch
- `computeVisualQuaternion(...)` uses flattened forward while grabbing/aiming
- This can make body/gun alignment differ from free-look orientation

6. No floating-specific animation or right-arm IK yet
- Confirmed in `PlanTracker.md`
- Current floating visual is just `Alien_IdleHold`
- So even after offset fixes, the weapon arm may still not visually track well in zero-G

## Suggested Fix Order For Claude

1. Fix muzzle node lookup in both gun systems first.
2. Decide on the canonical first-person anchor:
   - head/eyes bone
   - dedicated camera socket
   - or a hand-tuned local offset from the player root
3. Decide whether the body should remain visible in first-person:
   - full body
   - body without head/helmet
   - or hidden local body with only weapon/hands
4. Reconcile 1P and 3P weapon alignment around a shared muzzle/aim convention.
5. Re-test grabbing and aiming after any root or scale change because left-hand bar alignment is pose-sensitive.
6. Only after the above, retune the third-person camera shoulder distance/height if it still feels wrong.

## Useful Line References

- `client/src/game/gameApp.ts`: `beginNewRound` at line 77, `loop` at 102, `tickWeaponFire` at 147, `tickGunTuning` at 162, `updateGunVisibility` at 179
- `client/src/camera.ts`: `setZeroGMode` at 43, `applyMouseDelta` at 94, `getQuaternion` at 114, `apply` at 156, `resetForBreachSpawn` at 201
- `client/src/player/localPlayer.ts`: class starts 43, constructor 80, `update` 154, `updateBreach` 196, `updateFloating` 245, `updateGrabbing` 291, `updateAiming` 312, `updateAnimation` 366, `lockGrabPose` 415, `computeVisualQuaternion` 423, `lockGripToBar` 447
- `client/src/player/playerAnimationController.ts`: clip constants at 4-9, `registerRig` 50, `setTargetAnimation` 94, `snapToAnimation` 114, `tickBreathing` 129, `captureJumpRightArmPose` 164
- `client/src/player/playerGrabPose.ts`: grab offsets 10-23, `DEFAULT_LEFT_HAND_GRIP_LOCAL` 29, `applyBarHoldPose` 31, `measureLeftHandGripOffset` 65
- `client/src/player/playerThirdPersonGun.ts`: class 24, `attachTo` 36, `getMuzzleWorldPosition` 77, `nudge` 96, `computeMuzzleLocal` 150, `findMuzzleNode` 175
- `client/src/render/gun.ts`: class 22, constructor 27, `getMuzzleWorldPosition` 64, `computeMuzzleLocal` 73, `findMuzzleNode` 98
- `client/src/game/weaponFire.ts`: `buildShotFromCamera` 21
- `client/src/input.ts`: `setAimingMode` 77, `consumeMouseDelta` 82, `consumeAimDelta` 91, `consumeThirdPersonToggle` 130, `isSelfieHeld` 137, gun-tuning controls 140-160


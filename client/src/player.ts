import * as THREE from 'three';
import {
  MAX_LAUNCH_SPEED,
  LEGS_HIT_LAUNCH_FACTOR,
  LAUNCH_AIM_SENSITIVITY,
  GRAB_RADIUS,
  PLAYER_RADIUS,
  RESPAWN_TIME,
  BREACH_ROOM_D,
  BREACH_ROOM_H,
} from '../../shared/constants';
import { clamp } from './util/math';
import { type DamageState, type PlayerPhase } from '../../shared/schema';
import { CameraController } from './camera';
import { InputManager } from './input';
import {
  type PhysicsState,
  integrateZeroG,
  integrateBreachRoom,
  clampBreachRoom,
  bounceArena,
} from './physics';
import { Arena } from './arena/arena';
import { makePlayerMaterial } from './render/materials';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type HitZone = 'head' | 'body' | 'rightArm' | 'leftArm' | 'legs';

const DEFAULT_LEFT_HAND_GRIP_LOCAL = new THREE.Vector3(-0.27, -0.322, 0.287);
const LEFT_HAND_GRIP_FINGERTIP_BLEND = 0.64;
const LEFT_HAND_GRIP_THUMB_PULL = 0.16;
const LEFT_HAND_GRIP_FINGER_ADVANCE = 0.01;
const ANIM_IDLE_HOLD = 'Alien_IdleHold';
const ANIM_RUN_HOLD = 'Alien_RunHold';
const ANIM_STANDING = 'Alien_Standing';
const ANIM_DEATH = 'Alien_Death';
const ANIM_FADE_SECONDS = 0.16;
const GRAB_ROTATION_SMOOTHING = 0.0008;
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

type PoseBoneName =
  | 'Hips'
  | 'Abdomen'
  | 'Torso'
  | 'Neck'
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

type AnimatedRig = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  bones: Partial<Record<PoseBoneName, THREE.Bone>>;
};

export class LocalPlayer {
  public phys: PhysicsState = {
    pos: new THREE.Vector3(0, 0, -15),
    vel: new THREE.Vector3(),
  };

  public phase: PlayerPhase = 'BREACH';
  public team: 0 | 1 = 0;
  public kills = 0;
  public deaths = 0;

  public damage: DamageState = {
    frozen: false,
    rightArm: false,
    leftArm: false,
    legs: false,
  };

  public launchPower = 0;
  public grabbedBarPos: THREE.Vector3 | null = null;
  public currentBreachTeam: 0 | 1 = 0;   // which breach room provides gravity (changes on score)

  private respawnTimer = 0;
  private onGround = false;

  private mesh: THREE.Group;
  private leftHandGripLocal = DEFAULT_LEFT_HAND_GRIP_LOCAL.clone();
  private grabHandGripLocal: THREE.Vector3 | null = null;
  private grabPoseLocked = false;
  private animatedRigs: AnimatedRig[] = [];
  private currentAnimation = ANIM_IDLE_HOLD;
  private currentAnimationTime = 0;
  private visualQuaternion = new THREE.Quaternion();

  public onRoundWin: ((team: 0 | 1) => void) | null = null;

  public constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();

    const loader = new GLTFLoader();

    // Load Alien Body
    loader.load(
      '/models/Alien.glb',
      (gltf) => {
        const alien = gltf.scene;
        alien.scale.setScalar(0.2); // Reduced from 0.7
        alien.position.y = -PLAYER_RADIUS * 0.8; // Adjusted height for new scale
        alien.position.z = 0.3; // Push model behind the camera view
        // Face forward relative to camera
        alien.rotation.y = Math.PI;

        this.captureLeftHandGripOffset(alien);
        this.registerAnimatedRig(alien, gltf.animations);
        this.mesh.add(alien);
      },
      undefined,
      (err) => console.error('[LocalPlayer] failed to load Alien.glb', err)
    );

    // Load Alien Helmet
    loader.load(
      '/models/Alien_Helmet.glb',
      (gltf) => {
        const helmet = gltf.scene;
        helmet.scale.setScalar(0.2);
        helmet.position.y = -PLAYER_RADIUS * 0.8;
        helmet.position.z = 0.3; // Push behind the camera
        helmet.rotation.y = Math.PI;

        // The helmet export ships with an opaque "Glass" material.
        // Make only that material translucent so the dome reads like a visor
        // instead of a solid black sphere over the player's head.
        helmet.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of materials) {
            if (material.name !== 'Glass') continue;
            material.transparent = true;
            material.opacity = 0.22;
            material.depthWrite = false;
            material.roughness = 0.12;
            material.metalness = 0.0;
          }
        });

        this.registerAnimatedRig(helmet, gltf.animations);
        this.mesh.add(helmet);
      },
      undefined,
      (err) => console.error('[LocalPlayer] failed to load Alien_Helmet.glb', err)
    );

    scene.add(this.mesh);
  }

  public canGrabBar(): boolean {
    return !this.damage.frozen && !this.damage.leftArm;
  }

  public canFire(): boolean {
    return !this.damage.frozen && !this.damage.rightArm;
  }

  public maxLaunchPower(): number {
    return this.damage.legs
      ? MAX_LAUNCH_SPEED * LEGS_HIT_LAUNCH_FACTOR
      : MAX_LAUNCH_SPEED;
  }

  public update(
    input: InputManager,
    cam: CameraController,
    arena: Arena,
    dt: number,
  ): void {
    switch (this.phase) {
      case 'FROZEN':
        this.updateFrozen(arena, dt);
        break;
      case 'BREACH':
        this.updateBreach(input, cam, arena, dt);
        break;
      case 'FLOATING':
        this.updateFloating(input, cam, arena, dt);
        break;
      case 'GRABBING':
        this.updateGrabbing(input, cam, dt);
        break;
      case 'AIMING':
        this.updateAiming(input, cam, arena, dt);
        break;
      case 'RESPAWNING':
        this.updateRespawning(arena, dt);
        break;
    }
    this.updateAnimation(input, dt);
    const visualQuat = this.computeVisualQuaternion(cam, dt);
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
      this.lockGripToBar(visualQuat);
    }
    this.mesh.position.copy(this.phys.pos);
    this.mesh.quaternion.copy(visualQuat);
  }

  private updateFrozen(arena: Arena, dt: number): void {
    integrateZeroG(this.phys, dt);
    bounceArena(this.phys);
    arena.bounceObstacles(this.phys);
  }

  private updateBreach(
    input: InputManager,
    cam: CameraController,
    arena: Arena,
    dt: number,
  ): void {
    const center = arena.getBreachRoomCenter(this.currentBreachTeam);
    const openAxis = arena.getBreachOpenAxis(this.currentBreachTeam);
    const openSign = arena.getBreachOpenSign(this.currentBreachTeam);

    // Floor matches clampBreachRoom: center.y - (BREACH_ROOM_H/2 - PLAYER_RADIUS)
    const floorY = center.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS;
    this.onGround = this.phys.pos.y <= floorY + 0.08;

    integrateBreachRoom(
      this.phys,
      input.getWalkAxes(),
      cam.getYawForward(),
      cam.getYawRight(),
      input.isJumping(),
      this.onGround,
      dt,
    );

    clampBreachRoom(this.phys, center, openAxis, openSign, arena.isGoalDoorOpen(this.currentBreachTeam));

    const grabInput = input.consumeGrab();
    const nearBar = arena.getNearestBar(this.phys.pos, GRAB_RADIUS);
    if (nearBar && grabInput && this.canGrabBar()) {
      if (arena.isGoalDoorOpen(this.currentBreachTeam)) {
        this.grabBar(nearBar, cam);
        return;
      }
    }

    if (!arena.isInBreachRoom(this.phys.pos, this.currentBreachTeam)) {
      this.phase = 'FLOATING';
    }
  }

  private updateFloating(
    input: InputManager,
    cam: CameraController,
    arena: Arena,
    dt: number,
  ): void {
    const goalAxis = arena.getBreachOpenAxis(this.team);
    const perpAxis: 'x' | 'z' = goalAxis === 'z' ? 'x' : 'z';
    const team0FaceSign = (-arena.getBreachOpenSign(0)) as 1 | -1;
    const team1FaceSign = (-arena.getBreachOpenSign(1)) as 1 | -1;
    const portalFacesOpen = {
      positive: (team0FaceSign === 1 && arena.isGoalDoorOpen(0)) || (team1FaceSign === 1 && arena.isGoalDoorOpen(1)),
      negative: (team0FaceSign === -1 && arena.isGoalDoorOpen(0)) || (team1FaceSign === -1 && arena.isGoalDoorOpen(1)),
    };

    integrateZeroG(this.phys, dt);
    bounceArena(this.phys, goalAxis, perpAxis, portalFacesOpen);
    arena.bounceObstacles(this.phys);

    // Return to own breach room
    if (arena.isInBreachRoom(this.phys.pos, this.team)) {
      this.currentBreachTeam = this.team;
      this.phase = 'BREACH';
      this.phys.vel.y = 0;
      return;
    }

    // Enter enemy breach room — gravity + win activate once player is 1 m past the portal face
    const enemyTeam = (1 - this.team) as 0 | 1;
    if (!this.damage.frozen
      && arena.isGoalDoorOpen(enemyTeam)
      && arena.isDeepInBreachRoom(this.phys.pos, enemyTeam, 1.0)) {
      this.currentBreachTeam = enemyTeam;
      this.phase = 'BREACH';
      this.phys.vel.y = 0;
      this.kills++;
      this.onRoundWin?.(this.team);
      return;
    }

    const grabInput = input.consumeGrab();
    const nearBar = arena.getNearestBar(this.phys.pos, GRAB_RADIUS);
    if (nearBar && grabInput && this.canGrabBar()) {
      this.grabBar(nearBar, cam);
    }
  }

  private updateGrabbing(
    input: InputManager,
    _cam: CameraController,
    _dt: number,
  ): void {
    if (!this.grabbedBarPos) {
      this.phase = 'FLOATING';
      return;
    }

    this.phys.vel.set(0, 0, 0);

    // E releases the bar — stay at current bar position with zero velocity
    if (input.consumeGrab()) {
      this.phase = 'FLOATING';
      this.grabbedBarPos = null;
      return;
    }

    if (input.isAiming()) {
      this.phase = 'AIMING';
      this.launchPower = 0;
    }
  }

  private updateAiming(
    input: InputManager,
    cam: CameraController,
    _arena: Arena,
    _dt: number,
  ): void {
    if (!this.grabbedBarPos) {
      this.phase = 'FLOATING';
      return;
    }

    this.phys.vel.set(0, 0, 0);

    const { dy } = input.consumeAimDelta();
    this.launchPower += dy * LAUNCH_AIM_SENSITIVITY;
    this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());

    if (!input.isAiming()) {
      this.launch(cam);
    }
  }

  private updateRespawning(arena: Arena, dt: number): void {
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 0;
      this.currentBreachTeam = this.team;
      const center   = arena.getBreachRoomCenter(this.team);
      const openAxis = arena.getBreachOpenAxis(this.team);
      const openSign = arena.getBreachOpenSign(this.team);
      const floorY   = center.y - BREACH_ROOM_H_HALF() + PLAYER_RADIUS + 0.1;
      const spawnPos = center.clone();
      spawnPos[openAxis] -= openSign * (BREACH_ROOM_D / 2 - PLAYER_RADIUS - 0.5);
      this.phys.pos.set(spawnPos.x, floorY, spawnPos.z);
      this.phys.vel.set(0, 0, 0);
      this.phase     = 'BREACH';
    }
  }

  private grabBar(barPos: THREE.Vector3, cam: CameraController): void {
    this.grabbedBarPos = barPos.clone();
    this.phys.vel.set(0, 0, 0);
    this.phase = 'GRABBING';
    this.lockGrabPose();
    const visualQuat = this.computeVisualQuaternion(cam, 1 / 60);
    this.lockGripToBar(visualQuat);
  }

  private launch(cam: CameraController): void {
    const fwd = cam.getForward();
    // Offset player away from bar/obstacle surface before applying velocity
    this.phys.pos.addScaledVector(fwd, PLAYER_RADIUS + 0.8);
    this.phys.vel.copy(fwd).multiplyScalar(this.launchPower);
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabHandGripLocal = null;
    this.grabPoseLocked = false;
    this.phase = 'FLOATING';
  }

  private captureLeftHandGripOffset(alien: THREE.Group): void {
    const gripLocal = this.measureLeftHandGripOffset(alien);
    if (gripLocal) {
      this.leftHandGripLocal.copy(gripLocal);
    }
  }

  private registerAnimatedRig(root: THREE.Group, clips: THREE.AnimationClip[]): void {
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();

    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(clip.name, action);
    }

    this.animatedRigs.push({
      root,
      mixer,
      actions,
      bones: this.collectPoseBones(root),
    });

    const action = actions.get(this.currentAnimation) ?? actions.get(ANIM_IDLE_HOLD);
    if (action) {
      action.reset();
      action.play();
      action.time = this.currentAnimationTime;
    }
  }

  private updateAnimation(input: InputManager, dt: number): void {
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
      if (!this.grabPoseLocked) {
        this.lockGrabPose();
      }
      return;
    }

    this.grabPoseLocked = false;
    const nextAnimation = this.selectAnimation(input);
    if (nextAnimation !== this.currentAnimation) {
      this.playAnimation(nextAnimation);
    }

    this.currentAnimationTime += dt;
    for (const rig of this.animatedRigs) {
      rig.mixer.update(dt);
    }
  }

  private selectAnimation(input: InputManager): string {
    if (this.phase === 'FROZEN') {
      return ANIM_DEATH;
    }
    if (this.phase === 'RESPAWNING') {
      return ANIM_STANDING;
    }
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
      return ANIM_STANDING;
    }

    if (this.phase === 'BREACH') {
      const walk = input.getWalkAxes();
      if (this.onGround && (walk.x !== 0 || walk.z !== 0)) {
        return ANIM_RUN_HOLD;
      }
    }

    return ANIM_IDLE_HOLD;
  }

  private playAnimation(name: string): void {
    this.currentAnimationTime = 0;

    for (const rig of this.animatedRigs) {
      const next = rig.actions.get(name) ?? rig.actions.get(ANIM_IDLE_HOLD);
      const prev = rig.actions.get(this.currentAnimation);
      if (!next || next === prev) {
        continue;
      }

      prev?.fadeOut(ANIM_FADE_SECONDS);
      next.reset();
      next.fadeIn(ANIM_FADE_SECONDS);
      next.play();
    }

    this.currentAnimation = name;
  }

  private collectPoseBones(root: THREE.Group): Partial<Record<PoseBoneName, THREE.Bone>> {
    const names: PoseBoneName[] = [
      'Hips',
      'Abdomen',
      'Torso',
      'Neck',
      'ShoulderL',
      'UpperArmL',
      'LowerArmL',
      'PalmL',
      'UpperLegL',
      'LowerLegL',
      'FootL',
      'UpperLegR',
      'LowerLegR',
      'FootR',
    ];
    const bones: Partial<Record<PoseBoneName, THREE.Bone>> = {};

    for (const name of names) {
      const bone = root.getObjectByName(name);
      if (bone instanceof THREE.Bone) {
        bones[name] = bone;
      }
    }

    return bones;
  }

  private applyBarHoldPose(): void {
    for (const rig of this.animatedRigs) {
      this.applyPoseOffset(rig.bones.Hips, BAR_HOLD_HIPS_OFFSET);
      this.applyPoseOffset(rig.bones.Abdomen, BAR_HOLD_ABDOMEN_OFFSET);
      this.applyPoseOffset(rig.bones.Torso, BAR_HOLD_TORSO_OFFSET);
      this.applyPoseOffset(rig.bones.Neck, BAR_HOLD_NECK_OFFSET);
      this.applyPoseOffset(rig.bones.ShoulderL, BAR_HOLD_SHOULDER_OFFSET);
      this.applyPoseOffset(rig.bones.UpperArmL, BAR_HOLD_UPPER_ARM_OFFSET);
      this.applyPoseOffset(rig.bones.LowerArmL, BAR_HOLD_LOWER_ARM_OFFSET);
      this.applyPoseOffset(rig.bones.PalmL, BAR_HOLD_PALM_OFFSET);
      this.applyPoseOffset(rig.bones.UpperLegL, BAR_HOLD_UPPER_LEG_LEFT_OFFSET);
      this.applyPoseOffset(rig.bones.LowerLegL, BAR_HOLD_LOWER_LEG_LEFT_OFFSET);
      this.applyPoseOffset(rig.bones.FootL, BAR_HOLD_FOOT_LEFT_OFFSET);
      this.applyPoseOffset(rig.bones.UpperLegR, BAR_HOLD_UPPER_LEG_RIGHT_OFFSET);
      this.applyPoseOffset(rig.bones.LowerLegR, BAR_HOLD_LOWER_LEG_RIGHT_OFFSET);
      this.applyPoseOffset(rig.bones.FootR, BAR_HOLD_FOOT_RIGHT_OFFSET);
    }
  }

  private lockGrabPose(): void {
    if (this.currentAnimation !== ANIM_STANDING) {
      this.playAnimation(ANIM_STANDING);
    }

    this.currentAnimationTime = 0;
    for (const rig of this.animatedRigs) {
      rig.mixer.setTime(0);
    }

    this.applyBarHoldPose();
    this.grabHandGripLocal = this.measureLeftHandGripOffset(this.animatedRigs[0]?.root ?? null);
    this.grabPoseLocked = true;
  }

  private applyPoseOffset(bone: THREE.Bone | undefined, offset: THREE.Euler): void {
    if (!bone) {
      return;
    }

    const offsetQuat = new THREE.Quaternion().setFromEuler(offset);
    bone.quaternion.multiply(offsetQuat);
  }

  private measureLeftHandGripOffset(root: THREE.Group | null): THREE.Vector3 | null {
    if (!root) {
      return null;
    }

    root.updateMatrixWorld(true);

    const palm = root.getObjectByName('PalmL');
    const fingerTip = root.getObjectByName('MiddleFinger4L');
    if (!palm || !fingerTip) {
      return null;
    }
    const thumbTip = root.getObjectByName('Thumb3L');

    const palmWorld = new THREE.Vector3();
    const fingerTipWorld = new THREE.Vector3();
    palm.getWorldPosition(palmWorld);
    fingerTip.getWorldPosition(fingerTipWorld);

    // Blend across the closed hand so the bar sits inside the palm instead of
    // feeling centered in the wrist or floating near the fingertips.
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

  private computeVisualQuaternion(cam: CameraController, dt: number): THREE.Quaternion {
    const cameraQuat = cam.getQuaternion();
    if (this.phase !== 'GRABBING' && this.phase !== 'AIMING') {
      this.visualQuaternion.copy(cameraQuat);
      return this.visualQuaternion;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat);
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (flatForward.lengthSq() < 1e-5) {
      flatForward.set(0, 0, -1);
    } else {
      flatForward.normalize();
    }

    const target = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      flatForward,
    );
    const alpha = 1 - Math.pow(GRAB_ROTATION_SMOOTHING, dt);
    this.visualQuaternion.slerp(target, alpha);
    return this.visualQuaternion;
  }

  private lockGripToBar(visualQuat: THREE.Quaternion): void {
    if (!this.grabbedBarPos) {
      return;
    }

    const gripLocal = this.grabHandGripLocal ?? this.leftHandGripLocal;
    const handOffset = gripLocal.clone().applyQuaternion(visualQuat);
    this.phys.pos.copy(this.grabbedBarPos).sub(handOffset);
  }

  public applyHit(zone: HitZone, impulse: THREE.Vector3): void {
    this.phys.vel.add(impulse);

    switch (zone) {
      case 'head':
      case 'body':
        if (!this.damage.frozen) {
          this.damage.frozen = true;
          this.deaths++;
        }
        this.phase = 'FROZEN';
        this.grabbedBarPos = null;
        this.grabHandGripLocal = null;
        this.grabPoseLocked = false;
        break;
      case 'rightArm':
        this.damage.rightArm = true;
        break;
      case 'leftArm':
        this.damage.leftArm = true;
        if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
          this.phase = 'FLOATING';
          this.grabbedBarPos = null;
          this.grabHandGripLocal = null;
          this.grabPoseLocked = false;
        }
        break;
      case 'legs':
        this.damage.legs = true;
        this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());
        break;
    }
  }

  public static classifyHitZone(
    impactPoint: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerFacing: THREE.Vector3,
  ): HitZone {
    const local = impactPoint.clone().sub(playerPos);
    const yRel = local.y / PLAYER_RADIUS;

    if (yRel > 0.55) {
      return 'head';
    }
    if (yRel > -0.2) {
      const worldUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3()
        .crossVectors(playerFacing, worldUp)
        .normalize();
      const xProj = local.dot(right);
      if (xProj > 0.4) {
        return 'rightArm';
      }
      if (xProj < -0.4) {
        return 'leftArm';
      }
      return 'body';
    }
    return 'legs';
  }

  public resetForNewRound(arena: Arena): void {
    this.damage = {
      frozen: false,
      rightArm: false,
      leftArm: false,
      legs: false,
    };
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabHandGripLocal = null;
    this.grabPoseLocked = false;
    this.currentBreachTeam = this.team;
    this.phys.vel.set(0, 0, 0);

    const center   = arena.getBreachRoomCenter(this.team);
    const openAxis = arena.getBreachOpenAxis(this.team);
    const openSign = arena.getBreachOpenSign(this.team);
    const floorY   = center.y - BREACH_ROOM_H_HALF() + PLAYER_RADIUS + 0.1;
    // Spawn at back of breach room, facing portal
    const spawnPos = center.clone();
    spawnPos[openAxis] -= openSign * (BREACH_ROOM_D / 2 - PLAYER_RADIUS - 0.5);
    this.phys.pos.set(spawnPos.x, floorY, spawnPos.z);
    this.phase   = 'BREACH';
  }

  public getPosition(): THREE.Vector3 {
    return this.phys.pos;
  }

  public getMesh(): THREE.Group {
    return this.mesh;
  }

  public getScore(): number {
    return this.kills;
  }

  public getFrozenTimer(): number {
    return 0;
  }
}

function BREACH_ROOM_H_HALF(): number {
  return 3;
}

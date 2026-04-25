import * as THREE from 'three';
import {
  BOTH_LEGS_HIT_LAUNCH_FACTOR,
  GRAB_RADIUS,
  LAUNCH_AIM_SENSITIVITY,
  MAX_LAUNCH_SPEED,
  ONE_LEG_HIT_LAUNCH_FACTOR,
  PLAYER_RADIUS,
} from '../../../shared/constants';
import { clamp } from '../util/math';
import { type DamageState, type PlayerPhase } from '../../../shared/schema';
import { CameraController } from '../camera';
import { InputManager } from '../input';
import {
  type PhysicsState,
  integrateZeroG,
  integrateBreachRoom,
  clampBreachRoom,
  bounceArena,
} from '../physics';
import { Arena } from '../arena/arena';
import type { HitZone } from './playerTypes';
import { classifyHitZone } from './playerCombat';
import { breachRoomFloorY, computeBreachSpawnPosition } from './playerSpawn';
import {
  ANIM_DEATH,
  ANIM_FADE_SECONDS,
  ANIM_FLOAT,
  ANIM_IDLE_HOLD,
  ANIM_JUMP,
  ANIM_RUN_HOLD,
  ANIM_STANDING,
  BREACH_JUMP_TAKEOFF_SPEED,
  PlayerAnimationController,
} from './playerAnimationController';
import {
  DEFAULT_LEFT_HAND_GRIP_LOCAL,
  applyBarHoldPose,
  measureLeftHandGripOffset,
} from './playerGrabPose';
import { PlayerDamageGlow } from './playerDamageGlow';
import { loadAlienRenderClone } from './alienRenderAsset';
import { applyTeamAccent } from './teamAccent';
import {
  applyFloatArmTilt,
  applyArmRecoil,
  RECOIL_DURATION,
  getDefaultRotation,
  getFloatLimbRotation,
  getFloatLimbTuningState,
  resetFloatLimbRotation,
  setFloatLimbRotation,
  type DebugTuningTarget,
  type FloatArmTuningState,
  type FloatLimbTuningTarget,
} from './playerAimPose';
import { ThirdPersonGun, type ThirdPersonGunTuningState } from './playerThirdPersonGun';

const GRAB_ROTATION_SMOOTHING = 0.0008;
const FLOAT_ARM_TUNING_STEP = Math.PI / 180;
const FLOAT_ARM_FINE_TUNING_STEP = Math.PI / 900;
const BREACH_ENTRY_CARRY_TIME = 0.55;
const BREACH_ENTRY_CARRY_DAMPING_PER_60HZ = 0.9;
const ZERO_CARRY = new THREE.Vector3();

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
    leftLeg: false,
    rightLeg: false,
  };

  public launchPower = 0;
  public grabbedBarPos: THREE.Vector3 | null = null;
  public currentBreachTeam: 0 | 1 = 0;

  private respawnTimer = 0;
  private onGround = false;
  private breachJumpAnimationActive = false;
  private breachEntryCarry = new THREE.Vector3();
  private breachEntryCarryTimer = 0;

  private mesh: THREE.Group;
  private bodyRoot: THREE.Group | null = null;
  private helmetRoot: THREE.Group | null = null;
  private leftHandGripLocal = DEFAULT_LEFT_HAND_GRIP_LOCAL.clone();
  private grabHandGripLocal: THREE.Vector3 | null = null;
  private grabPoseLocked = false;
  private worldModelVisible = false;

  private animation = new PlayerAnimationController();
  private damageGlow = new PlayerDamageGlow(this.team);
  private gun = new ThirdPersonGun();
  private visualQuaternion = new THREE.Quaternion();
  // Tracks the previous frame's animation name so we can detect transitions.
  private lastKnownAnimation = ANIM_IDLE_HOLD;
  // Counts down after leaving ANIM_JUMP to cover the crossfade window.
  private armRestoreTimer = 0;
  // Counts down from RECOIL_DURATION to 0 after each shot.
  private recoilTimer = 0;
  // Counts up while phase === 'FROZEN'; after the crossfade window we stop
  // ticking mixers so the death pose holds instead of looping flails.
  private frozenHoldTimer = 0;
  private floatLimbTuningEnabled = false;

  public constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    void loadAlienRenderClone({ team: this.team, variant: 'player' })
      .then(({ body, bodyAnimations, helmet, helmetAnimations }) => {
        const gripLocal = measureLeftHandGripOffset(body);
        if (gripLocal) this.leftHandGripLocal.copy(gripLocal);

        this.bodyRoot = body;
        this.helmetRoot = helmet;

        this.animation.registerRig(body, bodyAnimations);
        this.damageGlow.attachTo(body);
        this.gun.attachTo(body);
        this.mesh.add(body);

        this.animation.registerRig(helmet, helmetAnimations);
        this.mesh.add(helmet);
        this.applyTeamVisuals();
        this.updateWorldModelVisibility();
      })
      .catch((err: unknown) => {
        console.error('[LocalPlayer] failed to load alien render assets', err);
      });

    scene.add(this.mesh);
  }

  public canGrabBar(): boolean {
    return !this.damage.frozen && !this.damage.leftArm;
  }

  public canFire(): boolean {
    return !this.damage.frozen && !this.damage.rightArm;
  }

  /** Call from gameApp immediately after a shot fires to start the recoil animation. */
  public triggerArmRecoil(): void {
    this.recoilTimer = RECOIL_DURATION;
  }

  public maxLaunchPower(): number {
    const legsHit = (this.damage.leftLeg ? 1 : 0) + (this.damage.rightLeg ? 1 : 0);
    if (legsHit === 2) return MAX_LAUNCH_SPEED * BOTH_LEGS_HIT_LAUNCH_FACTOR;
    if (legsHit === 1) return MAX_LAUNCH_SPEED * ONE_LEG_HIT_LAUNCH_FACTOR;
    return MAX_LAUNCH_SPEED;
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
        this.updateGrabbing(input);
        break;
      case 'AIMING':
        this.updateAiming(input, cam);
        break;
      case 'RESPAWNING':
        this.updateRespawning(arena, dt);
        break;
    }
    this.updateAnimation(input, cam, dt);
    this.damageGlow.update(this.damage, this.phase, dt);
    const visualQuat = this.computeVisualQuaternion(cam, dt);
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
      this.lockGripToBar(visualQuat);
    }
    this.mesh.position.copy(this.phys.pos);
    this.mesh.quaternion.copy(visualQuat);
    this.updateWorldModelVisibility();
  }

  private updateFrozen(arena: Arena, dt: number): void {
    this.breachJumpAnimationActive = false;
    // Frozen bodies bounce off every arena wall — fully-frozen players cannot
    // breach. Limb-damaged (but not frozen) allies unfreeze their limbs by
    // drifting home via the FLOATING branch of updateFloating.
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

    const floorY = breachRoomFloorY(center.y);
    const wasOnGround = this.phys.pos.y <= floorY + 0.08;
    const jumpStarted = input.isJumping() && wasOnGround;
    this.onGround = wasOnGround;

    integrateBreachRoom(
      this.phys,
      input.getWalkAxes(),
      cam.getYawForward(),
      cam.getYawRight(),
      input.isJumping(),
      this.onGround,
      this.breachEntryCarryTimer > 0 ? this.breachEntryCarry : ZERO_CARRY,
      dt,
    );

    clampBreachRoom(this.phys, center, openAxis, openSign, arena.isGoalDoorOpen(this.currentBreachTeam));
    this.onGround = this.phys.pos.y <= floorY + 0.02;
    if (this.onGround) {
      this.breachEntryCarry.set(0, 0, 0);
      this.breachEntryCarryTimer = 0;
    } else if (this.breachEntryCarryTimer > 0) {
      this.breachEntryCarryTimer = Math.max(0, this.breachEntryCarryTimer - dt);
      const damp = Math.pow(BREACH_ENTRY_CARRY_DAMPING_PER_60HZ, dt * 60);
      this.breachEntryCarry.multiplyScalar(damp);
      this.breachEntryCarry.y = 0;
    }

    if (jumpStarted) {
      this.breachJumpAnimationActive = true;
      this.animation.captureJumpRightArmPose();
    } else if (this.onGround || this.phys.vel.y <= 0) {
      this.breachJumpAnimationActive = false;
    }

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
    this.breachJumpAnimationActive = false;
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

    const breachTeam = this.getEnteredBreachTeam(arena);
    if (breachTeam !== null) {
      this.enterBreachRoom(breachTeam);
      return;
    }

    const grabInput = input.consumeGrab();
    const nearBar = arena.getNearestBar(this.phys.pos, GRAB_RADIUS);
    if (nearBar && grabInput && this.canGrabBar()) {
      this.grabBar(nearBar, cam);
    }
  }

  private updateGrabbing(input: InputManager): void {
    this.breachJumpAnimationActive = false;
    if (!this.grabbedBarPos) {
      this.phase = 'FLOATING';
      return;
    }

    this.phys.vel.set(0, 0, 0);

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

  private updateAiming(input: InputManager, cam: CameraController): void {
    this.breachJumpAnimationActive = false;
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
    this.breachJumpAnimationActive = false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 0;
      this.currentBreachTeam = this.team;
      const center = arena.getBreachRoomCenter(this.team);
      const openAxis = arena.getBreachOpenAxis(this.team);
      const openSign = arena.getBreachOpenSign(this.team);
      const spawn = computeBreachSpawnPosition(center, openAxis, openSign);
      this.phys.pos.set(spawn.x, spawn.y, spawn.z);
      this.phys.vel.set(0, 0, 0);
      this.phase = 'BREACH';
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
    this.phys.pos.addScaledVector(fwd, PLAYER_RADIUS + 0.8);
    this.phys.vel.copy(fwd).multiplyScalar(this.launchPower);
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabHandGripLocal = null;
    this.grabPoseLocked = false;
    this.phase = 'FLOATING';
  }

  private tryReturnToOwnBreach(arena: Arena): void {
    const breachTeam = this.getEnteredBreachTeam(arena);
    if (breachTeam === null) return;
    this.enterBreachRoom(breachTeam);
  }

  private getEnteredBreachTeam(arena: Arena): 0 | 1 | null {
    if (arena.isInBreachRoom(this.phys.pos, 0)) return 0;
    if (arena.isInBreachRoom(this.phys.pos, 1)) return 1;
    return null;
  }

  private enterBreachRoom(team: 0 | 1): void {
    // Fully-frozen players cannot reach here — FROZEN drift bounces off
    // every wall, so damage.frozen stays untouched. Allies who are still
    // FLOATING but wounded can drift home to heal their limb damage.
    this.currentBreachTeam = team;
    this.phase = 'BREACH';
    this.damage.leftArm = false;
    this.damage.rightArm = false;
    this.damage.leftLeg = false;
    this.damage.rightLeg = false;
    this.breachEntryCarry.copy(this.phys.vel);
    this.breachEntryCarry.y = 0;
    this.breachEntryCarryTimer = BREACH_ENTRY_CARRY_TIME;
  }

  private updateAnimation(input: InputManager, cam: CameraController, dt: number): void {
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
      this.animation.resetBreathing();
      if (!this.grabPoseLocked) {
        this.lockGrabPose();
      }
      // Clear transient timers so stale state doesn't bleed into post-grab transitions.
      this.armRestoreTimer = 0;
      this.lastKnownAnimation = ANIM_IDLE_HOLD;
      return;
    }

    this.grabPoseLocked = false;
    const prevAnimation = this.lastKnownAnimation;
    const nextAnimation = this.selectAnimation(input);

    this.animation.setTargetAnimation(nextAnimation);

    // Freeze the rig while the player is frozen: let the ANIM_DEATH crossfade
    // complete, then tick mixers with dt=0 so the death clip doesn't loop and
    // the alien holds the death pose.
    if (this.phase === 'FROZEN') {
      this.frozenHoldTimer += dt;
    } else {
      this.frozenHoldTimer = 0;
    }
    const holdFrozenPose = this.phase === 'FROZEN' && this.frozenHoldTimer > ANIM_FADE_SECONDS;
    const animationDt = holdFrozenPose
      ? 0
      : nextAnimation === ANIM_JUMP
        ? dt * BREACH_JUMP_TAKEOFF_SPEED
        : dt;
    this.animation.tickMixers(animationDt);

    // After leaving the jump clip, keep restoring for one crossfade window so
    // the jump clip's last-frame arm pose doesn't bleed through.
    if (prevAnimation === ANIM_JUMP && nextAnimation !== ANIM_JUMP) {
      this.armRestoreTimer = ANIM_FADE_SECONDS;
    }
    this.armRestoreTimer = Math.max(0, this.armRestoreTimer - dt);

    if (nextAnimation === ANIM_FLOAT) {
      this.animation.restoreFloatRightArmPose();
    } else if (nextAnimation === ANIM_JUMP || this.armRestoreTimer > 0) {
      this.animation.restoreJumpRightArmPose();
    }

    // Float: tilt the pistol arm upward after locking it to the base pose.
    if (nextAnimation === ANIM_FLOAT) {
      applyFloatArmTilt(this.animation.getRigs());
    }

    // Recoil: brief upward kick on every shot, applied on top of everything else.
    this.recoilTimer = Math.max(0, this.recoilTimer - dt);
    if (this.recoilTimer > 0) {
      applyArmRecoil(this.animation.getRigs(), this.recoilTimer / RECOIL_DURATION);
    }

    this.lastKnownAnimation = nextAnimation;

    if (this.isBreachIdle(input)) {
      this.animation.tickBreathing(dt);
    } else {
      this.animation.resetBreathing();
    }
  }

  private selectAnimation(input: InputManager): string {
    if (this.phase === 'FROZEN') return ANIM_DEATH;
    if (this.phase === 'FLOATING') return ANIM_FLOAT;
    if (this.phase === 'RESPAWNING') return ANIM_STANDING;
    if (this.phase === 'GRABBING' || this.phase === 'AIMING') return ANIM_STANDING;

    if (this.phase === 'BREACH') {
      if (this.breachJumpAnimationActive) return ANIM_JUMP;
      const walk = input.getWalkAxes();
      if (this.onGround && (walk.x !== 0 || walk.z !== 0)) return ANIM_RUN_HOLD;
    }

    return ANIM_IDLE_HOLD;
  }

  private isBreachIdle(input: InputManager): boolean {
    if (this.phase !== 'BREACH' || !this.onGround) return false;
    const walk = input.getWalkAxes();
    return walk.x === 0 && walk.z === 0 && !input.isJumping();
  }

  private lockGrabPose(): void {
    this.animation.snapToAnimation(ANIM_STANDING);
    applyBarHoldPose(this.animation.getRigs());
    const bodyRoot = this.animation.getRigs()[0]?.root ?? null;
    this.grabHandGripLocal = measureLeftHandGripOffset(bodyRoot);
    this.grabPoseLocked = true;
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
    if (!this.grabbedBarPos) return;
    const gripLocal = this.grabHandGripLocal ?? this.leftHandGripLocal;
    const handOffset = gripLocal.clone().applyQuaternion(visualQuat);
    this.phys.pos.copy(this.grabbedBarPos).sub(handOffset);
  }

  public applyHit(zone: HitZone, impulse: THREE.Vector3): boolean {
    this.phys.vel.add(impulse);

    switch (zone) {
      case 'head':
      case 'body':
        return this.promoteToFullFreeze();
      case 'rightArm':
        this.damage.rightArm = true;
        if (this.allLimbsDamaged()) return this.promoteToFullFreeze();
        return false;
      case 'leftArm':
        this.damage.leftArm = true;
        if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
          this.phase = 'FLOATING';
          this.grabbedBarPos = null;
          this.grabHandGripLocal = null;
          this.grabPoseLocked = false;
        }
        if (this.allLimbsDamaged()) return this.promoteToFullFreeze();
        return false;
      case 'leftLeg':
        this.damage.leftLeg = true;
        this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());
        if (this.allLimbsDamaged()) return this.promoteToFullFreeze();
        return false;
      case 'rightLeg':
        this.damage.rightLeg = true;
        this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());
        if (this.allLimbsDamaged()) return this.promoteToFullFreeze();
        return false;
    }
  }

  private allLimbsDamaged(): boolean {
    return this.damage.leftArm && this.damage.rightArm && this.damage.leftLeg && this.damage.rightLeg;
  }

  private promoteToFullFreeze(): true {
    if (!this.damage.frozen) {
      this.damage.frozen = true;
      this.deaths++;
    }
    this.phase = 'FROZEN';
    this.grabbedBarPos = null;
    this.grabHandGripLocal = null;
    this.grabPoseLocked = false;
    return true;
  }

  public static classifyHitZone(
    impactPoint: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerFacing: THREE.Vector3,
    hitOffsetY = 0,
    hitRadius?: number,
  ): HitZone {
    return classifyHitZone(impactPoint, playerPos, playerFacing, hitOffsetY, hitRadius);
  }

  public resetForNewRound(arena: Arena, spawnOverride?: { x: number; y: number; z: number }): void {
    this.damage = {
      frozen: false,
      rightArm: false,
      leftArm: false,
      leftLeg: false,
      rightLeg: false,
    };
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabHandGripLocal = null;
    this.grabPoseLocked = false;
    this.breachJumpAnimationActive = false;
    this.breachEntryCarry.set(0, 0, 0);
    this.breachEntryCarryTimer = 0;
    this.currentBreachTeam = this.team;
    this.phys.vel.set(0, 0, 0);

    const spawn = spawnOverride ?? (() => {
      const center = arena.getBreachRoomCenter(this.team);
      const openAxis = arena.getBreachOpenAxis(this.team);
      const openSign = arena.getBreachOpenSign(this.team);
      return computeBreachSpawnPosition(center, openAxis, openSign);
    })();
    this.phys.pos.set(spawn.x, spawn.y, spawn.z);
    this.phase = 'BREACH';
  }

  public getPosition(): THREE.Vector3 {
    return this.phys.pos;
  }

  public getMesh(): THREE.Group {
    return this.mesh;
  }

  public setTeam(team: 0 | 1): void {
    this.team = team;
    this.damageGlow.setTeam(team);
    this.applyTeamVisuals();
  }

  public setWorldModelVisible(visible: boolean): void {
    this.worldModelVisible = visible;
    this.updateWorldModelVisibility();
  }

  public setThirdPersonGunVisible(visible: boolean): void {
    this.gun.setVisible(visible);
  }

  public setThirdPersonGunFrozenTint(color: number | null): void {
    this.gun.setFrozenTint(color);
  }

  public getThirdPersonGunMuzzleWorldPosition(): THREE.Vector3 | null {
    return this.gun.getMuzzleWorldPosition();
  }

  public toggleThirdPersonGunTuning(): boolean {
    return this.gun.toggleTuning();
  }

  public isThirdPersonGunTuningEnabled(): boolean {
    return this.gun.isTuningEnabled();
  }

  public nudgeThirdPersonGun(
    positionAxes: { x: number; y: number; z: number },
    rotationAxes: { x: number; y: number; z: number },
    fine: boolean,
  ): boolean {
    return this.gun.nudge(positionAxes, rotationAxes, fine);
  }

  public resetThirdPersonGunTuning(): void {
    this.gun.resetTuning();
  }

  public logThirdPersonGunTuning(): string {
    return this.gun.logTuning();
  }

  public getThirdPersonGunTuningState(): ThirdPersonGunTuningState {
    return this.gun.getTuningState();
  }

  public toggleFloatArmTuning(): boolean {
    this.floatLimbTuningEnabled = !this.floatLimbTuningEnabled;
    console.info(
      `[FloatLimbTuning] tuning ${this.floatLimbTuningEnabled ? 'enabled' : 'disabled'}.`,
    );
    return this.floatLimbTuningEnabled;
  }

  public isFloatLimbTuningEnabled(): boolean {
    return this.floatLimbTuningEnabled;
  }

  public nudgeFloatLimbRotation(
    target: FloatLimbTuningTarget,
    rotationAxes: { x: number; y: number; z: number },
    fine: boolean,
  ): boolean {
    const hasRot = rotationAxes.x !== 0 || rotationAxes.y !== 0 || rotationAxes.z !== 0;
    if (!hasRot) return false;

    const step = fine ? FLOAT_ARM_FINE_TUNING_STEP : FLOAT_ARM_TUNING_STEP;
    const rotation = getFloatLimbRotation(target);
    rotation.x += rotationAxes.x * step;
    rotation.y += rotationAxes.y * step;
    rotation.z += rotationAxes.z * step;
    setFloatLimbRotation(target, rotation);
    return true;
  }

  public resetFloatLimbTuning(target: FloatLimbTuningTarget): void {
    resetFloatLimbRotation(target);
    console.info(`[${target}] rotation reset to default.`);
    this.logFloatLimbTuning(target);
  }

  public logFloatLimbTuning(target: FloatLimbTuningTarget): string {
    const rotation = getFloatLimbRotation(target);
    const degX = (rotation.x * 180) / Math.PI;
    const degY = (rotation.y * 180) / Math.PI;
    const degZ = (rotation.z * 180) / Math.PI;
    const defaults = getDefaultRotation(target);
    const line = `[${target}] ROTATION = new THREE.Euler(${rotation.x.toFixed(4)}, ${rotation.y.toFixed(4)}, ${rotation.z.toFixed(4)}); degrees (${degX.toFixed(1)}, ${degY.toFixed(1)}, ${degZ.toFixed(1)}); default (${defaults.x.toFixed(4)}, ${defaults.y.toFixed(4)}, ${defaults.z.toFixed(4)}).`;
    console.info(line);
    return line;
  }

  public getFloatLimbTuningState(target: FloatLimbTuningTarget): FloatArmTuningState {
    return getFloatLimbTuningState(target);
  }

  public isFloatLimbTarget(target: DebugTuningTarget): target is FloatLimbTuningTarget {
    return target === 'FloatRightArm'
      || target === 'FloatRightPalm'
      || target === 'LeftArmHanging';
  }

  public getScore(): number {
    return this.kills;
  }

  public getFrozenTimer(): number {
    return 0;
  }

  private applyTeamVisuals(): void {
    if (this.bodyRoot) {
      applyTeamAccent(this.bodyRoot, this.team, 'player');
    }
    if (this.helmetRoot) {
      applyTeamAccent(this.helmetRoot, this.team, 'player');
    }
  }

  private updateWorldModelVisibility(): void {
    this.mesh.visible = this.worldModelVisible && this.phase !== 'RESPAWNING';
  }
}

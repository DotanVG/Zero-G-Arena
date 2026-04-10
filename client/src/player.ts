import * as THREE from 'three';
import {
  MAX_LAUNCH_SPEED,
  LEGS_1_LAUNCH_FACTOR,
  LEGS_2_LAUNCH_FACTOR,
  LAUNCH_CHARGE_TIME,
  GRAB_RADIUS,
  PLAYER_RADIUS,
  BREACH_ROOM_H,
} from '../../shared/constants';
import { clamp } from './util/math';
import { type DamageState, type PlayerPhase, type PlayerNetState, type ClientInputMsg } from '../../shared/schema';
import {
  type HitZone,
  type BarGrabPoint,
  classifyHitZone as sharedClassifyHitZone,
  spawnPosition as sharedSpawnPosition,
} from '../../shared/player-logic';
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

export type { HitZone };

let inputSeq = 0;

export class LocalPlayer {
  public phys: PhysicsState = {
    pos: new THREE.Vector3(0, 0, -15),
    vel: new THREE.Vector3(),
  };

  public phase: PlayerPhase = 'BREACH';
  public team: 0 | 1 = 0;
  public kills = 0;
  public deaths = 0;
  public id = 'local';

  public damage: DamageState = {
    frozen:   false,
    rightArm: false,
    leftArm:  false,
    legs:     0,
  };

  public launchPower = 0;
  public grabbedBarPos: THREE.Vector3 | null = null;
  public grabbedBarNormal: THREE.Vector3 | null = null;
  public currentBreachTeam: 0 | 1 = 0;
  private serverAuthoritative = false;

  private respawnTimer = 0;
  private onGround = false;

  private mesh: THREE.Mesh;
  private arrowLine: THREE.Line | null = null;
  private arrowPositions: Float32Array | null = null;
  private readonly scene: THREE.Scene;

  // Smooth reconciliation
  private _targetPos: THREE.Vector3 | null = null;
  private _snapFrames = 0;

  // Input tracking for network serialization (set during update, read by serializeLastInput)
  private _netGrab  = false;
  private _netAimDy = 0;

  public onRoundWin: ((team: 0 | 1) => void) | null = null;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(PLAYER_RADIUS, 12, 8),
      makePlayerMaterial(0),
    );
    this.mesh.visible = false;  // FPS — no self-model
    scene.add(this.mesh);
  }

  public canGrabBar(): boolean {
    return !this.damage.frozen && !this.damage.leftArm;
  }

  public canFire(): boolean {
    return !this.damage.frozen && !this.damage.rightArm;
  }

  public maxLaunchPower(): number {
    if (this.damage.legs >= 2) return MAX_LAUNCH_SPEED * LEGS_2_LAUNCH_FACTOR;
    if (this.damage.legs === 1) return MAX_LAUNCH_SPEED * LEGS_1_LAUNCH_FACTOR;
    return MAX_LAUNCH_SPEED;
  }

  // ── Multiplayer: serialize inputs used this frame (call AFTER update()) ──

  /**
   * Build the ClientInputMsg from the inputs actually consumed during this frame's update().
   * Must be called AFTER update() so netGrab/netAimDy are populated.
   */
  public serializeLastInput(input: InputManager, cam: CameraController, fireCharge: number | null): ClientInputMsg {
    const msg: ClientInputMsg = {
      t:           'input',
      id:          this.id,
      seq:         ++inputSeq,
      walkAxes:    input.getWalkAxes(),
      grab:        this._netGrab,
      aiming:      input.isAiming(),
      aimDy:       this._netAimDy,
      launchPower: this.launchPower,
      fire:        fireCharge !== null,
      fireCharge:  fireCharge ?? undefined,
      jumping:     input.isJumping(),
      rot:         { yaw: cam.getYaw(), pitch: cam.getPitch() },
      lookDir:     (() => {
        const forward = cam.getForward();
        return { x: forward.x, y: forward.y, z: forward.z };
      })(),
      phase:       this.phase,
    };
    // Reset per-frame trackers
    this._netGrab  = false;
    this._netAimDy = 0;
    return msg;
  }

  /** Apply server-authoritative state (smooth reconciliation via lerp). */
  public applyServerState(state: PlayerNetState): void {
    // Update non-physics state directly
    this.id      = state.id;
    this.team    = state.team;
    this.phase   = state.phase;
    if (state.phase === 'BREACH' || state.phase === 'RESPAWNING') {
      this.currentBreachTeam = state.team;
      this.grabbedBarPos = null;
      this.grabbedBarNormal = null;
    }
    this.damage  = { ...state.damage };
    this.kills   = state.kills;
    this.deaths  = state.deaths;
    this.phys.vel.set(state.vel.x, state.vel.y, state.vel.z);

    // Smoothly snap position to server (lerp over 3 frames to avoid pop)
    const serverPos = new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z);
    const diff = serverPos.distanceTo(this.phys.pos);
    if (diff > 3.0) {
      // Large discrepancy — snap immediately
      this.phys.pos.copy(serverPos);
    } else if (diff > 0.05) {
      // Small discrepancy — lerp
      this._targetPos = serverPos;
      this._snapFrames = 3;
    }
    // else: close enough, keep local prediction
  }

  // ── Main update ───────────────────────────────────────────────────────────

  public setIdentity(id: string, team: 0 | 1): void {
    this.id = id;
    this.team = team;
    this.currentBreachTeam = team;
  }

  public setServerAuthoritative(active: boolean): void {
    this.serverAuthoritative = active;
  }

  public update(
    input: InputManager,
    cam: CameraController,
    arena: Arena,
    dt: number,
  ): void {
    switch (this.phase) {
      case 'FROZEN':     this.updateFrozen(arena, dt);             break;
      case 'BREACH':     this.updateBreach(input, cam, arena, dt); break;
      case 'FLOATING':   this.updateFloating(input, cam, arena, dt); break;
      case 'GRABBING':   this.updateGrabbing(input, cam, dt);      break;
      case 'AIMING':     this.updateAiming(input, cam, arena, dt); break;
      case 'RESPAWNING': this.updateRespawning(arena, dt);         break;
    }

    // Smooth reconciliation lerp
    if (this._targetPos && this._snapFrames > 0) {
      this.phys.pos.lerp(this._targetPos, 1 / this._snapFrames);
      this._snapFrames--;
      if (this._snapFrames === 0) this._targetPos = null;
    }

    this.mesh.position.copy(this.phys.pos);
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

    const nearBar = arena.getNearestBar(this.phys.pos, GRAB_RADIUS);
    if (nearBar && input.consumeGrab() && this.canGrabBar()) {
      this.grabBar(nearBar);
      return;
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

    if (arena.isInBreachRoom(this.phys.pos, this.team)) {
      this.currentBreachTeam = this.team;
      this.phase = 'BREACH';
      this.phys.vel.y = 0;
      return;
    }

    const enemyTeam = (1 - this.team) as 0 | 1;
    if (!this.damage.frozen
      && arena.isGoalDoorOpen(enemyTeam)
      && arena.isDeepInBreachRoom(this.phys.pos, enemyTeam, 1.0)) {
      this.currentBreachTeam = enemyTeam;
      this.phase = 'BREACH';
      this.phys.vel.y = 0;
      if (!this.serverAuthoritative) {
        this.kills++;
        this.onRoundWin?.(this.team);
      }
      return;
    }

    const nearBar = arena.getNearestBar(this.phys.pos, GRAB_RADIUS);
    if (nearBar && input.consumeGrab() && this.canGrabBar()) {
      this.grabBar(nearBar);
    }
  }

  private updateGrabbing(
    input: InputManager,
    _cam: CameraController,
    dt: number,
  ): void {
    if (!this.grabbedBarPos) { this.phase = 'FLOATING'; return; }
    this.phys.pos.lerp(this.grabbedBarPos, 1 - Math.pow(0.002, dt));
    this.phys.vel.set(0, 0, 0);

    if (input.consumeGrab()) {
      this.phase = 'FLOATING';
      this.grabbedBarPos = null;
      this.grabbedBarNormal = null;
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
    arena: Arena,
    dt: number,
  ): void {
    void arena;
    if (!this.grabbedBarPos) { this.phase = 'FLOATING'; return; }
    this.phys.pos.lerp(this.grabbedBarPos, 1 - Math.pow(0.002, dt));
    this.phys.vel.set(0, 0, 0);

    // Auto-charge launch power over time (holds Space = fills in LAUNCH_CHARGE_TIME seconds)
    this.launchPower += (this.maxLaunchPower() / LAUNCH_CHARGE_TIME) * dt;
    this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());
    // Accumulate aim delta for server sync (legacy mouse-Y path still supported)
    const { dy } = input.consumeAimDelta();
    this._netAimDy += dy;

    this.updateArrow(cam.getForward());

    if (!input.isAiming()) {
      this.launch(cam);
    }
  }

  private updateRespawning(arena: Arena, dt: number): void {
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 0;
      this.currentBreachTeam = this.team;
      const spawnPos = sharedSpawnPosition(this.team, arena);
      this.phys.pos.set(spawnPos.x, spawnPos.y, spawnPos.z);
      this.phys.vel.set(0, 0, 0);
      this.phase = 'BREACH';
    }
  }

  private grabBar(bar: BarGrabPoint): void {
    this.grabbedBarPos = new THREE.Vector3(bar.pos.x, bar.pos.y, bar.pos.z);
    this.grabbedBarNormal = new THREE.Vector3(bar.normal.x, bar.normal.y, bar.normal.z).normalize();
    this.phys.vel.set(0, 0, 0);
    this.phase = 'GRABBING';
    this._netGrab = true;   // record for server serialization
    this.hideArrow();
  }

  private launch(cam: CameraController): void {
    const fwd = cam.getForward();
    const surfaceNormal = this.grabbedBarNormal?.clone().normalize() ?? new THREE.Vector3();
    if (surfaceNormal.lengthSq() > 0) {
      // Push only along bar surface normal — no forward offset to avoid hitting the obstacle
      this.phys.pos.copy(this.grabbedBarPos ?? this.phys.pos)
        .addScaledVector(surfaceNormal, PLAYER_RADIUS + 1.0);
    } else {
      this.phys.pos.addScaledVector(fwd, PLAYER_RADIUS + 1.0);
    }
    this.phys.vel.copy(fwd).multiplyScalar(this.launchPower);
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabbedBarNormal = null;
    this.phase = 'FLOATING';
    this.hideArrow();
  }

  private ensureArrow(): void {
    if (this.arrowLine) return;
    const POINTS = 20;
    this.arrowPositions = new Float32Array(POINTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.arrowPositions, 3));

    const colors = new Float32Array(POINTS * 3);
    const tipColor = this.team === 0 ? new THREE.Color(0x00ffff) : new THREE.Color(0xff00ff);
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const col = new THREE.Color().lerpColors(new THREE.Color(0xffffff), tipColor, t);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
    this.arrowLine = new THREE.Line(geo, mat);
    this.scene.add(this.arrowLine);
  }

  private updateArrow(forward: THREE.Vector3): void {
    this.ensureArrow();
    const line = this.arrowLine!;
    const positions = this.arrowPositions!;
    const POINTS = 20;
    const maxLen = 18;
    const scale = this.launchPower / (this.maxLaunchPower() || 1);
    for (let i = 0; i < POINTS; i++) {
      const t = (i / (POINTS - 1)) * scale * maxLen;
      const pt = this.phys.pos.clone().addScaledVector(forward, t);
      positions[i * 3] = pt.x; positions[i * 3 + 1] = pt.y; positions[i * 3 + 2] = pt.z;
    }
    (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    line.visible = true;
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Date.now() * 0.005));
    (line.material as THREE.LineBasicMaterial).opacity = pulse;
  }

  private hideArrow(): void {
    if (this.arrowLine) this.arrowLine.visible = false;
  }

  public applyHit(zone: HitZone, impulse: THREE.Vector3): void {
    this.phys.vel.add(impulse);
    switch (zone) {
      case 'head':
      case 'body':
        if (!this.damage.frozen) { this.damage.frozen = true; this.deaths++; }
        this.phase = 'FROZEN';
        this.grabbedBarPos = null;
        this.grabbedBarNormal = null;
        this.hideArrow();
        break;
      case 'rightArm':
        this.damage.rightArm = true;
        break;
      case 'leftArm':
        this.damage.leftArm = true;
        if (this.phase === 'GRABBING' || this.phase === 'AIMING') {
          this.phase = 'FLOATING';
          this.grabbedBarPos = null;
          this.grabbedBarNormal = null;
          this.hideArrow();
        }
        break;
      case 'legs':
        this.damage.legs = Math.min(2, this.damage.legs + 1) as 0 | 1 | 2;
        this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());
        break;
    }
  }

  public static classifyHitZone(
    impactPoint: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerFacing: THREE.Vector3,
  ): HitZone {
    return sharedClassifyHitZone(impactPoint, playerPos, playerFacing);
  }

  public resetForNewRound(arena: Arena): void {
    this.damage = { frozen: false, rightArm: false, leftArm: false, legs: 0 };
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.grabbedBarNormal = null;
    this.currentBreachTeam = this.team;
    this.hideArrow();
    this.phys.vel.set(0, 0, 0);
    this._targetPos = null;
    this._snapFrames = 0;
    this._netGrab = false;
    this._netAimDy = 0;

    const spawnPos = sharedSpawnPosition(this.team, arena);
    this.phys.pos.set(spawnPos.x, spawnPos.y, spawnPos.z);
    this.phase = 'BREACH';
  }

  public getPosition(): THREE.Vector3 { return this.phys.pos; }
  public getMesh(): THREE.Mesh        { return this.mesh; }
  public getScore(): number           { return this.kills; }
  public getFrozenTimer(): number     { return 0; }
}

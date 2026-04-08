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

export type HitZone = 'head' | 'body' | 'rightArm' | 'leftArm' | 'legs';

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

  private mesh: THREE.Mesh;
  private arrowLine: THREE.Line | null = null;
  private arrowPositions: Float32Array | null = null;
  private readonly scene: THREE.Scene;

  public onRoundWin: ((team: 0 | 1) => void) | null = null;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(PLAYER_RADIUS, 12, 8),
      makePlayerMaterial(0),
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
    if (!this.grabbedBarPos) {
      this.phase = 'FLOATING';
      return;
    }

    this.phys.pos.lerp(this.grabbedBarPos, 1 - Math.pow(0.002, dt));
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
    arena: Arena,
    dt: number,
  ): void {
    if (!this.grabbedBarPos) {
      this.phase = 'FLOATING';
      return;
    }

    this.phys.pos.lerp(this.grabbedBarPos, 1 - Math.pow(0.002, dt));
    this.phys.vel.set(0, 0, 0);

    const { dy } = input.consumeAimDelta();
    this.launchPower += dy * LAUNCH_AIM_SENSITIVITY;
    this.launchPower = clamp(this.launchPower, 0, this.maxLaunchPower());

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

  private grabBar(barPos: THREE.Vector3): void {
    this.grabbedBarPos = barPos.clone();
    this.phys.vel.set(0, 0, 0);
    this.phase = 'GRABBING';
    this.hideArrow();
  }

  private launch(cam: CameraController): void {
    const fwd = cam.getForward();
    // Offset player away from bar/obstacle surface before applying velocity
    this.phys.pos.addScaledVector(fwd, PLAYER_RADIUS + 0.8);
    this.phys.vel.copy(fwd).multiplyScalar(this.launchPower);
    this.launchPower = 0;
    this.grabbedBarPos = null;
    this.phase = 'FLOATING';
    this.hideArrow();
  }

  private ensureArrow(): void {
    if (this.arrowLine) {
      return;
    }

    const POINTS = 20;
    this.arrowPositions = new Float32Array(POINTS * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.arrowPositions, 3));

    const colors = new Float32Array(POINTS * 3);
    const tipColor =
      this.team === 0 ? new THREE.Color(0x00ffff) : new THREE.Color(0xff00ff);
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const col = new THREE.Color().lerpColors(
        new THREE.Color(0xffffff),
        tipColor,
        t,
      );
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

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
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    }

    (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    line.visible = true;

    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Date.now() * 0.005));
    (line.material as THREE.LineBasicMaterial).opacity = pulse;
  }

  private hideArrow(): void {
    if (this.arrowLine) {
      this.arrowLine.visible = false;
    }
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
          this.hideArrow();
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
    this.currentBreachTeam = this.team;
    this.hideArrow();
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

  public getMesh(): THREE.Mesh {
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

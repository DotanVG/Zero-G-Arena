import * as THREE from 'three';
import {
  ARENA_SIZE,
  BREACH_ROOM_D,
  BREACH_ROOM_W,
  BREACH_ROOM_H,
} from '../../../shared/constants';
import { type PhysicsState } from '../physics';
import { GoalPlane, type GoalDef } from './goal';
import { BarObject } from './bar';
import { type GeneratedLayout } from './states';
import {
  makeArenaMaterial,
  makeObstacleMaterial,
} from '../render/materials';
import { buildBreachWalls } from './breachWalls';
import { placePortalArenaBars } from './portalBars';
import { isDeepInBreachRoom, isInBreachRoom } from './breachRoomQueries';
import { bounceAgainstBoxes } from './obstacleCollision';
import { PortalEnergyWall } from './portalEnergyWall';

interface BreachRoom {
  team: 0 | 1;
  center: THREE.Vector3;
  openAxis: 'x' | 'y' | 'z';
  openSign: 1 | -1;
  group: THREE.Group;
}

/**
 * Arena: owns the scene-side geometry for the arena cube, its obstacles,
 * goal planes, grab bars, and the two breach rooms. Gameplay queries
 * (isInBreachRoom, getNearestBar, bounceObstacles) live here so the game
 * layer can stay Three.js-agnostic-ish.
 *
 * Non-trivial logic is delegated to sibling modules:
 *   breachWalls         — breach room wall construction
 *   portalBars          — arena-side portal grab bars
 *   breachRoomQueries   — pure inside-room predicates
 *   obstacleCollision   — AABB bounce math
 */
export class Arena {
  private obstaclesGroup = new THREE.Group();
  private goalPlanes: GoalPlane[] = [];
  private barObjects: BarObject[] = [];
  private breachRooms: BreachRoom[] = [];
  private energyWalls: PortalEnergyWall[] = [];
  private currentLayout: GeneratedLayout | null = null;

  public constructor(private scene: THREE.Scene) {
    const cubeGeo = new THREE.BoxGeometry(ARENA_SIZE, ARENA_SIZE, ARENA_SIZE);
    const edges = new THREE.EdgesGeometry(cubeGeo);
    const lineSeg = new THREE.LineSegments(edges, makeArenaMaterial());
    scene.add(lineSeg);
    cubeGeo.dispose();

    scene.add(this.obstaclesGroup);
  }

  public loadLayout(layout: GeneratedLayout): void {
    this.currentLayout = layout;
    this.clearObstacles();
    this.clearGoalPlanes();
    this.clearBreachRooms();

    for (const obs of layout.obstacles) {
      const geo = new THREE.BoxGeometry(obs.size.x, obs.size.y, obs.size.z);
      const mesh = new THREE.Mesh(geo, makeObstacleMaterial());
      mesh.position.set(obs.pos.x, obs.pos.y, obs.pos.z);
      this.obstaclesGroup.add(mesh);

      for (const barDef of obs.bars) {
        const worldPos = new THREE.Vector3(
          obs.pos.x + barDef.localPos.x,
          obs.pos.y + barDef.localPos.y,
          obs.pos.z + barDef.localPos.z,
        );
        this.barObjects.push(new BarObject(this.scene, worldPos, barDef.normal));
      }
    }

    const { goalAxis, goalSigns } = layout;
    const goalDefs: GoalDef[] = [
      { axis: goalAxis, sign: goalSigns.team0, team: 0 },
      { axis: goalAxis, sign: goalSigns.team1, team: 1 },
    ];
    this.goalPlanes = goalDefs.map(def => new GoalPlane(def, this.scene));

    this.buildBreachRooms(goalAxis, goalSigns);
  }

  private buildBreachRooms(
    goalAxis: 'x' | 'y' | 'z',
    goalSigns: { team0: 1 | -1; team1: 1 | -1 },
  ): void {
    for (const team of [0, 1] as const) {
      const sign = team === 0 ? goalSigns.team0 : goalSigns.team1;

      // Room center sits just outside the arena on the goalAxis.
      const center = new THREE.Vector3();
      center[goalAxis] = sign * (ARENA_SIZE / 2 + BREACH_ROOM_D / 2);

      const group = new THREE.Group();
      group.position.copy(center);
      this.scene.add(group);

      // openSign = direction FROM back-wall TOWARD arena (opposite of goal sign).
      const openSign = (-sign) as 1 | -1;
      buildBreachWalls(group, team, goalAxis, openSign);

      this.breachRooms.push({ team, center, openAxis: goalAxis, openSign, group });
      this.energyWalls.push(new PortalEnergyWall(this.scene, goalAxis, sign, team));
    }

    placePortalArenaBars(this.scene, this.barObjects, goalAxis, goalSigns);
  }

  public isInBreachRoom(pos: THREE.Vector3, team: 0 | 1): boolean {
    const room = this.breachRooms[team];
    if (!room) return false;
    return isInBreachRoom(pos, { center: room.center, openAxis: room.openAxis });
  }

  public isDeepInBreachRoom(pos: THREE.Vector3, team: 0 | 1, minDepth: number): boolean {
    const room = this.breachRooms[team];
    if (!room) return false;
    return isDeepInBreachRoom(pos, { center: room.center, openAxis: room.openAxis }, minDepth);
  }

  public getBreachRoomCenter(team: 0 | 1): THREE.Vector3 {
    return this.breachRooms[team]?.center.clone() ?? new THREE.Vector3(0, 0, team === 0 ? -23 : 23);
  }

  public getBreachOpenAxis(team: 0 | 1): 'x' | 'y' | 'z' {
    return this.breachRooms[team]?.openAxis ?? 'z';
  }

  public getBreachOpenSign(team: 0 | 1): 1 | -1 {
    return this.breachRooms[team]?.openSign ?? (team === 0 ? 1 : -1);
  }

  public getNearestBar(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    let nearest: THREE.Vector3 | null = null;
    let best = radius * radius;
    for (const bar of this.barObjects) {
      const grabPoint = bar.getGrabPoint();
      const d2 = pos.distanceToSquared(grabPoint);
      if (d2 < best) {
        best = d2;
        nearest = grabPoint;
      }
    }
    return nearest;
  }

  public getAllBarGrabPoints(): THREE.Vector3[] {
    return this.barObjects.map((bar) => bar.getGrabPoint());
  }

  public bounceObstacles(state: PhysicsState): void {
    const boxes = this.obstaclesGroup.children.map((child) =>
      new THREE.Box3().setFromObject(child as THREE.Mesh),
    );
    bounceAgainstBoxes(state, boxes);
  }

  public getObstacleAABBs(): THREE.Box3[] {
    return this.obstaclesGroup.children.map(c => new THREE.Box3().setFromObject(c as THREE.Mesh));
  }

  /**
   * Thin world-space slabs at each breach room portal opening (BREACH_ROOM_W × BREACH_ROOM_H).
   * Include these alongside obstacle AABBs in projectileSystem.update() so bullets are killed
   * exactly at the portal face and trigger the hit-flash at the energy wall position.
   */
  public getPortalBarrierAABBs(): THREE.Box3[] {
    return this.breachRooms.map((room) => {
      const { openAxis, openSign } = room;
      // The arena face (portal opening) is at sign * ARENA_SIZE/2 where sign = -openSign.
      const sign = (-openSign) as 1 | -1;
      const faceCoord = sign * (ARENA_SIZE / 2);
      const SLAB = 0.15; // half-thickness of the barrier slab
      const hw = BREACH_ROOM_W / 2;
      const hh = BREACH_ROOM_H / 2;
      const perpAxis: 'x' | 'z' = openAxis === 'x' ? 'z' : 'x';

      const min = new THREE.Vector3();
      const max = new THREE.Vector3();

      // Y (height — always world-Y)
      min.y = -hh;
      max.y = hh;

      // Perp axis (width — rooms are centered at perpAxis=0)
      if (perpAxis === 'x') {
        min.x = -hw;  max.x = hw;
      } else {
        min.z = -hw;  max.z = hw;
      }

      // Goal axis (thin slab at portal face)
      if (openAxis === 'x') {
        min.x = faceCoord - SLAB;  max.x = faceCoord + SLAB;
      } else if (openAxis === 'y') {
        min.y = faceCoord - SLAB;  max.y = faceCoord + SLAB;
      } else {
        min.z = faceCoord - SLAB;  max.z = faceCoord + SLAB;
      }

      return new THREE.Box3(min, max);
    });
  }

  /**
   * Find the energy wall whose portal face is nearest `worldPos` and trigger
   * an impact ring + sparkle effect on it. Call this from the game loop whenever
   * a projectile hits a portal barrier AABB.
   */
  public triggerPortalImpact(worldPos: THREE.Vector3, bulletColor: number): void {
    let nearest: typeof this.energyWalls[0] | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.breachRooms.length; i++) {
      const room = this.breachRooms[i];
      const faceSign  = -room.openSign as 1 | -1;
      const faceCoord = faceSign * (ARENA_SIZE / 2);
      const d = room.openAxis === 'x'
        ? Math.abs(worldPos.x - faceCoord)
        : room.openAxis === 'y'
          ? Math.abs(worldPos.y - faceCoord)
          : Math.abs(worldPos.z - faceCoord);
      if (d < bestDist) { bestDist = d; nearest = this.energyWalls[i]; }
    }
    nearest?.spawnImpact(worldPos, bulletColor);
  }

  public getGoalPlanes(): GoalPlane[] {
    return this.goalPlanes;
  }

  public setPortalDoorsOpen(open: boolean): void {
    for (const goal of this.goalPlanes) goal.setDoorOpen(open);
  }

  public isGoalDoorOpen(team: 0 | 1): boolean {
    for (const goal of this.goalPlanes) {
      if (goal.getTeam() === team) return goal.isDoorOpen();
    }
    return false;
  }

  public update(dt: number): void {
    for (const bar of this.barObjects) bar.update(dt);
    for (const goal of this.goalPlanes) goal.update(dt);
    for (const wall of this.energyWalls) wall.update(dt);
  }

  private clearObstacles(): void {
    for (const child of [...this.obstaclesGroup.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.obstaclesGroup.clear();
    for (const bar of this.barObjects) bar.dispose();
    this.barObjects = [];
  }

  private clearGoalPlanes(): void {
    for (const g of this.goalPlanes) g.dispose();
    this.goalPlanes = [];
  }

  private clearBreachRooms(): void {
    for (const room of this.breachRooms) {
      this.scene.remove(room.group);
      for (const child of room.group.children) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    this.breachRooms = [];
    for (const wall of this.energyWalls) wall.dispose();
    this.energyWalls = [];
  }

  public setState(_id: string): void {
    console.warn('setState() is deprecated; use loadLayout() instead');
  }

  public getCurrentStateId(): string {
    return this.currentLayout ? String(this.currentLayout.seed) : 'none';
  }
}

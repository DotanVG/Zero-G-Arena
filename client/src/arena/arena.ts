import * as THREE from 'three';
import {
  ARENA_SIZE,
  PLAYER_RADIUS,
  BREACH_ROOM_W,
  BREACH_ROOM_H,
  BREACH_ROOM_D,
} from '../../../shared/constants';
import { type PhysicsState } from '../physics';
import { GoalPlane, type GoalDef } from './goal';
import { BarObject } from './bar';
import { type GeneratedLayout } from './states';
import {
  makeArenaMaterial,
  makeObstacleMaterial,
  makeBreachRoomMaterial,
  type BreachSurface,
} from '../render/materials';

interface BreachRoom {
  team: 0 | 1;
  center: THREE.Vector3;
  openAxis: 'x' | 'y' | 'z';
  openSign: 1 | -1;
  group: THREE.Group;
}

export class Arena {
  private obstaclesGroup = new THREE.Group();
  private goalPlanes: GoalPlane[] = [];
  private barObjects: BarObject[] = [];
  private breachRooms: BreachRoom[] = [];
  private currentLayout: GeneratedLayout | null = null;

  public constructor(private scene: THREE.Scene) {
    // Wireframe cube
    const cubeGeo = new THREE.BoxGeometry(ARENA_SIZE, ARENA_SIZE, ARENA_SIZE);
    const edges = new THREE.EdgesGeometry(cubeGeo);
    const lineSeg = new THREE.LineSegments(edges, makeArenaMaterial());
    scene.add(lineSeg);
    cubeGeo.dispose();

    scene.add(this.obstaclesGroup);
  }

  // -- Layout loading ----------------------------------------------

  public loadLayout(layout: GeneratedLayout): void {
    this.currentLayout = layout;
    this.clearObstacles();
    this.clearGoalPlanes();
    this.clearBreachRooms();

    // Build obstacles + their bars
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

    // Build goal planes
    const { goalAxis, goalSigns } = layout;
    const goalDefs: GoalDef[] = [
      { axis: goalAxis, sign: goalSigns.team0, team: 0 },
      { axis: goalAxis, sign: goalSigns.team1, team: 1 },
    ];
    this.goalPlanes = goalDefs.map(def => new GoalPlane(def, this.scene));

    // Build breach rooms
    this.buildBreachRooms(goalAxis, goalSigns);
  }

  // -- Breach rooms ------------------------------------------------

  private buildBreachRooms(
    goalAxis: 'x' | 'y' | 'z',
    goalSigns: { team0: 1 | -1; team1: 1 | -1 },
  ): void {
    for (const team of [0, 1] as const) {
      const sign = team === 0 ? goalSigns.team0 : goalSigns.team1;

      // Room center sits just outside the arena on the goalAxis
      const center = new THREE.Vector3();
      center[goalAxis] = sign * (ARENA_SIZE / 2 + BREACH_ROOM_D / 2);

      const group = new THREE.Group();
      group.position.copy(center);
      this.scene.add(group);

      // Build 5 solid walls (skip the portal-facing side)
      // openSign = direction FROM back-wall TOWARD arena (opposite of goal sign)
      const openSign = (-sign) as 1 | -1;

      this.buildBreachWalls(group, team, goalAxis, openSign);

      this.breachRooms.push({ team, center, openAxis: goalAxis, openSign, group });
    }

    // Portal-facing bars on the ARENA SIDE of each goal opening
    this.placePortalArenaBars(goalAxis, goalSigns);
  }

  private buildBreachWalls(
    group: THREE.Group,
    team: 0 | 1,
    openAxis: 'x' | 'y' | 'z',
    openSign: 1 | -1,
  ): void {
    const hw = BREACH_ROOM_W / 2;
    const hh = BREACH_ROOM_H / 2;
    const hd = BREACH_ROOM_D / 2;

    // We build walls in LOCAL space (group is already positioned at center).
    // The open face is on the openAxis / openSign side.
    const addWall = (
      surface: BreachSurface,
      w: number, h: number,
      px: number, py: number, pz: number,
      rx: number, ry: number, rz: number,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        makeBreachRoomMaterial(team, surface),
      );
      mesh.position.set(px, py, pz);
      mesh.rotation.set(rx, ry, rz);
      group.add(mesh);
    };

    if (openAxis === 'z') {
      // Floor/ceiling span X (width) × Z (depth)
      addWall('floor',   BREACH_ROOM_W, BREACH_ROOM_D, 0, -hh, 0, -Math.PI / 2, 0, 0);
      addWall('ceiling', BREACH_ROOM_W, BREACH_ROOM_D, 0,  hh, 0,  Math.PI / 2, 0, 0);
      // Left / right walls (X faces)
      addWall('side', BREACH_ROOM_D, BREACH_ROOM_H, -hw, 0, 0, 0,  Math.PI / 2, 0);
      addWall('side', BREACH_ROOM_D, BREACH_ROOM_H,  hw, 0, 0, 0, -Math.PI / 2, 0);
      // Back wall (away from arena) — brightest glow, the end of the room
      const backZ = openSign * -hd;
      addWall('back', BREACH_ROOM_W, BREACH_ROOM_H, 0, 0, backZ, 0, openSign === 1 ? Math.PI : 0, 0);
    } else if (openAxis === 'x') {
      // Floor/ceiling span X (depth) × Z (width) — dimensions swapped vs z-axis layout
      addWall('floor',   BREACH_ROOM_D, BREACH_ROOM_W, 0, -hh, 0, -Math.PI / 2, 0, 0);
      addWall('ceiling', BREACH_ROOM_D, BREACH_ROOM_W, 0,  hh, 0,  Math.PI / 2, 0, 0);
      addWall('side', BREACH_ROOM_D, BREACH_ROOM_H, 0, 0, -hw, 0, 0,  Math.PI / 2);
      addWall('side', BREACH_ROOM_D, BREACH_ROOM_H, 0, 0,  hw, 0, 0, -Math.PI / 2);
      const backX = openSign * -hd;
      addWall('back', BREACH_ROOM_W, BREACH_ROOM_H, backX, 0, 0, 0, openSign === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
    } else {
      // openAxis === 'y' — side walls face X, floor/ceiling span X×Z
      addWall('floor',   BREACH_ROOM_W, BREACH_ROOM_W, 0, -hh, 0, -Math.PI / 2, 0, 0);
      addWall('ceiling', BREACH_ROOM_W, BREACH_ROOM_W, 0,  hh, 0,  Math.PI / 2, 0, 0);
      addWall('side', BREACH_ROOM_W, BREACH_ROOM_D, -hw, 0, 0, 0,  Math.PI / 2, 0);
      addWall('side', BREACH_ROOM_W, BREACH_ROOM_D,  hw, 0, 0, 0, -Math.PI / 2, 0);
      const backY = openSign * -hd;
      addWall('back', BREACH_ROOM_W, BREACH_ROOM_W, 0, backY, 0, openSign === 1 ? 0 : Math.PI, 0, 0);
    }
  }

  /** One bar on the back wall of the breach room, facing toward the portal. */
  private placeBreachBars(
    center: THREE.Vector3,
    openAxis: 'x' | 'y' | 'z',
    openSign: 1 | -1,
  ): void {
    const hd = BREACH_ROOM_D / 2 - 0.5;
    if (openAxis === 'z') {
      this.barObjects.push(new BarObject(this.scene,
        new THREE.Vector3(center.x, 0, center.z - openSign * hd),
        { x: 0, y: 0, z: openSign as number }));
    } else if (openAxis === 'x') {
      this.barObjects.push(new BarObject(this.scene,
        new THREE.Vector3(center.x - openSign * hd, 0, center.z),
        { x: openSign as number, y: 0, z: 0 }));
    } else {
      this.barObjects.push(new BarObject(this.scene,
        new THREE.Vector3(center.x, center.y - openSign * hd, center.z),
        { x: 0, y: openSign as number, z: 0 }));
    }
  }

  /**
   * Two grab bars on the ARENA SIDE of each portal opening — left and right rim.
   * Players can grab these when floating toward a portal to control their approach.
   */
  private placePortalArenaBars(
    goalAxis: 'x' | 'y' | 'z',
    goalSigns: { team0: 1 | -1; team1: 1 | -1 },
  ): void {
    // Player standing: floor at -3 (center.y=0), grab height ~1.6u above floor = -1.4
    const barY = -BREACH_ROOM_H / 2 + 1.6;

    for (const team of [0, 1] as const) {
      const sign    = team === 0 ? goalSigns.team0 : goalSigns.team1;
      const wallPos = sign * (ARENA_SIZE / 2 - 0.5);  // just inside arena wall

      if (goalAxis === 'z') {
        this.barObjects.push(new BarObject(this.scene,
          new THREE.Vector3(-BREACH_ROOM_W / 2, barY, wallPos),
          { x: 1, y: 0, z: 0 }));
        this.barObjects.push(new BarObject(this.scene,
          new THREE.Vector3(BREACH_ROOM_W / 2, barY, wallPos),
          { x: -1, y: 0, z: 0 }));
      } else if (goalAxis === 'x') {
        this.barObjects.push(new BarObject(this.scene,
          new THREE.Vector3(wallPos, barY, -BREACH_ROOM_W / 2),
          { x: 0, y: 0, z: 1 }));
        this.barObjects.push(new BarObject(this.scene,
          new THREE.Vector3(wallPos, barY, BREACH_ROOM_W / 2),
          { x: 0, y: 0, z: -1 }));
      }
    }
  }

  // -- Public queries ----------------------------------------------

  public isInBreachRoom(pos: THREE.Vector3, team: 0 | 1): boolean {
    const room = this.breachRooms[team];
    if (!room) return false;
    const c   = room.center;
    const ax  = room.openAxis;

    // Y always carries room height
    if (Math.abs(pos.y - c.y) >= BREACH_ROOM_H / 2) return false;
    // openAxis carries room depth
    if (Math.abs(pos[ax] - c[ax]) >= BREACH_ROOM_D / 2) return false;
    // the perpendicular horizontal axis carries room width
    const perpAx = ax === 'x' ? 'z' : 'x';
    if (Math.abs(pos[perpAx] - c[perpAx]) >= BREACH_ROOM_W / 2) return false;

    return true;
  }

  /**
   * Returns true when `pos` is at least `minDepth` units past the open (portal) face
   * of the given team's breach room — used for win detection and gravity activation.
   */
  public isDeepInBreachRoom(pos: THREE.Vector3, team: 0 | 1, minDepth: number): boolean {
    const room = this.breachRooms[team];
    if (!room) return false;
    const c   = room.center;
    const ax  = room.openAxis;

    // Depth along goal axis: must be minDepth units inside the open face
    if (Math.abs(pos[ax] - c[ax]) >= BREACH_ROOM_D / 2 - minDepth) return false;

    // Lateral bounds (correct per axis)
    for (const a of (['x', 'y', 'z'] as const)) {
      if (a === ax) continue;
      const half = a === 'y' ? BREACH_ROOM_H / 2 : BREACH_ROOM_W / 2;
      if (Math.abs(pos[a] - c[a]) >= half) return false;
    }
    return true;
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

  /** AABB obstacle collision with velocity reflection. Called for FLOATING/FROZEN players. */
  public bounceObstacles(state: PhysicsState): void {
    for (const child of this.obstaclesGroup.children) {
      const mesh = child as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(mesh);
      const inflated = {
        min: box.min.clone().subScalar(PLAYER_RADIUS),
        max: box.max.clone().addScalar(PLAYER_RADIUS),
      };

      if (
        state.pos.x < inflated.min.x || state.pos.x > inflated.max.x ||
        state.pos.y < inflated.min.y || state.pos.y > inflated.max.y ||
        state.pos.z < inflated.min.z || state.pos.z > inflated.max.z
      ) continue;

      // Find shallowest penetration axis
      const overlaps = {
        x: Math.min(state.pos.x - inflated.min.x, inflated.max.x - state.pos.x),
        y: Math.min(state.pos.y - inflated.min.y, inflated.max.y - state.pos.y),
        z: Math.min(state.pos.z - inflated.min.z, inflated.max.z - state.pos.z),
      };

      let minAx: 'x' | 'y' | 'z' = 'x';
      if (overlaps.y < overlaps[minAx]) minAx = 'y';
      if (overlaps.z < overlaps[minAx]) minAx = 'z';

      const center = new THREE.Vector3(
        (inflated.min.x + inflated.max.x) / 2,
        (inflated.min.y + inflated.max.y) / 2,
        (inflated.min.z + inflated.max.z) / 2,
      );
      const dir = Math.sign(state.pos[minAx] - center[minAx]);
      state.pos[minAx] += dir * overlaps[minAx];
      state.vel[minAx] *= -0.5;
    }
  }

  public getObstacleAABBs(): THREE.Box3[] {
    return this.obstaclesGroup.children.map(c => new THREE.Box3().setFromObject(c as THREE.Mesh));
  }

  public getGoalPlanes(): GoalPlane[] {
    return this.goalPlanes;
  }

  /** Open or close the portal doors on all goal planes. */
  public setPortalDoorsOpen(open: boolean): void {
    for (const goal of this.goalPlanes) goal.setDoorOpen(open);
  }

  /** Returns true once the door for the given team's goal is at least half open. */
  public isGoalDoorOpen(team: 0 | 1): boolean {
    for (const goal of this.goalPlanes) {
      if (goal.getTeam() === team) return goal.isDoorOpen();
    }
    return false;
  }

  /** Per-frame update: pulse bars + animate portal doors. */
  public update(dt: number): void {
    for (const bar of this.barObjects) bar.update(dt);
    for (const goal of this.goalPlanes) goal.update(dt);
  }

  // -- Cleanup helpers ---------------------------------------------

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
  }

  /** Legacy - kept so old code won't break at compile time if referenced */
  public setState(_id: string): void {
    console.warn('setState() is deprecated; use loadLayout() instead');
  }

  public getCurrentStateId(): string {
    return this.currentLayout ? String(this.currentLayout.seed) : 'none';
  }
}

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
      this.buildBreachWalls(group, team, goalAxis, sign);

      // Place bars on back wall and side walls (2 bars per breach room)
      this.placeBreachBars(center, goalAxis, sign, team);

      this.breachRooms.push({ team, center, openAxis: goalAxis, openSign: sign, group });
    }
  }

  private buildBreachWalls(
    group: THREE.Group,
    team: 0 | 1,
    openAxis: 'x' | 'y' | 'z',
    openSign: 1 | -1,
  ): void {
    const mat = makeBreachRoomMaterial(team);
    const hw = BREACH_ROOM_W / 2;
    const hh = BREACH_ROOM_H / 2;
    const hd = BREACH_ROOM_D / 2;

    // We build walls in LOCAL space (group is already positioned at center).
    // The open face is on the openAxis / openSign side.
    const addWall = (
      w: number, h: number,
      px: number, py: number, pz: number,
      rx: number, ry: number, rz: number,
    ) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.clone());
      mesh.position.set(px, py, pz);
      mesh.rotation.set(rx, ry, rz);
      group.add(mesh);
    };

    // Floor
    addWall(BREACH_ROOM_W, BREACH_ROOM_D, 0, -hh, 0, -Math.PI / 2, 0, 0);
    // Ceiling
    addWall(BREACH_ROOM_W, BREACH_ROOM_D, 0, hh, 0, Math.PI / 2, 0, 0);

    if (openAxis === 'z') {
      // Left / right walls (X faces)
      addWall(BREACH_ROOM_D, BREACH_ROOM_H, -hw, 0, 0, 0, Math.PI / 2, 0);
      addWall(BREACH_ROOM_D, BREACH_ROOM_H, hw, 0, 0, 0, -Math.PI / 2, 0);
      // Back wall (away from arena)
      const backZ = openSign * -hd;
      addWall(BREACH_ROOM_W, BREACH_ROOM_H, 0, 0, backZ, 0, openSign === 1 ? Math.PI : 0, 0);
    } else if (openAxis === 'x') {
      addWall(BREACH_ROOM_D, BREACH_ROOM_H, 0, 0, -hw, 0, 0, Math.PI / 2);
      addWall(BREACH_ROOM_D, BREACH_ROOM_H, 0, 0, hw, 0, 0, -Math.PI / 2);
      const backX = openSign * -hd;
      addWall(BREACH_ROOM_H, BREACH_ROOM_W, backX, 0, 0, 0, openSign === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
    } else {
      // openAxis === 'y'
      addWall(BREACH_ROOM_W, BREACH_ROOM_D, -hw, 0, 0, 0, Math.PI / 2, 0);
      addWall(BREACH_ROOM_W, BREACH_ROOM_D, hw, 0, 0, 0, -Math.PI / 2, 0);
      const backY = openSign * -hd;
      addWall(BREACH_ROOM_W, BREACH_ROOM_D, 0, backY, 0, openSign === 1 ? 0 : Math.PI, 0, 0);
    }
  }

  private placeBreachBars(
    center: THREE.Vector3,
    openAxis: 'x' | 'y' | 'z',
    openSign: 1 | -1,
    team: 0 | 1,
  ): void {
    // Two bars: one on back wall, one on a side wall
    const hw = BREACH_ROOM_W / 2 - 0.5;
    const hh = BREACH_ROOM_H / 2 - 0.5;
    const hd = BREACH_ROOM_D / 2 - 0.5;

    if (openAxis === 'z') {
      // Back wall bar (faces inward = openSign direction)
      const backZ = center.z + openSign * (-hd);
      const backN = { x: 0, y: 0, z: openSign as number };
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(0, 0, backZ), backN));

      // Side wall bar
      const sideX = center.x + hw;
      const sideN = { x: -1, y: 0, z: 0 };
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(sideX, 0, center.z), sideN));
    } else if (openAxis === 'x') {
      const backX = center.x + openSign * (-hd);
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(backX, 0, 0), { x: openSign as number, y: 0, z: 0 }));
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(center.x, 0, hd), { x: 0, y: 0, z: -1 }));
    } else {
      const backY = center.y + openSign * (-hd);
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(0, backY, 0), { x: 0, y: openSign as number, z: 0 }));
      this.barObjects.push(new BarObject(this.scene, new THREE.Vector3(hw, center.y, 0), { x: -1, y: 0, z: 0 }));
    }
  }

  // -- Public queries ----------------------------------------------

  public isInBreachRoom(pos: THREE.Vector3, team: 0 | 1): boolean {
    const room = this.breachRooms[team];
    if (!room) return false;
    const c = room.center;
    return (
      Math.abs(pos.x - c.x) < BREACH_ROOM_W / 2 &&
      Math.abs(pos.y - c.y) < BREACH_ROOM_H / 2 &&
      Math.abs(pos.z - c.z) < BREACH_ROOM_D / 2
    );
  }

  public getBreachRoomCenter(team: 0 | 1): THREE.Vector3 {
    return this.breachRooms[team]?.center.clone() ?? new THREE.Vector3(0, 0, team === 0 ? -23 : 23);
  }

  public getBreachOpenAxis(team: 0 | 1): 'x' | 'y' | 'z' {
    return this.breachRooms[team]?.openAxis ?? 'z';
  }

  public getBreachOpenSign(team: 0 | 1): 1 | -1 {
    return this.breachRooms[team]?.openSign ?? (team === 0 ? -1 : 1);
  }

  public getNearestBar(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    let nearest: THREE.Vector3 | null = null;
    let best = radius * radius;
    for (const bar of this.barObjects) {
      const d2 = pos.distanceToSquared(bar.getWorldPosition());
      if (d2 < best) {
        best = d2;
        nearest = bar.getWorldPosition();
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

  /** Per-frame update: pulse bars. */
  public update(dt: number): void {
    for (const bar of this.barObjects) bar.update(dt);
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

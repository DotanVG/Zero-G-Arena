/**
 * Server-side implementation of SharedArenaQuery.
 * Built from an ArenaLayoutMsg using plain AABB math (no Three.js).
 */
import type { ArenaLayoutMsg, ObstacleNetDef } from '../../shared/schema';
import { type Vec3, v3 } from '../../shared/vec3';
import { type SharedArenaQuery, type BarGrabPoint } from '../../shared/player-logic';
import { bounceObstacleAABB } from '../../shared/physics';
import {
  ARENA_SIZE,
  PLAYER_RADIUS,
  BREACH_ROOM_W,
  BREACH_ROOM_H,
  BREACH_ROOM_D,
  GRAB_RADIUS,
  BAR_LENGTH,
} from '../../shared/constants';

interface ObstacleAABB {
  min: Vec3;
  max: Vec3;
}

interface BarWorld {
  pos: Vec3;
  normal: Vec3;
}

export class ServerArenaQuery implements SharedArenaQuery {
  private layout: ArenaLayoutMsg | null = null;
  private obstacleAABBs: ObstacleAABB[] = [];
  private bars: BarWorld[] = [];
  private breachCenters: [Vec3, Vec3] = [v3.zero(), v3.zero()];
  private goalDoorsOpen: [boolean, boolean] = [false, false];

  public loadLayout(layout: ArenaLayoutMsg): void {
    this.layout = layout;
    this.obstacleAABBs = [];
    this.bars = [];

    for (const obs of layout.obstacles) {
      const hx = obs.size.x / 2, hy = obs.size.y / 2, hz = obs.size.z / 2;
      this.obstacleAABBs.push({
        min: { x: obs.pos.x - hx, y: obs.pos.y - hy, z: obs.pos.z - hz },
        max: { x: obs.pos.x + hx, y: obs.pos.y + hy, z: obs.pos.z + hz },
      });

      // World-space bar positions
      for (const bar of obs.bars) {
        const anchor = {
          x: obs.pos.x + bar.localPos.x,
          y: obs.pos.y + bar.localPos.y,
          z: obs.pos.z + bar.localPos.z,
        };
        const normal = v3.normalize(bar.normal);
        this.bars.push({
          pos: v3.addScaled(anchor, normal, BAR_LENGTH),
          normal,
        });
      }
    }

    // Compute breach room centers from layout goal data
    this.breachCenters = [this._computeBreachCenter(0), this._computeBreachCenter(1)];
    this._addPortalArenaBars(layout.goalAxis, layout.goalSigns);
    this.goalDoorsOpen = [false, false];
  }

  private _computeBreachCenter(team: 0 | 1): Vec3 {
    if (!this.layout) return v3.zero();
    const { goalAxis, goalSigns } = this.layout;
    const sign = team === 0 ? goalSigns.team0 : goalSigns.team1;
    const center = v3.zero();
    center[goalAxis] = sign * (ARENA_SIZE / 2 + BREACH_ROOM_D / 2);
    return center;
  }

  public setDoorsOpen(open: boolean): void {
    this.goalDoorsOpen = [open, open];
  }

  // --- SharedArenaQuery implementation ---

  public getBreachRoomCenter(team: 0 | 1): Vec3 {
    return v3.clone(this.breachCenters[team]);
  }

  public getBreachOpenAxis(team: 0 | 1): 'x' | 'y' | 'z' {
    return this.layout?.goalAxis ?? 'z';
  }

  public getBreachOpenSign(team: 0 | 1): 1 | -1 {
    if (!this.layout) return team === 0 ? 1 : -1;
    const goalSign = team === 0 ? this.layout.goalSigns.team0 : this.layout.goalSigns.team1;
    return (-goalSign) as 1 | -1;
  }

  public isGoalDoorOpen(team: 0 | 1): boolean {
    return this.goalDoorsOpen[team];
  }

  public isInBreachRoom(pos: Vec3, team: 0 | 1): boolean {
    const c = this.breachCenters[team];
    const openAxis = this.getBreachOpenAxis(team);
    const half = this._getBreachHalfExtents(openAxis);
    return (
      Math.abs(pos.x - c.x) < half.x &&
      Math.abs(pos.y - c.y) < half.y &&
      Math.abs(pos.z - c.z) < half.z
    );
  }

  public isDeepInBreachRoom(pos: Vec3, team: 0 | 1, depth: number): boolean {
    if (!this.isInBreachRoom(pos, team)) return false;
    const c = this.breachCenters[team];
    const openAxis = this.getBreachOpenAxis(team);
    const openSign = this.getBreachOpenSign(team);
    const facePos = c[openAxis] + openSign * BREACH_ROOM_D / 2;
    const depthInside = (facePos - pos[openAxis]) * openSign;
    return depthInside >= depth;
  }

  public getNearestBar(pos: Vec3, radius: number): BarGrabPoint | null {
    let best: BarGrabPoint | null = null;
    let bestDist = radius * radius;
    for (const bar of this.bars) {
      const d = v3.distSq(pos, bar.pos);
      if (d < bestDist) {
        bestDist = d;
        best = { pos: bar.pos, normal: bar.normal };
      }
    }
    return best ? { pos: v3.clone(best.pos), normal: v3.clone(best.normal) } : null;
  }

  public bounceObstacles(pos: Vec3, vel: Vec3): void {
    for (const aabb of this.obstacleAABBs) {
      bounceObstacleAABB(pos, vel, aabb.min, aabb.max);
    }
  }

  public getGoalAxis(): 'x' | 'y' | 'z' {
    return this.layout?.goalAxis ?? 'z';
  }

  public getGoalPerpAxis(): 'x' | 'z' {
    const ax = this.getGoalAxis();
    return ax === 'z' ? 'x' : 'z';
  }

  public getPortalFacesOpen(): { positive: boolean; negative: boolean } {
    if (!this.layout) return { positive: false, negative: false };
    const { goalSigns } = this.layout;
    return {
      positive: (goalSigns.team0 === 1 && this.goalDoorsOpen[0]) ||
                (goalSigns.team1 === 1 && this.goalDoorsOpen[1]),
      negative: (goalSigns.team0 === -1 && this.goalDoorsOpen[0]) ||
                (goalSigns.team1 === -1 && this.goalDoorsOpen[1]),
    };
  }

  public getObstacleAABBs(): ObstacleAABB[] {
    return this.obstacleAABBs;
  }

  public hasLayout(): boolean {
    return this.layout !== null;
  }

  private _addPortalArenaBars(
    goalAxis: 'x' | 'y' | 'z',
    goalSigns: { team0: 1 | -1; team1: 1 | -1 },
  ): void {
    const barY = -BREACH_ROOM_H / 2 + 1.6;

    for (const team of [0, 1] as const) {
      const sign = team === 0 ? goalSigns.team0 : goalSigns.team1;
      const wallPos = sign * (ARENA_SIZE / 2 - 0.5);

      if (goalAxis === 'z') {
        this._pushBar({ x: -BREACH_ROOM_W / 2, y: barY, z: wallPos }, { x: 1, y: 0, z: 0 });
        this._pushBar({ x: BREACH_ROOM_W / 2, y: barY, z: wallPos }, { x: -1, y: 0, z: 0 });
      } else if (goalAxis === 'x') {
        this._pushBar({ x: wallPos, y: barY, z: -BREACH_ROOM_W / 2 }, { x: 0, y: 0, z: 1 });
        this._pushBar({ x: wallPos, y: barY, z: BREACH_ROOM_W / 2 }, { x: 0, y: 0, z: -1 });
      }
    }
  }

  private _getBreachHalfExtents(openAxis: 'x' | 'y' | 'z'): Vec3 {
    return {
      x: openAxis === 'x' ? BREACH_ROOM_D / 2 : BREACH_ROOM_W / 2,
      y: openAxis === 'y' ? BREACH_ROOM_D / 2 : BREACH_ROOM_H / 2,
      z: openAxis === 'z' ? BREACH_ROOM_D / 2 : BREACH_ROOM_W / 2,
    };
  }

  private _pushBar(anchor: Vec3, normal: Vec3): void {
    const unitNormal = v3.normalize(normal);
    this.bars.push({
      pos: v3.addScaled(anchor, unitNormal, BAR_LENGTH),
      normal: unitNormal,
    });
  }
}

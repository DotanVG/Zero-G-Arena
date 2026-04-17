import * as THREE from "three";
import type { SharedArenaQuery, BarGrabPoint } from "../../../shared/player-logic";
import type { Vec3 } from "../../../shared/vec3";
import { Arena } from "../arena/arena";

export class ArenaQueryAdapter implements SharedArenaQuery {
  public constructor(private arena: Arena) {}

  public getBreachRoomCenter(team: 0 | 1): Vec3 {
    const center = this.arena.getBreachRoomCenter(team);
    return { x: center.x, y: center.y, z: center.z };
  }

  public getBreachOpenAxis(team: 0 | 1): "x" | "y" | "z" {
    return this.arena.getBreachOpenAxis(team);
  }

  public getBreachOpenSign(team: 0 | 1): 1 | -1 {
    return this.arena.getBreachOpenSign(team);
  }

  public getAllBarGrabPoints(): Vec3[] {
    return this.arena.getAllBarGrabPoints().map((bar) => ({ x: bar.x, y: bar.y, z: bar.z }));
  }

  public isGoalDoorOpen(team: 0 | 1): boolean {
    return this.arena.isGoalDoorOpen(team);
  }

  public isInBreachRoom(pos: Vec3, team: 0 | 1): boolean {
    return this.arena.isInBreachRoom(this.toThree(pos), team);
  }

  public isDeepInBreachRoom(pos: Vec3, team: 0 | 1, depth: number): boolean {
    return this.arena.isDeepInBreachRoom(this.toThree(pos), team, depth);
  }

  public getNearestBar(pos: Vec3, radius: number): BarGrabPoint | null {
    const bar = this.arena.getNearestBar(this.toThree(pos), radius);
    if (!bar) return null;
    return { pos: { x: bar.x, y: bar.y, z: bar.z } };
  }

  private toThree(vec: Vec3) {
    return new THREE.Vector3(vec.x, vec.y, vec.z);
  }
}

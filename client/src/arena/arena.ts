import * as THREE from "three";

import { ARENA_SIZE } from "../../../shared/constants";
import { makeArenaMaterial, makeObstacleMaterial } from "../render/materials";
import { GoalPlane } from "./goal";
import { ARENA_STATES, type ArenaConfig } from "./states";

export class Arena {
  private obstaclesGroup: THREE.Group;
  private goalPlanes: GoalPlane[] = [];
  private currentState: ArenaConfig;

  public constructor(private scene: THREE.Scene) {
    const cube = new THREE.BoxGeometry(ARENA_SIZE, ARENA_SIZE, ARENA_SIZE);
    const edges = new THREE.EdgesGeometry(cube);
    const frame = new THREE.LineSegments(edges, makeArenaMaterial());
    this.scene.add(frame);

    this.obstaclesGroup = new THREE.Group();
    this.scene.add(this.obstaclesGroup);

    this.currentState = ARENA_STATES.A;
    this.setState("A");
  }

  public setState(id: "A" | "B" | "C"): void {
    while (this.obstaclesGroup.children.length > 0) {
      const child = this.obstaclesGroup.children[0] as THREE.Mesh;
      this.obstaclesGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    this.goalPlanes.forEach((goal) => goal.dispose());
    this.goalPlanes = [];

    const config = ARENA_STATES[id];
    this.currentState = config;

    for (const obstacle of config.obstacles) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...obstacle.size),
        makeObstacleMaterial(),
      );
      mesh.position.set(...obstacle.pos);
      this.obstaclesGroup.add(mesh);
    }

    this.goalPlanes = config.goals.map(
      (goalConfig) => new GoalPlane(goalConfig, this.scene),
    );
  }

  public getObstacleAABBs(): Array<{ min: THREE.Vector3; max: THREE.Vector3 }> {
    return this.obstaclesGroup.children.map((child) => {
      const box = new THREE.Box3().setFromObject(child);
      return {
        min: box.min.clone(),
        max: box.max.clone(),
      };
    });
  }

  public getGoalPlanes(): GoalPlane[] {
    return this.goalPlanes;
  }

  public getCurrentStateId(): "A" | "B" | "C" {
    return this.currentState.id;
  }
}

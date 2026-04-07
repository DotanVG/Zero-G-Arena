import * as THREE from "three";

import { ARENA_SIZE } from "../../../shared/constants";
import { makeGoalMaterial } from "../render/materials";
import type { GoalDef } from "./states";

export class GoalPlane {
  private mesh: THREE.Mesh;

  public constructor(
    private config: GoalDef,
    private scene: THREE.Scene,
  ) {
    const geometry = new THREE.PlaneGeometry(20, 20);
    const material = makeGoalMaterial(config.team);

    this.mesh = new THREE.Mesh(geometry, material);

    const halfSize = ARENA_SIZE / 2;
    this.mesh.position[config.axis] = config.sign * halfSize;

    if (config.axis === "x") {
      this.mesh.rotation.y = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else if (config.axis === "y") {
      this.mesh.rotation.x = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.mesh.rotation.y = config.sign === 1 ? Math.PI : 0;
    }

    this.scene.add(this.mesh);
  }

  public checkEntry(playerPos: THREE.Vector3, playerTeam: 0 | 1): boolean {
    if (playerTeam === this.config.team) {
      return false;
    }

    const target = this.config.sign * (ARENA_SIZE / 2);
    if (Math.abs(playerPos[this.config.axis] - target) >= 1.5) {
      return false;
    }

    const otherAxes = (["x", "y", "z"] as const).filter(
      (axis) => axis !== this.config.axis,
    );

    return otherAxes.every((axis) => Math.abs(playerPos[axis]) <= 10);
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

import * as THREE from 'three';
import { ARENA_SIZE } from '../../../shared/constants';
import { makeGoalMaterial } from '../render/materials';

export interface GoalDef {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  team: 0 | 1;
}

export class GoalPlane {
  private mesh: THREE.Mesh;

  public constructor(
    private config: GoalDef,
    private scene: THREE.Scene,
  ) {
    const geo = new THREE.PlaneGeometry(20, 20);
    this.mesh = new THREE.Mesh(geo, makeGoalMaterial(config.team));

    const pos = new THREE.Vector3();
    pos[config.axis] = config.sign * (ARENA_SIZE / 2);
    this.mesh.position.copy(pos);

    // Rotate plane to face inward
    if (config.axis === 'x') {
      this.mesh.rotation.y = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else if (config.axis === 'y') {
      this.mesh.rotation.x = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.mesh.rotation.y = config.sign === 1 ? Math.PI : 0;
    }

    scene.add(this.mesh);
  }

  /**
   * Returns true only when an UNFROZEN player crosses into the enemy portal.
   * Caller is responsible for checking player.damage.frozen before calling this.
   */
  public checkEntry(playerPos: THREE.Vector3, playerTeam: 0 | 1): boolean {
    // Same team = own goal, no score
    if (playerTeam === this.config.team) return false;

    // Primary axis proximity
    const target = this.config.sign * (ARENA_SIZE / 2);
    if (Math.abs(playerPos[this.config.axis] - target) > 1.5) return false;

    // Perpendicular axes within goal face bounds
    const axes = (['x', 'y', 'z'] as const).filter(a => a !== this.config.axis);
    return axes.every(a => Math.abs(playerPos[a]) < 10);
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

import * as THREE from 'three';
import { BAR_RADIUS, BAR_LENGTH } from '../../../shared/constants';
import { makeBarMaterial } from '../render/materials';
import type { BarGrabPoint } from '../../../shared/player-logic';

export class BarObject {
  private mesh: THREE.Mesh;
  private anchorPos: THREE.Vector3;
  private normal: THREE.Vector3;
  private pulseTime = 0;

  public constructor(
    private scene: THREE.Scene,
    worldPos: THREE.Vector3,
    normal: { x: number; y: number; z: number },
  ) {
    this.anchorPos = worldPos.clone();

    const geo = new THREE.CylinderGeometry(BAR_RADIUS, BAR_RADIUS, BAR_LENGTH, 8);
    this.mesh = new THREE.Mesh(geo, makeBarMaterial());

    // Orient cylinder along the surface normal (default cylinder axis is Y)
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    this.normal = n.clone();
    // Avoid degenerate quaternion when normal is exactly Y or -Y
    if (Math.abs(n.dot(up)) < 0.999) {
      this.mesh.quaternion.setFromUnitVectors(up, n);
    } else if (n.y < 0) {
      this.mesh.rotateZ(Math.PI);
    }

    this.mesh.position.copy(this.anchorPos).addScaledVector(this.normal, BAR_LENGTH / 2);
    scene.add(this.mesh);
  }

  public getGrabPoint(): BarGrabPoint {
    return {
      pos: this.anchorPos.clone().addScaledVector(this.normal, BAR_LENGTH),
      normal: this.normal.clone(),
    };
  }

  /** Call once per frame to animate the pulsing emissive glow. */
  public update(dt: number): void {
    this.pulseTime += dt;
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.15 + 0.45 * Math.abs(Math.sin(this.pulseTime * 3.0));
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

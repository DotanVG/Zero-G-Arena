import * as THREE from 'three';
import { ARENA_SIZE } from '../../shared/constants';

const BULLET_SPEED    = 50;      // units/s
const BULLET_LIFETIME = 2.0;     // seconds — max range = 100 units
const BULLET_RADIUS   = 0.07;
const TRAIL_SEGMENTS  = 8;       // points in the tracer tail

export class Projectile {
  private mesh:  THREE.Mesh;
  private trail: THREE.Line;
  private trailPositions: Float32Array;

  private vel: THREE.Vector3;
  private age  = 0;
  public  dead = false;
  private teamColor: number;

  public constructor(
    private scene: THREE.Scene,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    teamColor: number,
  ) {
    this.teamColor = teamColor;
    this.vel = direction.clone().normalize().multiplyScalar(BULLET_SPEED);

    // Core bullet mesh
    const geo = new THREE.SphereGeometry(BULLET_RADIUS, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: teamColor });
    this.mesh  = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);

    // Tracer tail
    this.trailPositions = new Float32Array(TRAIL_SEGMENTS * 3);
    for (let i = 0; i < TRAIL_SEGMENTS * 3; i++) {
      this.trailPositions[i] = origin.getComponent(i % 3);
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: teamColor,
      transparent: true,
      opacity: 0.45,
    });
    this.trail = new THREE.Line(trailGeo, trailMat);
    scene.add(this.trail);
  }

  /** Returns true when the bullet should be removed. */
  public update(dt: number): void {
    if (this.dead) return;
    this.age += dt;
    if (this.age > BULLET_LIFETIME) {
      this.dispose();
      return;
    }

    this.mesh.position.addScaledVector(this.vel, dt);

    // Bounce off solid arena walls, pass through portal openings
    const limit = ARENA_SIZE / 2;
    for (const ax of ['x', 'y', 'z'] as const) {
      const hi = limit;
      const lo = -limit;
      if (this.mesh.position[ax] > hi || this.mesh.position[ax] < lo) {
        // Bounce off wall — die instead of reflecting (cleaner feel)
        this.dispose();
        return;
      }
    }

    // Scroll trail back: shift older segments toward tail, put current pos at head
    for (let i = TRAIL_SEGMENTS - 1; i > 0; i--) {
      this.trailPositions[i * 3]     = this.trailPositions[(i - 1) * 3];
      this.trailPositions[i * 3 + 1] = this.trailPositions[(i - 1) * 3 + 1];
      this.trailPositions[i * 3 + 2] = this.trailPositions[(i - 1) * 3 + 2];
    }
    this.trailPositions[0] = this.mesh.position.x;
    this.trailPositions[1] = this.mesh.position.y;
    this.trailPositions[2] = this.mesh.position.z;
    (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** World position of the bullet this frame. */
  public getPosition(): THREE.Vector3 {
    return this.mesh.position;
  }

  public getTeamColor(): number {
    return this.teamColor;
  }

  public dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.scene.remove(this.trail);
    this.trail.geometry.dispose();
    (this.trail.material as THREE.Material).dispose();
  }
}


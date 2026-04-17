import * as THREE from "three";
import { ARENA_SIZE } from "../../shared/constants";

const BULLET_SPEED = 50;
const BULLET_LIFETIME = 2.0;
const BULLET_RADIUS = 0.07;
const TRAIL_SEGMENTS = 8;

export type ProjectileTrailMode = "full" | "reduced" | "hidden";

const BULLET_GEOMETRY = new THREE.SphereGeometry(BULLET_RADIUS, 6, 4);
const BULLET_MATERIALS = {
  0: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
  1: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
} satisfies Record<0 | 1, THREE.MeshBasicMaterial>;
const TRAIL_MATERIALS = {
  0: new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.45 }),
  1: new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.45 }),
} satisfies Record<0 | 1, THREE.LineBasicMaterial>;

export class Projectile {
  private age = 0;
  public dead = true;
  private mesh: THREE.Mesh;
  private ownerId = "";
  private previousPosition = new THREE.Vector3();
  private team: 0 | 1 = 0;
  private trail: THREE.Line;
  private trailGeometry: THREE.BufferGeometry;
  private trailMode: ProjectileTrailMode = "full";
  private trailPositions = new Float32Array(TRAIL_SEGMENTS * 3);
  private trailTickAccumulator = 0;
  private vel = new THREE.Vector3();

  public constructor(private readonly scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(BULLET_GEOMETRY, BULLET_MATERIALS[0]);
    this.mesh.visible = false;

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Line(this.trailGeometry, TRAIL_MATERIALS[0]);
    this.trail.visible = false;
  }

  public reset(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    team: 0 | 1,
    ownerId: string,
  ): void {
    this.team = team;
    this.ownerId = ownerId;
    this.dead = false;
    this.age = 0;
    this.trailMode = "full";
    this.trailTickAccumulator = 0;
    this.vel.copy(direction).normalize().multiplyScalar(BULLET_SPEED);

    this.mesh.material = BULLET_MATERIALS[team];
    this.mesh.position.copy(origin);
    this.previousPosition.copy(origin);
    this.mesh.visible = true;
    if (!this.mesh.parent) {
      this.scene.add(this.mesh);
    }

    this.trail.material = TRAIL_MATERIALS[team];
    this.trail.visible = true;
    if (!this.trail.parent) {
      this.scene.add(this.trail);
    }

    for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
      this.trailPositions[i * 3] = origin.x;
      this.trailPositions[i * 3 + 1] = origin.y;
      this.trailPositions[i * 3 + 2] = origin.z;
    }
    (this.trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  public update(dt: number): void {
    if (this.dead) return;

    this.age += dt;
    if (this.age > BULLET_LIFETIME) {
      this.dispose();
      return;
    }

    this.previousPosition.copy(this.mesh.position);
    this.mesh.position.addScaledVector(this.vel, dt);

    const limit = ARENA_SIZE / 2;
    for (const axis of ["x", "y", "z"] as const) {
      if (this.mesh.position[axis] > limit || this.mesh.position[axis] < -limit) {
        this.dispose();
        return;
      }
    }

    this.updateTrail(dt);
  }

  public getOwnerId(): string {
    return this.ownerId;
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position;
  }

  public getPreviousPosition(): THREE.Vector3 {
    return this.previousPosition;
  }

  public getTeam(): 0 | 1 {
    return this.team;
  }

  public getTeamColor(): number {
    return this.team === 0 ? 0x00ffff : 0xff00ff;
  }

  public setTrailMode(mode: ProjectileTrailMode): void {
    this.trailMode = mode;
    this.trail.visible = !this.dead && mode !== "hidden";
  }

  public dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.mesh.visible = false;
    this.trail.visible = false;
    if (this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
    if (this.trail.parent) {
      this.scene.remove(this.trail);
    }
  }

  private updateTrail(dt: number): void {
    if (this.trailMode === "hidden") {
      this.trail.visible = false;
      return;
    }

    this.trail.visible = true;
    if (this.trailMode === "reduced") {
      this.trailTickAccumulator += dt;
      if (this.trailTickAccumulator < 1 / 30) {
        return;
      }
      this.trailTickAccumulator = 0;
    }

    for (let i = TRAIL_SEGMENTS - 1; i > 0; i -= 1) {
      this.trailPositions[i * 3] = this.trailPositions[(i - 1) * 3];
      this.trailPositions[i * 3 + 1] = this.trailPositions[(i - 1) * 3 + 1];
      this.trailPositions[i * 3 + 2] = this.trailPositions[(i - 1) * 3 + 2];
    }
    this.trailPositions[0] = this.mesh.position.x;
    this.trailPositions[1] = this.mesh.position.y;
    this.trailPositions[2] = this.mesh.position.z;
    (this.trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

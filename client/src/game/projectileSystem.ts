import * as THREE from 'three';
import { Projectile } from '../projectile';

const BULLET_RADIUS   = 0.07;  // must match projectile.ts
const FLASH_DURATION  = 0.13;  // seconds — quick burst
const FLASH_INTENSITY = 5.0;
const FLASH_DISTANCE  = 6.0;   // light falloff radius

interface HitFlash {
  light: THREE.PointLight;
  age:   number;
}

/**
 * Owns the list of visual projectiles in the scene. Responsible for ticking
 * them, checking obstacle collisions, spawning hit-flash lights, culling dead
 * projectiles, and disposing everything on round reset.
 *
 * Projectiles here are client-visual only — the server is authoritative for
 * hits. See `projectile.ts` for single-projectile behaviour.
 */
export class ProjectileSystem {
  private projectiles: Projectile[] = [];
  private flashes:     HitFlash[]   = [];

  public constructor(private readonly scene: THREE.Scene) {}

  public spawn(origin: THREE.Vector3, direction: THREE.Vector3, color: number): void {
    this.projectiles.push(new Projectile(this.scene, origin, direction, color));
  }

  /**
   * @param obstacleBoxes  World-space AABBs of every solid obstacle this frame.
   *                       Bullets that intersect any box (within BULLET_RADIUS)
   *                       are killed and produce a hit-flash light.
   */
  public update(dt: number, obstacleBoxes: THREE.Box3[]): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;

      p.update(dt);

      // Obstacle hit test — runs only if the bullet survived its own update
      // (i.e. didn't exit the arena boundary or expire).
      if (!p.dead) {
        const pos = p.getPosition();
        for (const box of obstacleBoxes) {
          if (box.distanceToPoint(pos) <= BULLET_RADIUS) {
            p.dispose();
            break;
          }
        }
      }

      // Bullet died this frame (arena wall, lifetime, or obstacle) → flash.
      if (p.dead) {
        this.spawnFlash(p.getPosition(), p.getTeamColor());
      }
    }

    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // Tick flashes: quadratic intensity fade, remove when done.
    for (const f of this.flashes) {
      f.age += dt;
      const t = Math.min(f.age / FLASH_DURATION, 1);
      f.light.intensity = FLASH_INTENSITY * (1 - t * t);
    }
    for (const f of this.flashes) {
      if (f.age >= FLASH_DURATION) {
        this.scene.remove(f.light);
        f.light.dispose();
      }
    }
    this.flashes = this.flashes.filter((f) => f.age < FLASH_DURATION);
  }

  public clear(): void {
    for (const p of this.projectiles) p.dispose();
    this.projectiles = [];
    for (const f of this.flashes) {
      this.scene.remove(f.light);
      f.light.dispose();
    }
    this.flashes = [];
  }

  private spawnFlash(pos: THREE.Vector3, color: number): void {
    const light = new THREE.PointLight(color, FLASH_INTENSITY, FLASH_DISTANCE, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.flashes.push({ light, age: 0 });
  }
}

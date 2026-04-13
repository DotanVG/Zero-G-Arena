import * as THREE from 'three';
import { ARENA_SIZE } from '../../../shared/constants';
import { Projectile } from '../projectile';
import { bulletHitPoint } from './bulletCollision';

const BULLET_RADIUS  = 0.07;
const FLASH_DURATION = 0.13;   // seconds
const ARENA_LIMIT    = ARENA_SIZE / 2;  // 20

// Flash params per hit type.
const OBS_INTENSITY    = 5.0;  const OBS_DIST    = 6.0;
const PORTAL_INTENSITY = 9.0;  const PORTAL_DIST = 9.0;
const WALL_INTENSITY   = 5.0;  const WALL_DIST   = 6.0;

const SPARK_DURATION = 0.32;
const SPARK_COUNT    = 22;

interface HitFlash   { light: THREE.PointLight; age: number; }
interface SparkBurst { points: THREE.Points; positions: Float32Array; velocities: Float32Array; age: number; }

/**
 * Owns the list of visual projectiles. Three distinct hit paths:
 *
 *   1. Obstacle hit     → surface flash + omnidirectional sparks.
 *   2. Portal barrier   → bigger flash + onPortalHit() for the energy wall ring/sparks.
 *   3. Arena wall       → flash at clamped wall position + hemisphere sparks.
 *   4. Lifetime expiry  → flash only (bullet just fades out).
 *
 * Collision uses bulletHitPoint() — a swept ray-box test — so fast bullets
 * cannot skip through thin obstacles (1-unit plates/beams) in a single frame.
 */
export class ProjectileSystem {
  private projectiles: Projectile[] = [];
  private flashes:     HitFlash[]   = [];
  private sparks:      SparkBurst[] = [];

  public constructor(private readonly scene: THREE.Scene) {}

  public spawn(origin: THREE.Vector3, direction: THREE.Vector3, color: number): void {
    this.projectiles.push(new Projectile(this.scene, origin, direction, color));
  }

  /**
   * @param solidBoxes  Obstacle AABBs.
   * @param portalBoxes Portal barrier AABBs.
   * @param onPortalHit Called with the world-space surface hit point when a
   *                    bullet hits a portal barrier. Triggers the energy-wall
   *                    ring + sparkle effect in PortalEnergyWall.
   */
  public update(
    dt: number,
    solidBoxes: THREE.Box3[],
    portalBoxes: THREE.Box3[],
    onPortalHit: (pos: THREE.Vector3) => void,
  ): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;

      const oldPos = p.getPosition().clone();
      p.update(dt);

      let handledFlash = false;

      if (!p.dead) {
        const newPos = p.getPosition();

        // ── 1. Obstacle ─────────────────────────────────────────────
        for (const box of solidBoxes) {
          const hit = bulletHitPoint(oldPos, newPos, box, BULLET_RADIUS);
          if (hit) {
            p.dispose();
            this.spawnFlash(hit, p.getTeamColor(), OBS_INTENSITY, OBS_DIST);
            this.spawnSparks(hit, p.getTeamColor(), null);
            handledFlash = true;
            break;
          }
        }

        // ── 2. Portal barrier ────────────────────────────────────────
        if (!p.dead) {
          for (const box of portalBoxes) {
            const hit = bulletHitPoint(oldPos, newPos, box, BULLET_RADIUS);
            if (hit) {
              p.dispose();
              this.spawnFlash(hit, p.getTeamColor(), PORTAL_INTENSITY, PORTAL_DIST);
              onPortalHit(hit);
              handledFlash = true;
              break;
            }
          }
        }
      }

      // ── 3/4. Arena wall or lifetime (killed inside p.update()) ────
      if (p.dead && !handledFlash) {
        const rawPos  = p.getPosition();
        const wallPos = this.clampToArena(rawPos);
        const isWall  = this.isAtArenaBoundary(rawPos);
        this.spawnFlash(wallPos, p.getTeamColor(), WALL_INTENSITY, WALL_DIST);
        if (isWall) {
          this.spawnSparks(wallPos, p.getTeamColor(), this.inwardWallNormal(wallPos));
        }
      }
    }

    this.projectiles = this.projectiles.filter(p => !p.dead);

    // ── Tick and cull flashes ─────────────────────────────────────────
    for (const f of this.flashes) {
      f.age += dt;
      const t = Math.min(f.age / FLASH_DURATION, 1);
      f.light.intensity = (f.light.userData.peak as number) * (1 - t * t);
    }
    for (const f of this.flashes.filter(f => f.age >= FLASH_DURATION)) {
      this.scene.remove(f.light);
      f.light.dispose();
    }
    this.flashes = this.flashes.filter(f => f.age < FLASH_DURATION);

    // ── Tick and cull sparks ──────────────────────────────────────────
    for (const s of this.sparks) {
      s.age += dt;
      for (let i = 0; i < SPARK_COUNT; i++) {
        s.positions[i * 3]     += s.velocities[i * 3]     * dt;
        s.positions[i * 3 + 1] += s.velocities[i * 3 + 1] * dt;
        s.positions[i * 3 + 2] += s.velocities[i * 3 + 2] * dt;
      }
      (s.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const t = s.age / SPARK_DURATION;
      (s.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t * t);
    }
    for (const s of this.sparks.filter(s => s.age >= SPARK_DURATION)) {
      this.scene.remove(s.points);
      s.points.geometry.dispose();
      (s.points.material as THREE.Material).dispose();
    }
    this.sparks = this.sparks.filter(s => s.age < SPARK_DURATION);
  }

  public clear(): void {
    for (const p of this.projectiles) p.dispose();
    this.projectiles = [];
    for (const f of this.flashes) { this.scene.remove(f.light); f.light.dispose(); }
    this.flashes = [];
    for (const s of this.sparks) {
      this.scene.remove(s.points);
      s.points.geometry.dispose();
      (s.points.material as THREE.Material).dispose();
    }
    this.sparks = [];
  }

  // ── Effect spawners ────────────────────────────────────────────────────

  private spawnFlash(pos: THREE.Vector3, color: number, intensity: number, dist: number): void {
    const light = new THREE.PointLight(color, intensity, dist, 2);
    light.position.copy(pos);
    light.userData.peak = intensity;
    this.scene.add(light);
    this.flashes.push({ light, age: 0 });
  }

  /**
   * Spark burst. When `normal` is non-null, particles fly in a hemisphere
   * facing that direction (e.g. into the arena from a wall). When null,
   * particles scatter in all directions (obstacle interior hit).
   */
  private spawnSparks(pos: THREE.Vector3, color: number, normal: THREE.Vector3 | null): void {
    const positions  = new Float32Array(SPARK_COUNT * 3);
    const velocities = new Float32Array(SPARK_COUNT * 3);

    const nrm = normal ?? new THREE.Vector3(0, 1, 0);
    const t1  = new THREE.Vector3();
    const t2  = new THREE.Vector3();
    if (Math.abs(nrm.x) < 0.9) {
      t1.crossVectors(nrm, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(nrm, new THREE.Vector3(0, 1, 0)).normalize();
    }
    t2.crossVectors(nrm, t1);

    const phiMax = normal ? Math.PI / 2 : Math.PI;

    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3]     = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * phiMax;
      const speed = 2.5 + Math.random() * 5.5;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ct = Math.cos(theta);
      const st = Math.sin(theta);

      velocities[i * 3]     = (nrm.x * cp + (t1.x * ct + t2.x * st) * sp) * speed;
      velocities[i * 3 + 1] = (nrm.y * cp + (t1.y * ct + t2.y * st) * sp) * speed;
      velocities[i * 3 + 2] = (nrm.z * cp + (t1.z * ct + t2.z * st) * sp) * speed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.07, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.sparks.push({ points, positions, velocities, age: 0 });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private isAtArenaBoundary(pos: THREE.Vector3): boolean {
    return (
      Math.abs(pos.x) > ARENA_LIMIT - 0.5 ||
      Math.abs(pos.y) > ARENA_LIMIT - 0.5 ||
      Math.abs(pos.z) > ARENA_LIMIT - 0.5
    );
  }

  private clampToArena(pos: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.x)),
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.y)),
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.z)),
    );
  }

  private inwardWallNormal(clampedPos: THREE.Vector3): THREE.Vector3 {
    const ax = Math.abs(clampedPos.x);
    const ay = Math.abs(clampedPos.y);
    const az = Math.abs(clampedPos.z);
    if (ax >= ay && ax >= az) return new THREE.Vector3(-Math.sign(clampedPos.x), 0, 0);
    if (ay >= ax && ay >= az) return new THREE.Vector3(0, -Math.sign(clampedPos.y), 0);
    return new THREE.Vector3(0, 0, -Math.sign(clampedPos.z));
  }
}

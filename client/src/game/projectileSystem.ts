import * as THREE from "three";
import { ARENA_SIZE } from "../../../shared/constants";
import { Projectile, type ProjectileTrailMode } from "../projectile";
import { bulletHitPoint } from "./bulletCollision";
import { segmentSphereHitPoint } from "./projectileActorCollision";

const BULLET_RADIUS = 0.07;
const FLASH_DURATION = 0.13;
const ARENA_LIMIT = ARENA_SIZE / 2;

const OBS_INTENSITY = 5.0;
const OBS_DIST = 6.0;
const PORTAL_INTENSITY = 9.0;
const PORTAL_DIST = 9.0;
const WALL_INTENSITY = 5.0;
const WALL_DIST = 6.0;

const MAX_FLASH_POOL = 18;
const MAX_SPARK_POOL = 14;
const SPARK_DURATION = 0.32;
const SPARK_COUNT = 22;

interface HitFlash {
  active: boolean;
  age: number;
  light: THREE.PointLight;
  peak: number;
}

interface SparkBurst {
  active: boolean;
  age: number;
  count: number;
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
}

export interface ProjectileActorTarget {
  active: boolean;
  id: string;
  pos: THREE.Vector3;
  radius: number;
  team: 0 | 1;
}

export interface ProjectileActorHit {
  direction: THREE.Vector3;
  impactPoint: THREE.Vector3;
  ownerId: string;
  targetId: string;
}

type CollisionHit =
  | { kind: "actor"; point: THREE.Vector3; distance: number; targetId: string }
  | { kind: "obstacle"; point: THREE.Vector3; distance: number }
  | { kind: "portal"; point: THREE.Vector3; distance: number };

export class ProjectileSystem {
  private flashes: HitFlash[] = [];
  private projectilePool: Projectile[] = [];
  private projectiles: Projectile[] = [];
  private sparks: SparkBurst[] = [];
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpSparkNormal = new THREE.Vector3();

  public constructor(private readonly scene: THREE.Scene) {}

  public spawn(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    team: 0 | 1,
    ownerId: string,
  ): void {
    const projectile = this.projectilePool.pop() ?? new Projectile(this.scene);
    projectile.reset(origin, direction, team, ownerId);
    this.projectiles.push(projectile);
  }

  public update(
    dt: number,
    solidBoxes: THREE.Box3[],
    portalBoxes: THREE.Box3[],
    actorTargets: ProjectileActorTarget[],
    onPortalHit: (pos: THREE.Vector3, color: number) => void,
    onActorHit: (hit: ProjectileActorHit) => void,
  ): void {
    const fxMode = this.currentFxMode();
    const trailMode = this.currentTrailMode(fxMode);

    for (const projectile of this.projectiles) {
      if (projectile.dead) continue;

      projectile.setTrailMode(trailMode);
      projectile.update(dt);
      let handledFlash = false;

      if (!projectile.dead) {
        const oldPos = projectile.getPreviousPosition();
        const newPos = projectile.getPosition();
        const direction = this.tmpDirection.subVectors(newPos, oldPos).normalize();
        const nearestHit = this.findNearestHit(
          projectile,
          oldPos,
          newPos,
          solidBoxes,
          portalBoxes,
          actorTargets,
        );

        if (nearestHit) {
          projectile.dispose();
          handledFlash = true;

          if (nearestHit.kind === "obstacle") {
            this.spawnFlash(nearestHit.point, projectile.getTeamColor(), OBS_INTENSITY, OBS_DIST, fxMode);
            this.spawnSparks(nearestHit.point, projectile.getTeamColor(), null, fxMode);
          } else if (nearestHit.kind === "portal") {
            this.spawnFlash(nearestHit.point, projectile.getTeamColor(), PORTAL_INTENSITY, PORTAL_DIST, fxMode);
            onPortalHit(nearestHit.point, projectile.getTeamColor());
          } else {
            this.spawnFlash(nearestHit.point, projectile.getTeamColor(), OBS_INTENSITY, OBS_DIST, fxMode);
            this.spawnSparks(
              nearestHit.point,
              projectile.getTeamColor(),
              this.tmpSparkNormal.copy(direction).negate(),
              fxMode,
            );
            onActorHit({
              direction: direction.clone(),
              impactPoint: nearestHit.point,
              ownerId: projectile.getOwnerId(),
              targetId: nearestHit.targetId,
            });
          }
        }
      }

      if (projectile.dead && !handledFlash) {
        const rawPos = projectile.getPosition();
        const wallPos = this.clampToArena(rawPos);
        const isWall = this.isAtArenaBoundary(rawPos);
        this.spawnFlash(wallPos, projectile.getTeamColor(), WALL_INTENSITY, WALL_DIST, fxMode);
        if (isWall) {
          this.spawnSparks(
            wallPos,
            projectile.getTeamColor(),
            this.inwardWallNormal(wallPos),
            fxMode,
          );
        }
      }
    }

    this.recycleDeadProjectiles();
    this.updateFlashes(dt);
    this.updateSparks(dt);
  }

  public clear(): void {
    for (const projectile of this.projectiles) {
      projectile.dispose();
      this.projectilePool.push(projectile);
    }
    this.projectiles = [];

    for (const flash of this.flashes) {
      flash.active = false;
      flash.light.visible = false;
    }

    for (const spark of this.sparks) {
      spark.active = false;
      spark.points.visible = false;
    }
  }

  private acquireFlash(): HitFlash | null {
    const existing = this.flashes.find((flash) => !flash.active);
    if (existing) return existing;
    if (this.flashes.length >= MAX_FLASH_POOL) return null;

    const light = new THREE.PointLight(0xffffff, 0, 0, 2);
    light.visible = false;
    this.scene.add(light);

    const flash: HitFlash = { active: false, age: 0, light, peak: 0 };
    this.flashes.push(flash);
    return flash;
  }

  private acquireSparkBurst(): SparkBurst | null {
    const existing = this.sparks.find((spark) => !spark.active);
    if (existing) return existing;
    if (this.sparks.length >= MAX_SPARK_POOL) return null;

    const positions = new Float32Array(SPARK_COUNT * 3);
    const velocities = new Float32Array(SPARK_COUNT * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      depthWrite: false,
      opacity: 1,
      size: 0.07,
      transparent: true,
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    this.scene.add(points);

    const spark: SparkBurst = {
      active: false,
      age: 0,
      count: 0,
      points,
      positions,
      velocities,
    };
    this.sparks.push(spark);
    return spark;
  }

  private currentFxMode(): "normal" | "high" | "extreme" {
    if (this.projectiles.length >= 90) return "extreme";
    if (this.projectiles.length >= 45) return "high";
    return "normal";
  }

  private currentTrailMode(mode: "normal" | "high" | "extreme"): ProjectileTrailMode {
    if (mode === "extreme") return "hidden";
    if (mode === "high") return "reduced";
    return "full";
  }

  private findNearestHit(
    projectile: Projectile,
    oldPos: THREE.Vector3,
    newPos: THREE.Vector3,
    solidBoxes: THREE.Box3[],
    portalBoxes: THREE.Box3[],
    actorTargets: ProjectileActorTarget[],
  ): CollisionHit | null {
    let nearest: CollisionHit | null = null;

    for (const box of solidBoxes) {
      const hit = bulletHitPoint(oldPos, newPos, box, BULLET_RADIUS);
      if (!hit) continue;
      const distance = hit.distanceToSquared(oldPos);
      if (!nearest || distance < nearest.distance) {
        nearest = { kind: "obstacle", point: hit, distance };
      }
    }

    for (const box of portalBoxes) {
      const hit = bulletHitPoint(oldPos, newPos, box, BULLET_RADIUS);
      if (!hit) continue;
      const distance = hit.distanceToSquared(oldPos);
      if (!nearest || distance < nearest.distance) {
        nearest = { kind: "portal", point: hit, distance };
      }
    }

    for (const actor of actorTargets) {
      if (!actor.active) continue;
      if (actor.team === projectile.getTeam()) continue;
      if (actor.id === projectile.getOwnerId()) continue;
      const hit = segmentSphereHitPoint(oldPos, newPos, actor.pos, actor.radius);
      if (!hit) continue;
      const distance = hit.distanceToSquared(oldPos);
      if (!nearest || distance < nearest.distance) {
        nearest = { kind: "actor", point: hit, distance, targetId: actor.id };
      }
    }

    return nearest;
  }

  private inwardWallNormal(clampedPos: THREE.Vector3): THREE.Vector3 {
    const ax = Math.abs(clampedPos.x);
    const ay = Math.abs(clampedPos.y);
    const az = Math.abs(clampedPos.z);
    if (ax >= ay && ax >= az) return new THREE.Vector3(-Math.sign(clampedPos.x), 0, 0);
    if (ay >= ax && ay >= az) return new THREE.Vector3(0, -Math.sign(clampedPos.y), 0);
    return new THREE.Vector3(0, 0, -Math.sign(clampedPos.z));
  }

  private isAtArenaBoundary(pos: THREE.Vector3): boolean {
    return (
      Math.abs(pos.x) > ARENA_LIMIT - 0.5
      || Math.abs(pos.y) > ARENA_LIMIT - 0.5
      || Math.abs(pos.z) > ARENA_LIMIT - 0.5
    );
  }

  private clampToArena(pos: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.x)),
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.y)),
      Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, pos.z)),
    );
  }

  private recycleDeadProjectiles(): void {
    if (this.projectiles.length === 0) return;

    const active: Projectile[] = [];
    for (const projectile of this.projectiles) {
      if (projectile.dead) {
        this.projectilePool.push(projectile);
      } else {
        active.push(projectile);
      }
    }
    this.projectiles = active;
  }

  private spawnFlash(
    pos: THREE.Vector3,
    color: number,
    intensity: number,
    distance: number,
    mode: "normal" | "high" | "extreme",
  ): void {
    const flash = this.acquireFlash();
    if (!flash) return;

    const intensityScale = mode === "normal" ? 1 : mode === "high" ? 0.7 : 0.45;

    flash.active = true;
    flash.age = 0;
    flash.peak = intensity * intensityScale;
    flash.light.position.copy(pos);
    flash.light.color.setHex(color);
    flash.light.distance = distance * intensityScale;
    flash.light.intensity = flash.peak;
    flash.light.visible = true;
  }

  private spawnSparks(
    pos: THREE.Vector3,
    color: number,
    normal: THREE.Vector3 | null,
    mode: "normal" | "high" | "extreme",
  ): void {
    const sparkCount = mode === "normal" ? SPARK_COUNT : mode === "high" ? 10 : 0;
    if (sparkCount <= 0) return;

    const spark = this.acquireSparkBurst();
    if (!spark) return;

    const nrm = normal ?? new THREE.Vector3(0, 1, 0);
    const tangentA = new THREE.Vector3();
    const tangentB = new THREE.Vector3();
    if (Math.abs(nrm.x) < 0.9) {
      tangentA.crossVectors(nrm, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangentA.crossVectors(nrm, new THREE.Vector3(0, 1, 0)).normalize();
    }
    tangentB.crossVectors(nrm, tangentA);
    const phiMax = normal ? Math.PI / 2 : Math.PI;

    spark.active = true;
    spark.age = 0;
    spark.count = sparkCount;
    spark.points.visible = true;
    const material = spark.points.material as THREE.PointsMaterial;
    material.color.setHex(color);
    material.opacity = 1;

    for (let i = 0; i < SPARK_COUNT; i += 1) {
      spark.positions[i * 3] = pos.x;
      spark.positions[i * 3 + 1] = pos.y;
      spark.positions[i * 3 + 2] = pos.z;

      if (i >= sparkCount) {
        spark.velocities[i * 3] = 0;
        spark.velocities[i * 3 + 1] = 0;
        spark.velocities[i * 3 + 2] = 0;
        continue;
      }

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * phiMax;
      const speed = 2.5 + Math.random() * 5.5;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ct = Math.cos(theta);
      const st = Math.sin(theta);

      spark.velocities[i * 3] = (nrm.x * cp + (tangentA.x * ct + tangentB.x * st) * sp) * speed;
      spark.velocities[i * 3 + 1] = (nrm.y * cp + (tangentA.y * ct + tangentB.y * st) * sp) * speed;
      spark.velocities[i * 3 + 2] = (nrm.z * cp + (tangentA.z * ct + tangentB.z * st) * sp) * speed;
    }

    (spark.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateFlashes(dt: number): void {
    for (const flash of this.flashes) {
      if (!flash.active) continue;

      flash.age += dt;
      const t = Math.min(flash.age / FLASH_DURATION, 1);
      flash.light.intensity = flash.peak * (1 - t * t);

      if (flash.age >= FLASH_DURATION) {
        flash.active = false;
        flash.light.visible = false;
      }
    }
  }

  private updateSparks(dt: number): void {
    for (const spark of this.sparks) {
      if (!spark.active) continue;

      spark.age += dt;
      for (let i = 0; i < spark.count; i += 1) {
        spark.positions[i * 3] += spark.velocities[i * 3] * dt;
        spark.positions[i * 3 + 1] += spark.velocities[i * 3 + 1] * dt;
        spark.positions[i * 3 + 2] += spark.velocities[i * 3 + 2] * dt;
      }
      (spark.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (spark.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - (spark.age / SPARK_DURATION) ** 2);

      if (spark.age >= SPARK_DURATION) {
        spark.active = false;
        spark.points.visible = false;
      }
    }
  }
}

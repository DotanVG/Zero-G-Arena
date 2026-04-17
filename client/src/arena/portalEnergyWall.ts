import * as THREE from 'three';
import { ARENA_SIZE, BREACH_ROOM_W, BREACH_ROOM_H } from '../../../shared/constants';

const PARTICLE_COUNT  = 90;
const IMPACT_DURATION = 0.38;  // seconds — ring expansion + sparkle fade
const IMPACT_SPARKS   = 18;    // points per portal impact

interface ImpactEffect {
  ring:           THREE.Mesh;
  sparks:         THREE.Points;
  sparkPositions: Float32Array;
  sparkVelocities: Float32Array;
  age:            number;
}

/**
 * Visual "space energy barrier" at the breach room portal opening.
 *
 * Composed of:
 *   • Three semi-transparent pulsing planes (additive, team colour).
 *   • 90 particles drifting up/down within the portal bounds, wrapping
 *     vertically — the "waterfall of space energy" look.
 *
 * `spawnImpact(worldPos)` spawns an expanding ring + radial sparkles in the
 * portal plane every time a projectile hits the barrier. Call it from Arena.
 */
export class PortalEnergyWall {
  // ── Persistent fields (needed by spawnImpact) ──────────────────────
  private readonly axis:  'x' | 'y' | 'z';
  private readonly sign:  1 | -1;
  private readonly color: number;

  // ── Scene graph ────────────────────────────────────────────────────
  private group:       THREE.Group;
  private baseMesh:    THREE.Mesh;
  private rippleMeshA: THREE.Mesh;
  private rippleMeshB: THREE.Mesh;

  // ── Ambient particles ──────────────────────────────────────────────
  private particles:         THREE.Points;
  private particlePositions: Float32Array;
  private particleVelY:      Float32Array;

  // ── Active impact effects ──────────────────────────────────────────
  private impacts: ImpactEffect[] = [];
  private time = 0;

  public constructor(
    private scene: THREE.Scene,
    axis: 'x' | 'y' | 'z',
    sign: 1 | -1,
    team: 0 | 1,
  ) {
    this.axis  = axis;
    this.sign  = sign;
    this.color = team === 0 ? 0x00ffff : 0xff00ff;

    this.group = new THREE.Group();

    // Sit exactly at the arena face, matching the GoalPlane positioning.
    const pos = new THREE.Vector3();
    pos[axis] = sign * (ARENA_SIZE / 2);
    this.group.position.copy(pos);

    if (axis === 'x') {
      this.group.rotation.y = sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else if (axis === 'y') {
      this.group.rotation.x = sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.group.rotation.y = sign === 1 ? Math.PI : 0;
    }

    const w = BREACH_ROOM_W;
    const h = BREACH_ROOM_H;
    const col = this.color;

    // ── Base energy plane ────────────────────────────────────────────
    this.baseMesh = this.makePlane(w, h, 0,
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    this.group.add(this.baseMesh);

    // ── Inner ripple ─────────────────────────────────────────────────
    this.rippleMeshA = this.makePlane(w * 0.86, h * 0.86, -0.06,
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    this.group.add(this.rippleMeshA);

    // ── Outer ripple ─────────────────────────────────────────────────
    this.rippleMeshB = this.makePlane(w * 0.68, h * 0.68, 0.06,
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    this.group.add(this.rippleMeshB);

    // ── Ambient particles ─────────────────────────────────────────────
    const halfW = w / 2;
    const halfH = h / 2;

    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleVelY      = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3]     = (Math.random() * 2 - 1) * halfW * 0.92;
      this.particlePositions[i * 3 + 1] = (Math.random() * 2 - 1) * halfH * 0.92;
      this.particlePositions[i * 3 + 2] = (Math.random() * 2 - 1) * 0.12;
      this.particleVelY[i] = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 2.4);
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: col, size: 0.09,
        transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.group.add(this.particles);

    scene.add(this.group);
  }

  // ── Impact effect ─────────────────────────────────────────────────────

  /**
   * Spawn an expanding ring + radial sparkles at `worldPos`.
   * Call this whenever a projectile hits the portal barrier.
   */
  public spawnImpact(worldPos: THREE.Vector3, bulletColor: number): void {
    // Evict the oldest impact to cap concurrent geometry allocations on mobile.
    if (this.impacts.length >= 4) {
      const oldest = this.impacts.shift()!;
      this.scene.remove(oldest.ring);
      (oldest.ring.material as THREE.Material).dispose();
      oldest.ring.geometry.dispose();
      this.scene.remove(oldest.sparks);
      (oldest.sparks.material as THREE.Material).dispose();
      oldest.sparks.geometry.dispose();
    }

    const col = bulletColor;

    // ── Expanding ring (oriented to lie in the portal plane) ──────────
    const ringGeo = new THREE.RingGeometry(0.5, 1.0, 20);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.position.copy(worldPos);
    // Orient ring perpendicular to the portal normal (ring face = portal face).
    const normal = new THREE.Vector3();
    normal[this.axis] = this.sign;
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    ring.scale.setScalar(0.04); // start tiny; animated in update()
    this.scene.add(ring);

    // ── Radial sparkles in the portal plane ───────────────────────────
    // Build two tangent vectors spanning the portal face.
    const t1 = new THREE.Vector3();
    const t2 = new THREE.Vector3();
    if (this.axis === 'x') { t1.set(0, 1, 0); t2.set(0, 0, 1); }
    else if (this.axis === 'y') { t1.set(1, 0, 0); t2.set(0, 0, 1); }
    else                        { t1.set(1, 0, 0); t2.set(0, 1, 0); }

    const sparkPos = new Float32Array(IMPACT_SPARKS * 3);
    const sparkVel = new Float32Array(IMPACT_SPARKS * 3);

    for (let i = 0; i < IMPACT_SPARKS; i++) {
      sparkPos[i * 3]     = worldPos.x;
      sparkPos[i * 3 + 1] = worldPos.y;
      sparkPos[i * 3 + 2] = worldPos.z;

      const angle = (i / IMPACT_SPARKS) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = 2.5 + Math.random() * 4.5;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      sparkVel[i * 3]     = (t1.x * ca + t2.x * sa) * speed;
      sparkVel[i * 3 + 1] = (t1.y * ca + t2.y * sa) * speed;
      sparkVel[i * 3 + 2] = (t1.z * ca + t2.z * sa) * speed;
    }

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparks = new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({
        color: col, size: 0.1,
        transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.scene.add(sparks);

    this.impacts.push({ ring, sparks, sparkPositions: sparkPos, sparkVelocities: sparkVel, age: 0 });
  }

  // ── Per-frame tick ────────────────────────────────────────────────────

  public update(dt: number): void {
    this.time += dt;
    const t = this.time;

    // Pulse base planes.
    (this.baseMesh.material    as THREE.MeshBasicMaterial).opacity = 0.13 + 0.07 * Math.sin(t * 0.9);
    (this.rippleMeshA.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.05 * Math.sin(t * 2.3 + 0.6);
    (this.rippleMeshB.material as THREE.MeshBasicMaterial).opacity = 0.04 + 0.04 * Math.sin(t * 1.6 + 1.4);

    const sA = 0.86 + 0.03 * Math.sin(t * 2.1);
    this.rippleMeshA.scale.set(sA, sA, 1);
    const sB = 0.68 + 0.04 * Math.sin(t * 1.4 + 0.8);
    this.rippleMeshB.scale.set(sB, sB, 1);

    // Drift ambient particles vertically.
    const halfH = BREACH_ROOM_H / 2 * 0.93;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3 + 1] += this.particleVelY[i] * dt;
      if      (this.particlePositions[i * 3 + 1] >  halfH) this.particlePositions[i * 3 + 1] = -halfH;
      else if (this.particlePositions[i * 3 + 1] < -halfH) this.particlePositions[i * 3 + 1] =  halfH;
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Animate impact effects.
    for (const imp of this.impacts) {
      imp.age += dt;
      const p = Math.min(imp.age / IMPACT_DURATION, 1);

      // Ring: expand rapidly then slow down (easeOutCubic), opacity fades out.
      const eased = 1 - Math.pow(1 - p, 3);
      imp.ring.scale.setScalar(0.04 + eased * 2.4);
      (imp.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);

      // Sparkles: translate outward, fade out quadratically.
      for (let i = 0; i < IMPACT_SPARKS; i++) {
        imp.sparkPositions[i * 3]     += imp.sparkVelocities[i * 3]     * dt;
        imp.sparkPositions[i * 3 + 1] += imp.sparkVelocities[i * 3 + 1] * dt;
        imp.sparkPositions[i * 3 + 2] += imp.sparkVelocities[i * 3 + 2] * dt;
      }
      (imp.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (imp.sparks.material as THREE.PointsMaterial).opacity = 1.0 * (1 - p * p);
    }

    // Remove finished impacts.
    for (const imp of this.impacts) {
      if (imp.age >= IMPACT_DURATION) this.disposeImpact(imp);
    }
    this.impacts = this.impacts.filter(imp => imp.age < IMPACT_DURATION);
  }

  public dispose(): void {
    for (const imp of this.impacts) this.disposeImpact(imp);
    this.impacts = [];
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private makePlane(w: number, h: number, zOff: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.z = zOff;
    return mesh;
  }

  private disposeImpact(imp: ImpactEffect): void {
    this.scene.remove(imp.ring);
    imp.ring.geometry.dispose();
    (imp.ring.material as THREE.Material).dispose();
    this.scene.remove(imp.sparks);
    imp.sparks.geometry.dispose();
    (imp.sparks.material as THREE.Material).dispose();
  }
}

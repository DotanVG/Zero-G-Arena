import * as THREE from 'three';
import { ARENA_SIZE, BREACH_ROOM_W, BREACH_ROOM_H } from '../../../shared/constants';

const PARTICLE_COUNT = 90;

/**
 * Visual "space energy barrier" rendered at the breach room portal opening.
 *
 * Composed of:
 *   • Three semi-transparent base planes with pulsing opacity (additive blending).
 *   • A particle system of small points drifting randomly up or down within
 *     the portal bounds, wrapping when they leave the vertical extent.
 *
 * Projectiles are blocked at the arena boundary (±ARENA_SIZE/2) by the
 * arena wall check in projectile.ts and by the portal barrier AABBs returned
 * by Arena.getPortalBarrierAABBs() — this class is purely visual.
 */
export class PortalEnergyWall {
  private group: THREE.Group;
  private baseMesh:    THREE.Mesh;
  private rippleMeshA: THREE.Mesh;
  private rippleMeshB: THREE.Mesh;
  private particles:         THREE.Points;
  private particlePositions: Float32Array;
  private particleVelY:      Float32Array; // vertical drift speed, signed
  private time = 0;

  public constructor(
    private scene: THREE.Scene,
    axis: 'x' | 'y' | 'z',
    sign: 1 | -1,
    team: 0 | 1,
  ) {
    this.group = new THREE.Group();

    // Sit exactly at the arena face, matching the GoalPlane position/rotation.
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

    const color = team === 0 ? 0x00ffff : 0xff00ff;
    const w = BREACH_ROOM_W;
    const h = BREACH_ROOM_H;

    // ── Base energy plane ──────────────────────────────────────────────
    this.baseMesh = this.makePlane(w, h, 0,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
    this.group.add(this.baseMesh);

    // ── Inner ripple layer ─────────────────────────────────────────────
    this.rippleMeshA = this.makePlane(w * 0.86, h * 0.86, -0.06,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.10,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
    this.group.add(this.rippleMeshA);

    // ── Outer ripple layer ─────────────────────────────────────────────
    this.rippleMeshB = this.makePlane(w * 0.68, h * 0.68, 0.06,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
    this.group.add(this.rippleMeshB);

    // ── Particles ──────────────────────────────────────────────────────
    const halfW = w / 2;
    const halfH = h / 2;

    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleVelY      = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3]     = (Math.random() * 2 - 1) * halfW * 0.92;
      this.particlePositions[i * 3 + 1] = (Math.random() * 2 - 1) * halfH * 0.92;
      this.particlePositions[i * 3 + 2] = (Math.random() * 2 - 1) * 0.12;
      // Each particle drifts up or down at a random speed between 0.4 and 2.8 units/s.
      this.particleVelY[i] = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 2.4);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size: 0.09,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.group.add(this.particles);

    scene.add(this.group);
  }

  /** Animate particles and pulse the translucent planes. Call once per frame. */
  public update(dt: number): void {
    this.time += dt;
    const t = this.time;

    // Pulse opacities independently on each plane for a shimmering look.
    (this.baseMesh.material    as THREE.MeshBasicMaterial).opacity = 0.13 + 0.07 * Math.sin(t * 0.9);
    (this.rippleMeshA.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.05 * Math.sin(t * 2.3 + 0.6);
    (this.rippleMeshB.material as THREE.MeshBasicMaterial).opacity = 0.04 + 0.04 * Math.sin(t * 1.6 + 1.4);

    // Subtle scale ripple on inner/outer planes.
    const sA = 0.86 + 0.03 * Math.sin(t * 2.1);
    this.rippleMeshA.scale.set(sA, sA, 1);
    const sB = 0.68 + 0.04 * Math.sin(t * 1.4 + 0.8);
    this.rippleMeshB.scale.set(sB, sB, 1);

    // Drift particles; wrap vertically when they leave the portal extent.
    const halfH = BREACH_ROOM_H / 2 * 0.93;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3 + 1] += this.particleVelY[i] * dt;
      if (this.particlePositions[i * 3 + 1] > halfH) {
        this.particlePositions[i * 3 + 1] = -halfH;
      } else if (this.particlePositions[i * 3 + 1] < -halfH) {
        this.particlePositions[i * 3 + 1] = halfH;
      }
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private makePlane(w: number, h: number, zOff: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.z = zOff;
    return mesh;
  }
}

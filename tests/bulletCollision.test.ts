import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bulletHitsBox, bulletHitPoint } from '../client/src/game/bulletCollision';

const RADIUS = 0.07;

// Helper — axis-aligned box centred at origin with given half-extents.
function box(hx: number, hy: number, hz: number, cx = 0, cy = 0, cz = 0): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(cx - hx, cy - hy, cz - hz),
    new THREE.Vector3(cx + hx, cy + hy, cz + hz),
  );
}

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

describe('bulletHitsBox', () => {
  it('detects head-on hit against a thick box', () => {
    // 3×3×3 box centered at z=6; bullet travels from z=0 to z=7
    const b = box(1.5, 1.5, 1.5, 0, 0, 6);
    expect(bulletHitsBox(v(0, 0, 0), v(0, 0, 7), b, RADIUS)).toBe(true);
  });

  it('detects bullet skipping through a 1-unit-thin plate (fast bullet)', () => {
    // Plate: x[-5,5] y[-5,5] z[4.5,5.5]  (1 unit thick on Z)
    // Bullet moves 3 units per frame — skips from z=3 to z=6, never sampled inside.
    const b = new THREE.Box3(v(-5, -5, 4.5), v(5, 5, 5.5));
    expect(bulletHitsBox(v(0, 0, 3), v(0, 0, 6), b, RADIUS)).toBe(true);
  });

  it('returns false when bullet misses the box entirely', () => {
    const b = box(1.5, 1.5, 1.5, 0, 0, 6);
    // Bullet travels in +X, well clear of the box
    expect(bulletHitsBox(v(-10, 0, 0), v(10, 0, 0), b, RADIUS)).toBe(false);
  });

  it('returns false when bullet stops short of the box', () => {
    const b = box(1.5, 1.5, 1.5, 0, 0, 10);
    // Bullet only travels to z=5 — box starts at z=8.5
    expect(bulletHitsBox(v(0, 0, 0), v(0, 0, 5), b, RADIUS)).toBe(false);
  });

  it('returns false when bullet starts past and moves away', () => {
    const b = box(1.5, 1.5, 1.5, 0, 0, 5);
    // Bullet starts at z=8 and moves to z=15 — box is behind it
    expect(bulletHitsBox(v(0, 0, 8), v(0, 0, 15), b, RADIUS)).toBe(false);
  });

  it('detects surface graze within bullet radius', () => {
    // Box surface at z=2.0; bullet starts at z=1.95 (just outside expanded box by radius)
    const b = new THREE.Box3(v(-5, -5, 2.0), v(5, 5, 4.0));
    // oldPos is 0.05 from surface — within RADIUS (0.07) after expansion
    expect(bulletHitsBox(v(0, 0, 1.95), v(0, 0, 3.5), b, RADIUS)).toBe(true);
  });

  it('returns false for a bullet moving parallel along the face (no hit)', () => {
    const b = box(1.5, 1.5, 1.5, 0, 0, 5);
    // Bullet sweeps along Y at x=5, well outside the 1.5 half-extent + radius
    expect(bulletHitsBox(v(4, -10, 5), v(4, 10, 5), b, RADIUS)).toBe(false);
  });

  it('detects a 1-unit beam hit (beam along Z, shot from X)', () => {
    // Beam: [1, 10, 1] centred at (5, 0, 0) — thin on X and Z
    const b = new THREE.Box3(v(4.5, -5, -0.5), v(5.5, 5, 0.5));
    // Bullet moves from x=0 to x=8 — passes completely through the 1-unit-wide beam
    expect(bulletHitsBox(v(0, 0, 0), v(8, 0, 0), b, RADIUS)).toBe(true);
  });
});

describe('bulletHitPoint', () => {
  it('returns null on a clean miss', () => {
    const b = box(1.5, 1.5, 1.5, 0, 0, 6);
    expect(bulletHitPoint(v(5, 0, 0), v(5, 0, 4), b, RADIUS)).toBeNull();
  });

  it('returns a point on the near face of the box (head-on)', () => {
    // Box: x[-1.5,1.5] y[-1.5,1.5] z[4.5,7.5]  (centre at z=6)
    const b = box(1.5, 1.5, 1.5, 0, 0, 6);
    const hit = bulletHitPoint(v(0, 0, 0), v(0, 0, 8), b, RADIUS);
    expect(hit).not.toBeNull();
    // Hit should be near the near face (z ≈ 4.5 - RADIUS = 4.43)
    expect(hit!.z).toBeCloseTo(4.5 - RADIUS, 1);
  });

  it('returns surface point when bullet skips through thin plate', () => {
    // 1-unit plate at z[4.5,5.5]; bullet jumps from z=3 to z=6
    const b = new THREE.Box3(v(-5, -5, 4.5), v(5, 5, 5.5));
    const hit = bulletHitPoint(v(0, 0, 3), v(0, 0, 6), b, RADIUS);
    expect(hit).not.toBeNull();
    // Surface entry is at expanded near face: z ≈ 4.5 - RADIUS = 4.43
    expect(hit!.z).toBeGreaterThan(3.0);
    expect(hit!.z).toBeLessThan(5.5);
  });

  it('returns a point on the correct wall face for an X-axis hit', () => {
    // Box: x[8,10] y[-5,5] z[-5,5]; bullet travels along +X
    const b = new THREE.Box3(v(8, -5, -5), v(10, 5, 5));
    const hit = bulletHitPoint(v(0, 0, 0), v(15, 0, 0), b, RADIUS);
    expect(hit).not.toBeNull();
    // Near face is x=8; hit should be just before it (x ≈ 8 - RADIUS)
    expect(hit!.x).toBeCloseTo(8 - RADIUS, 1);
  });
});

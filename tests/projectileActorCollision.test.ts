import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { segmentSphereHitPoint } from "../client/src/game/projectileActorCollision";

describe("segmentSphereHitPoint", () => {
  it("finds the first hit point on a player sphere", () => {
    const hit = segmentSphereHitPoint(
      new THREE.Vector3(-2, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0, 0),
      1,
    );

    expect(hit?.x).toBeCloseTo(-1, 5);
    expect(hit?.y).toBeCloseTo(0, 5);
    expect(hit?.z).toBeCloseTo(0, 5);
  });

  it("returns null when the segment misses", () => {
    const hit = segmentSphereHitPoint(
      new THREE.Vector3(-2, 3, 0),
      new THREE.Vector3(2, 3, 0),
      new THREE.Vector3(0, 0, 0),
      1,
    );

    expect(hit).toBeNull();
  });
});

import { Vector3 } from "three";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clampMagnitude(v: Vector3, max: number): Vector3 {
  if (v.length() > max) {
    v.setLength(max);
  }

  return v;
}

export function lerpVec3(a: Vector3, b: Vector3, t: number): Vector3 {
  return new Vector3().lerpVectors(a, b, t);
}

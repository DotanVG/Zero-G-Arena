/** Plain-object 3D vector — no Three.js dependency. */
export interface Vec3 { x: number; y: number; z: number; }

/** Vec3 math utilities (all return new objects unless name ends in InPlace). */
export const v3 = {
  zero(): Vec3 { return { x: 0, y: 0, z: 0 }; },
  clone(a: Vec3): Vec3 { return { x: a.x, y: a.y, z: a.z }; },
  set(a: Vec3, x: number, y: number, z: number): void { a.x = x; a.y = y; a.z = z; },
  copyTo(src: Vec3, dst: Vec3): void { dst.x = src.x; dst.y = src.y; dst.z = src.z; },

  add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
  sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
  scale(a: Vec3, s: number): Vec3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
  addScaled(a: Vec3, b: Vec3, s: number): Vec3 { return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }; },

  addInPlace(a: Vec3, b: Vec3): void { a.x += b.x; a.y += b.y; a.z += b.z; },
  subInPlace(a: Vec3, b: Vec3): void { a.x -= b.x; a.y -= b.y; a.z -= b.z; },
  scaleInPlace(a: Vec3, s: number): void { a.x *= s; a.y *= s; a.z *= s; },
  addScaledInPlace(a: Vec3, b: Vec3, s: number): void { a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; },

  dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; },
  cross(a: Vec3, b: Vec3): Vec3 {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  },

  lengthSq(a: Vec3): number { return a.x * a.x + a.y * a.y + a.z * a.z; },
  length(a: Vec3): number { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); },
  normalize(a: Vec3): Vec3 {
    const l = v3.length(a);
    return l > 1e-10 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
  },
  normalizeInPlace(a: Vec3): void {
    const l = v3.length(a);
    if (l > 1e-10) { a.x /= l; a.y /= l; a.z /= l; }
  },

  lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  },
  lerpInPlace(a: Vec3, b: Vec3, t: number): void {
    a.x += (b.x - a.x) * t; a.y += (b.y - a.y) * t; a.z += (b.z - a.z) * t;
  },

  clampMagnitude(a: Vec3, max: number): Vec3 {
    const l = v3.length(a);
    return l > max ? v3.scale(a, max / l) : v3.clone(a);
  },
  clampMagnitudeInPlace(a: Vec3, max: number): void {
    const l = v3.length(a);
    if (l > max) { const f = max / l; a.x *= f; a.y *= f; a.z *= f; }
  },

  distSq(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
  },
  dist(a: Vec3, b: Vec3): number { return Math.sqrt(v3.distSq(a, b)); },
};

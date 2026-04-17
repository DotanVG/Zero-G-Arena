export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = {
  zero(): Vec3 {
    return { x: 0, y: 0, z: 0 };
  },

  clone(a: Vec3): Vec3 {
    return { x: a.x, y: a.y, z: a.z };
  },

  add(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  },

  sub(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  },

  scale(a: Vec3, s: number): Vec3 {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
  },

  addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
    return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
  },

  dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },

  cross(a: Vec3, b: Vec3): Vec3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  },

  lengthSq(a: Vec3): number {
    return a.x * a.x + a.y * a.y + a.z * a.z;
  },

  length(a: Vec3): number {
    return Math.sqrt(v3.lengthSq(a));
  },

  normalize(a: Vec3): Vec3 {
    const len = v3.length(a);
    if (len <= 1e-10) return { x: 0, y: 0, z: 0 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
  },

  distSq(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
  },

  dist(a: Vec3, b: Vec3): number {
    return Math.sqrt(v3.distSq(a, b));
  },
};

/**
 * Deterministic procedural arena layout generator (shared between client and server).
 * Uses Mulberry32 seeded RNG so both sides produce identical layouts from the same seed.
 */
import {
  ARENA_SIZE,
  BARS_PER_OBS_MIN,
  BARS_PER_OBS_MAX,
  OBSTACLE_MIN,
  OBSTACLE_MAX,
} from './constants';
import type { ObstacleNetDef, BarDef } from './schema';

// ── Seeded RNG ────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Obstacle archetypes ───────────────────────────────────────────────────────

const ARCHETYPES: Record<string, [number, number, number][]> = {
  box: [
    [3, 3, 3],
    [5, 5, 5],
    [7, 7, 7],
  ],
  plate: [
    [10, 1, 6],
    [8, 1, 8],
    [6, 1, 10],
    [12, 1, 5],
  ],
  beam: [
    [1, 1, 10],
    [1, 10, 1],
    [10, 1, 1],
    [1, 1, 14],
    [14, 1, 1],
  ],
};

// ── Bar generation ────────────────────────────────────────────────────────────

function generateBars(rng: () => number, size: [number, number, number], count: number): BarDef[] {
  const allFaces: { axis: 'x' | 'y' | 'z'; sign: 1 | -1 }[] = [
    { axis: 'x', sign:  1 }, { axis: 'x', sign: -1 },
    { axis: 'y', sign:  1 }, { axis: 'y', sign: -1 },
    { axis: 'z', sign:  1 }, { axis: 'z', sign: -1 },
  ];

  const half = { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 } as Record<string, number>;
  const bars: BarDef[] = [];

  for (let i = 0; i < count; i++) {
    const face = allFaces[i % allFaces.length];
    const { axis, sign } = face;
    const tangents = (['x', 'y', 'z'] as const).filter(a => a !== axis);
    const [ta, tb] = tangents;

    const offA = (rng() * 2 - 1) * half[ta] * 0.6;
    const offB = (rng() * 2 - 1) * half[tb] * 0.6;

    const lp: Record<string, number> = { x: 0, y: 0, z: 0 };
    lp[axis] = sign * (half[axis] + 0.15);
    lp[ta] = offA;
    lp[tb] = offB;

    const norm: Record<string, number> = { x: 0, y: 0, z: 0 };
    norm[axis] = sign;

    bars.push({
      localPos: { x: lp.x, y: lp.y, z: lp.z },
      normal:   { x: norm.x, y: norm.y, z: norm.z },
    });
  }

  return bars;
}

// ── Layout types ──────────────────────────────────────────────────────────────

export interface GeneratedLayout {
  obstacles: ObstacleNetDef[];
  goalAxis:  'x' | 'y' | 'z';
  goalSigns: { team0: 1 | -1; team1: 1 | -1 };
  seed:      number;
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Procedurally generate a random arena layout.
 * Half the obstacles are mirrored on the goalAxis for team symmetry.
 * Safe zone: obstacles avoid portal faces (portal lanes stay clear).
 */
export function generateArenaLayout(seed = Date.now()): GeneratedLayout {
  const rng = mulberry32(seed);
  const goalAxis = 'z' as const;   // always Z — breach rooms always at ±z face
  const count    = OBSTACLE_MIN + Math.floor(rng() * (OBSTACLE_MAX - OBSTACLE_MIN + 1));
  const half     = Math.floor(count / 2);

  const safeLimit    = ARENA_SIZE / 2 - 7;  // stay this far from portal faces
  const placementMax = ARENA_SIZE / 2 - 5;  // stay inside arena

  const obstacles: ObstacleNetDef[] = [];

  for (let i = 0; i < half; i++) {
    const archetypeName = pick(rng, Object.keys(ARCHETYPES));
    const sizeArr = pick(rng, ARCHETYPES[archetypeName]) as [number, number, number];

    const pos = { x: 0, y: 0, z: 0 } as Record<string, number>;
    for (const ax of ['x', 'y', 'z'] as const) {
      if (ax === goalAxis) {
        let v = 0;
        do { v = (rng() * 2 - 1) * safeLimit; }
        while (Math.abs(v) > safeLimit * 0.85);
        pos[ax] = v;
      } else {
        pos[ax] = (rng() * 2 - 1) * placementMax;
      }
    }

    const barCount = BARS_PER_OBS_MIN + Math.floor(rng() * (BARS_PER_OBS_MAX - BARS_PER_OBS_MIN + 1));
    const bars = generateBars(rng, sizeArr, barCount);

    const obs: ObstacleNetDef = {
      pos:       { x: pos.x, y: pos.y, z: pos.z },
      size:      { x: sizeArr[0], y: sizeArr[1], z: sizeArr[2] },
      archetype: archetypeName as 'box' | 'plate' | 'beam',
      bars,
    };

    // Mirror — flip position on goalAxis for symmetry
    const mirrorPos = { ...obs.pos } as Record<string, number>;
    mirrorPos[goalAxis] *= -1;

    const mirrorBars = bars.map(b => ({
      localPos: { ...b.localPos, [goalAxis]: -(b.localPos[goalAxis as keyof typeof b.localPos] as number) },
      normal:   { ...b.normal,   [goalAxis]: -(b.normal[goalAxis   as keyof typeof b.normal]   as number) },
    }));

    obstacles.push(obs);
    obstacles.push({ ...obs, pos: { x: mirrorPos.x, y: mirrorPos.y, z: mirrorPos.z }, bars: mirrorBars });
  }

  return {
    obstacles,
    goalAxis,
    goalSigns: { team0: -1, team1: 1 },
    seed,
  };
}

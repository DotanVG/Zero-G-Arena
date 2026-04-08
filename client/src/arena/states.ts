import {
  ARENA_SIZE,
  BARS_PER_OBS_MIN,
  BARS_PER_OBS_MAX,
  OBSTACLE_MIN,
  OBSTACLE_MAX,
} from '../../../shared/constants';
import type { ObstacleNetDef, BarDef } from '../../../shared/schema';

// -- Legacy preset types (kept for reference) --------------------------------

interface ObstacleDef {
  pos: [number, number, number];
  size: [number, number, number];
}
interface GoalDef {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  team: 0 | 1;
}
interface ArenaConfig {
  id: 'A' | 'B' | 'C';
  goals: [GoalDef, GoalDef];
  obstacles: ObstacleDef[];
}

export const STATE_A: ArenaConfig = {
  id: 'A',
  goals: [
    { axis: 'z', sign: -1, team: 0 },
    { axis: 'z', sign: 1, team: 1 },
  ],
  obstacles: [
    { pos: [0, 0, 0], size: [16, 1, 1] },
    { pos: [0, 0, 0], size: [1, 16, 1] },
    { pos: [8, 8, 0], size: [3, 3, 1] },
    { pos: [-8, -8, 0], size: [3, 3, 1] },
    { pos: [8, -8, 0], size: [3, 3, 1] },
    { pos: [-8, 8, 0], size: [3, 3, 1] },
  ],
};

export const STATE_B: ArenaConfig = {
  id: 'B',
  goals: [
    { axis: 'y', sign: -1, team: 0 },
    { axis: 'y', sign: 1, team: 1 },
  ],
  obstacles: [
    { pos: [10, 0, 10], size: [1, 12, 1] },
    { pos: [-10, 0, 10], size: [1, 12, 1] },
    { pos: [10, 0, -10], size: [1, 12, 1] },
    { pos: [-10, 0, -10], size: [1, 12, 1] },
  ],
};

export const STATE_C: ArenaConfig = {
  id: 'C',
  goals: [
    { axis: 'x', sign: -1, team: 0 },
    { axis: 'x', sign: 1, team: 1 },
  ],
  obstacles: [
    { pos: [0, 8, 8], size: [1, 10, 10] },
    { pos: [0, -8, -8], size: [1, 10, 10] },
    { pos: [0, 8, -8], size: [1, 10, 10] },
    { pos: [0, -8, 8], size: [1, 10, 10] },
  ],
};

export const ARENA_STATES: Record<string, ArenaConfig> = { A: STATE_A, B: STATE_B, C: STATE_C };

// -- Generated layout types ---------------------------------------------------

export interface GeneratedLayout {
  obstacles: ObstacleNetDef[];
  goalAxis: 'x' | 'y' | 'z';
  goalSigns: { team0: 1 | -1; team1: 1 | -1 };
  seed: number;
}

// -- Mulberry32 seeded RNG ----------------------------------------------------
function mulberry32(seed: number): () => number {
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

// Obstacle archetypes: [sizeX, sizeY, sizeZ]
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

/** Generate bar attachment points spread across all 6 obstacle faces with random surface offsets. */
function generateBars(rng: () => number, size: [number, number, number], count: number): BarDef[] {
  const allFaces: { axis: 'x' | 'y' | 'z'; sign: 1 | -1 }[] = [
    { axis: 'x', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'y', sign: 1 },
    { axis: 'y', sign: -1 },
    { axis: 'z', sign: 1 },
    { axis: 'z', sign: -1 },
  ];

  const half = { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 } as Record<string, number>;
  const bars: BarDef[] = [];

  // Distribute bars evenly across all faces, cycling round-robin then randomising offsets
  for (let i = 0; i < count; i++) {
    const face = allFaces[i % allFaces.length];
    const { axis, sign } = face;

    // The two tangent axes on this face
    const tangents = (['x', 'y', 'z'] as const).filter(a => a !== axis);
    const [ta, tb] = tangents;

    // Random position within 60 % of the face extent so bars aren't on the edge
    const offA = (rng() * 2 - 1) * half[ta] * 0.6;
    const offB = (rng() * 2 - 1) * half[tb] * 0.6;

    const lp: Record<string, number> = { x: 0, y: 0, z: 0 };
    lp[axis] = sign * (half[axis] + 0.15);  // just outside the surface
    lp[ta]   = offA;
    lp[tb]   = offB;

    const norm: Record<string, number> = { x: 0, y: 0, z: 0 };
    norm[axis] = sign;

    bars.push({
      localPos: { x: lp.x, y: lp.y, z: lp.z },
      normal:   { x: norm.x, y: norm.y, z: norm.z },
    });
  }

  return bars;
}

/**
 * Procedurally generate a random arena layout.
 * Half the obstacles are mirrored on the goalAxis for symmetry.
 * Safe zone: obstacles avoid ±(ARENA_SIZE/2 - 6) on the goalAxis (keeps portal lanes clear).
 */
export function generateArenaLayout(seed = Date.now()): GeneratedLayout {
  const rng = mulberry32(seed);
  const goalAxis = pick(rng, ['x', 'z'] as const);  // Y-axis excluded (portals must be vertical)
  const count = OBSTACLE_MIN + Math.floor(rng() * (OBSTACLE_MAX - OBSTACLE_MIN + 1));
  const half = Math.floor(count / 2);

  const safeLimit = ARENA_SIZE / 2 - 7; // stay this many units from portal faces
  const placementMax = ARENA_SIZE / 2 - 5; // stay inside arena

  const obstacles: ObstacleNetDef[] = [];

  for (let i = 0; i < half; i++) {
    const archetypeName = pick(rng, Object.keys(ARCHETYPES));
    const sizeArr = pick(rng, ARCHETYPES[archetypeName]) as [number, number, number];

    // Random position - avoid safe zone on goalAxis
    const pos = { x: 0, y: 0, z: 0 } as Record<string, number>;
    for (const ax of ['x', 'y', 'z'] as const) {
      if (ax === goalAxis) {
        // Place away from portal faces
        let v = 0;
        do {
          v = (rng() * 2 - 1) * safeLimit;
        } while (Math.abs(v) > safeLimit * 0.85);
        pos[ax] = v;
      } else {
        pos[ax] = (rng() * 2 - 1) * placementMax;
      }
    }

    const barCount =
      BARS_PER_OBS_MIN + Math.floor(rng() * (BARS_PER_OBS_MAX - BARS_PER_OBS_MIN + 1));
    const bars = generateBars(rng, sizeArr, barCount);

    const obs: ObstacleNetDef = {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      size: { x: sizeArr[0], y: sizeArr[1], z: sizeArr[2] },
      archetype: archetypeName as 'box' | 'plate' | 'beam',
      bars,
    };

    // Mirror: flip position on goalAxis for team symmetry
    const mirrorPos = { ...obs.pos } as Record<string, number>;
    mirrorPos[goalAxis] *= -1;

    const mirrorBars = bars.map((b) => ({
      localPos: { ...b.localPos, [goalAxis]: -b.localPos[goalAxis as keyof typeof b.localPos] },
      normal: { ...b.normal, [goalAxis]: -b.normal[goalAxis as keyof typeof b.normal] },
    }));

    obstacles.push(obs);
    obstacles.push({
      ...obs,
      pos: { x: mirrorPos.x, y: mirrorPos.y, z: mirrorPos.z },
      bars: mirrorBars,
    });
  }

  return {
    obstacles,
    goalAxis,
    goalSigns: { team0: -1, team1: 1 },
    seed,
  };
}

/**
 * Re-exports from shared/arena-gen.ts.
 * Legacy preset configs kept here for reference.
 */
export { generateArenaLayout, type GeneratedLayout } from '../../../shared/arena-gen';

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
    { axis: 'z', sign:  1, team: 1 },
  ],
  obstacles: [
    { pos: [0, 0, 0],   size: [16, 1, 1] },
    { pos: [0, 0, 0],   size: [1, 16, 1] },
    { pos: [8, 8, 0],   size: [3, 3, 1] },
    { pos: [-8, -8, 0], size: [3, 3, 1] },
    { pos: [8, -8, 0],  size: [3, 3, 1] },
    { pos: [-8, 8, 0],  size: [3, 3, 1] },
  ],
};

export const STATE_B: ArenaConfig = {
  id: 'B',
  goals: [
    { axis: 'y', sign: -1, team: 0 },
    { axis: 'y', sign:  1, team: 1 },
  ],
  obstacles: [
    { pos: [10, 0, 10],   size: [1, 12, 1] },
    { pos: [-10, 0, 10],  size: [1, 12, 1] },
    { pos: [10, 0, -10],  size: [1, 12, 1] },
    { pos: [-10, 0, -10], size: [1, 12, 1] },
  ],
};

export const STATE_C: ArenaConfig = {
  id: 'C',
  goals: [
    { axis: 'x', sign: -1, team: 0 },
    { axis: 'x', sign:  1, team: 1 },
  ],
  obstacles: [
    { pos: [0,  8,  8], size: [1, 10, 10] },
    { pos: [0, -8, -8], size: [1, 10, 10] },
    { pos: [0,  8, -8], size: [1, 10, 10] },
    { pos: [0, -8,  8], size: [1, 10, 10] },
  ],
};

export const ARENA_STATES: Record<string, ArenaConfig> = { A: STATE_A, B: STATE_B, C: STATE_C };

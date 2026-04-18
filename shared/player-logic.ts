import type { DamageState, PlayerPhase } from "./schema";
import {
  BREACH_ROOM_D,
  BREACH_ROOM_H,
  BREACH_ROOM_W,
  LEGS_HIT_LAUNCH_FACTOR,
  MAX_LAUNCH_SPEED,
  PLAYER_RADIUS,
} from "./constants";
import type { Vec3 } from "./vec3";
import { v3 } from "./vec3";

export type HitZone = "head" | "body" | "rightArm" | "leftArm" | "legs";

export interface BarGrabPoint {
  pos: Vec3;
  normal?: Vec3;
}

export interface SharedArenaQuery {
  getBreachRoomCenter(team: 0 | 1): Vec3;
  getBreachOpenAxis(team: 0 | 1): "x" | "y" | "z";
  getBreachOpenSign(team: 0 | 1): 1 | -1;
  getAllBarGrabPoints(): Vec3[];
  isGoalDoorOpen(team: 0 | 1): boolean;
  isInBreachRoom(pos: Vec3, team: 0 | 1): boolean;
  isDeepInBreachRoom(pos: Vec3, team: 0 | 1, depth: number): boolean;
  getNearestBar(pos: Vec3, radius: number): BarGrabPoint | null;
}

export interface SharedPlayerState {
  damage: DamageState;
  deaths: number;
  grabbedBarPos: Vec3 | null;
  launchPower: number;
  phase: PlayerPhase;
  vel: Vec3;
}

export interface FreezeCheckActor {
  frozen: boolean;
  team: 0 | 1;
}

export interface CollisionBody {
  active?: boolean;
  anchored?: boolean;
  pos: Vec3;
  radius: number;
}

export function classifyHitZone(
  impactPoint: Vec3,
  playerPos: Vec3,
  playerFacing: Vec3,
  hitOffsetY = 0,
  hitRadius = PLAYER_RADIUS,
): HitZone {
  const local = v3.sub(impactPoint, playerPos);
  // Shift so the hit sphere's centre is y=0, not the physics anchor,
  // then scale by the sphere's own radius so zone thresholds reach
  // regardless of how tight the hit geometry is.
  const yRel = (local.y - hitOffsetY) / hitRadius;

  if (yRel > 0.55) return "head";
  if (yRel > -0.2) {
    const worldUp = { x: 0, y: 1, z: 0 };
    const right = v3.normalize(v3.cross(playerFacing, worldUp));
    const xProj = v3.dot(local, right);
    const armThreshold = hitRadius * 0.55;
    if (xProj > armThreshold) return "rightArm";
    if (xProj < -armThreshold) return "leftArm";
    return "body";
  }
  return "legs";
}

export function maxLaunchPower(damage: DamageState): number {
  return damage.legs
    ? MAX_LAUNCH_SPEED * LEGS_HIT_LAUNCH_FACTOR
    : MAX_LAUNCH_SPEED;
}

export function applyHit(
  state: SharedPlayerState,
  zone: HitZone,
  impulse: Vec3,
): boolean {
  state.vel = v3.add(state.vel, impulse);

  switch (zone) {
    case "head":
    case "body":
      if (!state.damage.frozen) {
        state.damage.frozen = true;
        state.deaths += 1;
      }
      state.phase = "FROZEN";
      state.grabbedBarPos = null;
      return true;
    case "rightArm":
      state.damage.rightArm = true;
      return false;
    case "leftArm":
      state.damage.leftArm = true;
      if (state.phase === "GRABBING" || state.phase === "AIMING") {
        state.phase = "FLOATING";
        state.grabbedBarPos = null;
      }
      return false;
    case "legs":
      state.damage.legs = true;
      state.launchPower = Math.min(state.launchPower, maxLaunchPower(state.damage));
      return false;
  }
}

export function spawnPosition(
  team: 0 | 1,
  arena: Pick<SharedArenaQuery, "getBreachRoomCenter" | "getBreachOpenAxis" | "getBreachOpenSign">,
): Vec3 {
  const center = arena.getBreachRoomCenter(team);
  const openAxis = arena.getBreachOpenAxis(team);
  const openSign = arena.getBreachOpenSign(team);
  const floorY = center.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS + 0.1;
  const backOffset = BREACH_ROOM_D / 2 - PLAYER_RADIUS - 0.5;
  const pos = { x: center.x, y: floorY, z: center.z };
  pos[openAxis] -= openSign * backOffset;
  return pos;
}

export function generateSpawnPositions(
  team: 0 | 1,
  count: number,
  arena: Pick<SharedArenaQuery, "getBreachRoomCenter" | "getBreachOpenAxis" | "getBreachOpenSign">,
  seed = 0,
): Vec3[] {
  if (count <= 0) return [];

  const center = arena.getBreachRoomCenter(team);
  const openAxis = arena.getBreachOpenAxis(team);
  const openSign = arena.getBreachOpenSign(team);
  const backDir = -openSign;
  const rng = createSeededRandom(seed || team + 1);

  const widthAxis: "x" | "z" = openAxis === "x" ? "z" : "x";
  const usableWidth = BREACH_ROOM_W - PLAYER_RADIUS * 2 - 0.04;
  const usableDepth = BREACH_ROOM_D - PLAYER_RADIUS * 2 - 0.08;
  const widthHalf = usableWidth / 2;
  const depthHalf = usableDepth / 2;
  const minSpacing = PLAYER_RADIUS * 2 + 0.04;
  const floorY = center.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS + 0.08;
  const ceilingY = center.y + BREACH_ROOM_H / 2 - PLAYER_RADIUS - 0.08;
  const slots: Vec3[] = [];

  let attempts = 0;
  while (slots.length < count && attempts < 12000) {
    attempts += 1;

    const pos = { x: center.x, y: floorY, z: center.z };
    pos[widthAxis] = center[widthAxis] + lerp(-widthHalf, widthHalf, rng());
    pos.y = lerp(floorY, ceilingY, Math.pow(rng(), 0.92));
    const localDepth = depthHalf - usableDepth * Math.pow(rng(), 0.78);
    pos[openAxis] = center[openAxis] + localDepth * backDir;

    if (slots.every((slot) => v3.dist(slot, pos) >= minSpacing)) {
      slots.push(pos);
    }
  }

  if (slots.length < count) {
    const fallback = createSpawnLattice(
      count - slots.length,
      center,
      openAxis,
      widthAxis,
      widthHalf,
      depthHalf,
      floorY,
      ceilingY,
      backDir,
      minSpacing,
    );
    for (const slot of fallback) {
      if (slots.every((existing) => v3.dist(existing, slot) >= minSpacing * 0.98)) {
        slots.push(slot);
      }
      if (slots.length >= count) break;
    }
  }

  relaxSpawnSlots(slots, openAxis, widthAxis, center, widthHalf, depthHalf, floorY, ceilingY, backDir, minSpacing);
  return slots.slice(0, count);
}

export function findFullFreezeWinner(actors: FreezeCheckActor[]): 0 | 1 | null {
  const team0 = actors.filter((actor) => actor.team === 0);
  const team1 = actors.filter((actor) => actor.team === 1);
  if (team0.length === 0 || team1.length === 0) return null;

  const team0Frozen = team0.every((actor) => actor.frozen);
  const team1Frozen = team1.every((actor) => actor.frozen);
  if (team0Frozen === team1Frozen) return null;
  return team0Frozen ? 1 : 0;
}

export function resolveActorCollisions(
  actors: CollisionBody[],
  iterations = 2,
): boolean {
  let moved = false;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (actor.active === false) continue;

      for (let j = i + 1; j < actors.length; j += 1) {
        const other = actors[j];
        if (other.active === false) continue;

        const delta = v3.sub(other.pos, actor.pos);
        const minDistance = actor.radius + other.radius;
        const distSq = v3.lengthSq(delta);
        if (distSq >= minDistance * minDistance) continue;

        const normal = distSq > 1e-8
          ? v3.scale(delta, 1 / Math.sqrt(distSq))
          : fallbackCollisionNormal(i, j);
        const distance = distSq > 1e-8 ? Math.sqrt(distSq) : 0;
        const overlap = minDistance - distance;

        let actorWeight = actor.anchored ? 0 : 1;
        let otherWeight = other.anchored ? 0 : 1;
        if (actorWeight + otherWeight <= 0) {
          actorWeight = 1;
          otherWeight = 1;
        }

        const actorPush = overlap * (actorWeight / (actorWeight + otherWeight));
        const otherPush = overlap * (otherWeight / (actorWeight + otherWeight));

        actor.pos.x -= normal.x * actorPush;
        actor.pos.y -= normal.y * actorPush;
        actor.pos.z -= normal.z * actorPush;

        other.pos.x += normal.x * otherPush;
        other.pos.y += normal.y * otherPush;
        other.pos.z += normal.z * otherPush;
        moved = true;
      }
    }
  }

  return moved;
}

function fallbackCollisionNormal(i: number, j: number): Vec3 {
  const angle = ((i + 1) * 17 + (j + 1) * 31) * 0.37;
  return {
    x: Math.cos(angle),
    y: 0,
    z: Math.sin(angle),
  };
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function relaxSpawnSlots(
  slots: Vec3[],
  depthAxis: "x" | "y" | "z",
  widthAxis: "x" | "z",
  center: Vec3,
  widthHalf: number,
  depthHalf: number,
  floorY: number,
  ceilingY: number,
  backDir: number,
  minSpacing: number,
): void {
  if (slots.length <= 1) return;

  for (let iteration = 0; iteration < 16; iteration += 1) {
    resolveActorCollisions(
      slots.map((pos) => ({
        pos,
        radius: minSpacing / 2,
      })),
      1,
    );

    for (const slot of slots) {
      const lateral = clampValue(slot[widthAxis] - center[widthAxis], -widthHalf, widthHalf);
      const depth = clampValue((slot[depthAxis] - center[depthAxis]) * backDir, -depthHalf, depthHalf);
      slot[widthAxis] = center[widthAxis] + lateral;
      slot[depthAxis] = center[depthAxis] + depth * backDir;
      slot.y = clampValue(slot.y, floorY, ceilingY);
    }
  }
}

function createSpawnLattice(
  count: number,
  center: Vec3,
  depthAxis: "x" | "y" | "z",
  widthAxis: "x" | "z",
  widthHalf: number,
  depthHalf: number,
  floorY: number,
  ceilingY: number,
  backDir: number,
  minSpacing: number,
): Vec3[] {
  const heightSpan = Math.max(0, ceilingY - floorY);
  const positions: Vec3[] = [];
  const widthStep = minSpacing;
  const heightStep = minSpacing * 0.92;
  const depthStep = minSpacing * 0.86;

  for (let layer = 0; positions.length < count; layer += 1) {
    const localDepth = Math.min(depthHalf, depthHalf - layer * depthStep);
    if (localDepth < -depthHalf) break;

    for (let row = 0; positions.length < count; row += 1) {
      const y = floorY + row * heightStep;
      if (y > ceilingY + 1e-6) break;

      const rowShift = row % 2 === 0 ? 0 : widthStep * 0.5;
      for (let col = 0; positions.length < count; col += 1) {
        const x = -widthHalf + col * widthStep + rowShift;
        if (x > widthHalf + 1e-6) break;

        const pos = { x: center.x, y, z: center.z };
        pos[widthAxis] = center[widthAxis] + x;
        pos[depthAxis] = center[depthAxis] + localDepth * backDir;
        positions.push(pos);
      }
    }
  }

  return positions;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

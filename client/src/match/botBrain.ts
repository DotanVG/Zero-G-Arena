import { GRAB_RADIUS } from "../../../shared/constants";
import type { SharedArenaQuery } from "../../../shared/player-logic";
import type { DamageState, PlayerPhase } from "../../../shared/schema";
import type { Vec3 } from "../../../shared/vec3";
import { v3 } from "../../../shared/vec3";

const DEFAULT_WORLD_UP = { x: 0, y: 1, z: 0 } as const;
const MAX_FOCUS_RANGE = 28;
const ROUTE_REACH_DISTANCE = GRAB_RADIUS * 1.25;
const BAR_LINK_DISTANCE = 9;

type BotArchetype = "sprinter" | "hunter" | "drifter" | "anchor" | "rookie";

export interface BotSnapshot {
  currentBreachTeam: 0 | 1;
  damage: DamageState;
  phase: PlayerPhase;
  pos: Vec3;
  rot: { yaw: number; pitch: number };
  team: 0 | 1;
}

export interface EnemySnapshot {
  id: string;
  phase: PlayerPhase;
  pos: Vec3;
  team: 0 | 1;
}

export interface BotCommand {
  aimHeld: boolean;
  fire: boolean;
  fireDirection: Vec3 | null;
  grab: boolean;
  lookPitch: number;
  lookYaw: number;
  targetBar: Vec3 | null;
  walkAxes: { x: number; z: number };
}

export interface BarSelectionTuning {
  directionWeight?: number;
  distanceWeight?: number;
  lateralBias?: number;
  verticalBias?: number;
  noiseSeed?: number;
  pathNoise?: number;
}

export interface BotPersonality {
  aimNoise: number;
  aimReleaseMax: number;
  aimReleaseMin: number;
  archetype: BotArchetype;
  barDirectionWeight: number;
  barDistanceWeight: number;
  barLateralBias: number;
  barVerticalBias: number;
  breachForwardBias: number;
  breachStrafeAmplitude: number;
  breachWeaveSpeed: number;
  decisionInterval: number;
  enemyFocusBias: number;
  fireCooldown: number;
  fireRange: number;
  grabDecisionDelay: number;
  launchChargeSeconds: number;
  pathNoise: number;
  routeLengthMax: number;
  routeLengthMin: number;
  rngSeed: number;
  shotSpreadBase: number;
  weaveOffset: number;
}

export interface BarRouteGraph {
  nodes: Array<{
    neighbors: number[];
    pos: Vec3;
  }>;
}

export function buildBarGraph(bars: Vec3[]): BarRouteGraph {
  return {
    nodes: bars.map((pos, index) => ({
      pos: v3.clone(pos),
      neighbors: bars
        .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
        .filter(({ candidateIndex }) => candidateIndex !== index)
        .filter(({ candidate }) => v3.dist(candidate, pos) <= BAR_LINK_DISTANCE)
        .map(({ candidateIndex }) => candidateIndex),
    })),
  };
}

export function pickPreferredBar(
  botPos: Vec3,
  bars: Vec3[],
  preferredDirection: Vec3,
  tuning: BarSelectionTuning = {},
): Vec3 | null {
  const preferred = v3.normalize(preferredDirection);
  const lateralRaw = v3.cross(DEFAULT_WORLD_UP, preferred);
  const lateral = v3.lengthSq(lateralRaw) > 1e-6
    ? v3.normalize(lateralRaw)
    : { x: 1, y: 0, z: 0 };
  let bestBar: Vec3 | null = null;
  let bestScore = -Infinity;

  for (const bar of bars) {
    const toBar = v3.sub(bar, botPos);
    const distance = v3.length(toBar);
    if (distance <= 1e-6) return v3.clone(bar);

    const normal = v3.normalize(toBar);
    const directionScore = v3.dot(normal, preferred);
    const distanceScore = 1 / Math.max(distance, 0.001);
    const lateralScore = v3.dot(normal, lateral);
    const verticalScore = normal.y;
    const noiseScore = sampleBarNoise(bar, tuning.noiseSeed ?? 0);
    const score = directionScore * (tuning.directionWeight ?? 3)
      + distanceScore * (tuning.distanceWeight ?? 1)
      + lateralScore * (tuning.lateralBias ?? 0)
      + verticalScore * (tuning.verticalBias ?? 0)
      + noiseScore * (tuning.pathNoise ?? 0);

    if (score > bestScore) {
      bestScore = score;
      bestBar = v3.clone(bar);
    }
  }

  return bestBar;
}

function directionToRotation(dir: Vec3): { yaw: number; pitch: number } {
  const normal = v3.normalize(dir);
  return {
    yaw: Math.atan2(-normal.x, -normal.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, normal.y))),
  };
}

function breachExitDirection(arena: SharedArenaQuery, team: 0 | 1): Vec3 {
  const axis = arena.getBreachOpenAxis(team);
  const sign = arena.getBreachOpenSign(team);
  return axis === "x"
    ? { x: sign, y: 0, z: 0 }
    : axis === "y"
      ? { x: 0, y: sign, z: 0 }
      : { x: 0, y: 0, z: sign };
}

function findNearestEnemy(
  bot: BotSnapshot,
  enemies: EnemySnapshot[],
  maxDistance = MAX_FOCUS_RANGE,
): EnemySnapshot | null {
  let best: EnemySnapshot | null = null;
  let bestDistance = maxDistance;

  for (const enemy of enemies) {
    if (enemy.team === bot.team) continue;
    if (enemy.phase === "FROZEN" || enemy.phase === "RESPAWNING") continue;
    const distance = v3.dist(bot.pos, enemy.pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }

  return best;
}

export function createBotPersonality(id: string, team: 0 | 1): BotPersonality {
  const seeded = createSeededRandom(hashString(`${id}:${team}`));
  const archetypes: BotArchetype[] = ["sprinter", "hunter", "drifter", "anchor", "rookie"];
  const archetype = archetypes[Math.floor(seeded() * archetypes.length)];
  const sideBias = seeded() < 0.5 ? -1 : 1;
  const profile = createArchetypeProfile(archetype, seeded, sideBias);
  profile.rngSeed = hashString(`${id}:${team}:rng`);
  return profile;
}

export class BotBrain {
  private aimProgress = 0;
  private currentRoute: number[] = [];
  private decisionTimer = 0;
  private fireCooldown = 0;
  private grabDelay = 0;
  private lastPhase: PlayerPhase | null = null;
  private lastWaypointDistance = Infinity;
  private releaseThreshold = 0;
  private roamTime = 0;
  private roundRouteLength = 2;
  private roundSeed = 0;
  private roundShotSpread = 0;
  private rngState = 0;
  private stuckTimer = 0;

  public constructor(
    private readonly personality: BotPersonality = createBotPersonality("bot-default", 0),
  ) {
    this.resetForRound(1);
  }

  public resetForRound(roundSeed: number): void {
    this.roundSeed = roundSeed;
    this.rngState = hashString(`${this.personality.rngSeed}:${roundSeed}`) >>> 0;
    this.currentRoute = [];
    this.decisionTimer = 0;
    this.fireCooldown = 0;
    this.grabDelay = 0;
    this.lastPhase = null;
    this.lastWaypointDistance = Infinity;
    this.releaseThreshold = this.randomReleaseThreshold();
    this.roundRouteLength = this.personality.routeLengthMin
      + Math.floor(
        this.nextRandom() * (this.personality.routeLengthMax - this.personality.routeLengthMin + 1),
      );
    this.roundShotSpread = this.personality.shotSpreadBase * (1.1 + this.nextRandom() * 1.35);
    this.stuckTimer = 0;
  }

  public tick(
    bot: BotSnapshot,
    arena: SharedArenaQuery,
    graph: BarRouteGraph,
    enemies: EnemySnapshot[],
    dt: number,
  ): BotCommand {
    this.roamTime += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.decisionTimer = Math.max(0, this.decisionTimer - dt);

    if (bot.phase !== this.lastPhase) {
      this.handlePhaseChange(bot.phase, bot, graph, arena);
      this.lastPhase = bot.phase;
    }

    this.advanceRoute(bot.pos, graph, dt);

    const enemyPortal = arena.getBreachRoomCenter((1 - bot.team) as 0 | 1);
    const focusEnemy = findNearestEnemy(
      bot,
      enemies,
      Math.min(MAX_FOCUS_RANGE, this.personality.fireRange * (0.8 + this.personality.enemyFocusBias)),
    );
    const firingEnemy = findNearestEnemy(bot, enemies, this.personality.fireRange);
    let routeTarget = this.getRouteTarget(graph);

    if (this.shouldReplan(bot, routeTarget)) {
      this.planRoute(bot.pos, enemyPortal, graph);
      routeTarget = this.getRouteTarget(graph);
    }

    const movementTarget = this.getMovementTarget(bot, enemyPortal, graph);
    let lookDir = this.applyAimNoise(v3.sub(movementTarget, bot.pos));
    let look = directionToRotation(lookDir);
    let walkAxes = { x: 0, z: 0 };
    let grab = false;
    let aimHeld = false;

    if (bot.phase === "BREACH") {
      lookDir = breachExitDirection(arena, bot.currentBreachTeam);
      look = directionToRotation(lookDir);
      walkAxes = {
        x: Math.max(
          -1,
          Math.min(
            1,
            Math.sin(this.roamTime * this.personality.breachWeaveSpeed + this.personality.weaveOffset)
              * this.personality.breachStrafeAmplitude,
          ),
        ),
        z: this.personality.breachForwardBias,
      };
    } else if (bot.phase === "FLOATING") {
      if (routeTarget && v3.dist(bot.pos, routeTarget) <= ROUTE_REACH_DISTANCE && !bot.damage.leftArm) {
        grab = true;
      }
    } else if (bot.phase === "GRABBING") {
      this.grabDelay = Math.max(0, this.grabDelay - dt);
      aimHeld = this.grabDelay <= 0 && !bot.damage.frozen && !bot.damage.leftArm;
    } else if (bot.phase === "AIMING") {
      this.aimProgress = Math.min(1, this.aimProgress + dt / this.personality.launchChargeSeconds);
      aimHeld = this.aimProgress < this.releaseThreshold;
      if (!aimHeld) {
        this.aimProgress = 0;
        this.releaseThreshold = this.randomReleaseThreshold();
      }
      const launchTarget = this.getLaunchTarget(bot, enemyPortal, graph);
      look = directionToRotation(this.applyAimNoise(v3.sub(launchTarget, bot.pos)));
    } else if (bot.phase === "FROZEN") {
      this.aimProgress = 0;
      this.currentRoute = [];
    }

    let fire = false;
    let fireDirection: Vec3 | null = null;
    const canFire =
      bot.phase !== "FROZEN"
      && bot.phase !== "RESPAWNING"
      && !bot.damage.rightArm
      && !bot.damage.frozen;
    if (canFire && firingEnemy && this.fireCooldown <= 0) {
      fire = true;
      fireDirection = this.sampleFireDirection(v3.sub(firingEnemy.pos, bot.pos), bot.phase);
      this.fireCooldown = this.personality.fireCooldown;
    }

    return {
      aimHeld,
      fire,
      fireDirection,
      grab,
      lookPitch: look.pitch,
      lookYaw: look.yaw,
      targetBar: routeTarget ? v3.clone(routeTarget) : null,
      walkAxes,
    };
  }

  public getLaunchChargeSeconds(): number {
    return this.personality.launchChargeSeconds;
  }

  private advanceRoute(botPos: Vec3, graph: BarRouteGraph, dt: number): void {
    const routeTarget = this.getRouteTarget(graph);
    if (!routeTarget) {
      this.lastWaypointDistance = Infinity;
      this.stuckTimer = 0;
      return;
    }

    const distance = v3.dist(botPos, routeTarget);
    if (distance <= ROUTE_REACH_DISTANCE) {
      this.currentRoute.shift();
      this.lastWaypointDistance = Infinity;
      this.stuckTimer = 0;
      return;
    }

    if (distance >= this.lastWaypointDistance - 0.05) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    this.lastWaypointDistance = distance;
  }

  private applyAimNoise(dir: Vec3): Vec3 {
    if (this.personality.aimNoise <= 1e-4) return dir;
    return {
      x: dir.x + Math.sin(this.roamTime * 2.7 + this.personality.weaveOffset) * this.personality.aimNoise,
      y: dir.y + Math.cos(this.roamTime * 1.9 + this.personality.weaveOffset * 0.7) * this.personality.aimNoise * 0.45,
      z: dir.z + Math.sin(this.roamTime * 2.1 - this.personality.weaveOffset * 0.4) * this.personality.aimNoise,
    };
  }

  private getLaunchTarget(
    bot: BotSnapshot,
    enemyPortal: Vec3,
    graph: BarRouteGraph,
  ): Vec3 {
    const routeTarget = this.getRouteTarget(graph);
    if (routeTarget) return routeTarget;
    return v3.add(enemyPortal, {
      x: this.personality.barLateralBias * 4,
      y: this.personality.barVerticalBias * 2,
      z: 0,
    });
  }

  private getMovementTarget(
    bot: BotSnapshot,
    enemyPortal: Vec3,
    graph: BarRouteGraph,
  ): Vec3 {
    const routeTarget = this.getRouteTarget(graph);
    if (routeTarget) return routeTarget;
    const fallback = pickPreferredBar(
      bot.pos,
      graph.nodes.map((node) => node.pos),
      v3.sub(enemyPortal, bot.pos),
      {
        directionWeight: this.personality.barDirectionWeight,
        distanceWeight: this.personality.barDistanceWeight,
        lateralBias: this.personality.barLateralBias,
        verticalBias: this.personality.barVerticalBias,
        noiseSeed: this.roundSeed,
        pathNoise: this.personality.pathNoise,
      },
    );
    return fallback ?? enemyPortal;
  }

  private getRouteTarget(graph: BarRouteGraph): Vec3 | null {
    const nextNode = this.currentRoute[0];
    if (nextNode === undefined) return null;
    return graph.nodes[nextNode]?.pos ?? null;
  }

  private handlePhaseChange(
    phase: PlayerPhase,
    bot: BotSnapshot,
    graph: BarRouteGraph,
    arena: SharedArenaQuery,
  ): void {
    if (phase === "GRABBING") {
      this.advanceRoute(bot.pos, graph, 0);
      this.grabDelay = this.personality.grabDecisionDelay;
      this.aimProgress = 0;
      return;
    }

    if (phase === "AIMING") {
      if (this.currentRoute.length === 0) {
        const enemyPortal = arena.getBreachRoomCenter((1 - bot.team) as 0 | 1);
        this.planRoute(bot.pos, enemyPortal, graph);
      }
      this.aimProgress = 0;
      this.releaseThreshold = this.randomReleaseThreshold();
      return;
    }

    if (phase !== "FLOATING") {
      this.currentRoute = [];
      this.stuckTimer = 0;
    }
  }

  private nextRandom(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private planRoute(botPos: Vec3, enemyPortal: Vec3, graph: BarRouteGraph): void {
    if (graph.nodes.length === 0) {
      this.currentRoute = [];
      this.decisionTimer = this.personality.decisionInterval;
      return;
    }

    const startNode = findNearestBarNode(botPos, graph.nodes.map((node) => node.pos));
    const targetNode = this.pickRouteDestination(startNode, botPos, enemyPortal, graph);
    if (targetNode === null) {
      this.currentRoute = [];
      this.decisionTimer = this.personality.decisionInterval;
      return;
    }

    const path = findShortestPath(graph, startNode, targetNode);
    this.currentRoute = path.slice(0, this.roundRouteLength);
    this.decisionTimer = this.personality.decisionInterval;
    this.stuckTimer = 0;
    this.lastWaypointDistance = Infinity;
  }

  private pickRouteDestination(
    startNode: number | null,
    botPos: Vec3,
    enemyPortal: Vec3,
    graph: BarRouteGraph,
  ): number | null {
    let bestIndex: number | null = null;
    let bestScore = -Infinity;
    const preferredDirection = v3.sub(enemyPortal, botPos);
    const preferred = v3.normalize(preferredDirection);
    const lateralRaw = v3.cross(DEFAULT_WORLD_UP, preferred);
    const lateral = v3.lengthSq(lateralRaw) > 1e-6
      ? v3.normalize(lateralRaw)
      : { x: 1, y: 0, z: 0 };

    for (let i = 0; i < graph.nodes.length; i += 1) {
      if (i === startNode) continue;
      const node = graph.nodes[i];
      const toNode = v3.sub(node.pos, botPos);
      const distance = v3.length(toNode);
      if (distance <= 1e-6) continue;

      const normal = v3.normalize(toNode);
      const directionScore = v3.dot(normal, preferred) * this.personality.barDirectionWeight;
      const lateralScore = v3.dot(normal, lateral) * this.personality.barLateralBias;
      const verticalScore = normal.y * this.personality.barVerticalBias;
      const distanceScore = (1 / Math.max(distance, 0.001)) * this.personality.barDistanceWeight;
      const routeNoise = (this.nextRandom() * 2 - 1) * this.personality.pathNoise;
      const score = directionScore + lateralScore + verticalScore + distanceScore + routeNoise;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  private randomReleaseThreshold(): number {
    return this.personality.aimReleaseMin
      + this.nextRandom() * (this.personality.aimReleaseMax - this.personality.aimReleaseMin);
  }

  private sampleFireDirection(targetDir: Vec3, phase: PlayerPhase): Vec3 {
    const spread = this.roundShotSpread
      + phaseSpreadModifier(phase)
      + this.personality.shotSpreadBase * (0.2 + this.nextRandom() * 0.95);
    return jitterDirection(v3.normalize(targetDir), spread, this.nextRandom.bind(this));
  }

  private shouldReplan(bot: BotSnapshot, routeTarget: Vec3 | null): boolean {
    if (bot.phase !== "FLOATING" && bot.phase !== "AIMING" && bot.phase !== "GRABBING") {
      return false;
    }
    if (!routeTarget) return true;
    if (this.decisionTimer <= 0) return true;
    if (this.stuckTimer >= 1.15) return true;
    return false;
  }
}

function createArchetypeProfile(
  archetype: BotArchetype,
  seeded: () => number,
  sideBias: 1 | -1,
): BotPersonality {
  const base = {
    aimNoise: 0.12,
    aimReleaseMax: 0.88,
    aimReleaseMin: 0.7,
    archetype,
    barDirectionWeight: 3,
    barDistanceWeight: 1,
    barLateralBias: sideBias * 0.25,
    barVerticalBias: 0,
    breachForwardBias: 1,
    breachStrafeAmplitude: 0.18,
    breachWeaveSpeed: 1.6,
    decisionInterval: 0.4,
    enemyFocusBias: 0.5,
    fireCooldown: 0.55,
    fireRange: 18,
    grabDecisionDelay: 0.12,
    launchChargeSeconds: 0.9,
    pathNoise: 0.08,
    routeLengthMax: 3,
    routeLengthMin: 2,
    rngSeed: 0,
    shotSpreadBase: 0.06,
    weaveOffset: seeded() * Math.PI * 2,
  } satisfies BotPersonality;

  if (archetype === "sprinter") {
    base.aimNoise = 0.16 + seeded() * 0.08;
    base.barDistanceWeight = 1.4 + seeded() * 0.4;
    base.barLateralBias = sideBias * (0.18 + seeded() * 0.3);
    base.breachStrafeAmplitude = 0.2 + seeded() * 0.12;
    base.decisionInterval = 0.18 + seeded() * 0.16;
    base.enemyFocusBias = 0.34 + seeded() * 0.18;
    base.fireCooldown = 0.42 + seeded() * 0.18;
    base.fireRange = 15 + seeded() * 2.5;
    base.grabDecisionDelay = 0.02 + seeded() * 0.08;
    base.launchChargeSeconds = 0.58 + seeded() * 0.18;
    base.pathNoise = 0.12 + seeded() * 0.12;
    base.routeLengthMin = 2;
    base.routeLengthMax = 3;
    base.shotSpreadBase = 0.1 + seeded() * 0.035;
  } else if (archetype === "hunter") {
    base.aimNoise = 0.04 + seeded() * 0.06;
    base.aimReleaseMin = 0.74 + seeded() * 0.06;
    base.aimReleaseMax = 0.86 + seeded() * 0.08;
    base.barDirectionWeight = 3.2 + seeded() * 0.7;
    base.barDistanceWeight = 0.7 + seeded() * 0.35;
    base.barVerticalBias = -0.18 + seeded() * 0.36;
    base.breachStrafeAmplitude = 0.08 + seeded() * 0.08;
    base.decisionInterval = 0.22 + seeded() * 0.18;
    base.enemyFocusBias = 0.82 + seeded() * 0.18;
    base.fireCooldown = 0.34 + seeded() * 0.14;
    base.fireRange = 20 + seeded() * 4;
    base.grabDecisionDelay = 0.04 + seeded() * 0.1;
    base.launchChargeSeconds = 0.74 + seeded() * 0.16;
    base.pathNoise = 0.03 + seeded() * 0.04;
    base.routeLengthMin = 2;
    base.routeLengthMax = 4;
    base.shotSpreadBase = 0.04 + seeded() * 0.025;
  } else if (archetype === "drifter") {
    base.aimNoise = 0.24 + seeded() * 0.2;
    base.aimReleaseMin = 0.62 + seeded() * 0.06;
    base.aimReleaseMax = 0.82 + seeded() * 0.1;
    base.barDirectionWeight = 2.1 + seeded() * 0.55;
    base.barDistanceWeight = 0.95 + seeded() * 0.4;
    base.barLateralBias = sideBias * (0.72 + seeded() * 0.4);
    base.barVerticalBias = -0.45 + seeded() * 0.9;
    base.breachStrafeAmplitude = 0.44 + seeded() * 0.22;
    base.breachWeaveSpeed = 1.2 + seeded() * 0.7;
    base.decisionInterval = 0.38 + seeded() * 0.32;
    base.enemyFocusBias = 0.22 + seeded() * 0.16;
    base.fireCooldown = 0.62 + seeded() * 0.22;
    base.fireRange = 13 + seeded() * 3;
    base.grabDecisionDelay = 0.12 + seeded() * 0.2;
    base.launchChargeSeconds = 0.88 + seeded() * 0.26;
    base.pathNoise = 0.2 + seeded() * 0.18;
    base.routeLengthMin = 3;
    base.routeLengthMax = 4;
    base.shotSpreadBase = 0.12 + seeded() * 0.05;
  } else if (archetype === "anchor") {
    base.aimNoise = 0.08 + seeded() * 0.12;
    base.aimReleaseMin = 0.78 + seeded() * 0.08;
    base.aimReleaseMax = 0.9 + seeded() * 0.06;
    base.barDirectionWeight = 3.6 + seeded() * 0.7;
    base.barDistanceWeight = 0.45 + seeded() * 0.22;
    base.barLateralBias = sideBias * (0.06 + seeded() * 0.12);
    base.barVerticalBias = -0.1 + seeded() * 0.2;
    base.breachForwardBias = 0.82 + seeded() * 0.1;
    base.breachStrafeAmplitude = 0.04 + seeded() * 0.08;
    base.decisionInterval = 0.36 + seeded() * 0.2;
    base.enemyFocusBias = 0.48 + seeded() * 0.18;
    base.fireCooldown = 0.44 + seeded() * 0.18;
    base.fireRange = 18 + seeded() * 3;
    base.grabDecisionDelay = 0.08 + seeded() * 0.12;
    base.launchChargeSeconds = 0.92 + seeded() * 0.16;
    base.pathNoise = 0.02 + seeded() * 0.05;
    base.routeLengthMin = 2;
    base.routeLengthMax = 3;
    base.shotSpreadBase = 0.06 + seeded() * 0.03;
  } else {
    base.aimNoise = 0.42 + seeded() * 0.22;
    base.aimReleaseMin = 0.58 + seeded() * 0.08;
    base.aimReleaseMax = 0.84 + seeded() * 0.12;
    base.barDirectionWeight = 2.05 + seeded() * 0.4;
    base.barDistanceWeight = 1.1 + seeded() * 0.35;
    base.barLateralBias = sideBias * (0.28 + seeded() * 0.22);
    base.barVerticalBias = -0.24 + seeded() * 0.5;
    base.breachForwardBias = 0.72 + seeded() * 0.16;
    base.breachStrafeAmplitude = 0.16 + seeded() * 0.14;
    base.breachWeaveSpeed = 0.95 + seeded() * 0.45;
    base.decisionInterval = 0.58 + seeded() * 0.34;
    base.enemyFocusBias = 0.12 + seeded() * 0.22;
    base.fireCooldown = 0.74 + seeded() * 0.26;
    base.fireRange = 11 + seeded() * 4;
    base.grabDecisionDelay = 0.18 + seeded() * 0.28;
    base.launchChargeSeconds = 1 + seeded() * 0.24;
    base.pathNoise = 0.16 + seeded() * 0.18;
    base.routeLengthMin = 2;
    base.routeLengthMax = 3;
    base.shotSpreadBase = 0.15 + seeded() * 0.06;
  }

  return base;
}

function findNearestBarNode(botPos: Vec3, bars: Vec3[]): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < bars.length; i += 1) {
    const distance = v3.distSq(botPos, bars[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function findShortestPath(
  graph: BarRouteGraph,
  startNode: number | null,
  targetNode: number,
): number[] {
  if (startNode === null || startNode === targetNode) return [targetNode];

  const queue = [startNode];
  const visited = new Set<number>([startNode]);
  const parent = new Map<number, number | null>([[startNode, null]]);

  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (current === targetNode) break;

    for (const neighbor of graph.nodes[current]?.neighbors ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  if (!parent.has(targetNode)) return [targetNode];

  const path: number[] = [];
  let current: number | null = targetNode;
  while (current !== null) {
    path.push(current);
    current = parent.get(current) ?? null;
  }
  path.reverse();
  return path.slice(1);
}

function jitterDirection(
  dir: Vec3,
  spread: number,
  random: () => number,
): Vec3 {
  if (spread <= 1e-6) return dir;

  const referenceUp = Math.abs(dir.y) > 0.92 ? { x: 1, y: 0, z: 0 } : DEFAULT_WORLD_UP;
  const right = v3.normalize(v3.cross(dir, referenceUp));
  const up = v3.normalize(v3.cross(right, dir));
  const yawOffset = (random() * 2 - 1) * spread;
  const pitchOffset = (random() * 2 - 1) * spread * 0.8;
  return v3.normalize(
    v3.add(
      dir,
      v3.add(v3.scale(right, yawOffset), v3.scale(up, pitchOffset)),
    ),
  );
}

function phaseSpreadModifier(phase: PlayerPhase): number {
  if (phase === "AIMING") return 0.024;
  if (phase === "GRABBING") return 0.038;
  if (phase === "FLOATING") return 0.065;
  return 0.085;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function sampleBarNoise(bar: Vec3, seed: number): number {
  const wave = Math.sin(bar.x * 12.9898 + bar.y * 78.233 + bar.z * 37.719 + seed * 0.001);
  return (wave - Math.floor(wave)) * 2 - 1;
}

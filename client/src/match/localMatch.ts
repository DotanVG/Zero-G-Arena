import * as THREE from "three";
import { BOT_NAMES, GRAB_RADIUS, PLAYER_RADIUS } from "../../../shared/constants";
import { getSoloBotFill, type SoloMatchConfig } from "../../../shared/match";
import {
  classifyHitZone,
  findFullFreezeWinner,
  generateSpawnPositions,
  maxLaunchPower,
  resolveActorCollisions,
} from "../../../shared/player-logic";
import type { EnemyPlayerInfo, FullPlayerInfo, PlayerPhase, DamageState } from "../../../shared/schema";
import type { Vec3 } from "../../../shared/vec3";
import { v3 } from "../../../shared/vec3";
import { Arena } from "../arena/arena";
import { CameraController } from "../camera";
import {
  bounceArena,
  clampBreachRoom,
  integrateBreachRoom,
  integrateZeroG,
  type PhysicsState,
} from "../physics";
import { LocalPlayer } from "../player";
import { ArenaQueryAdapter } from "./arenaQueryAdapter";
import {
  buildBarGraph,
  type BarRouteGraph,
  BotBrain,
  createBotPersonality,
} from "./botBrain";
import { buildHudRosters } from "./rosterView";
import { SimulatedPlayerAvatar } from "./simulatedPlayerAvatar";

const LOCAL_PLAYER_ID = "local-player";

export interface ProjectileActorTarget {
  active: boolean;
  id: string;
  pos: THREE.Vector3;
  radius: number;
  team: 0 | 1;
}

export interface ProjectileHitEvent {
  direction: THREE.Vector3;
  impactPoint: THREE.Vector3;
  ownerId: string;
  targetId: string;
}

export interface SpawnProjectileEvent {
  direction: THREE.Vector3;
  origin: THREE.Vector3;
  ownerId: string;
  team: 0 | 1;
}

export type LocalMatchEvent =
  | {
    type: "hitConfirm";
    team: 0 | 1;
  }
  | {
    type: "freeze";
    killerName: string;
    killerTeam: 0 | 1;
    victimName: string;
    victimTeam: 0 | 1;
  }
  | {
    type: "score";
    scorerName: string;
    scorerTeam: 0 | 1;
  }
  | {
    type: "roundTie";
  }
  | {
    reason: "breach" | "fullFreeze";
    type: "roundWin";
    winningTeam: 0 | 1;
  };

interface BotState {
  avatar: SimulatedPlayerAvatar;
  brain: BotBrain;
  currentBreachTeam: 0 | 1;
  damage: DamageState;
  deaths: number;
  grabbedBarPos: THREE.Vector3 | null;
  id: string;
  isBot: true;
  kills: number;
  launchPower: number;
  name: string;
  phase: PlayerPhase;
  phys: PhysicsState;
  rot: { yaw: number; pitch: number };
  team: 0 | 1;
}

interface ActorDescriptor {
  damage: DamageState;
  id: string;
  name: string;
  phase: PlayerPhase;
  pos: THREE.Vector3;
  team: 0 | 1;
}

export class LocalMatch {
  private barGraph: BarRouteGraph = buildBarGraph([]);
  private bots: BotState[] = [];
  private config: SoloMatchConfig = { humanName: "You", humanTeam: 0, teamSize: 1 };
  private roundResolved = false;
  private roundSeed = 0;
  private score = { team0: 0, team1: 0 };

  public onEvent: ((event: LocalMatchEvent) => void) | null = null;

  public constructor(private scene: THREE.Scene) {}

  public startNewGame(config: SoloMatchConfig): void {
    this.config = config;
    this.score = { team0: 0, team1: 0 };
    this.roundResolved = false;
    this.roundSeed = 0;
    this.rebuildBots();
  }

  public resetForRound(arena: Arena, player: LocalPlayer): void {
    this.roundResolved = false;
    this.roundSeed += 1;

    const query = new ArenaQueryAdapter(arena);
    this.barGraph = buildBarGraph(query.getAllBarGrabPoints());

    const team0Slots = generateSpawnPositions(
      0,
      this.getTeamActorCount(0),
      query,
      this.roundSeed * 11 + 7,
    ).map((slot) => settleSpawnOnFloor(slot, query, 0));
    const team1Slots = generateSpawnPositions(
      1,
      this.getTeamActorCount(1),
      query,
      this.roundSeed * 17 + 13,
    ).map((slot) => settleSpawnOnFloor(slot, query, 1));

    if (this.config.humanTeam === 0) {
      player.resetForNewRound(arena, team0Slots.shift());
    } else {
      player.resetForNewRound(arena, team1Slots.shift());
    }

    const team0Bots = this.bots.filter((bot) => bot.team === 0);
    const team1Bots = this.bots.filter((bot) => bot.team === 1);
    resetBotsForRound(team0Bots, team0Slots, this.roundSeed, query);
    resetBotsForRound(team1Bots, team1Slots, this.roundSeed, query);
  }

  public dispose(): void {
    for (const bot of this.bots) {
      bot.avatar.dispose(this.scene);
    }
    this.bots = [];
  }

  public getScore(): { team0: number; team1: number } {
    return { ...this.score };
  }

  public getHudRosters(player: LocalPlayer): { ownTeam: FullPlayerInfo[]; enemyTeam: EnemyPlayerInfo[] } {
    const actors = [
      {
        id: LOCAL_PLAYER_ID,
        name: this.config.humanName,
        team: this.config.humanTeam,
        isBot: false,
        kills: player.kills,
        deaths: player.deaths,
        phase: player.phase,
        frozen: player.damage.frozen,
        ping: 0,
      },
      ...this.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        team: bot.team,
        isBot: true,
        kills: bot.kills,
        deaths: bot.deaths,
        phase: bot.phase,
        frozen: bot.damage.frozen,
        ping: 0,
      })),
    ];

    return buildHudRosters(LOCAL_PLAYER_ID, this.config.humanTeam, actors);
  }

  public getProjectileTargets(player: LocalPlayer): ProjectileActorTarget[] {
    return [
      {
        active: player.phase !== "RESPAWNING" && !player.damage.frozen,
        id: LOCAL_PLAYER_ID,
        pos: player.getPosition().clone(),
        radius: PLAYER_RADIUS,
        team: this.config.humanTeam,
      },
      ...this.bots.map((bot) => ({
        active: bot.phase !== "RESPAWNING" && !bot.damage.frozen,
        id: bot.id,
        pos: bot.phys.pos.clone(),
        radius: PLAYER_RADIUS,
        team: bot.team,
      })),
    ];
  }

  public handleProjectileHit(
    event: ProjectileHitEvent,
    player: LocalPlayer,
    camera: CameraController,
  ): void {
    if (this.roundResolved) return;

    const owner = this.getActorMeta(event.ownerId, player);
    const impulse = event.direction.clone().normalize().multiplyScalar(3);

    if (event.targetId === LOCAL_PLAYER_ID) {
      const zone = LocalPlayer.classifyHitZone(
        event.impactPoint,
        player.getPosition(),
        camera.getForward(),
      );
      const frozen = player.applyHit(zone, impulse);
      if (frozen) {
        if (owner) {
          this.emitEvent({
            type: "freeze",
            killerName: owner.name,
            killerTeam: owner.team,
            victimName: this.config.humanName,
            victimTeam: this.config.humanTeam,
          });
        }
        this.checkFullFreezeWin(player);
      }
      return;
    }

    const bot = this.bots.find((candidate) => candidate.id === event.targetId);
    if (!bot) return;

    const zone = classifyHitZone(
      toVec3(event.impactPoint),
      toVec3(bot.phys.pos),
      yawForward(bot.rot.yaw),
    );
    const frozen = applyHitToBot(bot, zone, impulse);
    if (event.ownerId === LOCAL_PLAYER_ID) {
      this.emitEvent({
        type: "hitConfirm",
        team: this.config.humanTeam,
      });
    }
    if (frozen) {
      if (owner) {
        this.emitEvent({
          type: "freeze",
          killerName: owner.name,
          killerTeam: owner.team,
          victimName: bot.name,
          victimTeam: bot.team,
        });
      }
      this.checkFullFreezeWin(player);
    }
  }

  public handleRoundTimeout(): void {
    if (this.roundResolved) return;
    this.roundResolved = true;
    this.emitEvent({ type: "roundTie" });
  }

  public tick(
    dt: number,
    arena: Arena,
    player: LocalPlayer,
    isRoundPlaying: boolean,
  ): SpawnProjectileEvent[] {
    const shots: SpawnProjectileEvent[] = [];
    const query = new ArenaQueryAdapter(arena);

    if (isRoundPlaying && !this.roundResolved) {
      const enemySnapshots = this.buildEnemySnapshots(player);
      for (const bot of this.bots) {
        this.tickBot(
          bot,
          dt,
          arena,
          query,
          enemySnapshots[bot.team],
          shots,
        );
      }

      this.checkForBreachScore(arena, player);
      this.checkFullFreezeWin(player);
    } else {
      for (const bot of this.bots) {
        this.tickBotPassive(bot, arena, dt);
      }
    }

    this.resolveActorOverlap(player);

    for (const bot of this.bots) {
      bot.avatar.update(bot.phys.pos, bot.damage, bot.phase, bot.rot.yaw, dt, bot.phys.vel.length());
    }

    return shots;
  }

  private buildEnemySnapshots(player: LocalPlayer): Record<0 | 1, Array<{ id: string; phase: PlayerPhase; pos: Vec3; team: 0 | 1 }>> {
    const actors = [
      {
        id: LOCAL_PLAYER_ID,
        phase: player.phase,
        pos: toVec3(player.getPosition()),
        team: this.config.humanTeam,
      },
      ...this.bots.map((bot) => ({
        id: bot.id,
        phase: bot.phase,
        pos: toVec3(bot.phys.pos),
        team: bot.team,
      })),
    ];

    return {
      0: actors.filter((actor) => actor.team === 1),
      1: actors.filter((actor) => actor.team === 0),
    };
  }

  private checkForBreachScore(arena: Arena, player: LocalPlayer): void {
    if (this.roundResolved) return;

    const actors = this.getActorsForScore(player);
    for (const actor of actors) {
      if (actor.phase !== "FLOATING" || actor.damage.frozen) continue;

      const enemyTeam = (1 - actor.team) as 0 | 1;
      if (!arena.isGoalDoorOpen(enemyTeam)) continue;
      if (!arena.isDeepInBreachRoom(actor.pos, enemyTeam, 1.0)) continue;

      if (actor.id === LOCAL_PLAYER_ID) {
        player.currentBreachTeam = enemyTeam;
        player.phase = "BREACH";
        player.phys.vel.y = 0;
        player.kills += 1;
      } else {
        const bot = this.getBot(actor.id);
        if (!bot) continue;
        bot.currentBreachTeam = enemyTeam;
        bot.phase = "BREACH";
        bot.phys.vel.y = 0;
        bot.kills += 1;
      }

      this.awardRoundPoint(actor.team, actor.name, "breach");
      return;
    }
  }

  private checkFullFreezeWin(player: LocalPlayer): void {
    if (this.roundResolved) return;

    const winner = findFullFreezeWinner([
      { team: this.config.humanTeam, frozen: player.damage.frozen },
      ...this.bots.map((bot) => ({ team: bot.team, frozen: bot.damage.frozen })),
    ]);

    if (winner === null) return;
    this.roundResolved = true;
    if (winner === 0) this.score.team0 += 1;
    else this.score.team1 += 1;
    this.emitEvent({ type: "roundWin", winningTeam: winner, reason: "fullFreeze" });
  }

  private awardRoundPoint(team: 0 | 1, scorerName: string, reason: "breach" | "fullFreeze"): void {
    if (this.roundResolved) return;
    this.roundResolved = true;
    if (team === 0) this.score.team0 += 1;
    else this.score.team1 += 1;

    this.emitEvent({
      type: "score",
      scorerName,
      scorerTeam: team,
    });
    this.emitEvent({
      type: "roundWin",
      winningTeam: team,
      reason,
    });
  }

  private emitEvent(event: LocalMatchEvent): void {
    this.onEvent?.(event);
  }

  private getActorMeta(id: string, player: LocalPlayer): { name: string; team: 0 | 1 } | null {
    if (id === LOCAL_PLAYER_ID) {
      return {
        name: this.config.humanName,
        team: this.config.humanTeam,
      };
    }

    const bot = this.getBot(id);
    if (!bot) return null;
    return {
      name: bot.name,
      team: bot.team,
    };
  }

  private getActorsForScore(player: LocalPlayer): ActorDescriptor[] {
    return [
      {
        id: LOCAL_PLAYER_ID,
        name: this.config.humanName,
        team: this.config.humanTeam,
        damage: player.damage,
        phase: player.phase,
        pos: player.getPosition(),
      },
      ...this.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        team: bot.team,
        damage: bot.damage,
        phase: bot.phase,
        pos: bot.phys.pos,
      })),
    ];
  }

  private getBot(id: string): BotState | undefined {
    return this.bots.find((candidate) => candidate.id === id);
  }

  private getTeamActorCount(team: 0 | 1): number {
    const humanCount = this.config.humanTeam === team ? 1 : 0;
    const botCount = this.bots.filter((bot) => bot.team === team).length;
    return humanCount + botCount;
  }

  private rebuildBots(): void {
    this.dispose();

    const fill = getSoloBotFill(this.config.teamSize, this.config.humanTeam);
    const makeName = (index: number): string => {
      const base = BOT_NAMES[index % BOT_NAMES.length];
      const cycle = Math.floor(index / BOT_NAMES.length);
      return cycle === 0 ? base : `${base}-${cycle + 1}`;
    };

    for (let i = 0; i < fill.team0Bots; i += 1) {
      this.bots.push(createBotState(this.scene, `bot-cyan-${i}`, makeName(i), 0));
    }

    for (let i = 0; i < fill.team1Bots; i += 1) {
      const idx = fill.team0Bots + i;
      this.bots.push(createBotState(this.scene, `bot-magenta-${i}`, makeName(idx), 1));
    }
  }

  private resolveActorOverlap(player: LocalPlayer): void {
    resolveActorCollisions([
      {
        active: player.phase !== "RESPAWNING",
        anchored: isAnchored(player.phase),
        pos: player.getPosition(),
        radius: PLAYER_RADIUS,
      },
      ...this.bots.map((bot) => ({
        active: bot.phase !== "RESPAWNING",
        anchored: isAnchored(bot.phase),
        pos: bot.phys.pos,
        radius: PLAYER_RADIUS,
      })),
    ]);
  }

  private tickBot(
    bot: BotState,
    dt: number,
    arena: Arena,
    query: ArenaQueryAdapter,
    enemies: Array<{ id: string; phase: PlayerPhase; pos: Vec3; team: 0 | 1 }>,
    shots: SpawnProjectileEvent[],
  ): void {
    if (bot.phase === "FROZEN") {
      integrateFloating(bot, arena, dt);
      if (arena.isInBreachRoom(bot.phys.pos, bot.team)) {
        returnBotToOwnBreach(bot);
      }
      return;
    }

    const command = bot.brain.tick(
      {
        currentBreachTeam: bot.currentBreachTeam,
        damage: bot.damage,
        phase: bot.phase,
        pos: toVec3(bot.phys.pos),
        rot: bot.rot,
        team: bot.team,
      },
      query,
      this.barGraph,
      enemies,
      dt,
    );

    bot.rot.yaw = command.lookYaw;
    bot.rot.pitch = command.lookPitch;

    if (command.fire && !bot.damage.rightArm && command.fireDirection) {
      const forward = toThree(command.fireDirection).normalize();
      shots.push({
        direction: forward.clone(),
        origin: bot.phys.pos.clone().addScaledVector(forward, PLAYER_RADIUS + 0.25),
        ownerId: bot.id,
        team: bot.team,
      });
    }

    switch (bot.phase) {
      case "BREACH":
        this.updateBotBreach(bot, command, arena, query, dt);
        break;
      case "FLOATING":
        this.updateBotFloating(bot, command, arena, query, dt);
        break;
      case "GRABBING":
        if (!bot.grabbedBarPos) {
          bot.phase = "FLOATING";
          return;
        }
        bot.phys.vel.set(0, 0, 0);
        bot.phys.pos.copy(bot.grabbedBarPos);
        if (command.aimHeld) {
          bot.phase = "AIMING";
          bot.launchPower = 0;
        }
        break;
      case "AIMING":
        if (!bot.grabbedBarPos) {
          bot.phase = "FLOATING";
          return;
        }
        bot.phys.vel.set(0, 0, 0);
        bot.phys.pos.copy(bot.grabbedBarPos);
        bot.launchPower = Math.min(
          maxLaunchPower(bot.damage),
          bot.launchPower + (maxLaunchPower(bot.damage) * dt) / bot.brain.getLaunchChargeSeconds(),
        );
        if (!command.aimHeld) {
          launchBot(bot);
        }
        break;
      default:
        break;
    }
  }

  private tickBotPassive(
    bot: BotState,
    arena: Arena,
    dt: number,
  ): void {
    switch (bot.phase) {
      case "BREACH":
        this.stepBotBreachPhysics(bot, arena, dt);
        break;
      case "FLOATING":
      case "FROZEN":
        integrateFloating(bot, arena, dt);
        if (arena.isInBreachRoom(bot.phys.pos, bot.team)) {
          returnBotToOwnBreach(bot);
        }
        break;
      case "GRABBING":
      case "AIMING":
        if (bot.grabbedBarPos) {
          bot.phys.vel.set(0, 0, 0);
          bot.phys.pos.copy(bot.grabbedBarPos);
        } else {
          bot.phase = "FLOATING";
        }
        break;
      default:
        break;
    }
  }

  private updateBotBreach(
    bot: BotState,
    command: ReturnType<BotBrain["tick"]>,
    arena: Arena,
    query: ArenaQueryAdapter,
    dt: number,
  ): void {
    const center = arena.getBreachRoomCenter(bot.currentBreachTeam);
    const openAxis = arena.getBreachOpenAxis(bot.currentBreachTeam);
    const openSign = arena.getBreachOpenSign(bot.currentBreachTeam);
    const yawForwardVec = new THREE.Vector3(-Math.sin(bot.rot.yaw), 0, -Math.cos(bot.rot.yaw));
    const yawRightVec = new THREE.Vector3(Math.cos(bot.rot.yaw), 0, -Math.sin(bot.rot.yaw));

    integrateBreachRoom(
      bot.phys,
      command.walkAxes,
      yawForwardVec,
      yawRightVec,
      false,
      isOnBreachGround(bot, center.y),
      dt,
    );
    clampBreachRoom(bot.phys, center, openAxis, openSign, arena.isGoalDoorOpen(bot.currentBreachTeam));

    if (command.grab && !bot.damage.leftArm && arena.isGoalDoorOpen(bot.currentBreachTeam)) {
      const nearest = query.getNearestBar(toVec3(bot.phys.pos), GRAB_RADIUS);
      if (nearest) {
        bot.grabbedBarPos = toThree(nearest.pos);
        bot.phase = "GRABBING";
      }
    }

    if (!arena.isInBreachRoom(bot.phys.pos, bot.currentBreachTeam)) {
      bot.phase = "FLOATING";
    }
  }

  private updateBotFloating(
    bot: BotState,
    command: ReturnType<BotBrain["tick"]>,
    arena: Arena,
    query: ArenaQueryAdapter,
    dt: number,
  ): void {
    integrateFloating(bot, arena, dt);

    if (arena.isInBreachRoom(bot.phys.pos, bot.team)) {
      returnBotToOwnBreach(bot);
      return;
    }

    if (command.grab && !bot.damage.leftArm && command.targetBar) {
      const nearest = query.getNearestBar(toVec3(bot.phys.pos), GRAB_RADIUS);
      if (nearest) {
        bot.grabbedBarPos = toThree(nearest.pos);
        bot.phase = "GRABBING";
      }
    }
  }

  private stepBotBreachPhysics(bot: BotState, arena: Arena, dt: number): void {
    const center = arena.getBreachRoomCenter(bot.currentBreachTeam);
    const openAxis = arena.getBreachOpenAxis(bot.currentBreachTeam);
    const openSign = arena.getBreachOpenSign(bot.currentBreachTeam);
    const yawForwardVec = new THREE.Vector3(-Math.sin(bot.rot.yaw), 0, -Math.cos(bot.rot.yaw));
    const yawRightVec = new THREE.Vector3(Math.cos(bot.rot.yaw), 0, -Math.sin(bot.rot.yaw));

    integrateBreachRoom(
      bot.phys,
      { x: 0, z: 0 },
      yawForwardVec,
      yawRightVec,
      false,
      isOnBreachGround(bot, center.y),
      dt,
    );
    clampBreachRoom(bot.phys, center, openAxis, openSign, arena.isGoalDoorOpen(bot.currentBreachTeam));
  }
}

function createDamageState(): DamageState {
  return {
    frozen: false,
    leftArm: false,
    legs: false,
    rightArm: false,
  };
}

function createBotState(scene: THREE.Scene, id: string, name: string, team: 0 | 1): BotState {
  const personality = createBotPersonality(id, team);
  return {
    avatar: new SimulatedPlayerAvatar(scene, team, name),
    brain: new BotBrain(personality),
    currentBreachTeam: team,
    damage: createDamageState(),
    deaths: 0,
    grabbedBarPos: null,
    id,
    isBot: true,
    kills: 0,
    launchPower: 0,
    name,
    phase: "BREACH",
    phys: { pos: new THREE.Vector3(), vel: new THREE.Vector3() },
    rot: { yaw: 0, pitch: 0 },
    team,
  };
}

function applyHitToBot(
  bot: BotState,
  zone: ReturnType<typeof classifyHitZone>,
  impulse: THREE.Vector3,
): boolean {
  bot.phys.vel.add(impulse);

  switch (zone) {
    case "head":
    case "body":
      if (!bot.damage.frozen) {
        bot.damage.frozen = true;
        bot.deaths += 1;
      }
      bot.phase = "FROZEN";
      bot.grabbedBarPos = null;
      return true;
    case "rightArm":
      bot.damage.rightArm = true;
      return false;
    case "leftArm":
      bot.damage.leftArm = true;
      if (bot.phase === "GRABBING" || bot.phase === "AIMING") {
        bot.phase = "FLOATING";
        bot.grabbedBarPos = null;
      }
      return false;
    case "legs":
      bot.damage.legs = true;
      bot.launchPower = Math.min(bot.launchPower, maxLaunchPower(bot.damage));
      return false;
  }
}

function integrateFloating(bot: BotState, arena: Arena, dt = 0): void {
  const goalAxis = arena.getBreachOpenAxis(bot.team);
  const perpAxis: "x" | "z" = goalAxis === "z" ? "x" : "z";
  const team0FaceSign = (-arena.getBreachOpenSign(0)) as 1 | -1;
  const team1FaceSign = (-arena.getBreachOpenSign(1)) as 1 | -1;
  const portalFacesOpen = {
    positive:
      (team0FaceSign === 1 && arena.isGoalDoorOpen(0))
      || (team1FaceSign === 1 && arena.isGoalDoorOpen(1)),
    negative:
      (team0FaceSign === -1 && arena.isGoalDoorOpen(0))
      || (team1FaceSign === -1 && arena.isGoalDoorOpen(1)),
  };

  integrateZeroG(bot.phys, dt);
  bounceArena(bot.phys, goalAxis, perpAxis, portalFacesOpen);
  arena.bounceObstacles(bot.phys);
}

function isAnchored(phase: PlayerPhase): boolean {
  return phase === "GRABBING" || phase === "AIMING";
}

function isOnBreachGround(bot: BotState, centerY: number): boolean {
  const floorY = centerY - 3 + PLAYER_RADIUS;
  return bot.phys.pos.y <= floorY + 0.08;
}

function launchBot(bot: BotState): void {
  const forward = directionFromRotation(bot.rot.yaw, bot.rot.pitch);
  bot.phys.pos.addScaledVector(forward, PLAYER_RADIUS + 0.8);
  bot.phys.vel.copy(forward).multiplyScalar(bot.launchPower);
  bot.grabbedBarPos = null;
  bot.launchPower = 0;
  bot.phase = "FLOATING";
}

function directionFromRotation(yaw: number, pitch: number): THREE.Vector3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return new THREE.Vector3(-sy * cp, sp, -cy * cp).normalize();
}

function resetBotsForRound(
  bots: BotState[],
  spawnSlots: Vec3[],
  roundSeed: number,
  query: ArenaQueryAdapter,
): void {
  for (let i = 0; i < bots.length; i += 1) {
    const bot = bots[i];
    const spawn = spawnSlots[i] ?? spawnSlots[spawnSlots.length - 1] ?? { x: 0, y: 0, z: 0 };
    bot.currentBreachTeam = bot.team;
    bot.damage = createDamageState();
    bot.grabbedBarPos = null;
    bot.launchPower = 0;
    bot.phase = "BREACH";
    bot.phys.pos.set(spawn.x, spawn.y, spawn.z);
    bot.phys.vel.set(0, 0, 0);
    bot.rot = exitRotation(query, bot.team);
    bot.brain.resetForRound(roundSeed * 37 + i * 13 + bot.team);
    bot.avatar.update(bot.phys.pos, bot.damage, bot.phase, bot.rot.yaw, 0, 0);
  }
}

function returnBotToOwnBreach(bot: BotState): void {
  bot.currentBreachTeam = bot.team;
  bot.damage.frozen = false;
  bot.phase = "BREACH";
  bot.phys.vel.y = 0;
}

function settleSpawnOnFloor(
  spawn: Vec3,
  query: ArenaQueryAdapter,
  team: 0 | 1,
): Vec3 {
  const center = query.getBreachRoomCenter(team);
  const floorY = center.y - 3 + PLAYER_RADIUS + 0.08;
  return {
    x: spawn.x,
    y: floorY,
    z: spawn.z,
  };
}

function exitRotation(query: ArenaQueryAdapter, team: 0 | 1): { yaw: number; pitch: number } {
  const axis = query.getBreachOpenAxis(team);
  const sign = query.getBreachOpenSign(team);
  const dir = axis === "x"
    ? new THREE.Vector3(sign, 0, 0)
    : axis === "y"
      ? new THREE.Vector3(0, sign, 0)
      : new THREE.Vector3(0, 0, sign);
  return {
    yaw: Math.atan2(-dir.x, -dir.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))),
  };
}

function toVec3(vec: THREE.Vector3): Vec3 {
  return { x: vec.x, y: vec.y, z: vec.z };
}

function toThree(vec: Vec3): THREE.Vector3 {
  return new THREE.Vector3(vec.x, vec.y, vec.z);
}

function yawForward(yaw: number): Vec3 {
  return v3.normalize({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
}

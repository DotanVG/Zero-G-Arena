import { Room, type Client } from "@colyseus/core";
import {
  buildBotName,
  canJoinMultiplayerRoom,
  canStartLobbyRound,
  getPreferredJoinTeam,
  isMatchTeamSizeValue,
  MULTIPLAYER_COUNTDOWN_SECONDS,
  MULTIPLAYER_DEFAULT_TEAM_SIZE,
  MULTIPLAYER_ROUND_END_SECONDS,
  MULTIPLAYER_ROUND_SECONDS,
  type BreachReportMessage,
  type FillBotsMessage,
  type FreezeEventMessage,
  type HitReportMessage,
  type LobbyTeam,
  type MultiplayerRoomPhase,
  type PlayerUpdateMessage,
  type RoundResultEventMessage,
  type SetReadyMessage,
  type SetTeamSizeMessage,
  type ShotEventMessage,
  type SwitchTeamMessage,
} from "../../../shared/multiplayer";
import type { MatchTeamSize } from "../../../shared/match";
import { findMatchWinner } from "../../../shared/match-flow";
import { generateArenaLayout } from "../../../shared/arena-gen";
import { isCallSignClean } from "../../../shared/profanity";
import {
  ACTOR_COLLISION_RADIUS,
  ARENA_SIZE,
  BREACH_ROOM_D,
  BREACH_ROOM_H,
  BREACH_ROOM_W,
  MATCH_POINT_TARGET,
  MAX_LAUNCH_SPEED,
  MAX_SPEED,
  PLAYER_RADIUS,
} from "../../../shared/constants";
import type { PlayerPhase } from "../../../shared/schema";
import { generateSpawnPositions, resolveActorCollisions, type CollisionBody } from "../../../shared/player-logic";
import { applyHitToOnlineActor, isHitZone, normalizeAuthoritativePhase } from "./actorDamage";
import { ActorState, LobbyMemberState, OrbitalLobbyState } from "./state";

type RoomClient = Client;

const MATCH_TICK_MS = 50;
const BOT_RESPAWN_SECONDS = 5;
const MAX_KILLS = 9999;
const POS_CLAMP = ARENA_SIZE * 4;
const VEL_CLAMP = MAX_SPEED * 4;
const PLAYER_UPDATE_MIN_MS = 40;

const VALID_PHASES = new Set<string>(["BREACH", "FLOATING", "GRABBING", "AIMING", "FROZEN", "RESPAWNING"]);

export class OrbitalLobbyRoom extends Room<{ state: OrbitalLobbyState }> {
  public maxClients = 32;
  public autoDispose = true;
  public patchRate = 50;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private roundEndTimer: ReturnType<typeof setTimeout> | null = null;
  private matchTick: ReturnType<typeof setInterval> | null = null;
  private botCounters: Record<LobbyTeam, number> = { 0: 0, 1: 0 };
  private botSpawnYaw: Record<LobbyTeam, number> = { 0: 0, 1: 0 };
  private botAI = new Map<string, { launchTimer: number }>();
  private botGoalAxis: "x" | "z" = "x";
  private botGoalSigns: { team0: 1 | -1; team1: 1 | -1 } = { team0: 1, team1: -1 };
  private botFireTimers = new Map<string, number>();
  private countdownPreparedRound = false;
  private roundResolved = false;
  private lastPlayerUpdate = new Map<string, number>();

  public onCreate(): void {
    this.state = new OrbitalLobbyState();
    this.state.teamSize = MULTIPLAYER_DEFAULT_TEAM_SIZE;

    this.onMessage("ready", (client, message: SetReadyMessage) => {
      this.handleReadyMessage(client, message);
    });
    this.onMessage("switch_team", (client, message: SwitchTeamMessage) => {
      this.handleSwitchTeamMessage(client, message);
    });
    this.onMessage("set_team_size", (client, message: SetTeamSizeMessage) => {
      this.handleSetTeamSizeMessage(client, message);
    });
    this.onMessage("fill_bots", (_client, message: FillBotsMessage) => {
      this.handleFillBotsMessage(message);
    });
    this.onMessage("player_update", (client, message: PlayerUpdateMessage) => {
      this.handlePlayerUpdateMessage(client, message);
    });
    this.onMessage("shot_event", (client, message: ShotEventMessage) => {
      this.handleShotEventMessage(client, message);
    });
    this.onMessage("hit_report", (client, message: HitReportMessage) => {
      this.handleHitReportMessage(client, message);
    });
    this.onMessage("breach_report", (client, message: BreachReportMessage) => {
      this.handleBreachReportMessage(client, message);
    });

    void this.unlock();
  }

  public onAuth(): true {
    if (!canJoinMultiplayerRoom(this.state.phase as MultiplayerRoomPhase)) {
      throw new Error("A match is already in progress. Wait for the lobby before joining.");
    }

    return true;
  }

  public onJoin(client: RoomClient, options?: { name?: string }): void {
    const member = new LobbyMemberState();
    member.id = client.sessionId;
    member.sessionId = client.sessionId;
    member.name = sanitizePlayerName(options?.name);
    member.team = getPreferredJoinTeam(this.getMemberSnapshots());
    member.ready = false;
    member.connected = true;
    member.isBot = false;

    this.state.members.set(client.sessionId, member);
    this.broadcast("lobby_event", {
      type: "info",
      text: `${member.name} joined the room.`,
    });
    this.syncLobbyFlow();
  }

  public onLeave(client: RoomClient): void {
    this.lastPlayerUpdate.delete(client.sessionId);
    const member = this.state.members.get(client.sessionId);
    if (!member) {
      return;
    }

    const leavingName = member.name;
    this.state.members.delete(client.sessionId);
    this.broadcast("lobby_event", {
      type: "info",
      text: `${leavingName} left the room.`,
    });

    if (!this.hasHumanMembers()) {
      this.removeAllBots();
      this.resetScore();
      this.state.matchComplete = false;
      this.cancelRoundFlow();
      this.resetLobbyReadiness();
      this.state.phase = "LOBBY";
      this.state.countdownRemaining = 0;
      this.state.roundTimeRemaining = 0;
      this.clearActors();
    }

    this.syncLobbyFlow();
  }

  public onDispose(): void {
    this.clearTimers();
  }

  // ── Lobby message handlers ──────────────────────────────────────────────────

  private handleReadyMessage(client: RoomClient, message: SetReadyMessage): void {
    if (this.state.phase !== "LOBBY" && this.state.phase !== "COUNTDOWN") {
      this.sendInfo(client, "Ready state can only change from the lobby.");
      return;
    }

    const member = this.state.members.get(client.sessionId);
    if (!member || member.isBot) {
      return;
    }

    member.ready = Boolean(message.ready);
    this.syncLobbyFlow();
  }

  private handleSwitchTeamMessage(client: RoomClient, message: SwitchTeamMessage): void {
    if (this.state.phase !== "LOBBY") {
      this.sendInfo(client, "Switch teams before the countdown starts.");
      return;
    }

    if (message.team !== 0 && message.team !== 1) {
      this.sendError(client, "Team must be Cyan or Magenta.");
      return;
    }

    const member = this.state.members.get(client.sessionId);
    if (!member || member.isBot) {
      return;
    }

    if (member.team === message.team) {
      return;
    }

    if (!this.ensureSeatForHuman(message.team)) {
      this.sendError(client, "That team is full right now.");
      return;
    }

    member.team = message.team;
    this.syncLobbyFlow();
  }

  private handleSetTeamSizeMessage(client: RoomClient, message: SetTeamSizeMessage): void {
    if (this.state.phase !== "LOBBY") {
      this.sendInfo(client, "Change the lobby size before the round starts.");
      return;
    }

    const nextTeamSize = Number(message.teamSize);
    if (!isMatchTeamSizeValue(nextTeamSize)) {
      this.sendError(client, "Unsupported team size.");
      return;
    }

    const humans = this.getHumanMembers();
    const team0Humans = humans.filter((member) => member.team === 0).length;
    const team1Humans = humans.filter((member) => member.team === 1).length;
    if (team0Humans > nextTeamSize || team1Humans > nextTeamSize) {
      this.sendError(client, "Move players first before shrinking the lobby.");
      return;
    }

    this.state.teamSize = nextTeamSize;
    this.trimBotsToTeamSize();
    this.syncLobbyFlow();
  }

  private handleFillBotsMessage(message: FillBotsMessage): void {
    if (this.state.phase !== "LOBBY") {
      return;
    }

    if (message.fill) {
      this.fillBotsToLobbySize();
    } else {
      this.removeAllBots();
    }

    this.syncLobbyFlow();
  }

  // ── Match message handlers ──────────────────────────────────────────────────

  private handlePlayerUpdateMessage(client: RoomClient, message: PlayerUpdateMessage): void {
    if (this.state.phase !== "PLAYING" && this.state.phase !== "ROUND_END") return;
    const actor = this.state.actors.get(client.sessionId);
    if (!actor || actor.isBot) return;

    const now = Date.now();
    const last = this.lastPlayerUpdate.get(client.sessionId) ?? 0;
    if (now - last < PLAYER_UPDATE_MIN_MS) return;
    this.lastPlayerUpdate.set(client.sessionId, now);

    actor.posX = clampFinite(Number(message.posX), -POS_CLAMP, POS_CLAMP);
    actor.posY = clampFinite(Number(message.posY), -POS_CLAMP, POS_CLAMP);
    actor.posZ = clampFinite(Number(message.posZ), -POS_CLAMP, POS_CLAMP);
    actor.velX = clampFinite(Number(message.velX), -VEL_CLAMP, VEL_CLAMP);
    actor.velY = clampFinite(Number(message.velY), -VEL_CLAMP, VEL_CLAMP);
    actor.velZ = clampFinite(Number(message.velZ), -VEL_CLAMP, VEL_CLAMP);
    actor.yaw = clampFinite(Number(message.yaw), -Math.PI * 2, Math.PI * 2);
    const rawPhase = String(message.phase ?? "");
    const prevPhase = actor.phase;
    actor.phase = normalizeAuthoritativePhase(rawPhase, actor);
    if (actor.phase === "BREACH" && prevPhase !== "BREACH") {
      actor.leftArm = false;
      actor.rightArm = false;
      actor.leftLeg = false;
      actor.rightLeg = false;
    }
  }

  private handleShotEventMessage(client: RoomClient, message: ShotEventMessage): void {
    if (this.state.phase !== "PLAYING" || this.roundResolved) return;

    const actor = this.state.actors.get(client.sessionId);
    if (!actor || actor.frozen || actor.rightArm || actor.phase === "RESPAWNING") return;

    const direction = normalizeDirection(
      Number(message.dirX),
      Number(message.dirY),
      Number(message.dirZ),
    );
    if (!direction) return;

    const shotEvent: ShotEventMessage = {
      ownerId: actor.id,
      team: actor.team,
      originX: clampFinite(Number(message.originX), -POS_CLAMP, POS_CLAMP),
      originY: clampFinite(Number(message.originY), -POS_CLAMP, POS_CLAMP),
      originZ: clampFinite(Number(message.originZ), -POS_CLAMP, POS_CLAMP),
      dirX: direction.x,
      dirY: direction.y,
      dirZ: direction.z,
    };
    this.broadcast("shot_event", shotEvent);
  }

  private handleHitReportMessage(client: RoomClient, message: HitReportMessage): void {
    if (this.state.phase !== "PLAYING" || this.roundResolved) return;

    const shooter = this.state.actors.get(client.sessionId);
    if (!shooter || shooter.frozen) return;

    const targetId = String(message.targetId ?? "").slice(0, 64);
    const target = this.state.actors.get(targetId);
    if (!target || target.frozen || target.team === shooter.team) return;
    if (!isHitZone(message.zone)) return;

    if (target.isBot) {
      target.frozen = true;
      target.phase = "FROZEN";
      target.deaths += 1;
    } else {
      const frozen = applyHitToOnlineActor(target, message.zone);
      if (!frozen) {
        return;
      }
    }

    target.frozenTimer = BOT_RESPAWN_SECONDS;
    shooter.kills = Math.min(MAX_KILLS, shooter.kills + 1);

    const freezeEvent: FreezeEventMessage = {
      targetId: target.id,
      killerName: shooter.name,
      killerTeam: shooter.team,
      victimName: target.name,
      victimTeam: target.team,
    };
    this.broadcast("freeze_event", freezeEvent);

    this.checkFullFreezeWin();
  }

  private handleBreachReportMessage(client: RoomClient, message: BreachReportMessage): void {
    if (this.state.phase !== "PLAYING" || this.roundResolved) return;

    const actor = this.state.actors.get(client.sessionId);
    if (!actor || actor.frozen) return;

    const scorerTeam = message.scorerTeam === 0 || message.scorerTeam === 1
      ? message.scorerTeam
      : actor.team;

    this.awardOnlineRoundPoint(scorerTeam, String(message.scorerName || actor.name), "breach");
  }

  // ── Round flow ──────────────────────────────────────────────────────────────

  private syncLobbyFlow(): void {
    if (this.state.phase === "ROUND_END") {
      return;
    }

    if (this.state.phase === "COUNTDOWN") {
      if (!canStartLobbyRound(this.getMemberSnapshots(), this.state.teamSize as MatchTeamSize)) {
        this.cancelCountdown();
      }
      return;
    }

    if (
      this.state.phase === "LOBBY"
      && canStartLobbyRound(this.getMemberSnapshots(), this.state.teamSize as MatchTeamSize)
    ) {
      this.startCountdown();
    }
  }

  private startCountdown(): void {
    this.clearTimers();
    if (this.state.matchComplete) {
      this.resetScore();
      this.state.matchComplete = false;
    }
    this.prepareCountdownRound();
    this.state.phase = "COUNTDOWN";
    this.state.countdownRemaining = MULTIPLAYER_COUNTDOWN_SECONDS;
    void this.lock();

    this.countdownTimer = setInterval(() => {
      this.state.countdownRemaining = Math.max(0, this.state.countdownRemaining - 1);
      if (this.state.countdownRemaining <= 0) {
        this.clearCountdownTimer();
        this.beginRoundPlay();
      }
    }, 1000);
  }

  private cancelCountdown(): void {
    this.clearCountdownTimer();
    this.revertPreparedCountdownRound();
    this.state.phase = "LOBBY";
    this.state.countdownRemaining = 0;
    this.state.roundTimeRemaining = 0;
    void this.unlock();
  }

  private prepareCountdownRound(): void {
    this.state.roundNumber += 1;
    this.state.roundTimeRemaining = MULTIPLAYER_ROUND_SECONDS;
    this.roundResolved = false;
    this.countdownPreparedRound = true;
    this.spawnActors();
  }

  private revertPreparedCountdownRound(): void {
    if (!this.countdownPreparedRound) return;
    this.countdownPreparedRound = false;
    this.state.roundNumber = Math.max(0, this.state.roundNumber - 1);
    this.clearActors();
  }

  private beginRoundPlay(): void {
    this.countdownPreparedRound = false;
    this.state.phase = "PLAYING";
    this.state.countdownRemaining = 0;
    this.state.roundTimeRemaining = MULTIPLAYER_ROUND_SECONDS;
    this.roundResolved = false;

    this.roundTimer = setInterval(() => {
      this.state.roundTimeRemaining = Math.max(0, this.state.roundTimeRemaining - 1);
      if (this.state.roundTimeRemaining <= 0) {
        this.clearRoundTimer();
        if (!this.roundResolved) {
          this.roundResolved = true;
          const resultEvent: RoundResultEventMessage = {
            outcome: "tie",
            winningTeam: null,
            matchWinner: null,
            reason: "timeout",
            scorerName: "Time",
          };
          this.broadcast("round_result_event", resultEvent);
          this.finishRound(null);
        }
      }
    }, 1000);

    this.matchTick = setInterval(() => {
      this.tickBots(MATCH_TICK_MS / 1000);
      this.resolveOnlineBotCollisions();
    }, MATCH_TICK_MS);
  }

  private finishRound(matchWinner: 0 | 1 | null): void {
    this.clearRoundTimer();
    this.clearMatchTick();

    this.state.phase = "ROUND_END";
    this.state.countdownRemaining = 0;
    this.state.roundTimeRemaining = 0;

    this.roundEndTimer = setTimeout(() => {
      this.roundEndTimer = null;
      this.countdownPreparedRound = false;

      if (
        matchWinner === null
        && canStartLobbyRound(this.getMemberSnapshots(), this.state.teamSize as MatchTeamSize)
      ) {
        this.startCountdown();
        return;
      }

      this.state.phase = "LOBBY";
      this.state.countdownRemaining = 0;
      this.state.roundTimeRemaining = 0;
      if (matchWinner !== null) {
        this.state.matchComplete = true;
        this.resetLobbyReadiness();
        this.broadcast("lobby_event", {
          type: "info",
          text: "Match complete. Review the debrief, then ready up to start the next one.",
        });
      }
      void this.unlock();
      this.syncLobbyFlow();
    }, MULTIPLAYER_ROUND_END_SECONDS * 1000);
  }

  private checkFullFreezeWin(): void {
    if (this.roundResolved || this.state.phase !== "PLAYING") return;

    const actors = Array.from(this.state.actors.values());
    const team0 = actors.filter((a) => a.team === 0);
    const team1 = actors.filter((a) => a.team === 1);
    if (team0.length === 0 || team1.length === 0) return;

    if (team0.every((a) => a.frozen)) {
      this.awardOnlineRoundPoint(1, "Magenta Team", "fullFreeze");
    } else if (team1.every((a) => a.frozen)) {
      this.awardOnlineRoundPoint(0, "Cyan Team", "fullFreeze");
    }
  }

  private awardOnlineRoundPoint(team: 0 | 1, scorerName: string, reason: "breach" | "fullFreeze"): void {
    if (this.roundResolved) return;
    this.roundResolved = true;

    if (team === 0) {
      this.state.scoreTeam0 += 1;
    } else {
      this.state.scoreTeam1 += 1;
    }

    const matchWinner = findMatchWinner(
      {
        team0: this.state.scoreTeam0,
        team1: this.state.scoreTeam1,
      },
      MATCH_POINT_TARGET,
    );

    const resultEvent: RoundResultEventMessage = {
      outcome: "win",
      winningTeam: team,
      matchWinner,
      reason,
      scorerName,
    };
    if (matchWinner !== null) {
      resultEvent.finalScore = {
        team0: this.state.scoreTeam0,
        team1: this.state.scoreTeam1,
      };
    }
    this.broadcast("round_result_event", resultEvent);

    setTimeout(() => {
      this.finishRound(matchWinner);
    }, 3000);
  }

  // ── Actor management ────────────────────────────────────────────────────────

  private spawnActors(): void {
    this.clearActors();

    const layout = generateArenaLayout(this.state.roundNumber);
    const { goalAxis, goalSigns } = layout;
    this.botGoalAxis = goalAxis as "x" | "z";
    this.botGoalSigns = goalSigns;

    // openSign = direction FROM breach room TOWARD arena (opposite of goalSign)
    const openSign0 = (-goalSigns.team0) as 1 | -1;
    const openSign1 = (-goalSigns.team1) as 1 | -1;

    this.botSpawnYaw[0] = breachExitYaw(goalAxis, openSign0);
    this.botSpawnYaw[1] = breachExitYaw(goalAxis, openSign1);

    const arenaQuery = makeServerArenaQuery(goalAxis, goalSigns);
    const roundSeed = this.state.roundNumber;
    const memberList = Array.from(this.state.members.values());
    const team0Count = memberList.filter((m) => m.team === 0).length;
    const team1Count = memberList.filter((m) => m.team === 1).length;
    const slots0 = generateSpawnPositions(0, team0Count, arenaQuery, roundSeed * 11 + 7);
    const slots1 = generateSpawnPositions(1, team1Count, arenaQuery, roundSeed * 17 + 13);
    const center0 = arenaQuery.getBreachRoomCenter(0);
    const center1 = arenaQuery.getBreachRoomCenter(1);
    const floorY0 = center0.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS + 0.08;
    const floorY1 = center1.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS + 0.08;

    let team0Index = 0;
    let team1Index = 0;

    for (const member of this.state.members.values()) {
      const actor = new ActorState();
      actor.id = member.id;
      actor.name = member.name;
      actor.team = member.team;
      actor.isBot = member.isBot;
      actor.phase = "BREACH";
      actor.frozen = false;
      actor.leftArm = false;
      actor.rightArm = false;
      actor.leftLeg = false;
      actor.rightLeg = false;
      actor.kills = 0;
      actor.deaths = 0;
      actor.yaw = this.botSpawnYaw[member.team];

      if (member.team === 0) {
        const slot = slots0[team0Index] ?? slots0[slots0.length - 1] ?? center0;
        actor.posX = slot.x;
        actor.posY = floorY0;
        actor.posZ = slot.z;
        team0Index += 1;
      } else {
        const slot = slots1[team1Index] ?? slots1[slots1.length - 1] ?? center1;
        actor.posX = slot.x;
        actor.posY = floorY1;
        actor.posZ = slot.z;
        team1Index += 1;
      }

      if (member.isBot) {
        const idHash = botIdHash(member.id);
        const p = botPersonality(idHash);
        this.botAI.set(member.id, { launchTimer: 1.5 + (idHash % 30) * 0.1 });
        this.botFireTimers.set(member.id, p.fireDelay * (0.5 + (idHash % 10) * 0.05));
      }

      this.state.actors.set(member.id, actor);
    }
  }

  private clearActors(): void {
    this.state.actors.clear();
    this.botAI.clear();
    this.botFireTimers.clear();
  }

  private tickBots(dt: number): void {
    if (this.state.phase !== "PLAYING") return;

    for (const actor of this.state.actors.values()) {
      if (!actor.isBot) continue;
      if (actor.frozen) continue; // stay frozen until round end

      const idHash = botIdHash(actor.id);
      const p = botPersonality(idHash);

      if (actor.phase === "BREACH") {
        const ai = this.botAI.get(actor.id);
        if (!ai) continue;
        ai.launchTimer -= dt;
        if (ai.launchTimer <= 0) {
          const dx = -actor.posX + (Math.random() - 0.5) * p.angleNoise * 6;
          const dy = -actor.posY + (Math.random() - 0.5) * p.angleNoise * 3;
          const dz = -actor.posZ + (Math.random() - 0.5) * p.angleNoise * 6;
          const len = Math.hypot(dx, dy, dz) || 1;
          actor.velX = (dx / len) * p.launchSpeed;
          actor.velY = (dy / len) * p.launchSpeed;
          actor.velZ = (dz / len) * p.launchSpeed;
          actor.phase = "FLOATING";
          const horizLen = Math.hypot(dx, dz);
          if (horizLen > 0.01) {
            actor.yaw = Math.atan2(-dx / horizLen, -dz / horizLen);
          }
        }
        continue;
      }

      if (actor.phase === "FLOATING") {
        botIntegrateZeroG(actor, dt);
        botBounceArena(actor, this.botGoalAxis);

        const horizSpeed = Math.hypot(actor.velX, actor.velZ);
        if (horizSpeed > 0.5) {
          actor.yaw = Math.atan2(-actor.velX, -actor.velZ);
        }

        if (!this.roundResolved && this.botIsInEnemyBreachRoom(actor)) {
          this.awardOnlineRoundPoint(actor.team, actor.name, "breach");
        }

        const fireTimer = this.botFireTimers.get(actor.id) ?? p.fireDelay;
        const nextFireTimer = fireTimer - dt;
        if (nextFireTimer <= 0) {
          this.botTryFire(actor, p);
          this.botFireTimers.set(actor.id, p.fireDelay * (0.8 + Math.random() * 0.4));
        } else {
          this.botFireTimers.set(actor.id, nextFireTimer);
        }
      }
    }
  }

  private resolveOnlineBotCollisions(): void {
    if (this.state.phase !== "PLAYING") return;

    const bodies: Array<CollisionBody & { id: string; isBot: boolean }> = [];
    for (const actor of this.state.actors.values()) {
      if (actor.frozen) continue;
      bodies.push({
        id: actor.id,
        isBot: actor.isBot,
        pos: { x: actor.posX, y: actor.posY, z: actor.posZ },
        vel: actor.isBot ? { x: actor.velX, y: actor.velY, z: actor.velZ } : undefined,
        radius: ACTOR_COLLISION_RADIUS,
        anchored: !actor.isBot,
      });
    }
    if (bodies.length < 2) return;
    resolveActorCollisions(bodies);
    for (const body of bodies) {
      if (!body.isBot) continue;
      const actor = this.state.actors.get(body.id);
      if (!actor) continue;
      actor.posX = body.pos.x;
      actor.posY = body.pos.y;
      actor.posZ = body.pos.z;
      if (body.vel) {
        actor.velX = body.vel.x;
        actor.velY = body.vel.y;
        actor.velZ = body.vel.z;
      }
    }
  }

  private botIsInEnemyBreachRoom(bot: ActorState): boolean {
    const enemyTeam = (bot.team === 0 ? 1 : 0) as 0 | 1;
    const enemySign = enemyTeam === 0 ? this.botGoalSigns.team0 : this.botGoalSigns.team1;
    const goalAxis = this.botGoalAxis;
    const perpAxis: "x" | "z" = goalAxis === "x" ? "z" : "x";
    const botOnGoal = goalAxis === "x" ? bot.posX : bot.posZ;
    const botOnPerp = perpAxis === "x" ? bot.posX : bot.posZ;
    const arenaEdge = enemySign * (ARENA_SIZE / 2);
    const roomBack = enemySign * (ARENA_SIZE / 2 + BREACH_ROOM_D);
    const inDepth = enemySign > 0
      ? botOnGoal > arenaEdge && botOnGoal < roomBack
      : botOnGoal < arenaEdge && botOnGoal > roomBack;
    return inDepth && Math.abs(bot.posY) < BREACH_ROOM_H / 2 && Math.abs(botOnPerp) < BREACH_ROOM_W / 2;
  }

  private findNearestBotEnemy(bot: ActorState): ActorState | null {
    let nearest: ActorState | null = null;
    let nearestDistSq = Infinity;
    for (const actor of this.state.actors.values()) {
      if (actor.team === bot.team || actor.frozen) continue;
      const dx = actor.posX - bot.posX;
      const dy = actor.posY - bot.posY;
      const dz = actor.posZ - bot.posZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = actor;
      }
    }
    return nearest;
  }

  private botTryFire(bot: ActorState, p: BotPersonality): void {
    if (bot.rightArm || bot.frozen) return;
    const enemy = this.findNearestBotEnemy(bot);
    if (!enemy) return;
    const dx = enemy.posX - bot.posX;
    const dy = enemy.posY - bot.posY;
    const dz = enemy.posZ - bot.posZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > p.maxRange * p.maxRange) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist + (Math.random() - 0.5) * p.angleNoise;
    const ny = dy / dist + (Math.random() - 0.5) * p.angleNoise;
    const nz = dz / dist + (Math.random() - 0.5) * p.angleNoise;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const shotEvent: ShotEventMessage = {
      ownerId: bot.id,
      team: bot.team,
      originX: bot.posX,
      originY: bot.posY,
      originZ: bot.posZ,
      dirX: nx / nLen,
      dirY: ny / nLen,
      dirZ: nz / nLen,
    };
    this.broadcast("shot_event", shotEvent);
    const rangeFactor = 1 - (dist / p.maxRange) * 0.5;
    const hitChance = (0.35 + p.tier * 0.1) * rangeFactor;
    if (Math.random() > hitChance || enemy.frozen) return;
    if (enemy.isBot) {
      enemy.frozen = true;
      enemy.phase = "FROZEN";
      enemy.deaths += 1;
    } else {
      const frozen = applyHitToOnlineActor(enemy, "body");
      if (!frozen) return;
    }
    enemy.frozenTimer = BOT_RESPAWN_SECONDS;
    bot.kills = Math.min(MAX_KILLS, bot.kills + 1);
    const freezeEvent: FreezeEventMessage = {
      targetId: enemy.id,
      killerName: bot.name,
      killerTeam: bot.team,
      victimName: enemy.name,
      victimTeam: enemy.team,
    };
    this.broadcast("freeze_event", freezeEvent);
    this.checkFullFreezeWin();
  }

  // ── Lobby helpers ───────────────────────────────────────────────────────────

  private getHumanMembers(): LobbyMemberState[] {
    return Array.from(this.state.members.values()).filter((member) => !member.isBot);
  }

  private getMemberSnapshots(): Array<{
    id: string;
    name: string;
    team: LobbyTeam;
    ready: boolean;
    connected: boolean;
    isBot: boolean;
  }> {
    return Array.from(this.state.members.values()).map((member) => ({
      id: member.id,
      name: member.name,
      team: member.team,
      ready: member.ready,
      connected: member.connected,
      isBot: member.isBot,
    }));
  }

  private ensureSeatForHuman(team: LobbyTeam): boolean {
    const teamMembers = Array.from(this.state.members.values()).filter((member) => member.team === team);
    if (teamMembers.length < this.state.teamSize) {
      return true;
    }

    const removableBot = teamMembers.find((member) => member.isBot);
    if (!removableBot) {
      return false;
    }

    this.state.members.delete(removableBot.id);
    return true;
  }

  private fillBotsToLobbySize(): void {
    this.fillTeamWithBots(0);
    this.fillTeamWithBots(1);
  }

  private fillTeamWithBots(team: LobbyTeam): void {
    const teamMembers = Array.from(this.state.members.values()).filter((member) => member.team === team);
    const missing = Math.max(0, this.state.teamSize - teamMembers.length);
    for (let index = 0; index < missing; index += 1) {
      const bot = new LobbyMemberState();
      const botId = `bot-${team}-${this.botCounters[team]}`;
      bot.id = botId;
      bot.sessionId = "";
      bot.name = buildBotName(this.botCounters[team], team);
      bot.team = team;
      bot.ready = false;
      bot.connected = true;
      bot.isBot = true;
      this.state.members.set(botId, bot);
      this.botCounters[team] += 1;
    }
  }

  private trimBotsToTeamSize(): void {
    this.trimTeamBots(0);
    this.trimTeamBots(1);
  }

  private trimTeamBots(team: LobbyTeam): void {
    const teamMembers = Array.from(this.state.members.values()).filter((member) => member.team === team);
    let overflow = Math.max(0, teamMembers.length - this.state.teamSize);
    if (overflow <= 0) {
      return;
    }

    for (const member of teamMembers) {
      if (!member.isBot) {
        continue;
      }

      this.state.members.delete(member.id);
      overflow -= 1;
      if (overflow <= 0) {
        break;
      }
    }
  }

  private removeAllBots(): void {
    for (const member of Array.from(this.state.members.values())) {
      if (member.isBot) {
        this.state.members.delete(member.id);
      }
    }
  }

  private hasHumanMembers(): boolean {
    return this.getHumanMembers().length > 0;
  }

  private resetLobbyReadiness(): void {
    for (const member of this.state.members.values()) {
      member.ready = false;
    }
  }

  private resetScore(): void {
    this.state.scoreTeam0 = 0;
    this.state.scoreTeam1 = 0;
    this.state.roundNumber = 0;
  }

  // ── Timer management ────────────────────────────────────────────────────────

  private clearTimers(): void {
    this.clearCountdownTimer();
    this.clearRoundTimer();
    this.clearMatchTick();
    if (this.roundEndTimer) {
      clearTimeout(this.roundEndTimer);
      this.roundEndTimer = null;
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private clearRoundTimer(): void {
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
  }

  private clearMatchTick(): void {
    if (this.matchTick) {
      clearInterval(this.matchTick);
      this.matchTick = null;
    }
  }

  private cancelRoundFlow(): void {
    this.clearTimers();
    this.countdownPreparedRound = false;
  }

  // ── Message helpers ─────────────────────────────────────────────────────────

  private sendInfo(client: RoomClient, text: string): void {
    client.send("lobby_event", { type: "info", text });
  }

  private sendError(client: RoomClient, text: string): void {
    client.send("lobby_event", { type: "error", text });
  }
}

// ── Pure geometry helpers ───────────────────────────────────────────────────

function sanitizePlayerName(rawName?: string): string {
  const trimmed = rawName?.trim().replace(/[^\x20-\x7E]/g, "").slice(0, 16);
  if (!trimmed || trimmed.length === 0) return "Pilot";
  return isCallSignClean(trimmed) ? trimmed : "Pilot";
}

function clampFinite(value: number, min: number, max: number): number {
  if (!isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function normalizeDirection(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } | null {
  const length = Math.hypot(x, y, z);
  if (!isFinite(length) || length < 1e-5) return null;
  return {
    x: x / length,
    y: y / length,
    z: z / length,
  };
}

function breachRoomCenter(goalAxis: "x" | "y" | "z", sign: 1 | -1): { x: number; y: number; z: number } {
  const center = { x: 0, y: 0, z: 0 };
  center[goalAxis] = sign * (ARENA_SIZE / 2 + BREACH_ROOM_D / 2);
  return center;
}

function breachExitYaw(axis: "x" | "y" | "z", openSign: 1 | -1): number {
  const dx = axis === "x" ? openSign : 0;
  const dz = axis === "z" ? openSign : 0;
  return Math.atan2(-dx, -dz);
}

function makeServerArenaQuery(
  goalAxis: "x" | "y" | "z",
  goalSigns: { team0: 1 | -1; team1: 1 | -1 },
) {
  const center0 = breachRoomCenter(goalAxis, goalSigns.team0);
  const center1 = breachRoomCenter(goalAxis, goalSigns.team1);
  const openSign0 = (-goalSigns.team0) as 1 | -1;
  const openSign1 = (-goalSigns.team1) as 1 | -1;
  return {
    getBreachRoomCenter: (team: 0 | 1) => (team === 0 ? center0 : center1),
    getBreachOpenAxis: (_team: 0 | 1) => goalAxis,
    getBreachOpenSign: (team: 0 | 1) => (team === 0 ? openSign0 : openSign1),
  };
}

interface BotPersonality {
  tier: number;
  launchSpeed: number;
  fireDelay: number;
  angleNoise: number;
  maxRange: number;
}

function botPersonality(idHash: number): BotPersonality {
  const tier = idHash % 5;
  return {
    tier,
    launchSpeed: 6 + tier * 2,      // 6..14
    fireDelay: 3.0 - tier * 0.4,    // 3.0..1.4s
    angleNoise: 0.45 - tier * 0.08, // 0.45..0.13
    maxRange: 15 + tier * 5,        // 15..35
  };
}

function botIdHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function botIntegrateZeroG(actor: ActorState, dt: number): void {
  const speed = Math.hypot(actor.velX, actor.velY, actor.velZ);
  if (speed > MAX_LAUNCH_SPEED) {
    const scale = MAX_LAUNCH_SPEED / speed;
    actor.velX *= scale;
    actor.velY *= scale;
    actor.velZ *= scale;
  }
  actor.posX += actor.velX * dt;
  actor.posY += actor.velY * dt;
  actor.posZ += actor.velZ * dt;
}

function botBounceArena(actor: ActorState, goalAxis: "x" | "z"): void {
  const half = ARENA_SIZE / 2 - PLAYER_RADIUS;
  const perpAxis: "x" | "z" = goalAxis === "x" ? "z" : "x";

  // Y axis — always solid
  if (actor.posY < -half) { actor.posY = -half; actor.velY = Math.abs(actor.velY); }
  else if (actor.posY > half) { actor.posY = half; actor.velY = -Math.abs(actor.velY); }

  // Perp axis — always solid
  if (perpAxis === "x") {
    if (actor.posX < -half) { actor.posX = -half; actor.velX = Math.abs(actor.velX); }
    else if (actor.posX > half) { actor.posX = half; actor.velX = -Math.abs(actor.velX); }
  } else {
    if (actor.posZ < -half) { actor.posZ = -half; actor.velZ = Math.abs(actor.velZ); }
    else if (actor.posZ > half) { actor.posZ = half; actor.velZ = -Math.abs(actor.velZ); }
  }

  // Goal axis — portal openings on both walls; breach room back wall at ±(ARENA_SIZE/2 + BREACH_ROOM_D)
  const perpPos = perpAxis === "x" ? actor.posX : actor.posZ;
  const inPortal = Math.abs(actor.posY) < BREACH_ROOM_H / 2 - PLAYER_RADIUS
    && Math.abs(perpPos) < BREACH_ROOM_W / 2 - PLAYER_RADIUS;
  const maxDepth = ARENA_SIZE / 2 + BREACH_ROOM_D - PLAYER_RADIUS;

  if (goalAxis === "x") {
    if (actor.posX < -half) {
      if (inPortal) {
        if (actor.posX < -maxDepth) { actor.posX = -maxDepth; actor.velX = Math.abs(actor.velX); }
      } else {
        actor.posX = -half; actor.velX = Math.abs(actor.velX);
      }
    } else if (actor.posX > half) {
      if (inPortal) {
        if (actor.posX > maxDepth) { actor.posX = maxDepth; actor.velX = -Math.abs(actor.velX); }
      } else {
        actor.posX = half; actor.velX = -Math.abs(actor.velX);
      }
    }
  } else {
    if (actor.posZ < -half) {
      if (inPortal) {
        if (actor.posZ < -maxDepth) { actor.posZ = -maxDepth; actor.velZ = Math.abs(actor.velZ); }
      } else {
        actor.posZ = -half; actor.velZ = Math.abs(actor.velZ);
      }
    } else if (actor.posZ > half) {
      if (inPortal) {
        if (actor.posZ > maxDepth) { actor.posZ = maxDepth; actor.velZ = -Math.abs(actor.velZ); }
      } else {
        actor.posZ = half; actor.velZ = -Math.abs(actor.velZ);
      }
    }
  }
}

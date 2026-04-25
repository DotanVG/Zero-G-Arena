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
  ARENA_SIZE,
  BREACH_ROOM_D,
  BREACH_ROOM_H,
  MATCH_POINT_TARGET,
  MAX_SPEED,
  PLAYER_RADIUS,
} from "../../../shared/constants";
import type { PlayerPhase } from "../../../shared/schema";
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
    if (this.state.phase !== "PLAYING") return;
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
    actor.phase = (VALID_PHASES.has(rawPhase) ? rawPhase : "FLOATING") as PlayerPhase;
    actor.frozen = Boolean(message.frozen);
    actor.leftArm = Boolean(message.leftArm);
    actor.rightArm = Boolean(message.rightArm);
    actor.leftLeg = Boolean(message.leftLeg);
    actor.rightLeg = Boolean(message.rightLeg);
    actor.kills = Math.min(MAX_KILLS, Math.max(0, Math.trunc(Number(message.kills)) || 0));
    actor.deaths = Math.min(MAX_KILLS, Math.max(0, Math.trunc(Number(message.deaths)) || 0));
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

    target.frozen = true;
    target.phase = "FROZEN";
    target.deaths += 1;
    target.frozenTimer = BOT_RESPAWN_SECONDS;
    shooter.kills += 1;

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
    }, MATCH_TICK_MS);
  }

  private finishRound(matchWinner: 0 | 1 | null): void {
    this.clearRoundTimer();
    this.clearMatchTick();

    this.state.phase = "ROUND_END";
    this.state.countdownRemaining = 0;
    this.state.roundTimeRemaining = 0;
    this.clearActors();

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

    const team0Center = breachRoomCenter(goalAxis, goalSigns.team0);
    const team1Center = breachRoomCenter(goalAxis, goalSigns.team1);

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
      actor.kills = 0;
      actor.deaths = 0;

      const center = member.team === 0 ? team0Center : team1Center;
      const sign = member.team === 0 ? goalSigns.team0 : goalSigns.team1;
      const index = member.team === 0 ? team0Index++ : team1Index++;
      const spawn = breachSpawnPos(center, goalAxis, sign, index);

      actor.posX = spawn.x;
      actor.posY = spawn.y;
      actor.posZ = spawn.z;

      this.state.actors.set(member.id, actor);
    }
  }

  private clearActors(): void {
    this.state.actors.clear();
  }

  private tickBots(dt: number): void {
    if (this.state.phase !== "PLAYING") return;

    for (const actor of this.state.actors.values()) {
      if (!actor.isBot) continue;

      if (actor.frozen) {
        actor.frozenTimer = Math.max(0, actor.frozenTimer - dt);
        if (actor.frozenTimer <= 0) {
          actor.frozen = false;
          actor.phase = "BREACH";
        }
        continue;
      }

      actor.yaw += (Math.random() - 0.5) * 0.08;
    }
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

function breachSpawnPos(
  center: { x: number; y: number; z: number },
  goalAxis: "x" | "y" | "z",
  sign: 1 | -1,
  index: number,
): { x: number; y: number; z: number } {
  const floorY = center.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS + 0.1;
  const backOffset = BREACH_ROOM_D / 2 - PLAYER_RADIUS - 0.5;
  const pos = { x: center.x, y: floorY, z: center.z };
  pos[goalAxis] = center[goalAxis] - sign * backOffset;
  const widthAxis: "x" | "z" = goalAxis === "z" ? "x" : "z";
  pos[widthAxis] = center[widthAxis] + (index - 1) * 1.5;
  return pos;
}

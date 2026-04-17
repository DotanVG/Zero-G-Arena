import { Room, type Client } from "@colyseus/core";
import {
  buildBotName,
  canStartLobbyRound,
  getPreferredJoinTeam,
  isMatchTeamSizeValue,
  MULTIPLAYER_COUNTDOWN_SECONDS,
  MULTIPLAYER_DEFAULT_TEAM_SIZE,
  MULTIPLAYER_ROUND_END_SECONDS,
  MULTIPLAYER_ROUND_SECONDS,
  type FillBotsMessage,
  type LobbyTeam,
  type SetReadyMessage,
  type SetTeamSizeMessage,
  type SwitchTeamMessage,
} from "../../../shared/multiplayer";
import type { MatchTeamSize } from "../../../shared/match";
import { LobbyMemberState, OrbitalLobbyState } from "./state";

type RoomClient = Client;

export class OrbitalLobbyRoom extends Room<{ state: OrbitalLobbyState }> {
  public maxClients = 32;
  public autoDispose = true;
  public patchRate = 100;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private roundEndTimer: ReturnType<typeof setTimeout> | null = null;
  private botCounters: Record<LobbyTeam, number> = { 0: 0, 1: 0 };

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

    void this.unlock();
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
      this.cancelRoundFlow();
      this.resetLobbyReadiness();
      this.state.phase = "LOBBY";
      this.state.countdownRemaining = 0;
      this.state.roundTimeRemaining = 0;
    }

    this.syncLobbyFlow();
  }

  public onDispose(): void {
    this.clearTimers();
  }

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
    member.ready = false;
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
    this.resetLobbyReadiness();
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

    this.resetLobbyReadiness();
    this.syncLobbyFlow();
  }

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
    this.state.phase = "COUNTDOWN";
    this.state.countdownRemaining = MULTIPLAYER_COUNTDOWN_SECONDS;
    void this.lock();

    this.countdownTimer = setInterval(() => {
      this.state.countdownRemaining = Math.max(0, this.state.countdownRemaining - 1);
      if (this.state.countdownRemaining <= 0) {
        this.clearCountdownTimer();
        this.startRound();
      }
    }, 1000);
  }

  private cancelCountdown(): void {
    this.clearCountdownTimer();
    this.state.phase = "LOBBY";
    this.state.countdownRemaining = 0;
    void this.unlock();
  }

  private startRound(): void {
    this.state.phase = "PLAYING";
    this.state.roundNumber += 1;
    this.state.roundTimeRemaining = MULTIPLAYER_ROUND_SECONDS;

    this.roundTimer = setInterval(() => {
      this.state.roundTimeRemaining = Math.max(0, this.state.roundTimeRemaining - 1);
      if (this.state.roundTimeRemaining <= 0) {
        this.clearRoundTimer();
        this.finishRound();
      }
    }, 1000);
  }

  private finishRound(): void {
    this.state.phase = "ROUND_END";
    this.state.roundTimeRemaining = 0;
    this.resetLobbyReadiness();

    this.roundEndTimer = setTimeout(() => {
      this.state.phase = "LOBBY";
      this.state.countdownRemaining = 0;
      this.state.roundTimeRemaining = 0;
      void this.unlock();
    }, MULTIPLAYER_ROUND_END_SECONDS * 1000);
  }

  private clearTimers(): void {
    this.clearCountdownTimer();
    this.clearRoundTimer();
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

  private cancelRoundFlow(): void {
    this.clearTimers();
  }

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

  private sendInfo(client: RoomClient, text: string): void {
    client.send("lobby_event", { type: "info", text });
  }

  private sendError(client: RoomClient, text: string): void {
    client.send("lobby_event", { type: "error", text });
  }
}

function sanitizePlayerName(rawName?: string): string {
  const trimmed = rawName?.trim().slice(0, 16);
  return trimmed && trimmed.length > 0 ? trimmed : "Pilot";
}

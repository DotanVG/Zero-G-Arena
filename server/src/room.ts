/**
 * Room — manages one match (lobby → countdown → playing → round-end → repeat).
 * Supports 5v5, 10v10, 20v20.
 */
import WebSocket from 'ws';
import { Sim } from './sim';
import { ServerPlayer } from './player';
import { generateArenaLayout } from '../../shared/arena-gen';
import {
  TICK_RATE,
  ROUND_END_DELAY,
  COUNTDOWN_SECONDS,
  ROUND_START_FADE_SECONDS,
  BOT_NAMES,
} from '../../shared/constants';
import type {
  ClientInputMsg,
  GamePhase,
  LobbyStateMsg,
  ServerEventMsg,
  ShootEventData,
  HitEventData,
  ScoreEventData,
} from '../../shared/schema';

export type MatchSize = 5 | 10 | 20;

export class Room {
  public readonly id: string;
  public readonly matchSize: MatchSize;
  private clients   = new Map<WebSocket, ServerPlayer>();
  private sim       = new Sim();
  private interval: ReturnType<typeof setInterval> | null = null;
  private roundEndTimer = 0;
  private emptyTimer    = 0;
  private lobbyCountdown = 0;

  public onEmpty: ((room: Room) => void) | null = null;

  public constructor(id: string, matchSize: MatchSize) {
    this.id        = id;
    this.matchSize = matchSize;
    this._wireSimCallbacks();
  }

  // ── Client management ─────────────────────────────────────────────────────

  public addClient(ws: WebSocket, name: string): ServerPlayer {
    const team   = this._nextTeam();
    const player = new ServerPlayer(name, team, false);
    this.clients.set(ws, player);
    this.sim.addPlayer(player);
    this._syncLobbyCountdown();
    this._broadcastLobby();

    return player;
  }

  public removeClient(ws: WebSocket): void {
    const player = this.clients.get(ws);
    if (player) {
      player.connected = false;
      this.sim.removePlayer(player.id);
    }
    this.clients.delete(ws);
    this._syncLobbyCountdown();
    if (this.sim.phase === 'LOBBY') {
      this._broadcastLobby();
    }
  }

  public handleInput(ws: WebSocket, msg: ClientInputMsg): void {
    const player = this.clients.get(ws);
    if (player) player.lastInput = msg;
  }

  public handleReady(ws: WebSocket, ready: boolean): void {
    const player = this.clients.get(ws);
    if (!player || player.isBot || this.sim.phase !== 'LOBBY') return;

    player.ready = ready;
    this._syncLobbyCountdown();
    this._broadcastLobby();
  }

  public handleLobbyAction(ws: WebSocket, action: 'addBots' | 'switchTeam' | 'removeBotFromTeam', team?: 0 | 1): void {
    if (this.sim.phase !== 'LOBBY') return;

    if (action === 'addBots') {
      this._addBotPair();
    } else if (action === 'switchTeam') {
      const player = this.clients.get(ws);
      if (player) player.team = (1 - player.team) as 0 | 1;
    } else if (action === 'removeBotFromTeam') {
      const targetTeam = team ?? 0;
      const bot = [...this.sim.players.values()].find(p => p.isBot && p.team === targetTeam);
      if (bot) this.sim.removePlayer(bot.id);
    }
    this._broadcastLobby();
  }

  public isFull(): boolean {
    return this.sim.players.size >= this.matchSize * 2;
  }

  public isEmpty(): boolean {
    return this.clients.size === 0;
  }

  public playerCount(): number {
    return this.clients.size;
  }

  public getPhase(): GamePhase {
    return this.sim.phase;
  }

  // ── Tick loop ─────────────────────────────────────────────────────────────

  public start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  public stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  private _tick(): void {
    const dt = 1 / TICK_RATE;

    if (this.isEmpty()) {
      this.emptyTimer += dt;
      if (this.emptyTimer > 60) { this.onEmpty?.(this); this.stop(); }
      return;
    }
    this.emptyTimer = 0;

    if (this.sim.phase === 'LOBBY') {
      this._tickLobby(dt);
      return;
    }

    if (this.sim.phase === 'ROUND_END') {
      this.roundEndTimer -= dt;
      if (this.roundEndTimer <= 0) this._beginRound(COUNTDOWN_SECONDS);
      this._broadcastSnapshot();
      return;
    }

    const roundEnd = this.sim.tick(dt);

    if (roundEnd) {
      this.sim.phase = 'ROUND_END';
      this.roundEndTimer = ROUND_END_DELAY;
      this._broadcastEvent('roundEnd', {
        scorerId:   roundEnd.scorerId,
        scorerName: roundEnd.scorerName,
        scorerTeam: roundEnd.winningTeam,
      } as ScoreEventData);
    }

    this._broadcastSnapshot();
  }

  private _tickLobby(dt: number): void {
    if (this.lobbyCountdown <= 0) return;

    const previousCeil = Math.ceil(this.lobbyCountdown);
    this.lobbyCountdown = Math.max(0, this.lobbyCountdown - dt);
    const nextCeil = Math.ceil(this.lobbyCountdown);

    if (this.lobbyCountdown <= 0) {
      this._beginRound();
      return;
    }

    if (nextCeil !== previousCeil) {
      this._broadcastLobby();
    }
  }

  // ── Round flow ────────────────────────────────────────────────────────────

  private _beginRound(countdownSeconds = ROUND_START_FADE_SECONDS): void {
    const seed        = Date.now();
    const genLayout   = generateArenaLayout(seed);
    const layout: import('../../shared/schema').ArenaLayoutMsg = { t: 'layout', ...genLayout };
    this.sim.loadLayout(layout);
    this.lobbyCountdown = 0;

    // Fill empty slots with bots
    this._fillWithBots();

    // Reset all players
    this.sim.resetForNewRound();
    this._resetHumanReadyState();

    // Broadcast layout to all clients
    this._broadcastAll(layout);

    this.sim.startCountdown(countdownSeconds);
  }

  private _fillWithBots(): void {
    const team0Count = [...this.sim.players.values()].filter(p => p.team === 0).length;
    const team1Count = [...this.sim.players.values()].filter(p => p.team === 1).length;

    const need0 = Math.max(0, this.matchSize - team0Count);
    const need1 = Math.max(0, this.matchSize - team1Count);

    for (let i = 0; i < need0; i++) this._addBot(0);
    for (let i = 0; i < need1; i++) this._addBot(1);
  }

  private _addBotPair(): void {
    const team0Count = [...this.sim.players.values()].filter(p => p.team === 0).length;
    const team1Count = [...this.sim.players.values()].filter(p => p.team === 1).length;

    if (team0Count < this.matchSize) this._addBot(0);
    if (team1Count < this.matchSize) this._addBot(1);
  }

  private _syncLobbyCountdown(): void {
    if (this.sim.phase !== 'LOBBY') {
      this.lobbyCountdown = 0;
      return;
    }

    if (this._allHumansReady()) {
      if (this.lobbyCountdown <= 0) {
        this.lobbyCountdown = COUNTDOWN_SECONDS;
      }
      return;
    }

    this.lobbyCountdown = 0;
  }

  private _allHumansReady(): boolean {
    const humans = [...this.sim.players.values()].filter((p) => !p.isBot);
    return humans.length > 0 && humans.every((p) => p.ready);
  }

  private _resetHumanReadyState(): void {
    for (const player of this.sim.players.values()) {
      if (!player.isBot) player.ready = false;
    }
  }

  private _addBot(team: 0 | 1): void {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const bot  = new ServerPlayer(name, team, true);
    this.sim.addPlayer(bot);
    // Bots run simple AI in their own tick (placeholder — Phase 4)
  }

  // ── Sim callbacks ─────────────────────────────────────────────────────────

  private _wireSimCallbacks(): void {
    this.sim.onShoot = (proj) => {
      this._broadcastEvent('shoot', {
        projectileId: proj.id,
        ownerId:      proj.ownerId,
        pos:          { ...proj.pos },
        vel:          { ...proj.vel },
        team:         proj.team,
      } as ShootEventData);
    };

    this.sim.onHit = (proj, target, zone, impactPos) => {
      const shooter = this.sim.players.get(proj.ownerId);
      this._broadcastEvent('hit', {
        projectileId: proj.id,
        targetId:     target.id,
        zone,
        impactPos:    { ...impactPos },
        frozen:       zone === 'head' || zone === 'body',
        killerName:   shooter?.name ?? 'Unknown',
        victimName:   target.name,
      } as HitEventData);
    };

    this.sim.onScore = (info) => {
      this._broadcastEvent('score', {
        scorerId:   info.scorerId,
        scorerName: info.scorerName,
        scorerTeam: info.winningTeam,
      } as ScoreEventData);
    };
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

  private _broadcastSnapshot(): void {
    this._broadcastAll(this.sim.getSnapshot());
  }

  private _broadcastLobby(): void {
    const players = [...this.sim.players.values()].map((p) => ({
      id:    p.id,
      name:  p.name,
      team:  p.team,
      isBot: p.isBot,
      ready: p.ready,
    }));
    const countdown = this.lobbyCountdown > 0 ? Math.ceil(this.lobbyCountdown) : undefined;

    for (const [ws, player] of this.clients) {
      const msg: LobbyStateMsg = {
        t:         'lobby',
        roomId:    this.id,
        matchSize: this.matchSize,
        players,
        selfId:    player.id,
        selfTeam:  player.team,
        countdown,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  }

  private _broadcastEvent(type: ServerEventMsg['type'], data: unknown): void {
    this._broadcastAll({ t: 'event', type, data } satisfies ServerEventMsg);
  }

  private _broadcastAll(msg: unknown): void {
    const str = JSON.stringify(msg);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(str);
    }
  }

  // ── Team assignment ───────────────────────────────────────────────────────

  private _nextTeam(): 0 | 1 {
    const team0 = [...this.sim.players.values()].filter(p => p.team === 0).length;
    const team1 = [...this.sim.players.values()].filter(p => p.team === 1).length;
    return team0 <= team1 ? 0 : 1;
  }

  private _humanCount(): number {
    return [...this.sim.players.values()].filter(p => !p.isBot).length;
  }

  private _botCount(): number {
    return [...this.sim.players.values()].filter(p => p.isBot).length;
  }

  public toRoomInfo(): import('../../shared/schema').RoomInfo {
    return {
      id:          this.id,
      playerCount: this.sim.players.size,
      maxPlayers:  this.matchSize * 2,
      phase:       this.sim.phase,
      matchSize:   this.matchSize,
    };
  }
}

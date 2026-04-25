import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import { getColyseusEndpoint } from "./endpoint";
import { isMatchTeamSize, type MatchTeamSize } from "../../../shared/match";
import {
  MULTIPLAYER_DEFAULT_TEAM_SIZE,
  MULTIPLAYER_ROOM_NAME,
  type BreachReportMessage,
  type FillBotsMessage,
  type FreezeEventMessage,
  type HitReportMessage,
  type LobbyEventMessage,
  type LobbyMemberSnapshot,
  type LobbyTeam,
  type MultiplayerJoinOptions,
  type MultiplayerRoomSnapshot,
  type OnlineActorSnapshot,
  type PlayerUpdateMessage,
  type RoundResultEventMessage,
  type SetReadyMessage,
  type SetTeamSizeMessage,
  type ShotEventMessage,
  type SwitchTeamMessage,
} from "../../../shared/multiplayer";

// Production reads VITE_COLYSEUS_ENDPOINT; dev defaults to same-origin so Vite
// proxies /matchmake HTTP and /ws WebSocket to the local game server.
// WebSocket endpoint is taken from the seat reservation's publicAddress field (set by the server).
const SERVER_URL = getColyseusEndpoint();

type ColyseusRoomState = {
  phase: string;
  countdownRemaining: number;
  roundTimeRemaining: number;
  scoreTeam0: number;
  scoreTeam1: number;
  teamSize: number;
  roundNumber: number;
  members: unknown;
  actors: unknown;
};

export class NetClient {
  private client: ColyseusClient | null = SERVER_URL ? new ColyseusClient(SERVER_URL) : null;
  private room: Room | null = null;

  public onStateChange: ((snapshot: MultiplayerRoomSnapshot) => void) | null = null;
  public onLobbyEvent: ((event: LobbyEventMessage) => void) | null = null;
  public onLeave: (() => void) | null = null;
  public onFreezeEvent: ((event: FreezeEventMessage) => void) | null = null;
  public onRoundResultEvent: ((event: RoundResultEventMessage) => void) | null = null;
  public onShotEvent: ((event: ShotEventMessage) => void) | null = null;

  public async connect(options: MultiplayerJoinOptions): Promise<MultiplayerRoomSnapshot> {
    await this.disconnect(false);

    if (!this.client) {
      throw new Error(
        "Online multiplayer endpoint not configured (VITE_COLYSEUS_ENDPOINT missing).",
      );
    }

    const room = await this.client.joinOrCreate(MULTIPLAYER_ROOM_NAME, {
      name: options.name,
    });

    this.room = room;
    room.onStateChange((state) => {
      this.onStateChange?.(buildSnapshot(room, state as ColyseusRoomState));
    });
    room.onMessage("lobby_event", (event: LobbyEventMessage) => {
      this.onLobbyEvent?.(event);
    });
    room.onMessage("freeze_event", (event: FreezeEventMessage) => {
      this.onFreezeEvent?.(event);
    });
    room.onMessage("round_result_event", (event: RoundResultEventMessage) => {
      this.onRoundResultEvent?.(event);
    });
    room.onMessage("shot_event", (event: ShotEventMessage) => {
      this.onShotEvent?.(event);
    });
    room.onLeave(() => {
      this.room = null;
      this.onLeave?.();
    });

    return buildSnapshot(room, room.state as ColyseusRoomState);
  }

  public async disconnect(consented = true): Promise<void> {
    const room = this.room;
    this.room = null;
    if (room) {
      await room.leave(consented);
    }
  }

  public getSessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  public setReady(ready: boolean): void {
    this.send<SetReadyMessage>("ready", { ready });
  }

  public switchTeam(team: LobbyTeam): void {
    this.send<SwitchTeamMessage>("switch_team", { team });
  }

  public setTeamSize(teamSize: MatchTeamSize): void {
    this.send<SetTeamSizeMessage>("set_team_size", { teamSize });
  }

  public fillBots(fill: boolean): void {
    this.send<FillBotsMessage>("fill_bots", { fill });
  }

  public sendPlayerUpdate(message: PlayerUpdateMessage): void {
    this.send<PlayerUpdateMessage>("player_update", message);
  }

  public sendHitReport(message: HitReportMessage): void {
    this.send<HitReportMessage>("hit_report", message);
  }

  public sendShot(message: ShotEventMessage): void {
    this.send<ShotEventMessage>("shot_event", message);
  }

  public sendBreachReport(message: BreachReportMessage): void {
    this.send<BreachReportMessage>("breach_report", message);
  }

  private send<T>(type: string, message: T): void {
    this.room?.send(type, message);
  }
}

function buildSnapshot(
  room: Room,
  state: ColyseusRoomState,
): MultiplayerRoomSnapshot {
  const members = getMembers(state.members);
  const actors = getActors(state.actors);
  const self = members.find((member) => member.id === room.sessionId);
  const teamSize = isMatchTeamSize(state.teamSize)
    ? state.teamSize
    : MULTIPLAYER_DEFAULT_TEAM_SIZE;

  return {
    roomId: room.roomId,
    sessionId: room.sessionId,
    selfTeam: self?.team ?? 0,
    phase: toRoomPhase(state.phase),
    countdownRemaining: Number(state.countdownRemaining ?? 0),
    roundTimeRemaining: Number(state.roundTimeRemaining ?? 0),
    score: {
      team0: Number(state.scoreTeam0 ?? 0),
      team1: Number(state.scoreTeam1 ?? 0),
    },
    roundNumber: Number(state.roundNumber ?? 0),
    teamSize,
    members,
    actors,
  };
}

function getMembers(rawMembers: unknown): LobbyMemberSnapshot[] {
  const members: LobbyMemberSnapshot[] = [];
  const collection = rawMembers as {
    forEach?: (cb: (value: Record<string, unknown>) => void) => void;
  };

  if (typeof collection?.forEach === "function") {
    collection.forEach((value) => {
      members.push(toLobbyMember(value));
    });
    return members.sort(sortMembers);
  }

  if (rawMembers && typeof rawMembers === "object") {
    for (const value of Object.values(rawMembers as Record<string, Record<string, unknown>>)) {
      members.push(toLobbyMember(value));
    }
  }

  return members.sort(sortMembers);
}

function getActors(rawActors: unknown): OnlineActorSnapshot[] {
  const actors: OnlineActorSnapshot[] = [];
  const collection = rawActors as {
    forEach?: (cb: (value: Record<string, unknown>) => void) => void;
  };

  if (typeof collection?.forEach === "function") {
    collection.forEach((value) => {
      actors.push(toActorSnapshot(value));
    });
    return actors;
  }

  if (rawActors && typeof rawActors === "object") {
    for (const value of Object.values(rawActors as Record<string, Record<string, unknown>>)) {
      actors.push(toActorSnapshot(value));
    }
  }

  return actors;
}

function toLobbyMember(value: Record<string, unknown>): LobbyMemberSnapshot {
  return {
    id: String(value.id ?? ""),
    name: String(value.name ?? "Pilot"),
    team: value.team === 1 ? 1 : 0,
    ready: Boolean(value.ready),
    connected: Boolean(value.connected),
    isBot: Boolean(value.isBot),
  };
}

function toActorSnapshot(value: Record<string, unknown>): OnlineActorSnapshot {
  return {
    id: String(value.id ?? ""),
    name: String(value.name ?? "Pilot"),
    team: value.team === 1 ? 1 : 0,
    isBot: Boolean(value.isBot),
    posX: Number(value.posX ?? 0),
    posY: Number(value.posY ?? 0),
    posZ: Number(value.posZ ?? 0),
    velX: Number(value.velX ?? 0),
    velY: Number(value.velY ?? 0),
    velZ: Number(value.velZ ?? 0),
    yaw: Number(value.yaw ?? 0),
    phase: String(value.phase ?? "BREACH"),
    frozen: Boolean(value.frozen),
    leftArm: Boolean(value.leftArm),
    rightArm: Boolean(value.rightArm),
    leftLeg: Boolean(value.leftLeg),
    rightLeg: Boolean(value.rightLeg),
    kills: Number(value.kills ?? 0),
    deaths: Number(value.deaths ?? 0),
  };
}

function sortMembers(a: LobbyMemberSnapshot, b: LobbyMemberSnapshot): number {
  if (a.team !== b.team) {
    return a.team - b.team;
  }
  if (a.isBot !== b.isBot) {
    return a.isBot ? 1 : -1;
  }
  return a.name.localeCompare(b.name);
}

function toRoomPhase(phase: string): MultiplayerRoomSnapshot["phase"] {
  switch (phase) {
    case "COUNTDOWN":
    case "PLAYING":
    case "ROUND_END":
      return phase;
    default:
      return "LOBBY";
  }
}

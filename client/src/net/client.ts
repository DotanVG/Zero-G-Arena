import { Client as ColyseusClient, type Room } from "colyseus.js";
import { isMatchTeamSize, type MatchTeamSize } from "../../../shared/match";
import {
  MULTIPLAYER_DEFAULT_TEAM_SIZE,
  MULTIPLAYER_ROOM_NAME,
  type FillBotsMessage,
  type LobbyEventMessage,
  type LobbyMemberSnapshot,
  type LobbyTeam,
  type MultiplayerJoinOptions,
  type MultiplayerRoomSnapshot,
  type SetReadyMessage,
  type SetTeamSizeMessage,
  type SwitchTeamMessage,
} from "../../../shared/multiplayer";

const SERVER_URL = import.meta.env.VITE_SERVER_URL
  ?? (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : `${location.protocol}//${location.host}`);

type ColyseusRoomState = {
  phase: string;
  countdownRemaining: number;
  roundTimeRemaining: number;
  scoreTeam0: number;
  scoreTeam1: number;
  teamSize: number;
  roundNumber: number;
  members: unknown;
};

export class NetClient {
  private client = new ColyseusClient(SERVER_URL);
  private room: Room | null = null;

  public onStateChange: ((snapshot: MultiplayerRoomSnapshot) => void) | null = null;
  public onLobbyEvent: ((event: LobbyEventMessage) => void) | null = null;
  public onLeave: (() => void) | null = null;

  public async connect(options: MultiplayerJoinOptions): Promise<MultiplayerRoomSnapshot> {
    await this.disconnect(false);

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

  private send<T>(type: string, message: T): void {
    this.room?.send(type, message);
  }
}

function buildSnapshot(
  room: Room,
  state: ColyseusRoomState,
): MultiplayerRoomSnapshot {
  const members = getMembers(state.members);
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

export type ArenaStateId = "A" | "B" | "C";

export interface PlayerNetState {
  id: string;
  team: 0 | 1;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  rot: { yaw: number; pitch: number; roll: number };
  state: "ACTIVE" | "FROZEN" | "RESPAWNING";
}

export interface ScoreState {
  team0: number;
  team1: number;
}

export interface ServerStateMsg {
  t: "state";
  seq: number;
  players: PlayerNetState[];
  score: ScoreState;
  arenaState: ArenaStateId;
}

export interface ServerEventMsg {
  t: "event";
  type: "hit" | "score" | "spawn";
  data: any;
}

export interface ClientInputMsg {
  t: "input";
  id: string;
  seq: number;
  axes: { x: number; y: number; z: number };
  boost: boolean;
  fire: boolean;
  rot: { yaw: number; pitch: number; roll: number };
}

export interface ClientJoinMsg {
  t: "join";
  name: string;
}

export type ClientMessage = ClientInputMsg | ClientJoinMsg;

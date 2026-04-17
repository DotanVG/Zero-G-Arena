// --- Shared vector types ---
export interface Vec3 { x: number; y: number; z: number; }

// --- Damage state (persistent per round) ---
export interface DamageState {
  frozen:   boolean;   // head or body hit — permanent for round, player drifts
  rightArm: boolean;   // can't fire pistol
  leftArm:  boolean;   // can't grab bars
  legs:     boolean;   // max launch power capped at 2/3
}

// --- Arena state ---
export type ArenaStateId = string; // 'A'|'B'|'C' legacy OR dynamic seed string

// --- Obstacle / bar layout (for random generation + network sync) ---
export interface BarDef {
  localPos: Vec3;   // offset from parent obstacle centre
  normal:   Vec3;   // outward face normal
}

export interface ObstacleNetDef {
  pos:       Vec3;
  size:      Vec3;
  archetype: 'box' | 'plate' | 'beam';
  bars:      BarDef[];
}

// --- Player network state ---
export type PlayerPhase =
  | 'BREACH'      // in breach room, gravity active
  | 'FLOATING'    // in arena, zero-G drift
  | 'GRABBING'    // clamped to a bar, vel=0
  | 'AIMING'      // holding Space while grabbing, charging launch
  | 'FROZEN'      // head/body hit — permanent this round, drifts physics only
  | 'RESPAWNING'; // waiting to re-enter breach room

export interface PlayerNetState {
  id:        string;
  name:      string;
  team:      0 | 1;
  pos:       Vec3;
  vel:       Vec3;
  rot:       { yaw: number; pitch: number };
  phase:     PlayerPhase;
  damage:    DamageState;
  ping:      number;
  kills:     number;   // breaches scored
  deaths:    number;   // times frozen
  connected: boolean;  // false = ghost body (disconnected player still floating)
  isBot?:    boolean;
}

// --- Score ---
export interface ScoreState { team0: number; team1: number; }

// --- Server → Client ---
export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export interface ServerStateMsg {
  t:          'state';
  seq:        number;
  players:    PlayerNetState[];
  score:      ScoreState;
  arenaState: ArenaStateId;
  phase:      GamePhase;
  countdown?: number;
}

export interface ArenaLayoutMsg {
  t:          'layout';
  obstacles:  ObstacleNetDef[];
  goalAxis:   'x' | 'y' | 'z';
  goalSigns:  { team0: 1 | -1; team1: 1 | -1 };
  seed:       number;
}

export interface RoundEndMsg {
  t:            'roundEnd';
  winningTeam:  0 | 1;
  scorerId:     string;
}

// --- Tab scoreboard ---
export interface FullPlayerInfo {
  id:     string;
  name:   string;
  frozen: boolean;   // own team only — visible to teammates
  kills:  number;
  deaths: number;
  ping:   number;
  isBot:  boolean;
}

export interface EnemyPlayerInfo {
  id:     string;
  name:   string;
  // frozen is intentionally OMITTED — info asymmetry by design
  kills:  number;
  deaths: number;
  ping:   number;
  isBot:  boolean;
}

export interface TabListMsg {
  t:         'tabList';
  ownTeam:   FullPlayerInfo[];
  enemyTeam: EnemyPlayerInfo[];
}

export interface ServerEventMsg {
  t:    'event';
  type: 'hit' | 'score' | 'spawn' | 'roundEnd';
  data: unknown;
}

// --- Client → Server ---
export interface ClientInputMsg {
  t:          'input';
  id:         string;
  seq:        number;
  walkAxes:   { x: number; z: number };  // replaces old axes (no y thrust in arena)
  grab:       boolean;
  aiming:     boolean;
  launchPower?: number;
  fire:       boolean;
  rot:        { yaw: number; pitch: number };
  phase:      PlayerPhase;
}

export interface ClientJoinMsg {
  t:    'join';
  name: string;
}

export type ClientMessage = ClientInputMsg | ClientJoinMsg;

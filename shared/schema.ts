// --- Shared vector types ---
export interface Vec3 { x: number; y: number; z: number; }

// --- Damage state (persistent per round) ---
export interface DamageState {
  frozen:   boolean;   // head or body hit — permanent for round, player drifts
  rightArm: boolean;   // can't fire pistol
  leftArm:  boolean;   // can't grab bars
  legs:     0 | 1 | 2; // 0=ok, 1=one leg hit (−25% launch), 2=both legs (−50%)
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
  isBot:     boolean;
}

// --- Score ---
export interface ScoreState { team0: number; team1: number; }

// --- Server → Client ---
export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export interface ServerStateMsg {
  t:               'state';
  seq:             number;
  players:         PlayerNetState[];
  score:           ScoreState;
  arenaState:      ArenaStateId;
  phase:           GamePhase;
  countdown?:      number;
  serverTime:      number;  // ms since server start, for interpolation
  allFrozenTeam?:  0 | 1;  // which enemy team has ALL members frozen
  allFrozenTimer?: number; // seconds remaining before frozen team unfreezes
}

export interface ArenaLayoutMsg {
  t:         'layout';
  obstacles: ObstacleNetDef[];
  goalAxis:  'x' | 'y' | 'z';
  goalSigns: { team0: 1 | -1; team1: 1 | -1 };
  seed:      number;
}

export interface RoundEndMsg {
  t:           'roundEnd';
  winningTeam: 0 | 1;
  scorerId:    string;
}

// --- Lobby messages ---
export interface LobbyPlayer {
  id:      string;
  name:    string;
  team:    0 | 1;
  isBot:   boolean;
  ready:   boolean;
}

export interface LobbyStateMsg {
  t:         'lobby';
  roomId:    string;
  players:   LobbyPlayer[];
  matchSize: 5 | 10 | 20;
  selfId:    string;
  selfTeam:  0 | 1;
  countdown?: number;   // ready countdown before the round layout is sent
}

export interface RoomInfo {
  id:          string;
  playerCount: number;
  maxPlayers:  number;
  phase:       GamePhase;
  matchSize:   5 | 10 | 20;
}

export interface RoomListMsg {
  t:     'roomList';
  rooms: RoomInfo[];
}

// --- Projectile ---
export interface ProjectileNetState {
  id:      number;
  pos:     Vec3;
  vel:     Vec3;
  team:    0 | 1;
  ownerId: string;
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

// --- Event messages (shoot, hit, kill-feed) ---
export interface ShootEventData {
  projectileId: number;
  ownerId:      string;
  pos:          Vec3;
  vel:          Vec3;
  team:         0 | 1;
}

export interface HitEventData {
  projectileId: number;
  targetId:     string;
  zone:         'head' | 'body' | 'rightArm' | 'leftArm' | 'legs';
  impactPos:    Vec3;
  frozen:       boolean;   // was this a freeze (head/body)?
  killerName:   string;
  victimName:   string;
}

export interface ScoreEventData {
  scorerId:    string;
  scorerName:  string;
  scorerTeam:  0 | 1;
}

export interface ServerEventMsg {
  t:    'event';
  type: 'shoot' | 'hit' | 'score' | 'spawn' | 'roundEnd';
  data: ShootEventData | HitEventData | ScoreEventData | unknown;
}

// --- Client → Server ---
export interface ClientInputMsg {
  t:           'input';
  id:          string;
  seq:         number;
  walkAxes:    { x: number; z: number };
  grab:        boolean;
  aiming:      boolean;
  launchPower?: number;
  aimDy:       number;   // mouse Y delta for launch power charging
  fire:        boolean;
  fireCharge?: number;  // 0..1 trigger squeeze; full charge = exact shot
  jumping:     boolean;  // space pressed in breach room
  rot:         { yaw: number; pitch: number };
  lookDir:     Vec3;
  phase:       PlayerPhase;
}

export interface ClientJoinMsg {
  t:         'join';
  name:      string;
  matchSize: 5 | 10 | 20;
  mode:      'quick' | 'browse';
  roomId?:   string;       // for browse mode
}

export interface ClientReadyMsg {
  t: 'ready';
  ready: boolean;
}

export interface ClientRequestRoomListMsg {
  t: 'requestRoomList';
}

export interface ClientLobbyActionMsg {
  t:      'lobbyAction';
  action: 'addBots' | 'switchTeam' | 'removeBotFromTeam';
  team?:  0 | 1;   // used by removeBotFromTeam; switchTeam uses server-side lookup by ws
}

export type ClientMessage =
  | ClientInputMsg
  | ClientJoinMsg
  | ClientReadyMsg
  | ClientRequestRoomListMsg
  | ClientLobbyActionMsg;

export type ServerMessage =
  | ServerStateMsg
  | ArenaLayoutMsg
  | LobbyStateMsg
  | RoomListMsg
  | ServerEventMsg
  | TabListMsg;

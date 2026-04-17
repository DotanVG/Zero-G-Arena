export const ARENA_SIZE             = 40;
export const PLAYER_RADIUS          = 0.8;
export const TICK_RATE              = 20;
export const FREEZE_TIME            = 2.0;    // kept for server compat
export const RESPAWN_TIME           = 2.0;
export const INVULN_TIME            = 0.5;
export const FIRE_RATE              = 6;

// Zero-G / Launch
export const MAX_LAUNCH_SPEED       = 20;
export const LEGS_HIT_LAUNCH_FACTOR = 2 / 3;
export const ZERO_G_DAMPING         = 1.0;    // true zero-G — no velocity bleed
export const GRAB_RADIUS            = 3.0;
export const LAUNCH_AIM_SENSITIVITY = 0.05;

// Bars
export const BAR_RADIUS             = 0.1;
export const BAR_LENGTH             = 1.5;
export const BARS_PER_OBS_MIN       = 3;
export const BARS_PER_OBS_MAX       = 8;

// Breach room
export const BREACH_ROOM_W          = 8;
export const BREACH_ROOM_H          = 6;
export const BREACH_ROOM_D          = 6;
export const BREACH_GRAVITY         = -12;
export const BREACH_JUMP_SPEED      = 7;
export const BREACH_WALK_SPEED      = 6;

// Zero-G portal gravity — subtle pull toward enemy portal in FLOATING state
export const ZERO_G_PORTAL_GRAVITY  = 1.5;

// Game flow
export const COUNTDOWN_SECONDS      = 5;
export const ROUND_END_DELAY        = 5;     // seconds before new round starts
export const ROUND_DURATION_SECONDS = 120;   // hard cap so every round ends

// Solo bot roster
export const BOT_NAMES = [
  'UNIT-7',
  'GHOST-3',
  'NOVA-5',
  'DRIFT-1',
  'ECHO-9',
  'RIFT-2',
  'LANCER-4',
  'ORBIT-6',
  'VOID-8',
  'PULSE-0',
] as const;

// Obstacles
export const OBSTACLE_MIN           = 14;
export const OBSTACLE_MAX           = 22;

// Legacy (kept for server sim — no longer used by client physics)
export const ACCEL                  = 18;
export const MAX_SPEED              = 16;
export const DAMPING                = 0.92;
export const BOOST                  = 10;

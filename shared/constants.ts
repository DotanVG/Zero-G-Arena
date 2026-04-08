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
export const ZERO_G_DAMPING         = 0.9995;
export const GRAB_RADIUS            = 2.0;
export const LAUNCH_AIM_SENSITIVITY = 0.05;

// Bars
export const BAR_RADIUS             = 0.1;
export const BAR_LENGTH             = 1.5;
export const BARS_PER_OBS_MIN       = 1;
export const BARS_PER_OBS_MAX       = 3;

// Breach room
export const BREACH_ROOM_W          = 8;
export const BREACH_ROOM_H          = 6;
export const BREACH_ROOM_D          = 6;
export const BREACH_GRAVITY         = -12;
export const BREACH_JUMP_SPEED      = 7;
export const BREACH_WALK_SPEED      = 6;

// Game flow
export const COUNTDOWN_SECONDS      = 10;
export const ROUND_END_DELAY        = 5;     // seconds before new round starts

// Obstacles
export const OBSTACLE_MIN           = 8;
export const OBSTACLE_MAX           = 14;

// Legacy (kept for server sim — no longer used by client physics)
export const ACCEL                  = 18;
export const MAX_SPEED              = 16;
export const DAMPING                = 0.92;
export const BOOST                  = 10;

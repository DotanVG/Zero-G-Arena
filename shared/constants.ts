export const ARENA_SIZE             = 40;
export const PLAYER_RADIUS          = 0.8;
export const TICK_RATE              = 20;
export const FREEZE_TIME            = 2.0;    // kept for server compat
export const RESPAWN_TIME           = 2.0;
export const INVULN_TIME            = 0.5;

// ── Revolver fire system ──────────────────────────────────────────────────────
export const REVOLVER_MIN_FIRE_TIME  = 0.5;  // must hold ≥500ms or shot won't fire
export const REVOLVER_FOCUS_TIME     = 1.5;  // extra time above min to reach 100% accuracy
export const REVOLVER_MIN_ACCURACY   = 0.75; // accuracy at minimum hold (500ms)
export const REVOLVER_MAX_SPREAD_RAD = (5 * Math.PI) / 180; // 5° cone at 0% extra charge
export const FIRE_RATE               = 2;    // server anti-spam: 500ms cooldown

// ── Zero-G / Launch ───────────────────────────────────────────────────────────
export const MAX_LAUNCH_SPEED        = 20;
export const LAUNCH_CHARGE_TIME      = 2.0;  // seconds to full charge (Space held)
export const LAUNCH_AIM_SENSITIVITY  = 0.05; // legacy mouse-Y fine-tuning (still sent)
export const LEGS_1_LAUNCH_FACTOR    = 0.75; // 1 leg hit → 75% max launch
export const LEGS_2_LAUNCH_FACTOR    = 0.50; // 2 legs hit → 50% max launch
// Legacy alias kept so old references don't break
export const LEGS_HIT_LAUNCH_FACTOR  = LEGS_2_LAUNCH_FACTOR;
export const ZERO_G_DAMPING          = 1.0;  // true zero-G — no velocity bleed
export const GRAB_RADIUS             = 3.0;

// ── Bars ─────────────────────────────────────────────────────────────────────
export const BAR_RADIUS              = 0.1;
export const BAR_LENGTH              = 1.5;
export const BARS_PER_OBS_MIN        = 3;
export const BARS_PER_OBS_MAX        = 8;

// ── Breach room ───────────────────────────────────────────────────────────────
export const BREACH_ROOM_W           = 8;
export const BREACH_ROOM_H           = 6;
export const BREACH_ROOM_D           = 6;
export const BREACH_GRAVITY          = -12;
export const BREACH_JUMP_SPEED       = 7;
export const BREACH_WALK_SPEED       = 6;

// Zero-G portal gravity — subtle pull toward enemy portal in FLOATING state
export const ZERO_G_PORTAL_GRAVITY   = 1.5;

// ── Projectiles ───────────────────────────────────────────────────────────────
export const BULLET_SPEED            = 50;
export const BULLET_LIFETIME         = 2.0;

// ── Game flow ─────────────────────────────────────────────────────────────────
export const COUNTDOWN_SECONDS       = 5;
export const ROUND_START_FADE_SECONDS = 0.45;
export const ROUND_END_DELAY         = 5;    // seconds before new round starts
export const ALL_FROZEN_TIMER        = 30;   // seconds team has to breach when all enemies frozen

// ── Multiplayer ───────────────────────────────────────────────────────────────
export const MAX_PLAYERS_PER_TEAM    = 20;
export const MATCH_SIZES             = [5, 10, 20] as const;
export const ROOM_IDLE_TIMEOUT       = 60;  // seconds before empty room is destroyed

// ── Obstacles ────────────────────────────────────────────────────────────────
export const OBSTACLE_MIN            = 14;
export const OBSTACLE_MAX            = 22;

// ── Bot names (space-themed) ──────────────────────────────────────────────────
export const BOT_NAMES: string[] = [
  'COSMO-7', 'VEGA-X', 'NOVA-3', 'ORION-9', 'LYRA-2',
  'SIRIUS-4', 'ATLAS-1', 'RIGEL-6', 'PULSAR-8', 'QUASAR-5',
  'ZENITH-3', 'APEX-7', 'HELIOS-2', 'CIPHER-9', 'ECHO-4',
  'FLUX-6', 'GRID-1', 'HELIX-8', 'ION-5', 'KRYOS-3',
];

// ── Legacy (not used by new physics) ─────────────────────────────────────────
export const ACCEL                   = 18;
export const MAX_SPEED               = 16;
export const DAMPING                 = 0.92;
export const BOOST                   = 10;

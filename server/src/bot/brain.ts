/**
 * BotBrain — simple hierarchical state machine for AI players.
 * Produces ClientInputMsg each tick, processed by the same server sim
 * as real player inputs (identical mechanics, no cheating).
 *
 * Strategy:
 *  - FLOATING: seek nearest bar roughly toward the enemy portal
 *  - GRABBING: switch to AIMING
 *  - AIMING:   charge power, aim toward enemy portal, release
 *  - BREACH:   walk toward the portal exit
 *  - ENGAGING: if an enemy is visible and close enough, shoot
 */
import type { ClientInputMsg } from '../../../shared/schema';
import type { ServerPlayer } from '../player';
import type { ServerArenaQuery } from '../arena-query';
import { v3, type Vec3 } from '../../../shared/vec3';
import { GRAB_RADIUS } from '../../../shared/constants';
import { maxLaunchPower } from '../../../shared/player-logic';
import { cameraForwardVec } from '../../../shared/physics';

/** Radians within which a bar is considered "good enough" to target */
const BAR_ARC_THRESHOLD = Math.PI * 0.75; // 135° — loose, avoids getting stuck
const SHOOT_RANGE        = 18;
const REACTION_DELAY     = 0.25; // seconds before bot reacts (simulate latency)
const AIM_SPEED          = 0.06; // aimDy per tick (power charge rate)
const BREACH_WALK_SPEED  = 1.0;  // magnitude of walk axes

type BotState = 'seek_bar' | 'grab' | 'aim' | 'launch' | 'floating' | 'breach';

export class BotBrain {
  private state:        BotState = 'seek_bar';
  private targetBar:    Vec3 | null = null;
  private shootCooldown = 0;
  private reactionTimer = REACTION_DELAY;
  private aimPower      = 0;
  private aimDir        = { yaw: 0, pitch: -0.3 };

  /**
   * Called once per server tick.
   * Returns the input message the bot "presses" this tick.
   */
  public tick(
    bot:     ServerPlayer,
    arena:   ServerArenaQuery,
    enemies: ServerPlayer[],
    dt:      number,
  ): ClientInputMsg {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    // Reaction delay — bots don't react instantly
    this.reactionTimer -= dt;
    const canReact = this.reactionTimer <= 0;
    if (!canReact) return this._idle(bot);

    // Sync bot internal state with sim-driven phase changes
    this._syncState(bot);

    let grab    = false;
    let aiming  = false;
    let fire    = false;
    let aimDy   = 0;
    let jumping = false;
    const walkAxes = { x: 0, z: 0 };
    let rot = { ...this.aimDir };

    // ── Shoot any close enemy regardless of bot phase ──────────────────────
    const target = this._findTarget(bot, enemies);
    if (target && this.shootCooldown <= 0 && bot.canFire()) {
      const toTarget = v3.normalize(v3.sub(target.pos, bot.pos));
      const yaw   = Math.atan2(toTarget.x, toTarget.z);
      const dist  = v3.length(v3.sub(target.pos, bot.pos));
      const pitch = -Math.asin(Math.max(-1, Math.min(1, toTarget.y)));
      rot   = { yaw, pitch };
      fire  = true;
      this.shootCooldown = 0.6;
      this.aimDir = rot;
    }

    // ── Phase-driven navigation ────────────────────────────────────────────
    switch (this.state) {
      case 'seek_bar':
      case 'floating': {
        // Find bar closest to the direction of enemy portal
        const enemyBreachCenter = arena.getBreachRoomCenter((1 - bot.team) as 0 | 1);
        const toEnemy = v3.normalize(v3.sub(enemyBreachCenter, bot.pos));
        const bar = this._findBar(bot, arena, toEnemy);

        if (bar) {
          this.targetBar = bar;
          // Aim toward bar
          const toBar = v3.normalize(v3.sub(bar, bot.pos));
          rot = {
            yaw:   Math.atan2(toBar.x, toBar.z),
            pitch: -Math.asin(Math.max(-1, Math.min(1, toBar.y))),
          };
          this.aimDir = rot;
          grab = v3.dist(bot.pos, bar) < GRAB_RADIUS * 1.1;
          if (grab) this.state = 'grab';
        }
        break;
      }

      case 'grab': {
        // Already grabbed, start aiming next frame
        grab   = false; // don't release
        aiming = true;
        this.aimPower = 0;
        this.state = 'aim';
        break;
      }

      case 'aim': {
        // Aim toward enemy portal
        const enemyBreachCenter = arena.getBreachRoomCenter((1 - bot.team) as 0 | 1);
        const toEnemy = v3.normalize(v3.sub(enemyBreachCenter, bot.pos));
        rot = {
          yaw:   Math.atan2(toEnemy.x, toEnemy.z),
          pitch: -Math.asin(Math.max(-1, Math.min(1, toEnemy.y))),
        };
        this.aimDir = rot;

        // Charge power
        const targetPower = maxLaunchPower(bot.damage) * 0.8;
        this.aimPower += AIM_SPEED;
        aimDy = AIM_SPEED / 0.05; // approximate aimDy for the sim's LAUNCH_AIM_SENSITIVITY

        aiming = this.aimPower < targetPower;
        if (!aiming) {
          // Release — launch!
          this.aimPower = 0;
          this.state    = 'floating';
          this.reactionTimer = REACTION_DELAY * 2; // pause before next action
        }
        break;
      }

      case 'breach': {
        // Walk toward the portal exit
        const enemyBreachCenter = arena.getBreachRoomCenter((1 - bot.team) as 0 | 1);
        const toExit = v3.normalize(v3.sub(enemyBreachCenter, bot.pos));
        rot = { yaw: Math.atan2(toExit.x, toExit.z), pitch: 0 };
        this.aimDir = rot;
        walkAxes.z = BREACH_WALK_SPEED;
        jumping    = false;
        break;
      }
    }

    return {
      t:         'input',
      id:        bot.id,
      seq:       0,
      phase:     bot.phase,
      walkAxes,
      grab,
      aiming,
      aimDy,
      fire,
      jumping,
      rot,
      lookDir:   cameraForwardVec(rot.yaw, rot.pitch),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _syncState(bot: ServerPlayer): void {
    // After sim changes bot.phase, update internal state to match
    switch (bot.phase) {
      case 'FLOATING':
        if (this.state !== 'floating' && this.state !== 'seek_bar') {
          this.state = 'floating';
        }
        break;
      case 'GRABBING':
        if (this.state !== 'grab' && this.state !== 'aim') {
          this.state = 'grab';
        }
        break;
      case 'BREACH':
        this.state = 'breach';
        break;
    }
  }

  private _findBar(bot: ServerPlayer, arena: ServerArenaQuery, preferred: Vec3): Vec3 | null {
    // Try to get nearest bar that's roughly in the preferred direction
    const nearest = arena.getNearestBar(bot.pos, GRAB_RADIUS * 12);
    if (!nearest) return null;

    const toBar = v3.normalize(v3.sub(nearest.pos, bot.pos));
    const dot   = v3.dot(toBar, preferred);
    // Accept bars within BAR_ARC_THRESHOLD angle OR if it's very close
    if (dot >= Math.cos(BAR_ARC_THRESHOLD) || v3.dist(bot.pos, nearest.pos) < GRAB_RADIUS * 2) {
      return nearest.pos;
    }

    // Fall back to nearest bar regardless of direction
    return arena.getNearestBar(bot.pos, GRAB_RADIUS * 12)?.pos ?? null;
  }

  private _findTarget(bot: ServerPlayer, enemies: ServerPlayer[]): ServerPlayer | null {
    let bestDist = SHOOT_RANGE;
    let best: ServerPlayer | null = null;

    for (const e of enemies) {
      if (e.phase === 'RESPAWNING' || e.phase === 'FROZEN') continue;
      const d = v3.dist(bot.pos, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  private _idle(bot: ServerPlayer): ClientInputMsg {
    return {
      t:         'input',
      id:        bot.id,
      seq:       0,
      phase:     bot.phase,
      walkAxes:  { x: 0, z: 0 },
      grab:      false,
      aiming:    false,
      aimDy:     0,
      fire:      false,
      jumping:   false,
      rot:       { yaw: bot.rot.yaw, pitch: bot.rot.pitch },
      lookDir:   cameraForwardVec(bot.rot.yaw, bot.rot.pitch),
    };
  }
}

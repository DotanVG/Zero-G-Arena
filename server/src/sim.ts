/**
 * Server simulation — authoritative bar-grab-launch zero-G mechanics.
 * Uses shared physics + player-logic so client and server run identical math.
 */
import { ServerPlayer } from './player';
import { ServerProjectile } from './projectile';
import { ServerArenaQuery } from './arena-query';
import {
  integrateZeroG,
  bounceArena,
  integrateBreachRoom,
  clampBreachRoom,
  yawForwardVec,
  yawRightVec,
  cameraForwardVec,
  applyShotSpread,
} from '../../shared/physics';
import {
  applyHit,
  spawnPosition,
  maxLaunchPower,
} from '../../shared/player-logic';
import { v3 } from '../../shared/vec3';
import type { Vec3 } from '../../shared/vec3';
import type { ClientInputMsg, ServerStateMsg, GamePhase, ArenaLayoutMsg } from '../../shared/schema';
import {
  GRAB_RADIUS,
  MAX_LAUNCH_SPEED,
  LAUNCH_CHARGE_TIME,
  RESPAWN_TIME,
  COUNTDOWN_SECONDS,
  ROUND_END_DELAY,
  BREACH_ROOM_H,
  PLAYER_RADIUS,
  BULLET_SPEED,
  TICK_RATE,
  FIRE_RATE,
  ALL_FROZEN_TIMER,
} from '../../shared/constants';
import { clamp } from './util';

export interface RoundEndInfo {
  winningTeam: 0 | 1;
  scorerId:    string;
  scorerName:  string;
}

export class Sim {
  public players    = new Map<string, ServerPlayer>();
  public score      = { team0: 0, team1: 0 };
  public phase: GamePhase = 'LOBBY';
  public countdown  = 0;
  public seq        = 0;
  public arena      = new ServerArenaQuery();
  public projectiles: ServerProjectile[] = [];
  private serverStart = Date.now();

  // All-frozen tracking
  public allFrozenTeam:  0 | 1 | null = null;
  public allFrozenTimer: number = 0;

  // Callbacks
  public onShoot:    ((proj: ServerProjectile) => void)         | null = null;
  public onHit:      ((proj: ServerProjectile, target: ServerPlayer, zone: import('../../shared/player-logic').HitZone, impactPos: Vec3) => void) | null = null;
  public onScore:    ((info: RoundEndInfo) => void)             | null = null;
  public onRoundEnd: ((info: RoundEndInfo) => void)             | null = null;

  public addPlayer(p: ServerPlayer): void  { this.players.set(p.id, p); }
  public removePlayer(id: string): void    { this.players.delete(id); }

  public loadLayout(layout: ArenaLayoutMsg): void {
    this.arena.loadLayout(layout);
    this.arena.setDoorsOpen(false);
    this.projectiles = [];
  }

  public startCountdown(duration = COUNTDOWN_SECONDS): void {
    this.phase     = 'COUNTDOWN';
    this.countdown = duration;
  }

  public startPlaying(): void {
    this.phase = 'PLAYING';
    this.arena.setDoorsOpen(true);
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  public tick(dt: number): RoundEndInfo | null {
    if (!this.arena.hasLayout()) return null;

    if (this.phase === 'COUNTDOWN') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 0) this.startPlaying();
    }

    // Tick bot brains first so they produce fresh lastInput
    const allPlayers = [...this.players.values()];
    for (const p of allPlayers) {
      if (p.brain && p.phase !== 'FROZEN' && p.phase !== 'RESPAWNING') {
        const enemies = allPlayers.filter(e => e.team !== p.team);
        p.lastInput = p.brain.tick(p, this.arena, enemies, dt);
      }
    }

    for (const p of this.players.values()) {
      this._tickPlayer(p, dt);
    }

    if (this.phase === 'PLAYING') {
      const roundEnd = this._tickProjectiles(dt);
      const scoreEnd = this._checkScoring();
      if (roundEnd ?? scoreEnd) return roundEnd ?? scoreEnd;
      this._tickAllFrozen(dt);
      return null;
    }

    return null;
  }

  // ── Player tick ───────────────────────────────────────────────────────────

  private _tickPlayer(p: ServerPlayer, dt: number): void {
    p.shotCooldown = Math.max(0, p.shotCooldown - dt);

    if (p.phase === 'RESPAWNING') {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        const sp = spawnPosition(p.team, this.arena);
        p.resetForNewRound(sp);
      }
      return;
    }

    if (p.phase === 'FROZEN') {
      integrateZeroG(p.pos, p.vel, dt);
      const ga = this.arena.getGoalAxis();
      const pa = this.arena.getGoalPerpAxis();
      bounceArena(p.pos, p.vel, ga, pa, this.arena.getPortalFacesOpen());
      this.arena.bounceObstacles(p.pos, p.vel);
      return;
    }

    const inp = p.lastInput;
    if (!inp) return;

    // Sync rotation from client
    p.rot = { yaw: inp.rot.yaw, pitch: inp.rot.pitch };

    switch (p.phase) {
      case 'BREACH':    this._tickBreach(p, inp, dt);    break;
      case 'FLOATING':  this._tickFloating(p, inp, dt);  break;
      case 'GRABBING':  this._tickGrabbing(p, inp, dt);  break;
      case 'AIMING':    this._tickAiming(p, inp, dt);    break;
    }
  }

  private _tickBreach(p: ServerPlayer, inp: ClientInputMsg, dt: number): void {
    const center   = this.arena.getBreachRoomCenter(p.currentBreachTeam);
    const openAxis = this.arena.getBreachOpenAxis(p.currentBreachTeam);
    const openSign = this.arena.getBreachOpenSign(p.currentBreachTeam);
    const floorY   = center.y - BREACH_ROOM_H / 2 + PLAYER_RADIUS;
    p.onGround     = p.pos.y <= floorY + 0.08;

    const yawFwd = yawForwardVec(inp.rot.yaw);
    const yawRt  = yawRightVec(inp.rot.yaw);

    integrateBreachRoom(
      p.pos, p.vel,
      inp.walkAxes,
      yawFwd, yawRt,
      inp.jumping, p.onGround,
      dt,
    );
    clampBreachRoom(p.pos, p.vel, center, openAxis, openSign, this.arena.isGoalDoorOpen(p.currentBreachTeam));

    // Try grab
    if (inp.grab && p.canGrabBar()) {
      const bar = this.arena.getNearestBar(p.pos, GRAB_RADIUS);
      if (bar) {
        p.grabbedBarPos = bar.pos;
        p.grabbedBarNormal = bar.normal;
        v3.set(p.vel, 0, 0, 0);
        p.phase = 'GRABBING';
        return;
      }
    }

    if (!this.arena.isInBreachRoom(p.pos, p.currentBreachTeam)) {
      p.phase = 'FLOATING';
    }
  }

  private _tickFloating(p: ServerPlayer, inp: ClientInputMsg, dt: number): void {
    const ga = this.arena.getGoalAxis();
    const pa = this.arena.getGoalPerpAxis();
    integrateZeroG(p.pos, p.vel, dt);
    bounceArena(p.pos, p.vel, ga, pa, this.arena.getPortalFacesOpen());
    this.arena.bounceObstacles(p.pos, p.vel);

    // Return to own breach room
    if (this.arena.isInBreachRoom(p.pos, p.team)) {
      p.currentBreachTeam = p.team;
      p.phase = 'BREACH';
      p.vel.y = 0;
      return;
    }

    // Breach enemy room → score
    const enemyTeam = (1 - p.team) as 0 | 1;
    if (!p.damage.frozen
      && this.arena.isGoalDoorOpen(enemyTeam)
      && this.arena.isDeepInBreachRoom(p.pos, enemyTeam, 1.0)) {
      // Score handled by _checkScoring()
      return;
    }

    // Grab bar
    if (inp.grab && p.canGrabBar()) {
      const bar = this.arena.getNearestBar(p.pos, GRAB_RADIUS);
      if (bar) {
        p.grabbedBarPos = bar.pos;
        p.grabbedBarNormal = bar.normal;
        v3.set(p.vel, 0, 0, 0);
        p.phase = 'GRABBING';
      }
    }
  }

  private _tickGrabbing(p: ServerPlayer, inp: ClientInputMsg, _dt: number): void {
    if (!p.grabbedBarPos) { p.phase = 'FLOATING'; return; }
    v3.lerpInPlace(p.pos, p.grabbedBarPos, 0.1);
    v3.set(p.vel, 0, 0, 0);

    if (inp.grab) {
      // E pressed again = release
      p.phase = 'FLOATING';
      p.grabbedBarPos = null;
      p.grabbedBarNormal = null;
      return;
    }
    if (inp.aiming) {
      p.phase = 'AIMING';
      p.launchPower = 0;
    }
  }

  private _tickAiming(p: ServerPlayer, inp: ClientInputMsg, dt: number): void {
    if (!p.grabbedBarPos) { p.phase = 'FLOATING'; return; }
    v3.lerpInPlace(p.pos, p.grabbedBarPos, 0.1);
    v3.set(p.vel, 0, 0, 0);

    // Auto-charge: fill to max over LAUNCH_CHARGE_TIME seconds
    p.launchPower += (maxLaunchPower(p.damage) / LAUNCH_CHARGE_TIME) * dt;
    p.launchPower = clamp(p.launchPower, 0, maxLaunchPower(p.damage));

    if (!inp.aiming) {
      // Launch — push along bar surface normal only (no fwd offset to avoid hitting obstacle)
      const fwd = this._inputLookDir(inp);
      if (p.grabbedBarPos && p.grabbedBarNormal) {
        v3.copyTo(p.grabbedBarPos, p.pos);
        v3.addScaledInPlace(p.pos, p.grabbedBarNormal, PLAYER_RADIUS + 1.0);
      } else {
        v3.addScaledInPlace(p.pos, fwd, PLAYER_RADIUS + 1.0);
      }
      v3.copyTo(v3.scale(fwd, p.launchPower), p.vel);
      p.launchPower   = 0;
      p.grabbedBarPos = null;
      p.grabbedBarNormal = null;
      p.phase         = 'FLOATING';
    }
  }

  // ── Projectile tick ───────────────────────────────────────────────────────

  private _tickProjectiles(dt: number): RoundEndInfo | null {
    const allPlayers = [...this.players.values()];

    for (const proj of this.projectiles) {
      if (proj.dead) continue;
      proj.tick(dt);
      if (proj.dead) continue;

      const hit = proj.checkHit(allPlayers);
      if (hit) {
        const impulseDir = v3.normalize(proj.vel);
        const impulse    = v3.scale(impulseDir, 3);
        const wasKilled  = applyHit(hit.target, hit.zone, impulse);
        proj.dead        = true;

        if (wasKilled) {
          // Give kill credit to shooter
          const shooter = this.players.get(proj.ownerId);
          if (shooter) shooter.kills++;

          // Check if all enemies are frozen → round end? (optional bonus rule — skip for now)
        }

        this.onHit?.(proj, hit.target, hit.zone, hit.impactPos);
      }
    }

    // Fire new projectiles from player input
    for (const p of allPlayers) {
      const inp = p.lastInput;
      if (!inp?.fire || !p.canFire() || this.phase !== 'PLAYING') continue;
      const charge = inp.fireCharge ?? 1;
      const fwd  = applyShotSpread(this._inputLookDir(inp), charge, Math.random(), Math.random());
      const pos  = v3.addScaled(p.pos, fwd, 1.0);
      const vel  = v3.scale(fwd, BULLET_SPEED);
      const proj = new ServerProjectile(pos, vel, p.team, p.id);
      this.projectiles.push(proj);
      p.shotCooldown = 1 / FIRE_RATE;
      this.onShoot?.(proj);
    }

    // Cull dead projectiles
    this.projectiles = this.projectiles.filter(p => !p.dead);
    return null;
  }

  // ── All-frozen ────────────────────────────────────────────────────────────

  private _tickAllFrozen(dt: number): void {
    const allPlayers = [...this.players.values()];
    // Check each team: are ALL opponents of the other team frozen?
    for (const attackTeam of [0, 1] as const) {
      const defTeam = (1 - attackTeam) as 0 | 1;
      const defenders = allPlayers.filter(p => p.team === defTeam && p.connected);
      if (defenders.length === 0) continue;
      const allFrozen = defenders.every(p => p.damage.frozen || p.phase === 'FROZEN');
      if (allFrozen) {
        if (this.allFrozenTeam !== defTeam) {
          this.allFrozenTeam = defTeam;
          this.allFrozenTimer = ALL_FROZEN_TIMER;
        }
        this.allFrozenTimer -= dt;
        if (this.allFrozenTimer <= 0) {
          // Unfreeze all defenders
          for (const p of defenders) {
            p.damage.frozen = false;
            p.phase = 'FLOATING';
          }
          this.allFrozenTeam = null;
          this.allFrozenTimer = 0;
        }
        return;
      }
    }
    // Not all-frozen
    this.allFrozenTeam = null;
    this.allFrozenTimer = 0;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private _checkScoring(): RoundEndInfo | null {
    for (const p of this.players.values()) {
      if (p.damage.frozen || p.phase !== 'FLOATING') continue;
      const enemyTeam = (1 - p.team) as 0 | 1;
      if (!this.arena.isGoalDoorOpen(enemyTeam)) continue;
      if (!this.arena.isDeepInBreachRoom(p.pos, enemyTeam, 1.0)) continue;

      // Score!
      if (p.team === 0) this.score.team0++;
      else              this.score.team1++;
      p.kills++;

      const info: RoundEndInfo = {
        winningTeam: p.team,
        scorerId:    p.id,
        scorerName:  p.name,
      };
      this.onScore?.(info);
      return info;
    }
    return null;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  public getSnapshot(): ServerStateMsg {
    return {
      t:               'state',
      seq:             ++this.seq,
      players:         [...this.players.values()].map(p => p.toNetState()),
      score:           { ...this.score },
      arenaState:      String(this.seq),
      phase:           this.phase,
      countdown:       this.countdown,
      serverTime:      Date.now() - this.serverStart,
      allFrozenTeam:   this.allFrozenTeam ?? undefined,
      allFrozenTimer:  this.allFrozenTeam !== null ? this.allFrozenTimer : undefined,
    };
  }

  public resetForNewRound(): void {
    this.projectiles = [];
    this.allFrozenTeam = null;
    this.allFrozenTimer = 0;
    this.arena.setDoorsOpen(false);
    for (const p of this.players.values()) {
      const sp = spawnPosition(p.team, this.arena);
      p.resetForNewRound(sp);
    }
  }

  private _inputLookDir(inp: ClientInputMsg): Vec3 {
    return inp.lookDir
      ? v3.normalize(inp.lookDir)
      : v3.normalize(cameraForwardVec(inp.rot.yaw, inp.rot.pitch));
  }
}

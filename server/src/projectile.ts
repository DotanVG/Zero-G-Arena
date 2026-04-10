import { type Vec3, v3 } from '../../shared/vec3';
import { tickProjectile } from '../../shared/physics';
import { classifyHitZone, type HitZone } from '../../shared/player-logic';
import { cameraForwardVec } from '../../shared/physics';
import { PLAYER_RADIUS, BULLET_LIFETIME } from '../../shared/constants';
import type { ServerPlayer } from './player';

let nextProjectileId = 1;

export class ServerProjectile {
  public readonly id: number;
  public pos: Vec3;
  public vel: Vec3;
  public readonly team: 0 | 1;
  public readonly ownerId: string;
  private age: number;
  public dead: boolean;

  public constructor(pos: Vec3, vel: Vec3, team: 0 | 1, ownerId: string) {
    this.id      = nextProjectileId++;
    this.pos     = v3.clone(pos);
    this.vel     = v3.clone(vel);
    this.team    = team;
    this.ownerId = ownerId;
    this.age     = 0;
    this.dead    = false;
  }

  public tick(dt: number): void {
    this.age += dt;
    if (this.age >= BULLET_LIFETIME) { this.dead = true; return; }
    const hitWall = tickProjectile(this.pos, this.vel, dt);
    if (hitWall) this.dead = true;
  }

  /**
   * Check if this projectile hits any enemy player.
   * Returns hit data or null.
   */
  public checkHit(players: ServerPlayer[]): {
    target: ServerPlayer;
    zone: HitZone;
    impactPos: Vec3;
  } | null {
    const radiusSq = (PLAYER_RADIUS * 1.2) ** 2;  // slightly generous hitbox

    for (const p of players) {
      if (p.team === this.team) continue;          // no friendly fire
      if (p.phase === 'FROZEN' || p.phase === 'RESPAWNING') continue;
      if (!p.connected) continue;

      if (v3.distSq(this.pos, p.pos) < radiusSq) {
        const facing = cameraForwardVec(p.rot.yaw, p.rot.pitch);
        const zone   = classifyHitZone(this.pos, p.pos, facing);
        return { target: p, zone, impactPos: v3.clone(this.pos) };
      }
    }
    return null;
  }
}

import ServerPlayer from "./player";
import type {
  ArenaStateId,
  ClientInputMsg,
  ServerStateMsg,
} from "../../shared/schema";
import {
  ACCEL,
  ARENA_SIZE,
  BOOST,
  DAMPING,
  FREEZE_TIME,
  INVULN_TIME,
  MAX_SPEED,
  PLAYER_RADIUS,
  RESPAWN_TIME,
} from "../../shared/constants";

export default class Sim {
  public players: Map<string, ServerPlayer> = new Map();
  public score = { team0: 0, team1: 0 };
  public arenaStateId: ArenaStateId = "A";
  public seq = 0;

  public addPlayer(p: ServerPlayer): void {
    this.players.set(p.id, p);
  }

  public removePlayer(id: string): void {
    this.players.delete(id);
  }

  public tick(dt: number): void {
    for (const p of this.players.values()) {
      if (p.state === "ACTIVE") {
        this.applyInput(p);
        this.integratePlayer(p, dt);
        this.bounceArena(p);
        this.checkGoal(p);
      }

      if (p.state === "FROZEN") {
        p.frozenTimer -= dt;
        this.dampVel(p, 0.7);
        if (p.frozenTimer <= 0) {
          p.state = "ACTIVE";
        }
      }

      if (p.state === "RESPAWNING") {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.state = "ACTIVE";
          p.invulnTimer = INVULN_TIME;
          this.resetPos(p);
        }
      }

      if (p.invulnTimer > 0) {
        p.invulnTimer -= dt;
      }
    }
  }

  private applyInput(p: ServerPlayer): void {
    if (!p.lastInput) {
      return;
    }

    const inp: ClientInputMsg = p.lastInput;
    if (inp.seq <= p.seq) {
      return;
    }

    p.seq = inp.seq;
    p.rot = { ...inp.rot };
  }

  private integratePlayer(p: ServerPlayer, dt: number): void {
    if (!p.lastInput) {
      return;
    }

    const inp = p.lastInput;
    const { yaw, pitch } = p.rot;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const forward = { x: -sy * cp, y: sp, z: -cy * cp };
    const right = { x: cy, y: 0, z: -sy };
    const up = { x: sy * sp, y: cp, z: cy * sp };
    const ax = inp.axes;
    const scale = ACCEL * dt;

    p.vel.x += (right.x * ax.x + up.x * ax.y + forward.x * ax.z) * scale;
    p.vel.y += (right.y * ax.x + up.y * ax.y + forward.y * ax.z) * scale;
    p.vel.z += (right.z * ax.x + up.z * ax.y + forward.z * ax.z) * scale;

    if (inp.boost) {
      p.vel.x += forward.x * BOOST;
      p.vel.y += forward.y * BOOST;
      p.vel.z += forward.z * BOOST;
    }

    p.vel.x *= DAMPING;
    p.vel.y *= DAMPING;
    p.vel.z *= DAMPING;

    const spd = Math.sqrt(p.vel.x ** 2 + p.vel.y ** 2 + p.vel.z ** 2);
    if (spd > MAX_SPEED) {
      const f = MAX_SPEED / spd;
      p.vel.x *= f;
      p.vel.y *= f;
      p.vel.z *= f;
    }

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
  }

  private bounceArena(p: ServerPlayer): void {
    const limit = ARENA_SIZE / 2 - PLAYER_RADIUS;
    for (const ax of ["x", "y", "z"] as const) {
      if (p.pos[ax] > limit) {
        p.pos[ax] = limit;
        p.vel[ax] = -Math.abs(p.vel[ax]) * 0.5;
      }

      if (p.pos[ax] < -limit) {
        p.pos[ax] = -limit;
        p.vel[ax] = Math.abs(p.vel[ax]) * 0.5;
      }
    }
  }

  private dampVel(p: ServerPlayer, factor: number): void {
    p.vel.x *= factor;
    p.vel.y *= factor;
    p.vel.z *= factor;
  }

  private checkGoal(p: ServerPlayer): void {
    if (this.arenaStateId === "A") {
      const goalZ = p.team === 0 ? 20 : -20;
      if (
        Math.abs(p.pos.z - goalZ) < 1.5 &&
        Math.abs(p.pos.x) < 10 &&
        Math.abs(p.pos.y) < 10
      ) {
        if (p.team === 0) {
          this.score.team0 += 1;
        } else {
          this.score.team1 += 1;
        }
        this.resetPos(p);
        p.state = "RESPAWNING";
        p.respawnTimer = RESPAWN_TIME;
      }
    }
  }

  private resetPos(p: ServerPlayer): void {
    p.pos = p.team === 0 ? { x: 0, y: 0, z: -15 } : { x: 0, y: 0, z: 15 };
    p.vel = { x: 0, y: 0, z: 0 };
  }

  public handleShot(shooterId: string, targetId: string): void {
    const target = this.players.get(targetId);
    if (!target || target.state !== "ACTIVE" || target.invulnTimer > 0) {
      return;
    }

    const shooter = this.players.get(shooterId);
    if (!shooter) {
      return;
    }

    target.state = "FROZEN";
    target.frozenTimer = FREEZE_TIME;

    const dx = target.pos.x - shooter.pos.x;
    const dy = target.pos.y - shooter.pos.y;
    const dz = target.pos.z - shooter.pos.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    target.vel.x += (dx / len) * 3;
    target.vel.y += (dy / len) * 3;
    target.vel.z += (dz / len) * 3;
  }

  public getSnapshot(): ServerStateMsg {
    return {
      t: "state",
      seq: ++this.seq,
      players: [...this.players.values()].map((p) => p.toNetState()),
      score: { ...this.score },
      arenaState: this.arenaStateId,
    };
  }
}

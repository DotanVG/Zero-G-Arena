/**
 * Entity interpolation buffer for remote players.
 * Buffers incoming snapshots and samples them at a fixed render delay
 * to produce smooth, jitter-free movement.
 */
import type { PlayerNetState } from '../../../shared/schema';

const RENDER_DELAY_MS = 100; // 2 ticks at 20Hz — trade-off: latency vs smoothness

interface Snapshot {
  serverTime: number;
  state:      PlayerNetState;
}

export class InterpolationBuffer {
  private snapshots: Snapshot[] = [];
  private maxBuffer  = 30; // ~1.5 seconds of snapshots

  public push(state: PlayerNetState, serverTime: number): void {
    this.snapshots.push({ serverTime, state });
    // Keep buffer bounded
    if (this.snapshots.length > this.maxBuffer) {
      this.snapshots.shift();
    }
  }

  /**
   * Sample the interpolated state for the given server render time.
   * Returns null if not enough data yet.
   */
  public sample(currentServerTime: number): PlayerNetState | null {
    const renderTime = currentServerTime - RENDER_DELAY_MS;

    if (this.snapshots.length === 0) return null;

    // Find the two snapshots bracketing renderTime
    let before: Snapshot | null = null;
    let after:  Snapshot | null = null;

    for (let i = 0; i < this.snapshots.length; i++) {
      const s = this.snapshots[i];
      if (s.serverTime <= renderTime) {
        before = s;
      } else {
        after = s;
        break;
      }
    }

    // Not enough history yet — return the oldest we have
    if (!before) return this.snapshots[0].state;
    // Past all snapshots — return latest
    if (!after)  return this.snapshots[this.snapshots.length - 1].state;

    // Interpolate between before and after
    const span = after.serverTime - before.serverTime;
    const t    = span > 0 ? (renderTime - before.serverTime) / span : 0;

    return interpolateState(before.state, after.state, t);
  }

  public clear(): void {
    this.snapshots = [];
  }
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return {
    x: lerpNum(a.x, b.x, t),
    y: lerpNum(a.y, b.y, t),
    z: lerpNum(a.z, b.z, t),
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  // Handle wrapping for yaw
  let diff = b - a;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

function interpolateState(a: PlayerNetState, b: PlayerNetState, t: number): PlayerNetState {
  return {
    ...b, // take most fields from the newer snapshot (team, damage, phase, etc.)
    pos: lerpVec3(a.pos, b.pos, t),
    vel: lerpVec3(a.vel, b.vel, t),
    rot: {
      yaw:   lerpAngle(a.rot.yaw,   b.rot.yaw,   t),
      pitch: lerpAngle(a.rot.pitch, b.rot.pitch, t),
    },
  };
}

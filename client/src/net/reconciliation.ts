/**
 * Client-side prediction & server reconciliation.
 *
 * Flow each frame:
 *   1. Record current input + predicted pos/vel in pendingInputs
 *   2. On server state arrival: snap to server state, discard acked inputs,
 *      re-simulate remaining pending inputs to get the corrected present position.
 *
 * This hides network latency — the player feels instant response while the
 * server remains authoritative.
 */
import type { PlayerNetState, ClientInputMsg } from '../../../shared/schema';

export interface PendingInput {
  seq:   number;
  input: ClientInputMsg;
  /** Predicted position immediately BEFORE applying this input */
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
}

export class Reconciliation {
  private pendingInputs: PendingInput[] = [];
  private maxPending = 120; // 6 seconds at 20Hz

  /**
   * Record a predicted input for later reconciliation.
   * Call this every frame before sending the input to the server.
   */
  public record(input: ClientInputMsg, pos: { x:number;y:number;z:number }, vel: { x:number;y:number;z:number }): void {
    this.pendingInputs.push({ seq: input.seq, input, pos: { ...pos }, vel: { ...vel } });
    if (this.pendingInputs.length > this.maxPending) this.pendingInputs.shift();
  }

  /**
   * Reconcile with server-authoritative state.
   * Discards inputs the server has processed (seq <= serverSeq).
   * Returns the corrected position/velocity to snap the local player to.
   *
   * For Phase 2 we use a simple snap + discard strategy.
   * A full re-simulation pass can be added later if snap causes visible jitter.
   */
  public reconcile(serverState: PlayerNetState): {
    pos: { x:number;y:number;z:number };
    vel: { x:number;y:number;z:number };
  } {
    // Discard all inputs the server has already processed
    // (We use server seq === latest message sequence, not per-input ack for now)
    this.pendingInputs = [];

    // Simply trust the server position — snap to it
    return {
      pos: { ...serverState.pos },
      vel: { ...serverState.vel },
    };
  }

  public clear(): void {
    this.pendingInputs = [];
  }
}

import {
  COUNTDOWN_SECONDS,
  ROUND_DURATION_SECONDS,
  ROUND_END_DELAY,
} from '../../../shared/constants';
import type { GamePhase } from '../render/hud';

/**
 * Tracks round lifecycle state: LOBBY → COUNTDOWN → PLAYING → ROUND_END.
 *
 * This class owns the timer and phase transitions; scheduling the actual
 * "new round" effects (arena regen, player reset, etc.) stays in the caller
 * via the `onBeginRound` callback so domain wiring lives in one place.
 */
export class RoundController {
  private phase: GamePhase = 'LOBBY';
  private countdownTimer = COUNTDOWN_SECONDS;
  private restartHandle: ReturnType<typeof setTimeout> | null = null;
  private roundTimer = ROUND_DURATION_SECONDS;
  private roundTimeoutFired = false;

  public onBeginRound: (() => void) | null = null;
  public onCountdownEnd: (() => void) | null = null;
  public onRoundTimeout: (() => void) | null = null;

  public getPhase(): GamePhase {
    return this.phase;
  }

  public getCountdown(): number {
    return this.countdownTimer;
  }

  public getRoundTimeRemaining(): number {
    return this.roundTimer;
  }

  public startCountdown(): void {
    if (this.restartHandle) {
      clearTimeout(this.restartHandle);
      this.restartHandle = null;
    }
    this.phase = 'COUNTDOWN';
    this.countdownTimer = COUNTDOWN_SECONDS;
    this.roundTimer = ROUND_DURATION_SECONDS;
    this.roundTimeoutFired = false;
  }

  public tick(dt: number): void {
    if (this.phase === 'COUNTDOWN') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.countdownTimer = 0;
        this.phase = 'PLAYING';
        this.onCountdownEnd?.();
      }
      return;
    }

    if (this.phase === 'PLAYING') {
      this.roundTimer = Math.max(0, this.roundTimer - dt);
      if (this.roundTimer <= 0 && !this.roundTimeoutFired) {
        this.roundTimeoutFired = true;
        this.onRoundTimeout?.();
      }
    }
  }

  public endRound(): void {
    this.phase = 'ROUND_END';
    if (this.restartHandle) {
      clearTimeout(this.restartHandle);
    }
    this.restartHandle = setTimeout(() => {
      this.restartHandle = null;
      this.onBeginRound?.();
    }, ROUND_END_DELAY * 1000);
  }

  public isPlaying(): boolean {
    return this.phase === 'PLAYING';
  }

  /**
   * Cancel the scheduled "start next round" callback. Used when the match
   * has ended and we want to freeze the current ROUND_END screen until the
   * caller transitions to menu or a new match.
   */
  public cancelPendingRestart(): void {
    if (this.restartHandle) {
      clearTimeout(this.restartHandle);
      this.restartHandle = null;
    }
  }
}

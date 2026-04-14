import { FIRE_RATE } from '../../shared/constants';

export class InputManager {
  private keys          = new Set<string>();
  private mouseDx       = 0;
  private mouseDy       = 0;
  private aimDy         = 0;         // separate accumulator for aim power (during AIMING phase)
  private aimingActive  = false;
  private fireCooldown  = 0;
  private grabPressed   = false;     // one-shot: true only on the frame E is first pressed
  private thirdPersonTogglePressed = false; // one-shot: for third-person toggle (V key)
  private gunTuneTogglePressed = false;
  private gunTuneResetPressed = false;
  private gunTunePrintPressed = false;

  public mouseSensitivity = 0.002;

  public constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) this.grabPressed = true;
      if (e.code === 'KeyV' && !e.repeat) this.thirdPersonTogglePressed = true;
      if (e.code === 'KeyP' && !e.repeat) this.gunTuneTogglePressed = true;
      if (e.code === 'Backspace' && !e.repeat) this.gunTuneResetPressed = true;
      if (e.code === 'Enter' && !e.repeat) this.gunTunePrintPressed = true;
      // Prevent Tab from switching browser focus
      if (
        e.code === 'Tab'
        || e.code === 'ArrowUp'
        || e.code === 'ArrowDown'
        || e.code === 'ArrowLeft'
        || e.code === 'ArrowRight'
        || e.code === 'PageUp'
        || e.code === 'PageDown'
        || e.code === 'Backspace'
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked()) return;
      this.mouseDx += e.movementX;
      // Route Y delta: aiming mode → power control; otherwise → camera pitch
      if (this.aimingActive) {
        this.aimDy += e.movementY;
      } else {
        this.mouseDy += e.movementY;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.keys.add('MouseLeft');
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.keys.delete('MouseLeft');
    });

    window.addEventListener('blur', () => {
      this.clearState();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearState();
      }
    });
  }

  // ── Aiming mode ──────────────────────────────────────────────────
  /** Must be called BEFORE consumeMouseDelta() each frame */
  public setAimingMode(active: boolean): void {
    this.aimingActive = active;
  }

  // ── Mouse delta ───────────────────────────────────────────────────
  public consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDx;
    const dy = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return { dx, dy };
  }

  /** Power aim delta (mouse Y when in aiming mode). Positive = mouse moved down = more power. */
  public consumeAimDelta(): { dy: number } {
    const dy = this.aimDy;
    this.aimDy = 0;
    return { dy };
  }

  // ── Movement ──────────────────────────────────────────────────────
  /** WASD walk axes (XZ only). Used in breach room. */
  public getWalkAxes(): { x: number; z: number } {
    return {
      x: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      z: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0),
    };
  }

  /** @deprecated use getWalkAxes() — kept for server sim compatibility */
  public getThrustAxes(): { x: number; y: number; z: number } {
    return {
      x: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      y: (this.keys.has('Space') ? 1 : 0) - (this.keys.has('ControlLeft') ? 1 : 0),
      z: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0),
    };
  }

  // ── Actions ───────────────────────────────────────────────────────
  /** Jump — only active in breach room. Space key. */
  public isJumping(): boolean { return this.keys.has('Space'); }

  /** Grab bar — KeyE. Distinct from jump. Returns true only on the first frame E is pressed. */
  public consumeGrab(): boolean {
    const v = this.grabPressed;
    this.grabPressed = false;
    return v;
  }

  /** @deprecated use consumeGrab() */
  public isGrab(): boolean { return this.keys.has('KeyE'); }

  /** Toggle Third Person — KeyV. Returns true only on the first frame V is pressed. */
  public consumeThirdPersonToggle(): boolean {
    const v = this.thirdPersonTogglePressed;
    this.thirdPersonTogglePressed = false;
    return v;
  }

  /** Selfie view held — KeyB. */
  public isSelfieHeld(): boolean { return this.keys.has('KeyB'); }

  /** Toggle third-person gun tuning — KeyP. */
  public consumeGunTuneToggle(): boolean {
    const v = this.gunTuneTogglePressed;
    this.gunTuneTogglePressed = false;
    return v;
  }

  /** Reset third-person gun tuning to defaults — Backspace. */
  public consumeGunTuneReset(): boolean {
    const v = this.gunTuneResetPressed;
    this.gunTuneResetPressed = false;
    return v;
  }

  /** Print the current third-person gun constants — Enter. */
  public consumeGunTunePrint(): boolean {
    const v = this.gunTunePrintPressed;
    this.gunTunePrintPressed = false;
    return v;
  }

  public getGunTuneAxes(): {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    fine: boolean;
  } {
    return {
      position: {
        x: (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0),
        y: (this.keys.has('PageUp') ? 1 : 0) - (this.keys.has('PageDown') ? 1 : 0),
        z: (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0),
      },
      rotation: {
        x: (this.keys.has('KeyK') ? 1 : 0) - (this.keys.has('KeyI') ? 1 : 0),
        y: (this.keys.has('KeyL') ? 1 : 0) - (this.keys.has('KeyJ') ? 1 : 0),
        z: (this.keys.has('KeyO') ? 1 : 0) - (this.keys.has('KeyU') ? 1 : 0),
      },
      fine: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  /**
   * Aim / launch charge — Space held while GRABBING.
   * Same key as jump; context determined by player state.
   */
  public isAiming(): boolean { return this.keys.has('Space'); }

  /** Fire (LMB). Respects fire rate cooldown. Returns true once per allowed shot. */
  public updateFireCooldown(dt: number): void { this.fireCooldown -= dt; }
  public canFire(): boolean {
    if (this.fireCooldown > 0) return false;
    this.fireCooldown = 1 / FIRE_RATE;
    return true;
  }
  /** True if LMB is held AND fire rate allows a shot this frame. */
  public consumeFire(): boolean {
    if (!this.keys.has('MouseLeft')) return false;
    return this.canFire();
  }

  /** Tab key — show scoreboard overlay */
  public isTabHeld(): boolean { return this.keys.has('Tab'); }

  // ── Pointer lock ──────────────────────────────────────────────────
  public lockPointer(canvas: HTMLCanvasElement): void {
    void canvas.requestPointerLock();
  }

  public isLocked(): boolean {
    return document.pointerLockElement != null;
  }

  private clearState(): void {
    this.keys.clear();
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.aimDy = 0;
    this.grabPressed = false;
    this.thirdPersonTogglePressed = false;
    this.gunTuneTogglePressed = false;
    this.gunTuneResetPressed = false;
    this.gunTunePrintPressed = false;
  }
}

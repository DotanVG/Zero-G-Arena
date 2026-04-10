import { FIRE_RATE, REVOLVER_FOCUS_TIME, REVOLVER_MIN_FIRE_TIME } from '../../shared/constants';

export class InputManager {
  private keys          = new Set<string>();
  private mouseDx       = 0;
  private mouseDy       = 0;
  private aimDy         = 0;         // separate accumulator for aim power (during AIMING phase)
  private aimingActive  = false;
  private fireCooldown  = 0;
  private fireHoldTime  = 0;
  private fireHolding   = false;
  private fireArmed     = false;
  private pendingFireCharge: number | null = null;
  private grabPressed   = false;     // one-shot: true only on the frame E is first pressed

  public mouseSensitivity = 0.002;

  public constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) this.grabPressed = true;
      // Prevent Tab from switching browser focus
      if (e.code === 'Tab') e.preventDefault();
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
      if (e.button === 0) {
        this.keys.add('MouseLeft');
        if (this.isFireReady()) {
          this.fireHolding = true;
          this.fireArmed = true;
          this.fireHoldTime = 0;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.keys.delete('MouseLeft');
        // Only fire if held ≥ minimum time
        if (this.fireHolding && this.fireArmed && this.fireHoldTime >= REVOLVER_MIN_FIRE_TIME) {
          this.pendingFireCharge = this.getFireCharge();
        }
        this.fireHolding = false;
        this.fireArmed = false;
        this.fireHoldTime = 0;
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

  /**
   * Aim / launch charge — Space held while GRABBING.
   * Same key as jump; context determined by player state.
   */
  public isAiming(): boolean { return this.keys.has('Space'); }

  /** Fire (LMB). Hold to steady the shot; release to fire. */
  public updateFireCooldown(dt: number): void {
    this.fireCooldown -= dt;
    if (this.fireHolding && this.isFireReady()) {
      this.fireHoldTime += dt;
    }
  }

  public isFireReady(): boolean {
    return this.fireCooldown <= 0;
  }

  public commitFireCooldown(): void {
    this.fireCooldown = 1 / FIRE_RATE;
  }

  public consumeFireRelease(): number | null {
    const charge = this.pendingFireCharge;
    this.pendingFireCharge = null;
    return charge;
  }

  public getFireCharge(): number {
    // charge 0→1 over REVOLVER_FOCUS_TIME seconds AFTER the minimum hold time
    return Math.max(0, Math.min(1, (this.fireHoldTime - REVOLVER_MIN_FIRE_TIME) / REVOLVER_FOCUS_TIME));
  }

  /** True while LMB is physically held (no fire-rate gate). */
  public isMouseLeft(): boolean { return this.keys.has('MouseLeft'); }

  /** Tab key — show scoreboard overlay */
  public isTabHeld(): boolean { return this.keys.has('Tab'); }

  // ── Pointer lock ──────────────────────────────────────────────────
  public lockPointer(canvas: HTMLCanvasElement): void {
    void canvas.requestPointerLock();
  }

  public unlockPointer(): void {
    if (document.pointerLockElement) {
      void document.exitPointerLock();
    }
  }

  public isLocked(): boolean {
    return document.pointerLockElement != null;
  }
}

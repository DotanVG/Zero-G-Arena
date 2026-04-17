import { InputManager } from '../input';

const MOBILE_LOOK_SCALE = 4.0;

const CSS = `
  .mob-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .mob-look {
    position: absolute;
    inset: 0;
    pointer-events: all;
    touch-action: none;
  }
  .mob-joystick-zone {
    position: absolute;
    bottom: calc(48px + env(safe-area-inset-bottom, 0px));
    left: 24px;
    width: 128px;
    height: 128px;
    pointer-events: all;
    touch-action: none;
    z-index: 1;
  }
  .mob-joystick-base {
    width: 128px;
    height: 128px;
    border-radius: 64px;
    background: rgba(0, 255, 255, 0.07);
    border: 2px solid rgba(0, 255, 255, 0.22);
    position: relative;
  }
  .mob-joystick-thumb {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 25px;
    background: rgba(0, 255, 255, 0.28);
    border: 2px solid rgba(0, 255, 255, 0.55);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .mob-power-track {
    position: absolute;
    left: 24px;
    bottom: calc(48px + env(safe-area-inset-bottom, 0px));
    width: 14px;
    height: 180px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(0, 255, 255, 0.4);
    border-radius: 7px;
    z-index: 1;
    overflow: hidden;
    display: none;
    pointer-events: none;
  }
  .mob-power-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 0%;
    background: hsl(120, 90%, 55%);
    border-radius: 7px;
    transition: none;
  }
  .mob-btn {
    position: absolute;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: all;
    touch-action: none;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: background 0.08s ease, border-color 0.08s ease;
    -webkit-tap-highlight-color: transparent;
    z-index: 1;
  }
  .mob-btn-fire {
    width: 80px;
    height: 80px;
    bottom: calc(48px + env(safe-area-inset-bottom, 0px));
    right: 28px;
    background: rgba(255, 50, 100, 0.15);
    border: 2px solid rgba(255, 50, 100, 0.38);
    color: rgba(255, 120, 150, 0.8);
  }
  .mob-btn-fire.mob-pressed {
    background: rgba(255, 50, 100, 0.45);
    border-color: rgba(255, 50, 100, 0.8);
  }
  .mob-btn-jump {
    width: 64px;
    height: 64px;
    bottom: calc(148px + env(safe-area-inset-bottom, 0px));
    right: 40px;
    background: rgba(0, 255, 255, 0.12);
    border: 2px solid rgba(0, 255, 255, 0.28);
    color: rgba(0, 220, 255, 0.75);
  }
  .mob-btn-jump.mob-pressed {
    background: rgba(0, 255, 255, 0.35);
    border-color: rgba(0, 255, 255, 0.65);
  }
  .mob-btn-grab {
    width: 60px;
    height: 60px;
    bottom: calc(52px + env(safe-area-inset-bottom, 0px));
    right: 128px;
    background: rgba(255, 200, 0, 0.12);
    border: 2px solid rgba(255, 200, 0, 0.28);
    color: rgba(255, 200, 0, 0.75);
    display: none;
  }
  .mob-btn-grab.mob-pressed {
    background: rgba(255, 200, 0, 0.38);
    border-color: rgba(255, 200, 0, 0.65);
  }
`;

export class MobileControls {
  private container: HTMLDivElement;
  private lookArea: HTMLDivElement;
  private joystickZone: HTMLDivElement;
  private joystickBase: HTMLDivElement;
  private joystickThumb: HTMLDivElement;
  private powerTrack: HTMLDivElement;
  private powerFill: HTMLDivElement;
  private fireBtn: HTMLDivElement;
  private jumpBtn: HTMLDivElement;
  private grabBtn: HTMLDivElement;

  private joystickPointerId = -1;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private readonly JOYSTICK_RADIUS = 52;

  private lookPointers = new Map<number, { x: number; y: number }>();

  private styleEl: HTMLStyleElement | null = null;
  private input: InputManager;

  // Haptic threshold tracking
  private lastHapticPct = 0;

  constructor(input: InputManager) {
    this.input = input;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.container = document.createElement('div');
    this.container.className = 'mob-overlay';

    // Look area covers full screen; buttons/joystick sit on top (z-index: 1)
    this.lookArea = document.createElement('div');
    this.lookArea.className = 'mob-look';
    this.container.appendChild(this.lookArea);

    // Joystick zone
    this.joystickZone = document.createElement('div');
    this.joystickZone.className = 'mob-joystick-zone';
    this.joystickBase = document.createElement('div');
    this.joystickBase.className = 'mob-joystick-base';
    this.joystickThumb = document.createElement('div');
    this.joystickThumb.className = 'mob-joystick-thumb';
    this.joystickBase.appendChild(this.joystickThumb);
    this.joystickZone.appendChild(this.joystickBase);
    this.container.appendChild(this.joystickZone);

    // Vertical power track (replaces joystick area when grabbing/aiming)
    this.powerTrack = document.createElement('div');
    this.powerTrack.className = 'mob-power-track';
    this.powerFill = document.createElement('div');
    this.powerFill.className = 'mob-power-fill';
    this.powerTrack.appendChild(this.powerFill);
    this.container.appendChild(this.powerTrack);

    // Buttons (appended after look area → higher implicit z within same stacking context)
    this.fireBtn = this.makeBtn('mob-btn-fire', 'FIRE');
    this.jumpBtn = this.makeBtn('mob-btn-jump', 'JUMP');
    this.grabBtn = this.makeBtn('mob-btn-grab', 'GRAB');
    this.container.appendChild(this.fireBtn);
    this.container.appendChild(this.jumpBtn);
    this.container.appendChild(this.grabBtn);

    this.bindLookArea();
    this.bindJoystick();
    this.bindFireBtn();
    this.bindJumpBtn();
    this.bindGrabBtn();
  }

  public mount(): void {
    document.body.appendChild(this.container);
  }

  public show(): void {
    this.container.style.display = '';
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.input.setMobileFireHeld(false);
    this.input.setMobileJumpHeld(false);
    this.input.setMobileMoveAxes(0, 0);
  }

  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  /** Called every frame from gameApp to sync controls to player state. */
  public setPhase(phase: string): void {
    const inGravity = phase === 'BREACH';
    const onBar = phase === 'GRABBING' || phase === 'AIMING';

    // Joystick: only in gravity (BREACH) walk mode
    this.joystickZone.style.display = inGravity ? '' : 'none';

    // Vertical power track: only when on a bar
    // (hidden via setPowerLevel show flag too, but gate here for clarity)
    if (!onBar) {
      this.powerTrack.style.display = 'none';
    }

    // JUMP label transforms to LAUNCH when on bar
    if (onBar) {
      this.jumpBtn.textContent = 'LAUNCH';
    } else {
      this.jumpBtn.textContent = 'JUMP';
    }
  }

  /** Called every frame — show GRAB button only when the player can grab a nearby bar. */
  public setNearBar(near: boolean, canGrab: boolean): void {
    const showGrab = near && canGrab;
    this.grabBtn.style.display = showGrab ? '' : 'none';
  }

  /** Called every frame with normalised power (0–1) and whether to show the meter. */
  public setPowerLevel(pct: number, show: boolean): void {
    this.powerTrack.style.display = show ? '' : 'none';
    if (!show) {
      this.lastHapticPct = 0;
      return;
    }

    const h = 120 - pct * 120;
    this.powerFill.style.height = `${(pct * 100).toFixed(1)}%`;
    this.powerFill.style.background = `hsl(${h}, 90%, 55%)`;

    // Haptic feedback at 25 % thresholds
    const thresholds = [0.25, 0.5, 0.75, 1.0];
    for (const t of thresholds) {
      if (this.lastHapticPct < t && pct >= t) {
        navigator.vibrate?.(pct >= 1.0 ? 40 : 15);
        break;
      }
    }
    this.lastHapticPct = pct;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private makeBtn(className: string, label: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `mob-btn ${className}`;
    el.textContent = label;
    return el;
  }

  private bindLookArea(): void {
    this.lookArea.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.lookArea.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    this.lookArea.addEventListener('pointermove', (e) => {
      const prev = this.lookPointers.get(e.pointerId);
      if (!prev) return;
      const dx = (e.clientX - prev.x) * MOBILE_LOOK_SCALE;
      const dy = (e.clientY - prev.y) * MOBILE_LOOK_SCALE;
      this.input.setMobileLookDelta(dx, dy);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    const endLook = (e: PointerEvent): void => {
      this.lookPointers.delete(e.pointerId);
    };
    this.lookArea.addEventListener('pointerup', endLook);
    this.lookArea.addEventListener('pointercancel', endLook);
  }

  private bindJoystick(): void {
    this.joystickBase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickPointerId !== -1) return;
      this.joystickPointerId = e.pointerId;
      this.joystickBase.setPointerCapture(e.pointerId);
      const rect = this.joystickBase.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
      this.updateJoystick(e.clientX, e.clientY);
    });

    this.joystickBase.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.updateJoystick(e.clientX, e.clientY);
    });

    const endJoystick = (e: PointerEvent): void => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = -1;
      this.joystickThumb.style.transform = 'translate(-50%, -50%)';
      this.input.setMobileMoveAxes(0, 0);
    };
    this.joystickBase.addEventListener('pointerup', endJoystick);
    this.joystickBase.addEventListener('pointercancel', endJoystick);
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenterX;
    const dy = clientY - this.joystickCenterY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(len, this.JOYSTICK_RADIUS);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;

    this.joystickThumb.style.transform =
      `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;

    // normX: right=+1 (strafe right), normZ: up on screen=+1 (forward)
    this.input.setMobileMoveAxes(
      nx * (clamped / this.JOYSTICK_RADIUS),
      -ny * (clamped / this.JOYSTICK_RADIUS),
    );
  }

  // FIRE: hold = shoot; drag = look (issues 2D + 3)
  private bindFireBtn(): void {
    const lastPos = new Map<number, { x: number; y: number }>();
    const active = new Set<number>();

    this.fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireBtn.setPointerCapture(e.pointerId);
      active.add(e.pointerId);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.fireBtn.classList.add('mob-pressed');
      this.input.setMobileFireHeld(true);
    });

    this.fireBtn.addEventListener('pointermove', (e) => {
      const prev = lastPos.get(e.pointerId);
      if (!prev) return;
      const dx = (e.clientX - prev.x) * MOBILE_LOOK_SCALE;
      const dy = (e.clientY - prev.y) * MOBILE_LOOK_SCALE;
      this.input.setMobileLookDelta(dx, dy);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    const end = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      lastPos.delete(e.pointerId);
      if (active.size === 0) {
        this.fireBtn.classList.remove('mob-pressed');
        this.input.setMobileFireHeld(false);
      }
    };
    this.fireBtn.addEventListener('pointerup', end);
    this.fireBtn.addEventListener('pointercancel', end);
  }

  // JUMP / LAUNCH: hold = Space (charge); drag down = charge power via aimingActive routing;
  // drag horizontal = look. Single-finger launch with haptic feedback.
  private bindJumpBtn(): void {
    const lastPos = new Map<number, { x: number; y: number }>();
    const active = new Set<number>();

    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.jumpBtn.setPointerCapture(e.pointerId);
      active.add(e.pointerId);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.jumpBtn.classList.add('mob-pressed');
      this.input.setMobileJumpHeld(true);
    });

    this.jumpBtn.addEventListener('pointermove', (e) => {
      const prev = lastPos.get(e.pointerId);
      if (!prev) return;
      // setMobileLookDelta handles routing: when aimingActive, dy → aimDy (charge);
      // otherwise dy → touchLookDy (look up/down). dx always → look left/right.
      const dx = (e.clientX - prev.x) * MOBILE_LOOK_SCALE;
      const dy = (e.clientY - prev.y) * MOBILE_LOOK_SCALE;
      this.input.setMobileLookDelta(dx, dy);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    const end = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      lastPos.delete(e.pointerId);
      if (active.size === 0) {
        this.jumpBtn.classList.remove('mob-pressed');
        this.input.setMobileJumpHeld(false);
      }
    };
    this.jumpBtn.addEventListener('pointerup', end);
    this.jumpBtn.addEventListener('pointercancel', end);
  }

  // GRAB: one-shot press; drag = look
  private bindGrabBtn(): void {
    const lastPos = new Map<number, { x: number; y: number }>();
    const active = new Set<number>();

    this.grabBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.grabBtn.setPointerCapture(e.pointerId);
      active.add(e.pointerId);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.grabBtn.classList.add('mob-pressed');
      this.input.pressMobileGrab();
    });

    this.grabBtn.addEventListener('pointermove', (e) => {
      const prev = lastPos.get(e.pointerId);
      if (!prev) return;
      const dx = (e.clientX - prev.x) * MOBILE_LOOK_SCALE;
      const dy = (e.clientY - prev.y) * MOBILE_LOOK_SCALE;
      this.input.setMobileLookDelta(dx, dy);
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    const end = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      lastPos.delete(e.pointerId);
      if (active.size === 0) {
        this.grabBtn.classList.remove('mob-pressed');
      }
    };
    this.grabBtn.addEventListener('pointerup', end);
    this.grabBtn.addEventListener('pointercancel', end);
  }
}

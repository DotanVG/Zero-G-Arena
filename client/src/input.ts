import { FIRE_RATE } from "../../shared/constants";

export class InputManager {
  private keys = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private fireCooldown = 0;

  public mouseSensitivity = 0.002;

  public constructor() {
    window.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener("mousemove", (event) => {
      if (!this.isLocked()) {
        return;
      }

      this.mouseDx += event.movementX;
      this.mouseDy += event.movementY;
    });

    window.addEventListener("mousedown", (event) => {
      if (event.button === 0) {
        this.keys.add("MouseLeft");
      }
    });

    window.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        this.keys.delete("MouseLeft");
      }
    });
  }

  public getAxes(): { x: number; y: number; z: number } {
    return {
      x: (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
      y:
        (this.keys.has("Space") ? 1 : 0) -
        (this.keys.has("ControlLeft") ? 1 : 0),
      z: (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0),
    };
  }

  public consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDx;
    const dy = this.mouseDy;

    this.mouseDx = 0;
    this.mouseDy = 0;

    return { dx, dy };
  }

  public isBoost(): boolean {
    return this.keys.has("ShiftLeft");
  }

  public updateFireCooldown(dt: number): void {
    this.fireCooldown -= dt;
  }

  public canFire(): boolean {
    if (this.fireCooldown > 0) {
      return false;
    }

    this.fireCooldown = 1 / FIRE_RATE;
    return true;
  }

  public isRoll(): { left: boolean; right: boolean } {
    return {
      left: this.keys.has("KeyQ"),
      right: this.keys.has("KeyE"),
    };
  }

  public lockPointer(canvas: HTMLCanvasElement): void {
    void canvas.requestPointerLock();
  }

  public isLocked(): boolean {
    return document.pointerLockElement != null;
  }
}

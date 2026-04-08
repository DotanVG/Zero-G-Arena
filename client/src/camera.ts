import * as THREE from 'three';
import { clamp } from './util/math';

/**
 * Dual-mode camera controller:
 *
 * GRAVITY MODE  (player.phase === 'BREACH')
 *   – Classic yaw + pitch, pitch clamped to ±89°.
 *   – Used in breach rooms where the floor is "down".
 *
 * ZERO-G MODE   (all other phases)
 *   – Free quaternion rotation, no clamping, full 360°.
 *   – When entering zero-G the camera pitches 90° so the enemy portal
 *     (the direction the player was just facing) becomes the bottom of
 *     the viewport instead of the horizon.
 */
const TRANSITION_DURATION = 0.35;  // seconds — fast but perceptible

export class CameraController {
  // ── Gravity mode state ────────────────────────────────────────────
  private yaw   = 0;
  private pitch = 0;

  // ── Zero-G mode state ─────────────────────────────────────────────
  private zeroGMode = false;
  private zeroGQuat = new THREE.Quaternion();
  private hasFlippedForZeroG = false;  // true after first breach-room exit this round

  // ── Orientation transition ─────────────────────────────────────────
  private transitioning = false;
  private transitionFrom = new THREE.Quaternion();
  private transitionProgress = 0;  // 0 → 1

  public constructor(private camera: THREE.PerspectiveCamera) {}

  // ── Mode switching ────────────────────────────────────────────────

  /**
   * Call once per frame BEFORE applyMouseDelta.
   * Handles the transition between breach-room (gravity) and arena (zero-G) cameras.
   */
  /**
   * Call once per frame BEFORE applyMouseDelta.
   * Handles the transition between breach-room (gravity) and arena (zero-G) cameras.
   *
   * The 90° flip happens ONCE per round (first exit from own breach room).
   * Subsequent exits (e.g. after grabbing a bar back inside) preserve the
   * existing zero-G quaternion so orientation never jumps unexpectedly.
   */
  public setZeroGMode(active: boolean): void {
    if (active === this.zeroGMode) return;

    if (active) {
      // Capture current orientation as transition start
      this.transitionFrom.copy(this.gravityQuaternion());

      if (!this.hasFlippedForZeroG) {
        // First exit this round: seed from breach-room orientation and flip 90°
        // so the enemy portal (what was "forward") becomes the bottom of the view.
        this.zeroGQuat.copy(this.gravityQuaternion());
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.zeroGQuat);
        const q90   = new THREE.Quaternion().setFromAxisAngle(right, Math.PI / 2);
        this.zeroGQuat.premultiply(q90);
        this.zeroGQuat.normalize();
        this.hasFlippedForZeroG = true;
      }
      // Subsequent exits: keep existing zeroGQuat — no jump in orientation

      // Start slerp transition toward the target zero-G orientation
      this.transitioning = true;
      this.transitionProgress = 0;
    } else {
      // Leaving zero-G: preserve the current horizontal facing for breach-room controls.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.zeroGQuat);
      const flatForward = new THREE.Vector3(forward.x, 0, forward.z);
      if (flatForward.lengthSq() > 1e-6) {
        flatForward.normalize();
        this.yaw = Math.atan2(-flatForward.x, -flatForward.z);
      }
      this.pitch = 0;
      // No transition needed going back to breach room — physics snaps player to floor anyway
      this.transitioning = false;
    }

    this.zeroGMode = active;
  }

  /** Call at the start of each new round to re-enable the one-time 90° flip. */
  public resetZeroGFlip(): void {
    this.hasFlippedForZeroG = false;
    this.transitioning = false;
    this.transitionProgress = 0;
  }

  /**
   * Advance the orientation transition. Call once per frame AFTER setZeroGMode().
   * Returns true while a transition is in progress.
   */
  public tickTransition(dt: number): boolean {
    if (!this.transitioning) return false;
    this.transitionProgress = Math.min(1, this.transitionProgress + dt / TRANSITION_DURATION);
    if (this.transitionProgress >= 1) {
      this.transitioning = false;
    }
    return true;
  }

  // ── Input ─────────────────────────────────────────────────────────

  /**
   * Apply accumulated mouse delta to the camera.
   * Must be called AFTER setZeroGMode() and AFTER InputManager.setAimingMode().
   * (When aiming, InputManager routes movementY to aimDy so dy is 0 here.)
   */
  public applyMouseDelta(dx: number, dy: number, sensitivity: number): void {
    if (this.zeroGMode) {
      // Free-look: rotate around camera's own local axes — no pitch cap
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.zeroGQuat);
      const camUp    = new THREE.Vector3(0, 1, 0).applyQuaternion(this.zeroGQuat);
      const qH = new THREE.Quaternion().setFromAxisAngle(camUp,    -dx * sensitivity);
      const qV = new THREE.Quaternion().setFromAxisAngle(camRight,  -dy * sensitivity);
      this.zeroGQuat.premultiply(qH).premultiply(qV);
      this.zeroGQuat.normalize();
    } else {
      // Gravity mode: classic yaw + clamped pitch
      this.yaw   -= dx * sensitivity;
      this.pitch -= dy * sensitivity;
      this.pitch  = clamp(this.pitch, (-Math.PI * 89) / 180, (Math.PI * 89) / 180);
    }
  }

  // ── Orientation queries ───────────────────────────────────────────

  /** Combined rotation quaternion (mode-aware, slerped during transitions). */
  public getQuaternion(): THREE.Quaternion {
    if (this.zeroGMode && this.transitioning) {
      // Cubic easeInOut for a snappy-but-smooth disorienting sweep
      const t = this.transitionProgress;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      return new THREE.Quaternion()
        .copy(this.transitionFrom)
        .slerp(this.zeroGQuat, ease);
    }
    return this.zeroGMode ? this.zeroGQuat.clone() : this.gravityQuaternion();
  }

  /** Full 3D forward — used for launch direction and projectile firing. */
  public getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.getQuaternion());
  }

  public getRight(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.getQuaternion());
  }

  public getUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.getQuaternion());
  }

  /**
   * Yaw-only forward projected onto the XZ plane.
   * Always uses the gravity-mode yaw — needed for breach room WASD walking.
   */
  public getYawForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Yaw-only right projected onto the XZ plane (breach room walking). */
  public getYawRight(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  // ── Application ───────────────────────────────────────────────────

  public apply(position: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.quaternion.copy(this.getQuaternion());
  }

  // ── Explicit setters (used by App to orient camera at round start) ──

  public setYaw(y: number):   void { this.yaw = y; }
  public setPitch(p: number): void { this.pitch = p; }
  public getYaw():   number { return this.yaw; }
  public getPitch(): number { return this.pitch; }

  // ── Private helpers ───────────────────────────────────────────────

  private gravityQuaternion(): THREE.Quaternion {
    const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    return qYaw.multiply(qPitch);
  }
}

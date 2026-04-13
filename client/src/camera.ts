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
 *   – Camera orientation is seeded from wherever the player was looking
 *     when they exited the breach room — own or enemy.
 */
const TRANSITION_DURATION = 0.6;   // seconds — return-to-breach sweep duration

export class CameraController {
  // ── Gravity mode state ────────────────────────────────────────────
  private yaw   = 0;
  private pitch = 0;

  // ── Zero-G mode state ─────────────────────────────────────────────
  private zeroGMode = false;
  private zeroGQuat = new THREE.Quaternion();

  // ── Orientation transition: arena → breach (easeOutQuint) ─────────
  private returnTransitioning = false;
  private returnTransitionFrom = new THREE.Quaternion();  // zeroGQuat snapshot
  private returnTransitionProgress = 0;  // 0 → 1

  public constructor(private camera: THREE.PerspectiveCamera) {}

  // ── Mode switching ────────────────────────────────────────────────

  /**
   * Call once per frame BEFORE applyMouseDelta.
   * Handles the transition between breach-room (gravity) and arena (zero-G) cameras.
   *
   * Always seeds zeroGQuat from the current gravity-mode orientation on exit,
   * so the camera stays exactly where the player was looking — in any breach room.
   */
  public setZeroGMode(active: boolean): void {
    if (active === this.zeroGMode) return;

    if (active) {
      // Seed zero-G orientation from the current breach-room look direction.
      // No flip applied — camera is exactly where the player was looking.
      this.zeroGQuat.copy(this.gravityQuaternion());
    } else {
      // Snapshot the current zero-G orientation as the start of the return slerp
      this.returnTransitionFrom.copy(this.zeroGQuat);
      this.returnTransitioning = true;
      this.returnTransitionProgress = 0;

      // Extract yaw from zeroGQuat so gravity-mode WASD controls start correctly
      // (this is the *destination* orientation that the slerp converges toward)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.zeroGQuat);
      const flatForward = new THREE.Vector3(forward.x, 0, forward.z);
      if (flatForward.lengthSq() > 1e-6) {
        flatForward.normalize();
        this.yaw = Math.atan2(-flatForward.x, -flatForward.z);
      }
      this.pitch = 0;
    }

    this.zeroGMode = active;
  }

  /** Call at the start of each new round to reset zero-G state. */
  public resetZeroGFlip(): void {
    this.returnTransitioning = false;
    this.returnTransitionProgress = 0;
  }

  /**
   * Advance the orientation transition. Call once per frame AFTER setZeroGMode().
   * Returns true while a transition is in progress.
   */
  public tickTransition(dt: number): boolean {
    if (!this.returnTransitioning) return false;
    this.returnTransitionProgress = Math.min(1, this.returnTransitionProgress + dt / TRANSITION_DURATION);
    if (this.returnTransitionProgress >= 1) this.returnTransitioning = false;
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
    if (!this.zeroGMode && this.returnTransitioning) {
      // easeOutQuint: fast start, smooth settle — camera "catches up" to the
      // landing body as gravity snaps the player back to the breach-room floor.
      const t = this.returnTransitionProgress;
      const ease = 1 - Math.pow(1 - t, 5);
      return new THREE.Quaternion()
        .copy(this.returnTransitionFrom)
        .slerp(this.gravityQuaternion(), ease);
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

  public apply(position: THREE.Vector3, isThirdPerson: boolean = false, isSelfie: boolean = false): void {
    const quat = this.getQuaternion();

    if (isSelfie) {
      // Selfie mode: look backwards at character
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      const camPos = position.clone().add(forward.multiplyScalar(3.0));
      this.camera.position.copy(camPos);

      // Rotate camera to look exactly opposite
      const lookBackQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      this.camera.quaternion.copy(quat).multiply(lookBackQuat);

    } else if (isThirdPerson) {
      // Third person: camera is behind and slightly up
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const camPos = position.clone().add(backward.multiplyScalar(3.0)).add(up.multiplyScalar(0.5));
      this.camera.position.copy(camPos);
      this.camera.quaternion.copy(quat);

    } else {
      // First person
      this.camera.position.copy(position);
      this.camera.quaternion.copy(quat);
    }
  }

  // ── Explicit setters (used by App to orient camera at round start) ──

  public setYaw(y: number):   void { this.yaw = y; }
  public setPitch(p: number): void { this.pitch = p; }
  public getYaw():   number { return this.yaw; }
  public getPitch(): number { return this.pitch; }

  /**
   * Hard-reset camera orientation for round start when the player spawns in
   * their breach room. Must be called instead of the old resetZeroGFlip +
   * setYaw + setPitch combo.
   *
   * Problem it solves: setYaw() sets gravity-mode yaw correctly, but the very
   * next frame setZeroGMode(false) fires (because player.phase === 'BREACH')
   * and re-extracts yaw from zeroGQuat — overwriting the value we just set.
   * Seeding zeroGQuat here ensures that extraction gives the right answer.
   */
  public resetForBreachSpawn(yaw: number): void {
    this.yaw   = yaw;
    this.pitch = 0;
    // Seed zeroGQuat to match so the yaw extraction in setZeroGMode(false) is
    // correct if it fires on the first frame (i.e. player was previously floating).
    this.zeroGQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // Force gravity mode immediately — no transition needed at round start.
    this.zeroGMode             = false;
    this.returnTransitioning   = false;
    this.returnTransitionProgress = 0;
  }

  // ── Private helpers ───────────────────────────────────────────────

  private gravityQuaternion(): THREE.Quaternion {
    const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    return qYaw.multiply(qPitch);
  }
}

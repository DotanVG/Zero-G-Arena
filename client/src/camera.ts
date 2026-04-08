import * as THREE from 'three';
import { clamp } from './util/math';

export class CameraController {
  private yaw   = 0;
  private pitch = 0;

  public constructor(private camera: THREE.PerspectiveCamera) {}

  /**
   * Apply mouse delta to yaw/pitch.
   * Mouse X always controls yaw.
   * Mouse Y controls pitch (camera tilt) — when InputManager is in aiming mode,
   * it routes movementY to aimDy instead of mouseDy, so dy will be 0 here.
   */
  public applyMouseDelta(dx: number, dy: number, sensitivity: number): void {
    this.yaw   -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch  = clamp(this.pitch, (-Math.PI * 89) / 180, (Math.PI * 89) / 180);
  }

  public getQuaternion(): THREE.Quaternion {
    const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    return qYaw.multiply(qPitch);
  }

  /** Full 3D forward (includes pitch) — used for launch direction */
  public getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.getQuaternion());
  }

  public getRight(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.getQuaternion());
  }

  public getUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.getQuaternion());
  }

  /** Yaw-only forward projected onto XZ plane — used for breach room walking */
  public getYawForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Yaw-only right projected onto XZ plane — used for breach room walking */
  public getYawRight(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  public apply(position: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.quaternion.copy(this.getQuaternion());
  }

  public getYaw(): number   { return this.yaw; }
  public getPitch(): number { return this.pitch; }
}

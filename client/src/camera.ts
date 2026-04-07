import * as THREE from "three";

import { clamp } from "./util/math";

export class CameraController {
  private yaw = 0;
  private pitch = 0;
  private roll = 0;

  public constructor(private camera: THREE.PerspectiveCamera) {}

  public applyMouseDelta(
    dx: number,
    dy: number,
    rollDelta: number,
    sensitivity: number,
  ): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = clamp(this.pitch, (-Math.PI * 89) / 180, (Math.PI * 89) / 180);

    this.roll += rollDelta * 0.04;
    this.roll = clamp(this.roll, -Math.PI / 4, Math.PI / 4);

    if (rollDelta === 0) {
      this.roll *= 0.9;
    }
  }

  public getQuaternion(): THREE.Quaternion {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw,
    );
    const qPitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      this.pitch,
    );
    const qRoll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      this.roll,
    );

    return qYaw.multiply(qPitch).multiply(qRoll);
  }

  public getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.getQuaternion());
  }

  public getRight(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.getQuaternion());
  }

  public getUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.getQuaternion());
  }

  public apply(position: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.quaternion.copy(this.getQuaternion());
  }
}

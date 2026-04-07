import * as THREE from "three";

import {
  FREEZE_TIME,
  INVULN_TIME,
  RESPAWN_TIME,
} from "../../shared/constants";
import { CameraController } from "./camera";
import { InputManager } from "./input";
import { type PhysicsState, bounceArena, integrate } from "./physics";
import { Arena } from "./arena/arena";
import { makePlayerMaterial } from "./render/materials";

type PlayerActivityState = "ACTIVE" | "FROZEN" | "RESPAWNING";

export class LocalPlayer {
  public phys: PhysicsState = {
    pos: new THREE.Vector3(0, 0, -15),
    vel: new THREE.Vector3(),
  };

  public team: 0 | 1 = 0;
  public score = 0;
  public state: PlayerActivityState = "ACTIVE";
  public frozenTimer = 0;
  public respawnTimer = 0;
  public invulnTimer = 0;
  public boostCooldown = 0;

  private mesh: THREE.Mesh;

  public constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 8),
      makePlayerMaterial(0),
    );
    scene.add(this.mesh);
  }

  public update(
    input: InputManager,
    cam: CameraController,
    arena: Arena,
    dt: number,
  ): void {
    if (this.state === "ACTIVE") {
      const boost = input.isBoost() && this.boostCooldown <= 0;
      if (boost) {
        this.boostCooldown = 1.5;
      }

      this.boostCooldown = Math.max(0, this.boostCooldown - dt);

      integrate(
        this.phys,
        input.getAxes(),
        cam.getForward(),
        cam.getRight(),
        cam.getUp(),
        boost,
        dt,
      );
      bounceArena(this.phys);
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);

      for (const goal of arena.getGoalPlanes()) {
        if (this.invulnTimer <= 0 && goal.checkEntry(this.phys.pos, this.team)) {
          this.score += 1;
          this.respawn();
          break;
        }
      }
    } else if (this.state === "FROZEN") {
      this.frozenTimer -= dt;
      this.phys.vel.multiplyScalar(0.7);

      if (this.frozenTimer <= 0) {
        this.state = "ACTIVE";
        this.frozenTimer = 0;
      }
    } else if (this.state === "RESPAWNING") {
      this.respawnTimer -= dt;

      if (this.respawnTimer <= 0) {
        this.state = "ACTIVE";
        this.respawnTimer = 0;
        this.invulnTimer = INVULN_TIME;
      }
    }

    this.mesh.position.copy(this.phys.pos);
  }

  public freeze(impulse: THREE.Vector3): void {
    this.state = "FROZEN";
    this.frozenTimer = FREEZE_TIME;
    this.phys.vel.add(impulse);
  }

  public respawn(): void {
    this.state = "RESPAWNING";
    this.respawnTimer = RESPAWN_TIME;
    this.phys.pos.set(0, 0, this.team === 0 ? -15 : 15);
    this.phys.vel.set(0, 0, 0);
    this.mesh.position.copy(this.phys.pos);
  }

  public getPosition(): THREE.Vector3 {
    return this.phys.pos;
  }

  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  public getFrozenTimer(): number {
    return this.frozenTimer;
  }

  public getScore(): number {
    return this.score;
  }
}

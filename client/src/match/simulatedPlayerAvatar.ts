import * as THREE from "three";
import type { PlayerPhase } from "../../../shared/schema";
import { loadAlienRenderClone } from "../player/alienRenderAsset";
import {
  ANIM_DEATH,
  ANIM_FLOAT,
  ANIM_IDLE_HOLD,
  ANIM_RUN_HOLD,
  ANIM_STANDING,
  PlayerAnimationController,
} from "../player/playerAnimationController";
import { PlayerDamageGlow } from "../player/playerDamageGlow";
import { applyBarHoldPose } from "../player/playerGrabPose";
import { ThirdPersonGun } from "../player/playerThirdPersonGun";

export class SimulatedPlayerAvatar {
  private readonly animation = new PlayerAnimationController();
  private readonly damageGlow: PlayerDamageGlow;
  private disposed = false;
  private readonly gun = new ThirdPersonGun();
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  private ready = false;
  private readonly root = new THREE.Group();

  public constructor(scene: THREE.Scene, team: 0 | 1) {
    this.damageGlow = new PlayerDamageGlow(team);
    scene.add(this.root);

    void loadAlienRenderClone({ team, variant: "bot" })
      .then(({ body, bodyAnimations, helmet, helmetAnimations }) => {
        if (this.disposed) return;

        this.root.add(body);
        this.root.add(helmet);
        this.animation.registerRig(body, bodyAnimations);
        this.animation.registerRig(helmet, helmetAnimations);
        this.damageGlow.attachTo(body);
        this.gun.attachTo(body);
        this.gun.setVisible(true);
        this.collectMaterials();
        this.ready = true;
      })
      .catch((err: unknown) => {
        console.error("[SimulatedPlayerAvatar] failed to load alien render assets", err);
      });
  }

  public update(
    pos: THREE.Vector3,
    damage: { frozen: boolean; leftArm: boolean; rightArm: boolean; legs: boolean },
    phase: PlayerPhase,
    yaw: number,
    dt: number,
    moveSpeed: number,
  ): void {
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = phase !== "RESPAWNING";
    this.gun.setVisible(phase !== "RESPAWNING");
    this.damageGlow.update(damage, phase, dt);

    if (!this.ready) return;

    const animation = selectAnimation(phase, moveSpeed);
    this.animation.setTargetAnimation(animation);
    this.animation.tickMixers(dt);

    if (phase === "GRABBING" || phase === "AIMING") {
      applyBarHoldPose(this.animation.getRigs());
      this.animation.resetBreathing();
    } else if (animation === ANIM_IDLE_HOLD) {
      this.animation.tickBreathing(dt);
    } else {
      this.animation.resetBreathing();
    }

    this.applyPhaseVisuals(phase);
  }

  public dispose(scene: THREE.Scene): void {
    this.disposed = true;
    this.damageGlow.dispose();
    this.gun.dispose();
    scene.remove(this.root);
    for (const material of this.materials) {
      material.dispose();
    }
    this.materials.clear();
  }

  private collectMaterials(): void {
    this.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          this.materials.add(material);
        }
      }
    });
  }

  private applyPhaseVisuals(phase: PlayerPhase): void {
    for (const material of this.materials) {
      if (phase === "FROZEN") {
        material.transparent = true;
        material.opacity = material.name === "Glass" ? 0.12 : 0.35;
        material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.08);
      } else if (material.name === "Glass") {
        material.transparent = true;
        material.opacity = 0.22;
        material.emissiveIntensity = 0;
      } else {
        material.transparent = false;
        material.opacity = 1;
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.42);
      }
      material.needsUpdate = true;
    }
  }
}

function selectAnimation(phase: PlayerPhase, moveSpeed: number): string {
  if (phase === "FROZEN") return ANIM_DEATH;
  if (phase === "FLOATING") return ANIM_FLOAT;
  if (phase === "GRABBING" || phase === "AIMING") return ANIM_STANDING;
  if (phase === "BREACH" && moveSpeed > 0.25) return ANIM_RUN_HOLD;
  return ANIM_IDLE_HOLD;
}

import * as THREE from "three";
import type { DamageState, PlayerPhase } from "../../../shared/schema";

type GlowSlotId =
  | "frozenCore"
  | "frozenHead"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg";

interface GlowShell {
  baseOpacity: number;
  baseScale: THREE.Vector3;
  mesh: THREE.Mesh;
  phaseOffset: number;
}

interface GlowSlotConfig {
  baseOpacity: number;
  baseScale: THREE.Vector3;
  boneName: string;
  offset?: THREE.Vector3;
}

const GLOW_GEOMETRY = new THREE.SphereGeometry(1, 12, 10);

const SLOT_CONFIG: Record<GlowSlotId, GlowSlotConfig> = {
  frozenCore: {
    baseOpacity: 0.28,
    baseScale: new THREE.Vector3(1.5, 1.9, 1.2),
    boneName: "Torso",
    offset: new THREE.Vector3(0, 0.08, 0),
  },
  frozenHead: {
    baseOpacity: 0.22,
    baseScale: new THREE.Vector3(0.85, 0.85, 0.85),
    boneName: "Neck",
    offset: new THREE.Vector3(0, 0.14, 0),
  },
  leftArm: {
    baseOpacity: 0.22,
    baseScale: new THREE.Vector3(0.68, 0.68, 0.68),
    boneName: "LowerArmL",
  },
  rightArm: {
    baseOpacity: 0.22,
    baseScale: new THREE.Vector3(0.68, 0.68, 0.68),
    boneName: "LowerArmR",
  },
  leftLeg: {
    baseOpacity: 0.18,
    baseScale: new THREE.Vector3(0.82, 0.82, 0.82),
    boneName: "UpperLegL",
  },
  rightLeg: {
    baseOpacity: 0.18,
    baseScale: new THREE.Vector3(0.82, 0.82, 0.82),
    boneName: "UpperLegR",
  },
};

export class PlayerDamageGlow {
  private readonly color = new THREE.Color();
  private readonly slots = new Map<GlowSlotId, GlowShell>();
  private time = 0;

  public constructor(team: 0 | 1) {
    this.color.set(team === 0 ? "#ff4fd8" : "#59d9ff");
  }

  public attachTo(root: THREE.Group): void {
    this.dispose();

    (Object.entries(SLOT_CONFIG) as Array<[GlowSlotId, GlowSlotConfig]>).forEach(([id, config], index) => {
      const bone = root.getObjectByName(config.boneName);
      if (!bone) return;

      const material = new THREE.MeshBasicMaterial({
        color: this.color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
        transparent: true,
      });
      const mesh = new THREE.Mesh(GLOW_GEOMETRY, material);
      mesh.renderOrder = 10;
      mesh.visible = false;
      mesh.scale.copy(config.baseScale);
      mesh.position.copy(config.offset ?? new THREE.Vector3());
      bone.add(mesh);

      this.slots.set(id, {
        baseOpacity: config.baseOpacity,
        baseScale: config.baseScale.clone(),
        mesh,
        phaseOffset: index * 0.7,
      });
    });
  }

  public update(damage: DamageState, phase: PlayerPhase, dt: number): void {
    this.time += dt;

    for (const [id, slot] of this.slots) {
      const active = phase !== "RESPAWNING" && isSlotActive(id, damage);
      slot.mesh.visible = active;
      if (!active) continue;

      const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.time * 2.4 + slot.phaseOffset));
      const scalePulse = id.startsWith("frozen") ? 1.05 + pulse * 0.12 : 1.02 + pulse * 0.08;
      slot.mesh.scale.copy(slot.baseScale).multiplyScalar(scalePulse);

      const material = slot.mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(this.color);
      material.opacity = slot.baseOpacity * pulse;
    }
  }

  public dispose(): void {
    for (const slot of this.slots.values()) {
      if (slot.mesh.parent) {
        slot.mesh.parent.remove(slot.mesh);
      }
      (slot.mesh.material as THREE.Material).dispose();
    }
    this.slots.clear();
  }
}

function isSlotActive(id: GlowSlotId, damage: DamageState): boolean {
  switch (id) {
    case "frozenCore":
    case "frozenHead":
      return damage.frozen;
    case "leftArm":
      return damage.leftArm;
    case "rightArm":
      return damage.rightArm;
    case "leftLeg":
    case "rightLeg":
      return damage.legs;
  }
}

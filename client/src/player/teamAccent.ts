import * as THREE from "three";

interface AccentMaterialUserData {
  obBaseColor?: THREE.Color;
  obBaseEmissive?: THREE.Color;
  obBaseEmissiveIntensity?: number;
}

export function applyTeamAccent(
  root: THREE.Group,
  team: 0 | 1,
  variant: "player" | "bot",
): void {
  const accent = team === 0 ? new THREE.Color("#59d9ff") : new THREE.Color("#ff4fd8");
  const colorMix = variant === "player"
    ? team === 0 ? 0.06 : 0.14
    : team === 0 ? 0.1 : 0.24;
  const emissiveMix = variant === "player"
    ? team === 0 ? 0.24 : 0.4
    : team === 0 ? 0.34 : 0.58;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === "Glass") continue;

      const userData = material.userData as AccentMaterialUserData;
      userData.obBaseColor ??= material.color.clone();
      userData.obBaseEmissive ??= material.emissive.clone();
      userData.obBaseEmissiveIntensity ??= material.emissiveIntensity;

      material.color.copy(userData.obBaseColor).lerp(accent, colorMix);
      material.emissive.copy(userData.obBaseEmissive).lerp(accent, emissiveMix);
      material.emissiveIntensity = Math.max(
        userData.obBaseEmissiveIntensity,
        team === 0 ? 0.42 : 0.65,
      );
      material.needsUpdate = true;
    }
  });
}

import * as THREE from "three";

export function makeArenaMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0x334455,
    transparent: true,
    opacity: 0.6,
  });
}

export function makeObstacleMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a3a4a,
    metalness: 0.3,
    roughness: 0.7,
  });
}

export function makeGoalMaterial(team: 0 | 1): THREE.MeshStandardMaterial {
  const palette =
    team === 0
      ? { color: 0x004444, emissive: 0x00ffff }
      : { color: 0x440044, emissive: 0xff00ff };

  return new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  });
}

export function makePlayerMaterial(team: 0 | 1): THREE.MeshStandardMaterial {
  const color = team === 0 ? 0x00ffff : 0xff00ff;

  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.4,
  });
}

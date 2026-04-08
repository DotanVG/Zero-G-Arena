import * as THREE from 'three';

export function makeArenaMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.6 });
}

export function makeObstacleMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x2a3a4a, metalness: 0.3, roughness: 0.7 });
}

export function makeGoalMaterial(team: 0 | 1): THREE.MeshStandardMaterial {
  const color = team === 0 ? 0x004444 : 0x440044;
  const emissive = team === 0 ? 0x00ffff : 0xff00ff;
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  });
}

export function makePlayerMaterial(team: 0 | 1): THREE.MeshStandardMaterial {
  const color = team === 0 ? 0x00ffff : 0xff00ff;
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
}

export function makeGhostMaterial(team: 0 | 1): THREE.MeshStandardMaterial {
  const color = team === 0 ? 0x00ffff : 0xff00ff;
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.3,
  });
}

export function makeBreachRoomMaterial(team: 0 | 1): THREE.MeshBasicMaterial {
  // Same dark opaque colour as the portal door panels — solid walls, no see-through
  const color = team === 0 ? 0x001a2e : 0x1a001a;
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
  });
}

export function makeBarMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff9900,
    emissive: 0xff6600,
    emissiveIntensity: 0.2,
    metalness: 0.9,
    roughness: 0.1,
  });
}

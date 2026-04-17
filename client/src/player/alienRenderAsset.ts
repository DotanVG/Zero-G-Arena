import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
import { PLAYER_RADIUS } from "../../../shared/constants";

interface AlienRenderPrototype {
  body: THREE.Group;
  bodyAnimations: THREE.AnimationClip[];
  helmet: THREE.Group;
  helmetAnimations: THREE.AnimationClip[];
}

export interface AlienRenderCloneOptions {
  team: 0 | 1;
  variant?: "player" | "bot";
}

export interface AlienRenderClone {
  body: THREE.Group;
  bodyAnimations: THREE.AnimationClip[];
  helmet: THREE.Group;
  helmetAnimations: THREE.AnimationClip[];
}

const ALIEN_SCALE = 0.2;
const ALIEN_OFFSET_Y = -PLAYER_RADIUS * 0.8;
const ALIEN_OFFSET_Z = 0.3;
const ALIEN_ROTATION_Y = Math.PI;

let prototypePromise: Promise<AlienRenderPrototype> | null = null;

export function loadAlienRenderClone(options: AlienRenderCloneOptions): Promise<AlienRenderClone> {
  return loadAlienRenderPrototype().then((prototype) => {
    const body = cloneRig(prototype.body);
    const helmet = cloneRig(prototype.helmet);

    applyTeamAccent(body, options.team, options.variant ?? "bot");
    applyTeamAccent(helmet, options.team, options.variant ?? "bot");

    return {
      body,
      bodyAnimations: prototype.bodyAnimations,
      helmet,
      helmetAnimations: prototype.helmetAnimations,
    };
  });
}

async function loadAlienRenderPrototype(): Promise<AlienRenderPrototype> {
  if (!prototypePromise) {
    prototypePromise = (async () => {
      const loader = new GLTFLoader();
      const [bodyGltf, helmetGltf] = await Promise.all([
        loader.loadAsync("/models/Alien.glb"),
        loader.loadAsync("/models/Alien_Helmet.glb"),
      ]);

      const body = bodyGltf.scene;
      applyAlienTransform(body);

      const helmet = helmetGltf.scene;
      applyAlienTransform(helmet);
      configureHelmetGlass(helmet);

      return {
        body,
        bodyAnimations: bodyGltf.animations,
        helmet,
        helmetAnimations: helmetGltf.animations,
      };
    })();
  }

  return prototypePromise;
}

function applyAlienTransform(root: THREE.Group): void {
  root.scale.setScalar(ALIEN_SCALE);
  root.position.y = ALIEN_OFFSET_Y;
  root.position.z = ALIEN_OFFSET_Z;
  root.rotation.y = ALIEN_ROTATION_Y;
}

function configureHelmetGlass(root: THREE.Group): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name !== "Glass") continue;
      material.transparent = true;
      material.opacity = 0.22;
      material.depthWrite = false;
      material.roughness = 0.12;
      material.metalness = 0.0;
    }
  });
}

function cloneRig(root: THREE.Group): THREE.Group {
  const clone = cloneSkinnedScene(root) as THREE.Group;

  clone.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((material) => material.clone());
      return;
    }
    obj.material = obj.material.clone();
  });

  return clone;
}

function applyTeamAccent(
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

      material.color = material.color.clone().lerp(accent, colorMix);
      material.emissive = material.emissive.clone().lerp(accent, emissiveMix);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, team === 0 ? 0.42 : 0.65);
      material.needsUpdate = true;
    }
  });
}

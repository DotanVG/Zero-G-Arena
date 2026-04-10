/**
 * GLTF model loader with caching.
 * Wraps Three.js GLTFLoader — preloads soldier + pistol at startup.
 */
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache  = new Map<string, GLTF>();

export async function loadGLTF(url: string): Promise<GLTF> {
  if (cache.has(url)) return cache.get(url)!;
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => { cache.set(url, gltf); resolve(gltf); }, undefined, reject);
  });
}

export async function preloadModels(): Promise<void> {
  await Promise.all([
    loadGLTF('/assets/characters/Character_Soldier.gltf'),
    loadGLTF('/assets/weapons/Pistol.gltf'),
  ]);
}

export function getCachedGLTF(url: string): GLTF | null {
  return cache.get(url) ?? null;
}

export const MODEL_PATHS = {
  soldier: '/assets/characters/Character_Soldier.gltf',
  pistol:  '/assets/weapons/Pistol.gltf',
} as const;

/**
 * RemotePlayer — renders a non-local player with entity interpolation.
 * Uses PlayerModel (Character_Soldier.gltf) if preloaded; falls back to sphere.
 */
import * as THREE from 'three';
import type { PlayerNetState } from '../../shared/schema';
import { InterpolationBuffer } from './net/interpolation';
import { makePlayerMaterial } from './render/materials';
import { PlayerModel } from './render/player-model';
import { getCachedGLTF, MODEL_PATHS } from './render/model-loader';
import { PLAYER_RADIUS } from '../../shared/constants';
import { v3 } from '../../shared/vec3';

export class RemotePlayer {
  private model:     PlayerModel | null = null;
  private fallback:  THREE.Mesh  | null = null;
  private buffer:    InterpolationBuffer;
  private scene:     THREE.Scene;
  public  lastState: PlayerNetState;

  public constructor(scene: THREE.Scene, initialState: PlayerNetState) {
    this.scene     = scene;
    this.lastState = initialState;
    this.buffer    = new InterpolationBuffer();

    // Use preloaded GLTF if available, otherwise sphere fallback
    const gltf = getCachedGLTF(MODEL_PATHS.soldier);
    if (gltf) {
      this.model = new PlayerModel(scene, gltf, initialState.team as 0 | 1);
    } else {
      this.fallback = new THREE.Mesh(
        new THREE.SphereGeometry(PLAYER_RADIUS, 12, 8),
        makePlayerMaterial(initialState.team),
      );
      this.fallback.visible = (initialState.phase !== 'RESPAWNING');
      scene.add(this.fallback);
    }

    this.buffer.push(initialState, 0);
  }

  public pushState(state: PlayerNetState, serverTime: number): void {
    this.lastState = state;
    this.buffer.push(state, serverTime);
  }

  public update(serverTime: number, dt: number): void {
    const state = this.buffer.sample(serverTime) ?? this.lastState;

    const visible = state.connected && state.phase !== 'RESPAWNING';
    const vel     = state.vel ?? { x: 0, y: 0, z: 0 };
    const speed   = v3.length(vel);

    if (this.model) {
      this.model.setPosition(state.pos.x, state.pos.y, state.pos.z);
      this.model.setRotationYaw(state.rot?.yaw ?? 0);
      this.model.update(dt, state.phase, speed);
      // model.update() sets its own visibility for RESPAWNING
      if (state.phase !== 'RESPAWNING') {
        // nothing extra needed — update handles it
      }
    } else if (this.fallback) {
      this.fallback.position.set(state.pos.x, state.pos.y, state.pos.z);
      this.fallback.visible = visible;

      const mat = this.fallback.material as THREE.MeshStandardMaterial;
      if (state.phase === 'FROZEN') {
        mat.emissiveIntensity = 0.05;
        mat.transparent = true;
        mat.opacity = 0.55;
      } else {
        mat.emissiveIntensity = 0.4;
        mat.transparent = false;
        mat.opacity = 1.0;
      }
      mat.needsUpdate = true;
    }
  }

  public dispose(): void {
    if (this.model) {
      this.model.dispose();
    } else if (this.fallback) {
      this.scene.remove(this.fallback);
      this.fallback.geometry.dispose();
      (this.fallback.material as THREE.Material).dispose();
    }
    this.buffer.clear();
  }

  public getId(): string { return this.lastState.id; }
  public get team(): 0 | 1 { return this.lastState.team; }
}

/**
 * PlayerModel — wraps Character_Soldier.gltf with:
 *  - Grey armor base + team neon color overlay
 *  - Animation state machine (Idle, Walk, Jump_Idle, Death)
 *  - Pistol node shown (all other weapons hidden)
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlayerPhase } from '../../../shared/schema';
import { PLAYER_RADIUS } from '../../../shared/constants';

/** Team colours: 0 = cyan, 1 = magenta */
const TEAM_COLORS: [number, number] = [0x00ffff, 0xff00ff];
const MODEL_YAW_OFFSET = Math.PI;

/** Animation names that exist in the Character_Soldier GLTF. */
const ANIM_NAMES = ['Idle', 'Walk', 'Run', 'Jump_Idle', 'Death', 'HitReact', 'Idle_Shoot'] as const;
type AnimName = typeof ANIM_NAMES[number];

export class PlayerModel {
  private root:    THREE.Group;
  private mixer:   THREE.AnimationMixer;
  private actions  = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private scene:   THREE.Scene;

  public constructor(scene: THREE.Scene, gltf: GLTF, team: 0 | 1) {
    this.scene = scene;

    // Clone the model so each player is independent
    this.root  = gltf.scene.clone(true);
    this.mixer = new THREE.AnimationMixer(this.root);

    // Scale to match PLAYER_RADIUS hitbox (soldier model height ~1.8 units in glTF)
    const targetHeight = PLAYER_RADIUS * 2.2;
    this.root.scale.setScalar(targetHeight / 1.8);

    // Apply team color to armor + set up weapon visibility
    this._applyTeamColor(team);
    this._setupWeapon();

    // Build animation actions
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip, this.root);
      action.loop  = THREE.LoopRepeat;
      this.actions.set(clip.name, action);
    }

    // Default pose
    this._playAnim('Idle', 0);

    scene.add(this.root);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y - PLAYER_RADIUS, z); // offset so sphere center aligns
  }

  public setRotationYaw(yaw: number): void {
    // glTF character faces +Z by default; gameplay yaw 0 faces -Z.
    this.root.rotation.y = yaw + MODEL_YAW_OFFSET;
  }

  public update(dt: number, phase: PlayerPhase, velMagnitude: number): void {
    this.mixer.update(dt);

    // Animation state from player phase
    switch (phase) {
      case 'BREACH':
        this._playAnim(velMagnitude > 0.5 ? 'Walk' : 'Idle');
        break;
      case 'FLOATING':
      case 'GRABBING':
      case 'AIMING':
        this._playAnim('Jump_Idle');
        break;
      case 'FROZEN':
        this._playAnim('Death', 0.3);
        if (this.current) {
          this.current.loop  = THREE.LoopOnce;
          this.current.clampWhenFinished = true;
        }
        break;
      case 'RESPAWNING':
        this.root.visible = false;
        return;
    }
    this.root.visible = true;
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) (m as THREE.Material).dispose();
      }
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _applyTeamColor(team: 0 | 1): void {
    const teamColor = new THREE.Color(TEAM_COLORS[team]);

    this.root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i] as THREE.MeshStandardMaterial;
        if (!mat.isMeshStandardMaterial) continue;

        const name = (mat.name ?? '').toLowerCase();

        // Main armor — grey base with neon team glow
        if (name.includes('main') || name.includes('armor') || name.includes('body')) {
          const newMat = mat.clone();
          newMat.color.set(0x777777);         // grey armor base
          newMat.emissive.copy(teamColor);
          newMat.emissiveIntensity = 0.3;
          newMat.metalness = 0.6;
          newMat.roughness = 0.4;
          if (Array.isArray(mesh.material)) {
            (mesh.material as THREE.Material[])[i] = newMat;
          } else {
            mesh.material = newMat;
          }
        }
        // Other materials (skin, detail, visor) — keep mostly as-is, subtle tint
        else if (name.includes('visor') || name.includes('glass') || name.includes('lens')) {
          const newMat = mat.clone();
          newMat.color.copy(teamColor).multiplyScalar(0.8);
          newMat.emissive.copy(teamColor);
          newMat.emissiveIntensity = 0.6;
          newMat.transparent = true;
          newMat.opacity = 0.7;
          if (Array.isArray(mesh.material)) {
            (mesh.material as THREE.Material[])[i] = newMat;
          } else {
            mesh.material = newMat;
          }
        }
      }
    });
  }

  private _setupWeapon(): void {
    // The soldier GLTF has weapon nodes on the skeleton.
    // Show only the Pistol node; hide everything else weapon-related.
    const weaponKeywords = ['ak', 'smg', 'sniper', 'revolver', 'rocket', 'grenade', 'shotgun', 'knife', 'shovel'];

    this.root.traverse((obj) => {
      const n = obj.name.toLowerCase();
      const isWeapon = weaponKeywords.some(k => n.includes(k));
      const isPistol = n.includes('pistol');

      if (isWeapon && !isPistol) {
        obj.visible = false;
      }
    });
  }

  private _playAnim(name: AnimName, fadeIn = 0.25): void {
    const action = this.actions.get(name);
    if (!action || action === this.current) return;

    if (this.current) this.current.fadeOut(fadeIn);
    action.reset().fadeIn(fadeIn).play();
    this.current = action;
  }
}

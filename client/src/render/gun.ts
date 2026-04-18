import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * First-person gun view model.
 *
 * The model is parented to the camera so it automatically follows all camera
 * movement and rotation. depthTest is disabled on every mesh so the gun is
 * always drawn on top and never clips through environment geometry.
 *
 * Tune GUN_OFFSET, GUN_SCALE and GUN_ROTATION after first launch to fit the
 * specific model's coordinate system and size.
 */

/** Camera-local offset: right (+X), up (+Y), forward (-Z) */
const GUN_OFFSET = new THREE.Vector3(0.1, -0.3, -0.15);
/** Uniform scale — Ray Gun .glb may be exported in cm; tune as needed */
const GUN_SCALE = 0.15;
/** Euler rotation in camera space — flip/reorient as the model requires */
const GUN_ROTATION = new THREE.Euler(0, -0.1, 0);

export class GunViewModel {
  private root: THREE.Group | null = null;
  private _visible = true;
  private muzzleLocal: THREE.Vector3 | null = null;
  private tintMaterials: THREE.MeshStandardMaterial[] = [];
  private tintOriginal: { emissive: THREE.Color; intensity: number }[] = [];
  private pendingTint: number | null = null;

  public constructor(camera: THREE.PerspectiveCamera) {
    const loader = new GLTFLoader();
    loader.load(
      '/models/Ray Gun.glb',
      (gltf) => {
        this.root = gltf.scene;
        this.root.scale.setScalar(GUN_SCALE);
        this.root.position.copy(GUN_OFFSET);
        this.root.rotation.copy(GUN_ROTATION);
        this.muzzleLocal = this.computeMuzzleLocal(this.root);

        // Render on top of everything — never clip into walls. Clone
        // materials so the frozen tint on this instance doesn't leak
        // into any other gun that happens to share the source material.
        this.root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          obj.renderOrder = 999;
          const src = Array.isArray(obj.material) ? obj.material : [obj.material];
          const cloned = src.map((m) => m.clone());
          obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
          for (const m of cloned) {
            m.depthTest = false;
            m.depthWrite = true;
            m.transparent = true;
            if (m instanceof THREE.MeshStandardMaterial) {
              this.tintMaterials.push(m);
              this.tintOriginal.push({
                emissive: m.emissive.clone(),
                intensity: m.emissiveIntensity,
              });
            }
          }
        });

        this.root.visible = this._visible;
        camera.add(this.root);
        if (this.pendingTint !== null) {
          this.applyTint(this.pendingTint);
        }
      },
      undefined,
      (err) => console.error('[GunViewModel] failed to load Ray Gun.glb:', err),
    );
  }

  /** Show or hide the gun (e.g. hide in menus or death state). */
  public setVisible(visible: boolean): void {
    this._visible = visible;
    if (this.root) this.root.visible = visible;
  }

  /**
   * Tint the pistol with an enemy-team glow when the local player is
   * incapacitated. Pass `null` to clear the tint. Keeping the model
   * visible (rather than hiding it) gives the player clear visual
   * feedback that they've been hit.
   */
  public setFrozenTint(color: number | null): void {
    if (!this.root) {
      this.pendingTint = color;
      return;
    }
    this.applyTint(color);
  }

  private applyTint(color: number | null): void {
    if (color === null) {
      for (let i = 0; i < this.tintMaterials.length; i++) {
        const m = this.tintMaterials[i];
        const orig = this.tintOriginal[i];
        m.emissive.copy(orig.emissive);
        m.emissiveIntensity = orig.intensity;
        m.needsUpdate = true;
      }
      return;
    }
    for (const m of this.tintMaterials) {
      m.emissive.setHex(color);
      m.emissiveIntensity = 1.3;
      m.needsUpdate = true;
    }
  }

  public getMuzzleWorldPosition(): THREE.Vector3 | null {
    if (!this.root || !this.muzzleLocal) {
      return null;
    }

    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(this.muzzleLocal.clone());
  }

  private computeMuzzleLocal(root: THREE.Group): THREE.Vector3 {
    const muzzleNode = this.findMuzzleNode(root) ?? root;

    if (muzzleNode instanceof THREE.Mesh && muzzleNode.geometry) {
      if (!muzzleNode.geometry.boundingBox) {
        muzzleNode.geometry.computeBoundingBox();
      }
      const bbox = muzzleNode.geometry.boundingBox;
      if (bbox) {
        const localPoint = new THREE.Vector3(
          (bbox.min.x + bbox.max.x) * 0.5,
          (bbox.min.y + bbox.max.y) * 0.5,
          bbox.min.z - 0.02,
        );
        return root.worldToLocal(muzzleNode.localToWorld(localPoint));
      }
    }

    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(muzzleNode);
    const center = bbox.getCenter(new THREE.Vector3());
    const muzzleWorld = new THREE.Vector3(center.x, center.y, bbox.min.z - 0.02);
    return root.worldToLocal(muzzleWorld);
  }

  private findMuzzleNode(root: THREE.Object3D): THREE.Object3D | null {
    return root.getObjectByName('Muzzle.005')
      ?? root.getObjectByName('Muzzle')
      ?? root.getObjectByName('muzzle')
      ?? root.children.find((child) => child.name.toLowerCase().includes('muzzle'))
      ?? null;
  }
}

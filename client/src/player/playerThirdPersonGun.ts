import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const THIRD_PERSON_GUN_POSITION_STEP = 0.01;
const THIRD_PERSON_GUN_FINE_POSITION_STEP = 0.002;
const THIRD_PERSON_GUN_ROTATION_STEP = 0.05;
const THIRD_PERSON_GUN_FINE_ROTATION_STEP = 0.01;
const THIRD_PERSON_GUN_SCALE = 0.28;

const DEFAULT_OFFSET = new THREE.Vector3(0.02, 0.03, -0.08);
const DEFAULT_ROTATION = new THREE.Euler(-17.72, 0.0, 1.31);

let gunPrototypePromise: Promise<THREE.Group> | null = null;

export interface ThirdPersonGunTuningState {
  enabled: boolean;
  offset: THREE.Vector3;
  rotation: THREE.Euler;
}

/**
 * Owns the third-person pistol: the GLB load, attachment to the player's
 * right palm bone, visible-toggling, muzzle world-position query, and the
 * live tuning overlay API used from app.ts via the /tune keys.
 */
export class ThirdPersonGun {
  private model: THREE.Group | null = null;
  private visible = false;
  private muzzleLocal: THREE.Vector3 | null = null;
  private offset = DEFAULT_OFFSET.clone();
  private rotation = DEFAULT_ROTATION.clone();
  private tuningEnabled = false;
  private tintMaterials: THREE.MeshStandardMaterial[] = [];
  private tintOriginal: { emissive: THREE.Color; intensity: number }[] = [];
  private pendingTint: number | null = null;

  /**
   * Find the right-hand bone on the alien rig and load the gun GLB as a
   * child of it. Called once when the Alien.glb rig is ready.
   */
  public attachTo(alien: THREE.Group): void {
    const palm = ['PalmR', 'Palm.R', 'HandR', 'Hand.R', 'LowerArmR', 'LowerArm.R']
      .map((name) => alien.getObjectByName(name))
      .find((node): node is THREE.Object3D => node !== undefined);
    if (!palm) {
      console.warn('[ThirdPersonGun] could not find a right-hand bone for attachment');
      return;
    }

    void loadGunPrototype()
      .then((prototype) => {
        const gun = prototype.clone(true);
        gun.position.copy(this.offset);
        gun.rotation.copy(this.rotation);
        gun.visible = this.visible;

        // Clone materials so per-instance tint doesn't leak across players.
        gun.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const src = Array.isArray(obj.material) ? obj.material : [obj.material];
          const cloned = src.map((m) => m.clone());
          obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
          for (const m of cloned) {
            if (m instanceof THREE.MeshStandardMaterial) {
              this.tintMaterials.push(m);
              this.tintOriginal.push({
                emissive: m.emissive.clone(),
                intensity: m.emissiveIntensity,
              });
            }
          }
        });

        this.muzzleLocal = this.computeMuzzleLocal(gun);
        palm.add(gun);
        this.model = gun;
        this.applyTransform();
        if (this.pendingTint !== null) {
          this.applyTint(this.pendingTint);
        }
      })
      .catch((err: unknown) => console.error('[ThirdPersonGun] failed to load Ray Gun.glb', err));
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.model) this.model.visible = visible;
  }

  public setFrozenTint(color: number | null): void {
    if (!this.model) {
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

  public dispose(): void {
    if (this.model?.parent) {
      this.model.parent.remove(this.model);
    }
    this.model = null;
    this.muzzleLocal = null;
  }

  public getMuzzleWorldPosition(): THREE.Vector3 | null {
    if (!this.model || !this.muzzleLocal) return null;
    this.model.updateMatrixWorld(true);
    return this.model.localToWorld(this.muzzleLocal.clone());
  }

  public toggleTuning(): boolean {
    this.tuningEnabled = !this.tuningEnabled;
    console.info(
      `[ThirdPersonGun] tuning ${this.tuningEnabled ? 'enabled' : 'disabled'}.`,
    );
    if (this.tuningEnabled) this.logTuning();
    return this.tuningEnabled;
  }

  public isTuningEnabled(): boolean {
    return this.tuningEnabled;
  }

  public nudge(
    positionAxes: { x: number; y: number; z: number },
    rotationAxes: { x: number; y: number; z: number },
    fine: boolean,
  ): boolean {
    const posStep = fine ? THIRD_PERSON_GUN_FINE_POSITION_STEP : THIRD_PERSON_GUN_POSITION_STEP;
    const rotStep = fine ? THIRD_PERSON_GUN_FINE_ROTATION_STEP : THIRD_PERSON_GUN_ROTATION_STEP;
    const hasPos = positionAxes.x !== 0 || positionAxes.y !== 0 || positionAxes.z !== 0;
    const hasRot = rotationAxes.x !== 0 || rotationAxes.y !== 0 || rotationAxes.z !== 0;
    if (!hasPos && !hasRot) return false;

    this.offset.x += positionAxes.x * posStep;
    this.offset.y += positionAxes.y * posStep;
    this.offset.z += positionAxes.z * posStep;

    this.rotation.x += rotationAxes.x * rotStep;
    this.rotation.y += rotationAxes.y * rotStep;
    this.rotation.z += rotationAxes.z * rotStep;

    this.applyTransform();
    return true;
  }

  public resetTuning(): void {
    this.offset.copy(DEFAULT_OFFSET);
    this.rotation.copy(DEFAULT_ROTATION);
    this.applyTransform();
    console.info('[ThirdPersonGun] tuning reset to defaults.');
    this.logTuning();
  }

  public logTuning(): string {
    const lines = [
      `[ThirdPersonGun] OFFSET = new THREE.Vector3(${this.offset.x.toFixed(3)}, ${this.offset.y.toFixed(3)}, ${this.offset.z.toFixed(3)});`,
      `[ThirdPersonGun] ROTATION = new THREE.Euler(${this.rotation.x.toFixed(3)}, ${this.rotation.y.toFixed(3)}, ${this.rotation.z.toFixed(3)});`,
    ];
    for (const line of lines) console.info(line);
    return lines.join('\n');
  }

  public getTuningState(): ThirdPersonGunTuningState {
    return {
      enabled: this.tuningEnabled,
      offset: this.offset.clone(),
      rotation: this.rotation.clone(),
    };
  }

  private applyTransform(): void {
    if (!this.model) return;
    this.model.position.copy(this.offset);
    this.model.rotation.copy(this.rotation);
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

async function loadGunPrototype(): Promise<THREE.Group> {
  if (!gunPrototypePromise) {
    gunPrototypePromise = new GLTFLoader()
      .loadAsync('/models/Ray Gun.glb')
      .then((gltf) => {
        const gun = gltf.scene;
        gun.scale.setScalar(THIRD_PERSON_GUN_SCALE);
        gun.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;
        });
        return gun;
      });
  }

  return gunPrototypePromise;
}

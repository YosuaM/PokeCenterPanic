import * as THREE from 'three';
import { MEDICINE_DISPOSAL_POINT, type MedicineKind } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS, worldPosition } from './center3dLayout.js';
import type { MedicineBottleModels } from './medicineBottleModels.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/medicine-disposal-bin.glb`;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class MedicineDisposalModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D;
  private light: THREE.MeshStandardMaterial | null = null;
  private lastTime = 0;
  private readonly effects: Array<{ bottle: THREE.Group; start: number | null;
    release: () => void }> = [];

  constructor(private readonly scene: THREE.Scene,
    load: () => Promise<THREE.Object3D> = loadModel) {
    const fallback = new THREE.Group();
    fallback.name = 'MedicineDisposalFallback';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.65, 1.02),
      new THREE.MeshLambertMaterial({ color: 0xfff1d9 }));
    body.position.y = 0.325;
    const opening = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.88),
      new THREE.MeshLambertMaterial({ color: 0x233d49 }));
    opening.position.y = 0.67;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x7ae8d2, emissive: 0x7ae8d2, emissiveIntensity: 0.65 }));
    light.name = 'StatusGlow';
    light.position.set(0, 0.13, 0.55);
    fallback.add(body, opening, light);
    this.model = fallback;
    this.place(fallback);
    scene.add(fallback);
    this.ready = this.install(load);
  }

  play(kind: MedicineKind, bottles: MedicineBottleModels): void {
    if (this.disposed) return;
    // Bound temporary geometry even if many confirmations arrive together.
    if (this.effects.length === 8) this.effects.shift()!.release();
    const bottle = bottles.create(kind);
    bottle.name = 'DiscardedMedicine';
    bottle.visible = false;
    this.scene.add(bottle);
    this.effects.push({ bottle, start: null, release: () => bottles.release(bottle) });
  }

  update(timeMs: number): void {
    if (this.disposed) return;
    if (timeMs < this.lastTime) this.clearEffects();
    this.lastTime = timeMs;
    let flash = 0;
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index]!;
      effect.start ??= timeMs;
      const progress = (timeMs - effect.start) / 700;
      if (progress >= 1) {
        effect.release();
        this.effects.splice(index, 1);
        continue;
      }
      const bottle = effect.bottle;
      bottle.visible = true;
      bottle.position.copy(this.model.position);
      bottle.position.y += 1.35 - 0.85 * progress * progress;
      bottle.rotation.set(0.2 * progress, 0, 0.12 * Math.sin(progress * Math.PI));
      // Tuck the bottle into the shallow modeled opening without clipping through the casing.
      bottle.scale.setScalar(0.85 * Math.min(1, (1 - progress) / 0.35));
      flash = Math.max(flash, Math.sin(progress * Math.PI) ** 2);
    }
    if (this.light) this.light.emissiveIntensity = 0.65 + 3 * flash;
  }

  clearEffects(): void {
    for (const effect of this.effects) effect.release();
    this.effects.length = 0;
    if (this.light) this.light.emissiveIntensity = 0.65;
  }

  private place(model: THREE.Object3D): void {
    // The existing inset supports the bin, directly behind the disposal target.
    model.position.set(worldPosition(MEDICINE_DISPOSAL_POINT).x,
      0.705, CENTER_3D_FOOTPRINTS[3]!.z + 0.22);
    const glow = model.getObjectByName('StatusGlow');
    this.light = glow instanceof THREE.Mesh && glow.material instanceof THREE.MeshStandardMaterial ?
      glow.material : null;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearEffects();
    this.light = null;
    this.model.removeFromParent();
    disposeModelResources(this.model);
  }

  private async install(load: () => Promise<THREE.Object3D>): Promise<boolean> {
    try {
      const model = await load();
      if (this.disposed) {
        disposeModelResources(model);
        return false;
      }
      this.place(model);
      this.model.removeFromParent();
      disposeModelResources(this.model);
      this.model = model;
      this.scene.add(model);
      this.update(this.lastTime);
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Medicine disposal model unavailable; using procedural container.', error);
      return false;
    }
  }
}

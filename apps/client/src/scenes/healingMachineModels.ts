import * as THREE from 'three';
import { disposeModelResources } from './modelResources.js';
import type { HealingMachineSnapshot } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/healing-machine.glb`;
type MachineStatus = HealingMachineSnapshot['status'];

function lightAppearance(status: MachineStatus, timeMs: number): { color: number; intensity: number } {
  switch (status) {
    case 'treating': return { color: 0x36bff5,
      intensity: 0.25 + 1.45 * (0.5 + 0.5 * Math.sin(timeMs * Math.PI * 2 / 1600)) };
    case 'completed': return { color: 0x62e985, intensity: 0.8 };
    case 'broken': return { color: 0xff5e42, intensity: timeMs % 1200 < 350 ? 1.4 : 0.08 };
    case 'empty': return { color: 0x52988e, intensity: 0.15 };
  }
}

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

/** Owns the shared GLB resources; procedural stations stay visible until loading succeeds. */
export class HealingMachineModels {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D | null = null;
  private readonly instances: THREE.Object3D[] = [];
  private readonly lights: THREE.MeshStandardMaterial[][] = [];
  private status: MachineStatus = 'empty';
  private timeMs = 0;

  constructor(scene: THREE.Scene, fallbacks: THREE.Group[],
    load: () => Promise<THREE.Object3D> = loadModel) {
    this.ready = this.install(scene, fallbacks, load);
  }

  update(status: MachineStatus, timeMs: number): void {
    if (this.disposed) return;
    this.status = status;
    this.timeMs = timeMs;
    for (const [index, materials] of this.lights.entries()) {
      // Only the left station currently has an authoritative machine on the server.
      const appearance = lightAppearance(index === 0 ? status : 'empty', timeMs);
      for (const material of materials) {
        material.color.setHex(appearance.color);
        material.emissive.setHex(appearance.color);
        material.emissiveIntensity = appearance.intensity;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const instance of this.instances) instance.removeFromParent();
    this.instances.length = 0;
    for (const materials of this.lights) {
      for (const material of materials) material.dispose();
    }
    this.lights.length = 0;
    if (this.model) disposeModelResources(this.model);
    this.model = null;
  }

  private async install(scene: THREE.Scene, fallbacks: THREE.Group[],
    load: () => Promise<THREE.Object3D>): Promise<boolean> {
    try {
      const model = await load();
      if (this.disposed) {
        disposeModelResources(model);
        return false;
      }
      this.model = model;
      for (const [index, fallback] of fallbacks.entries()) {
        const station = CENTER_3D_FOOTPRINTS[index + 1]!;
        const instance = model.clone(true);
        instance.name = `HealingMachineStation${index + 1}`;
        instance.position.set(station.x, 0, station.z);
        const lightMaterials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
        instance.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.name !== 'StatusGlow' && object.name !== 'ScreenTrace') return;
          const cloneLight = (material: THREE.Material): THREE.Material => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return material;
            let copy = lightMaterials.get(material);
            if (!copy) {
              copy = material.clone();
              lightMaterials.set(material, copy);
            }
            return copy;
          };
          object.material = Array.isArray(object.material) ?
            object.material.map(cloneLight) : cloneLight(object.material);
        });
        this.lights.push([...lightMaterials.values()]);
        scene.add(instance);
        this.instances.push(instance);
        fallback.removeFromParent();
        disposeModelResources(fallback);
      }
      this.update(this.status, this.timeMs);
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Healing machine model unavailable; using procedural stations.', error);
      return false;
    }
  }
}

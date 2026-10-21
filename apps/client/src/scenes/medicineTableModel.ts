import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/medicine-table.glb`;
const PREPARATION_LIGHTS = [
  { node: 'BurnHealGlow', color: 0xf18b65, periodMs: 1200 },
  { node: 'AntidoteGlow', color: 0xb97bf0, periodMs: 1800 },
] as const;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class MedicineTableModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D | null = null;
  private readonly lights: Array<THREE.MeshStandardMaterial | null> = [];
  private preparing = [false, false];
  private timeMs = 0;

  constructor(scene: THREE.Scene, fallback: THREE.Group,
    load: () => Promise<THREE.Object3D> = loadModel) {
    this.ready = this.install(scene, fallback, load);
  }

  update(owners: readonly string[], timeMs: number): void {
    if (this.disposed) return;
    this.preparing = PREPARATION_LIGHTS.map((_, index) => Boolean(owners[index]));
    this.timeMs = timeMs;
    this.updateLights();
  }

  private updateLights(): void {
    for (const [index, light] of this.lights.entries()) {
      if (!light) continue;
      const { color, periodMs } = PREPARATION_LIGHTS[index]!;
      light.color.setHex(color);
      light.emissive.setHex(color);
      light.emissiveIntensity = this.preparing[index] ?
        0.3 + 1.3 * (0.5 + 0.5 * Math.sin(this.timeMs * Math.PI * 2 / periodMs)) : 0.12;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lights.length = 0;
    if (this.model) {
      this.model.removeFromParent();
      disposeModelResources(this.model);
      this.model = null;
    }
  }

  private async install(scene: THREE.Scene, fallback: THREE.Group,
    load: () => Promise<THREE.Object3D>): Promise<boolean> {
    try {
      const model = await load();
      if (this.disposed) {
        disposeModelResources(model);
        return false;
      }
      const station = CENTER_3D_FOOTPRINTS[3]!;
      model.position.set(station.x, 0, station.z);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.model = model;
      for (const { node } of PREPARATION_LIGHTS) {
        const mesh = model.getObjectByName(node);
        this.lights.push(mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial ?
          mesh.material : null);
      }
      this.updateLights();
      scene.add(model);
      fallback.removeFromParent();
      disposeModelResources(fallback);
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Medicine table model unavailable; using procedural table.', error);
      return false;
    }
  }
}

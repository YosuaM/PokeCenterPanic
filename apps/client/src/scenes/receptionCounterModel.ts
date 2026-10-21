import * as THREE from 'three';
import { patientPresentation, RECEPTION_SLOT_POSITIONS, type PatientRecord } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/reception-counter.glb`;
const LIGHT_NODES = [...RECEPTION_SLOT_POSITIONS.map((_, index) => `ReceptionGlow${index + 1}`),
  'DischargeGlow'];
type LightState = 'empty' | 'occupied' | 'ready';

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class ReceptionCounterModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D | null = null;
  private readonly lights: Array<THREE.MeshStandardMaterial | null> = [];
  private states: LightState[] = LIGHT_NODES.map(() => 'empty');
  private timeMs = 0;

  constructor(scene: THREE.Scene, fallback: THREE.Group,
    load: () => Promise<THREE.Object3D> = loadModel) {
    this.ready = this.install(scene, fallback, load);
  }

  update(patients: readonly PatientRecord[], timeMs: number): void {
    if (this.disposed) return;
    this.states = LIGHT_NODES.map(() => 'empty');
    this.timeMs = timeMs;
    for (const patient of patients) {
      if (patient.lifecycle !== 'active' || patient.location === 'none') continue;
      const ready = patientPresentation(patient).readyForDischarge;
      if (ready) this.states[RECEPTION_SLOT_POSITIONS.length] = 'ready';
      if (patient.location === 'reception' && Number.isInteger(patient.slotIndex) &&
        patient.slotIndex >= 0 && patient.slotIndex < RECEPTION_SLOT_POSITIONS.length) {
        this.states[patient.slotIndex] = ready ? 'ready' : 'occupied';
      }
    }
    this.updateLights();
  }

  private updateLights(): void {
    for (const [index, light] of this.lights.entries()) {
      if (!light) continue;
      const state = this.states[index];
      const color = state === 'ready' ? 0x68ee91 : state === 'occupied' ? 0xf3bc64 : 0x79b7ab;
      const pulse = 0.5 + 0.5 * Math.sin(this.timeMs * Math.PI * 2 / (state === 'ready' ? 1400 : 2400));
      light.color.setHex(color);
      light.emissive.setHex(color);
      light.emissiveIntensity = state === 'ready' ? 0.4 + 1.2 * pulse :
        state === 'occupied' ? 0.35 + 0.35 * pulse : 0.12;
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
      const station = CENTER_3D_FOOTPRINTS[0]!;
      model.position.set(station.x, 0, station.z);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.model = model;
      for (const name of LIGHT_NODES) {
        const mesh = model.getObjectByName(name);
        this.lights.push(mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial ?
          mesh.material : null);
      }
      this.updateLights();
      scene.add(model);
      fallback.removeFromParent();
      disposeModelResources(fallback);
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Reception counter model unavailable; using procedural counter.', error);
      return false;
    }
  }
}

import * as THREE from 'three';
import { patientPresentation, type PatientRecord } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/recovery-area.glb`;
const LIGHT_NODES = ['StatusGlow', 'ScreenTrace', 'ReadyMark'];
type LightState = 'empty' | 'waiting' | 'ready';

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class RecoveryAreaModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D | null = null;
  private readonly lights: Array<THREE.MeshStandardMaterial | null> = [];
  private trace: THREE.Object3D | null = null;
  private readyMark: THREE.Object3D | null = null;
  private state: LightState = 'empty';
  private timeMs = 0;

  constructor(scene: THREE.Scene, fallback: THREE.Group,
    load: () => Promise<THREE.Object3D> = loadModel) {
    this.ready = this.install(scene, fallback, load);
  }

  update(patients: readonly PatientRecord[], timeMs: number): void {
    if (this.disposed) return;
    this.state = 'empty';
    this.timeMs = timeMs;
    for (const patient of patients) {
      if (patient.lifecycle !== 'active' || patient.location !== 'recovery' ||
        !Number.isInteger(patient.slotIndex) || patient.slotIndex < 0) continue;
      if (patient.slotIndex === 0 && patientPresentation(patient).readyForDischarge) {
        this.state = 'ready';
        break;
      }
      this.state = 'waiting';
    }
    this.updateLights();
  }

  private updateLights(): void {
    const ready = this.state === 'ready';
    const color = ready ? 0x68ee91 : this.state === 'waiting' ? 0xf3bc64 : 0x79b7ab;
    const pulse = 0.5 + 0.5 * Math.sin(this.timeMs * Math.PI * 2 / (ready ? 1400 : 2400));
    for (const light of this.lights) {
      if (!light) continue;
      light.color.setHex(color);
      light.emissive.setHex(color);
      light.emissiveIntensity = ready ? 0.4 + 1.2 * pulse :
        this.state === 'waiting' ? 0.35 + 0.35 * pulse : 0.12;
    }
    if (this.trace) this.trace.visible = !ready;
    if (this.readyMark) this.readyMark.visible = ready;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lights.length = 0;
    this.trace = null;
    this.readyMark = null;
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
      const station = CENTER_3D_FOOTPRINTS[5]!;
      model.position.set(station.x, 0, station.z);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.model = model;
      this.trace = model.getObjectByName('ScreenTrace') ?? null;
      this.readyMark = model.getObjectByName('ReadyMark') ?? null;
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
      if (!this.disposed) console.warn('Recovery area model unavailable; using procedural recovery area.', error);
      return false;
    }
  }
}

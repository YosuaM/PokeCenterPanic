import * as THREE from 'three';
import { MEDICINE_KINDS, type MedicineKind, type Point } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CarriedItemMotion } from './carriedItemMotion.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_FILES: Record<MedicineKind, string> = {
  burnHeal: 'burn-heal-bottle.glb', antidote: 'antidote-bottle.glb',
};
export const MEDICINE_BOTTLE_SURFACE_HEIGHT = 0.04;
export const MEDICINE_BOTTLE_CARRIED_HEIGHT = 0.92;

async function loadModel(kind: MedicineKind): Promise<THREE.Object3D> {
  const url = `${import.meta.env.BASE_URL}assets/original/models/${MODEL_FILES[kind]}`;
  return (await new GLTFLoader().loadAsync(url)).scene;
}

export class MedicineBottleModels {
  readonly ready: Promise<Record<MedicineKind, boolean>>;
  private disposed = false;
  private readonly templates: Partial<Record<MedicineKind, THREE.Object3D>> = {};
  private readonly motions = new Map<THREE.Group, { carrierId: string; motion: CarriedItemMotion }>();
  private readonly instances = new Map<THREE.Group, MedicineKind>();

  constructor(load: (kind: MedicineKind) => Promise<THREE.Object3D> = loadModel) {
    this.ready = Promise.all(MEDICINE_KINDS.map((kind) => this.install(kind, load)))
      .then(([burnHeal, antidote]) => ({ burnHeal: burnHeal!, antidote: antidote! }));
  }

  create(kind: MedicineKind): THREE.Group {
    const group = new THREE.Group();
    group.name = `${kind}BottleInstance`;
    group.userData.medicineKind = kind;
    if (this.disposed) return group;
    this.instances.set(group, kind);
    const template = this.templates[kind];
    if (template) group.add(template.clone(true));
    else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.36, 6),
        new THREE.MeshLambertMaterial({ color: kind === 'burnHeal' ? 0xf28d66 : 0xa876d6 }));
      body.position.y = 0.18;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 6),
        new THREE.MeshLambertMaterial({ color: 0xffeed0 }));
      cap.position.y = 0.4;
      group.add(body, cap);
    }
    return group;
  }

  motion(group: THREE.Group, point: Point, carrierId: string, timeMs: number): { lift: number; roll: number } {
    if (!this.instances.has(group) || !carrierId) {
      this.motions.delete(group);
      return { lift: 0, roll: 0 };
    }
    let state = this.motions.get(group);
    if (!state || state.carrierId !== carrierId) {
      state = { carrierId, motion: new CarriedItemMotion({ lift: 0.015, roll: 0.06 }) };
      this.motions.set(group, state);
    }
    return state.motion.update(point, true, timeMs);
  }

  release(group: THREE.Group): void {
    const kind = this.instances.get(group);
    if (!kind) return;
    this.instances.delete(group);
    this.motions.delete(group);
    group.removeFromParent();
    // Clones share resources owned by their medicine's template.
    if (!this.templates[kind]) disposeModelResources(group);
    group.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const group of this.instances.keys()) this.release(group);
    for (const kind of MEDICINE_KINDS) {
      const template = this.templates[kind];
      if (template) disposeModelResources(template);
      delete this.templates[kind];
    }
  }

  private async install(kind: MedicineKind,
    load: (kind: MedicineKind) => Promise<THREE.Object3D>): Promise<boolean> {
    try {
      const model = await load(kind);
      if (this.disposed) {
        disposeModelResources(model);
        return false;
      }
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.templates[kind] = model;
      for (const [group, instanceKind] of this.instances) {
        if (instanceKind !== kind) continue;
        disposeModelResources(group);
        group.clear();
        group.add(model.clone(true));
      }
      return true;
    } catch (error) {
      if (!this.disposed) console.warn(`${kind} bottle model unavailable; using procedural bottles.`, error);
      return false;
    }
  }
}

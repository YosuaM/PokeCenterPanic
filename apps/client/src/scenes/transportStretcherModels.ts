import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/transport-stretcher.glb`;
export const TRANSPORT_STRETCHER_ELEVATION = 1.17;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class TransportStretcherModels {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private template: THREE.Object3D | null = null;
  private readonly instances = new Set<THREE.Group>();

  constructor(load: () => Promise<THREE.Object3D> = loadModel) {
    this.ready = this.install(load);
  }

  create(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TransportStretcherInstance';
    group.visible = false;
    if (this.disposed) return group;
    this.instances.add(group);
    if (this.template) group.add(this.template.clone(true));
    else {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xe7e3d3 }));
      bed.position.y = 0.06;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.64),
        new THREE.MeshLambertMaterial({ color: 0x526a73 }));
      frame.position.y = -0.04;
      group.add(bed, frame);
    }
    return group;
  }

  release(group: THREE.Group): void {
    if (!this.instances.delete(group)) return;
    group.removeFromParent();
    // Loaded instances share geometry and materials owned by the template.
    if (!this.template) disposeModelResources(group);
    group.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const group of this.instances) this.release(group);
    if (this.template) disposeModelResources(this.template);
    this.template = null;
  }

  private async install(load: () => Promise<THREE.Object3D>): Promise<boolean> {
    try {
      const model = await load();
      if (this.disposed) {
        disposeModelResources(model);
        return false;
      }
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.template = model;
      for (const group of this.instances) {
        disposeModelResources(group);
        group.clear();
        group.add(model.clone(true));
      }
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Transport stretcher model unavailable; using procedural stretchers.', error);
      return false;
    }
  }
}

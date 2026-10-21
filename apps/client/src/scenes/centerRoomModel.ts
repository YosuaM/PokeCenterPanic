import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/center-room.glb`;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class CenterRoomModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D;

  constructor(private readonly scene: THREE.Scene, fallback: THREE.Group,
    load: () => Promise<THREE.Object3D> = loadModel) {
    this.model = fallback;
    this.ready = this.install(load);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
      // The room is exported in shared-map coordinates, including the entrance step.
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = !object.name.startsWith('Floor');
        object.receiveShadow = true;
      });
      this.model.removeFromParent();
      disposeModelResources(this.model);
      this.model = model;
      this.scene.add(model);
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Center room model unavailable; using procedural floor and walls.', error);
      return false;
    }
  }
}

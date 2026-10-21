import * as THREE from 'three';
import { WALK_BOUNDS } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { worldPosition } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/center-sign.glb`;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class CenterSignModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D;
  private lights: Array<{ material: THREE.MeshStandardMaterial; intensity: number }> = [];
  private lastTime = 0;

  constructor(private readonly scene: THREE.Scene,
    load: () => Promise<THREE.Object3D> = loadModel) {
    const fallback = new THREE.Group();
    fallback.name = 'CenterSignFallback';
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.9, 1.12, 0.28),
      new THREE.MeshLambertMaterial({ color: 0xfff1d9 }));
    frame.position.y = 0.7;
    const face = new THREE.Mesh(new THREE.BoxGeometry(5.36, 0.7, 0.055),
      new THREE.MeshLambertMaterial({ color: 0x102f39 }));
    face.position.set(0, 0.7, 0.235);
    fallback.add(frame, face);
    for (const [width, height] of [[0.14, 0.5], [0.5, 0.14]]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x7ae8d2, emissive: 0x7ae8d2,
          emissiveIntensity: 0.65 }));
      cross.position.set(0, 0.7, 0.29);
      cross.name = 'StatusGlow';
      fallback.add(cross);
    }
    this.model = fallback;
    this.place(fallback);
    scene.add(fallback);
    this.ready = this.install(load);
  }

  update(timeMs: number): void {
    if (this.disposed) return;
    this.lastTime = timeMs;
    // A four-second breathing cycle keeps every light lit, even at its trough.
    const brightness = 1 - 0.2 * Math.cos(timeMs * Math.PI * 2 / 4000);
    for (const { material, intensity } of this.lights) {
      material.emissiveIntensity = intensity * brightness;
    }
  }

  private place(model: THREE.Object3D): void {
    // Mount above the back wall, clear of reception patients and foreground staff.
    model.position.set(0, 2.36, worldPosition({ x: 480, y: WALK_BOUNDS.top }).z - 0.02);
    const lights = new Set<THREE.MeshStandardMaterial>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if ((object.name === 'StatusGlow' || object.name === 'ScreenTrace') &&
        object.material instanceof THREE.MeshStandardMaterial) lights.add(object.material);
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.lights = [...lights].map((material) => ({ material, intensity: material.emissiveIntensity }));
    this.update(this.lastTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lights = [];
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
      return true;
    } catch (error) {
      if (!this.disposed) console.warn('Center sign model unavailable; using procedural sign.', error);
      return false;
    }
  }
}

import * as THREE from 'three';
import type { Point } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ENTRANCE_3D_POSITION, ENTRANCE_3D_WIDTH, worldPosition } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/entrance-door.glb`;
const CLOSED_LIGHT_COLOR = new THREE.Color(0xffad55);
const OPEN_LIGHT_COLOR = new THREE.Color(0x54efac);

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class EntranceDoorModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D;
  private leaves: Array<{ object: THREE.Object3D; travel: number }> = [];
  private lights: THREE.MeshStandardMaterial[] = [];
  private openness = 1;
  private sensorActive = false;
  private lastNearby = -Infinity;
  private lastTime: number | null = null;

  constructor(private readonly scene: THREE.Scene,
    load: () => Promise<THREE.Object3D> = loadModel) {
    const fallback = new THREE.Group();
    fallback.name = 'EntranceDoorFallback';
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE_3D_WIDTH, 0.07, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x347a80 }));
    threshold.position.y = 0.035;
    fallback.add(threshold);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.42),
        new THREE.MeshLambertMaterial({ color: 0xfff1d9 }));
      post.position.set(side * 2.9, 1.27, 0);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.035),
        new THREE.MeshStandardMaterial());
      light.name = 'StatusGlow';
      light.position.set(0, 0.71, 0.277);
      post.add(light);
      fallback.add(post);
    }
    for (const [side, label] of [[-1, 'L'], [1, 'R']] as const) {
      for (let index = 0; index < 3; index++) {
        const leaf = new THREE.Group();
        leaf.name = `EntranceLeaf${label}${index}_Runtime`;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.28, 0.065),
          new THREE.MeshLambertMaterial({ color: 0xa4d9ca }));
        panel.position.set(side * (0.465 + 0.92 * index), 1.26, 0.08 - index * 0.15);
        leaf.add(panel);
        fallback.add(leaf);
      }
    }
    this.model = fallback;
    this.place(fallback);
    scene.add(fallback);
    this.ready = this.install(load);
  }

  update(players: readonly Point[], timeMs: number): void {
    if (this.disposed) return;
    const reset = this.lastTime === null || timeMs < this.lastTime || timeMs - this.lastTime > 1000;
    const elapsed = reset ? 0 : timeMs - this.lastTime!;
    if (reset) {
      this.sensorActive = false;
      this.lastNearby = -Infinity;
    }
    const halfWidth = this.sensorActive ? 3.4 : 3;
    const depth = this.sensorActive ? 2.6 : 2.2;
    this.sensorActive = players.some((point) => {
      const world = worldPosition(point);
      return Math.abs(world.x - ENTRANCE_3D_POSITION.x) <= halfWidth &&
        Math.abs(world.z - ENTRANCE_3D_POSITION.z) <= depth;
    });
    if (this.sensorActive) this.lastNearby = timeMs;
    const target = this.sensorActive || timeMs - this.lastNearby < 350 ? 1 : 0;
    if (reset) this.openness = target;
    else if (target > this.openness) this.openness = Math.min(1, this.openness + elapsed / 450);
    else if (target < this.openness) this.openness = Math.max(0, this.openness - elapsed / 550);
    this.lastTime = timeMs;
    this.applyPose();
  }

  private applyPose(): void {
    const eased = this.openness * this.openness * (3 - 2 * this.openness);
    for (const { object, travel } of this.leaves) object.position.x = travel * eased;
    for (const light of this.lights) {
      light.color.copy(CLOSED_LIGHT_COLOR).lerp(OPEN_LIGHT_COLOR, eased);
      light.emissive.copy(light.color);
      light.emissiveIntensity = 0.45 + 0.65 * eased;
    }
  }

  private place(model: THREE.Object3D): void {
    model.position.set(ENTRANCE_3D_POSITION.x, 0, ENTRANCE_3D_POSITION.z);
    // Match the open foreground facade so the lintel cannot hide staff sprites.
    const header = model.getObjectByName('EntranceHeader_Runtime');
    if (header) header.visible = false;
    this.leaves = [];
    for (const [side, label] of [[-1, 'L'], [1, 'R']] as const) {
      for (let index = 0; index < 3; index++) {
        const object = model.getObjectByName(`EntranceLeaf${label}${index}_Runtime`);
        if (object) this.leaves.push({ object,
          travel: side * (2.52 + index * 0.04 - (0.465 + 0.92 * index)) });
      }
    }
    this.lights = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name === 'StatusGlow' && object.material instanceof THREE.MeshStandardMaterial) {
        this.lights.push(object.material);
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.applyPose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.leaves = [];
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
      if (!this.disposed) console.warn('Entrance door model unavailable; using procedural doorway.', error);
      return false;
    }
  }
}

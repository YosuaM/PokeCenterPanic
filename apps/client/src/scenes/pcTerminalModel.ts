import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';
import { disposeModelResources } from './modelResources.js';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/original/models/pc-terminal.glb`;
export const PC_TERMINAL_SURFACE_HEIGHT = 0.84;

async function loadModel(): Promise<THREE.Object3D> {
  return (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
}

export class PcTerminalModel {
  readonly ready: Promise<boolean>;
  private disposed = false;
  private model: THREE.Object3D;
  private timeMs = 0;
  private displays: Array<{ mesh: THREE.Mesh; material: THREE.MeshStandardMaterial;
    baseIntensity: number; baseX: number; left: number; baseScale: number }> = [];

  constructor(private readonly scene: THREE.Scene,
    load: () => Promise<THREE.Object3D> = loadModel) {
    const fallback = new THREE.Group();
    fallback.name = 'PcTerminalFallback';
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.3, 0.92),
      new THREE.MeshLambertMaterial({ color: 0x347a80 }));
    base.position.y = 0.15;
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.8, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xfff1d9 }));
    monitor.position.set(0, 0.76, -0.16);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.73, 0.49, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x347a80, emissive: 0x7ae8d2,
        emissiveIntensity: 0.3 }));
    screen.name = 'ScreenTrace';
    screen.position.set(0, 0.81, 0.076);
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.045, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xde6c62 }));
    keyboard.position.set(0, 0.325, 0.31);
    fallback.add(base, monitor, screen, keyboard);
    for (const [name, x, y, z, width, height] of [
      ['DataLine1', 0.11, 0.93, 0.112, 0.25, 0.025],
      ['DataLine2', 0.11, 0.84, 0.112, 0.215, 0.025],
      ['DataLine3', 0.11, 0.75, 0.112, 0.18, 0.025],
      ['ProgressGlow', 0, 0.64, 0.112, 0.55, 0.025],
      ['ReaderGlow', 0, 0.19, 0.488, 0.28, 0.018],
      ['StatusGlow', 0.3, 0.48, 0.078, 0.055, 0.035],
    ] as const) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x7ae8d2, emissive: 0x7ae8d2,
          emissiveIntensity: 0.65 }));
      light.name = name;
      light.position.set(x, y, z);
      fallback.add(light);
    }
    this.model = fallback;
    this.place(fallback);
    scene.add(fallback);
    this.ready = this.install(load);
  }

  update(timeMs: number): void {
    if (this.disposed) return;
    this.timeMs = timeMs;
    const pulse = (period: number, offset = 0): number =>
      (1 - Math.cos((timeMs / period - offset) * Math.PI * 2)) / 2;
    for (const display of this.displays) {
      const { mesh, material, baseIntensity } = display;
      let width = 1;
      let brightness = 1;
      if (mesh.name.startsWith('DataLine')) {
        const activity = pulse(2400, (Number(mesh.name.slice(-1)) - 1) * 0.18);
        width = 0.3 + 0.7 * activity;
        brightness = 0.45 + 0.85 * activity;
      } else if (mesh.name === 'ProgressGlow') {
        width = 0.12 + 0.88 * pulse(4000);
        brightness = 0.65 + 0.35 * pulse(4000);
      } else if (mesh.name === 'ReaderGlow') brightness = 0.35 + 0.85 * pulse(1200);
      else if (mesh.name === 'ScreenTrace') brightness = 0.85 + 0.15 * pulse(4000);
      material.emissiveIntensity = baseIntensity * brightness;
      // Keep each row's left edge fixed while its length changes.
      mesh.scale.x = display.baseScale * width;
      mesh.position.x = display.baseX + display.left * display.baseScale * (1 - width);
    }
  }

  private place(model: THREE.Object3D): void {
    const reception = CENTER_3D_FOOTPRINTS[0]!;
    // Reserve the left end of the existing counter, clear of the first arrival pad.
    model.position.set(reception.x - reception.width / 2 + 0.57,
      PC_TERMINAL_SURFACE_HEIGHT, reception.z);
    this.displays = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (['ScreenTrace', 'StatusGlow', 'ReaderGlow', 'ProgressGlow',
        'DataLine1', 'DataLine2', 'DataLine3'].includes(object.name) &&
        object.material instanceof THREE.MeshStandardMaterial) {
        object.geometry.computeBoundingBox();
        this.displays.push({ mesh: object, material: object.material,
          baseIntensity: object.material.emissiveIntensity, baseX: object.position.x,
          left: object.geometry.boundingBox!.min.x, baseScale: object.scale.x });
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.update(this.timeMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.displays = [];
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
      if (!this.disposed) console.warn('PC terminal model unavailable; using procedural computer.', error);
      return false;
    }
  }
}

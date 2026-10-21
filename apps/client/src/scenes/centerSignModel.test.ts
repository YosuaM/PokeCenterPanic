import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WALK_BOUNDS } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CenterSignModel } from './centerSignModel.js';
import { CAMERA_HALF_HEIGHT, CAMERA_HALF_WIDTH, cameraPosition, worldPosition } from './center3dLayout.js';

async function asset() {
  const bytes = await readFile('apps/client/public/assets/original/models/center-sign.glb');
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

function disposalSpies(model: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
    }
  });
  return [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
}

describe('center sign model', () => {
  it('breathes in sync every four seconds without changing the casing or light colors', async () => {
    const model = await asset();
    const materials = ['StatusGlow', 'ScreenTrace'].map((name) =>
      (model.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material);
    const base = materials.map((material) => ({ intensity: material.emissiveIntensity,
      color: material.color.clone(), emissive: material.emissive.clone() }));
    const casing = (model.getObjectByName('CeramicCream') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    const casingIntensity = casing.emissiveIntensity;
    const sign = new CenterSignModel(new THREE.Scene(), async () => model);
    await sign.ready;
    for (const [time, brightness] of [[0, 0.8], [1000, 1], [2000, 1.2], [3000, 1], [4000, 0.8]]) {
      sign.update(time!);
      for (const [index, material] of materials.entries()) {
        expect(material.emissiveIntensity).toBeCloseTo(base[index]!.intensity * brightness!);
        expect(material.color.equals(base[index]!.color)).toBe(true);
        expect(material.emissive.equals(base[index]!.emissive)).toBe(true);
      }
    }
    for (const fps of [30, 60, 120]) {
      for (let frame = 0; frame <= fps * 2; frame++) sign.update(frame * 1000 / fps);
      expect(materials[0]!.emissiveIntensity).toBeCloseTo(base[0]!.intensity * 1.2);
    }
    sign.update(4000 - 1);
    const beforeWrap = materials[0]!.emissiveIntensity;
    sign.update(4000 + 1);
    expect(materials[0]!.emissiveIntensity).toBeCloseTo(beforeWrap, 8);
    sign.update(0);
    expect(materials[0]!.emissiveIntensity).toBeCloseTo(base[0]!.intensity * 0.8);
    expect(casing.emissiveIntensity).toBe(casingIntensity);
    sign.dispose();
    sign.update(2000);
    expect(materials[0]!.emissiveIntensity).toBeCloseTo(base[0]!.intensity * 0.8);
  });

  it('keeps the pulse phase when the loaded model replaces the fallback', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const sign = new CenterSignModel(scene, () => new Promise((done) => { resolve = done; }));
    sign.update(2000);
    const fallback = scene.children[0]!;
    for (const object of fallback.children) {
      if (object.name !== 'StatusGlow') continue;
      const light = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(light.material.emissiveIntensity).toBeCloseTo(0.65 * 1.2);
    }
    const model = await asset();
    const light = (model.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    const baseIntensity = light.emissiveIntensity;
    resolve(model);
    expect(await sign.ready).toBe(true);
    expect(light.emissiveIntensity).toBeCloseTo(baseIntensity * 1.2);
    sign.update(4000);
    expect(light.emissiveIntensity).toBeCloseTo(baseIntensity * 0.8);
    sign.dispose();
  });

  it('loads the glowing sign above the rear wall and inside the gameplay camera', async () => {
    const scene = new THREE.Scene();
    const model = await asset();
    const sign = new CenterSignModel(scene, async () => model);
    const fallbackSpies = disposalSpies(scene.children[0]!);
    expect(await sign.ready).toBe(true);
    expect(scene.children).toEqual([model]);
    for (const spy of fallbackSpies) expect(spy).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(2.36);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(bounds.max.z).toBeLessThan(worldPosition({ x: 480, y: WALK_BOUNDS.top }).z + 0.36);
    const camera = new THREE.OrthographicCamera(-CAMERA_HALF_WIDTH, CAMERA_HALF_WIDTH,
      CAMERA_HALF_HEIGHT, -CAMERA_HALF_HEIGHT, 0.1, 100);
    const position = cameraPosition();
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(0, 0.65, 0);
    camera.updateMatrixWorld();
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
    }
    for (const name of ['StatusGlow', 'ScreenTrace']) {
      const mesh = model.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(mesh.material.emissive.g).toBeGreaterThan(0.4);
    }
    const disposes = disposalSpies(model);
    sign.dispose();
    sign.dispose();
    expect(scene.children).toHaveLength(0);
    for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
  });

  it('retains a luminous fallback on load failure and cleans it up', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const scene = new THREE.Scene();
      const sign = new CenterSignModel(scene, async () => { throw new Error('404'); });
      const fallback = scene.children[0]!;
      const disposes = disposalSpies(fallback);
      expect(await sign.ready).toBe(false);
      expect(scene.children).toEqual([fallback]);
      expect(fallback.name).toBe('CenterSignFallback');
      expect(fallback.children.filter((object) => object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial && object.material.emissiveIntensity > 0)).toHaveLength(2);
      expect(warn).toHaveBeenCalledOnce();
      sign.update(2000);
      const light = (fallback.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
        THREE.MeshStandardMaterial>).material;
      expect(light.emissiveIntensity).toBeCloseTo(0.65 * 1.2);
      sign.update(4000);
      expect(light.emissiveIntensity).toBeCloseTo(0.65 * 0.8);
      sign.dispose();
      expect(scene.children).toHaveLength(0);
      for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('disposes a late load after the view is destroyed', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const sign = new CenterSignModel(scene, () => new Promise((done) => { resolve = done; }));
    const fallbackSpies = disposalSpies(scene.children[0]!);
    sign.dispose();
    const model = await asset();
    const disposes = disposalSpies(model);
    resolve(model);
    expect(await sign.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    for (const spy of [...fallbackSpies, ...disposes]) expect(spy).toHaveBeenCalledOnce();
  });
});

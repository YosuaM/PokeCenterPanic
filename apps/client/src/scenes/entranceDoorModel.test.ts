import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SPAWN_POINTS, WALK_BOUNDS, isWalkable } from '@pokecenter/shared';
import { EntranceDoorModel } from './entranceDoorModel.js';
import { ENTRANCE_3D_POSITION, worldPosition } from './center3dLayout.js';

async function asset() {
  const bytes = await readFile('apps/client/public/assets/original/models/entrance-door.glb');
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

function spies(model: THREE.Object3D) {
  const disposes: ReturnType<typeof vi.spyOn>[] = [];
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) disposes.push(vi.spyOn(object.geometry, 'dispose'));
  });
  return disposes;
}

describe('entrance door model', () => {
  it('shows warm closed lights and green open lights, following the leaves through delay and reversal', async () => {
    const model = await asset();
    const door = new EntranceDoorModel(new THREE.Scene(), async () => model);
    await door.ready;
    const light = (model.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    const near = { x: 480, y: WALK_BOUNDS.bottom - 48 };
    door.update([], 0);
    expect(light.color.getHex()).toBe(0xffad55);
    expect(light.emissive.equals(light.color)).toBe(true);
    expect(light.emissiveIntensity).toBeCloseTo(0.45);
    door.update([near], 225);
    expect(light.color.equals(new THREE.Color(0xffad55).lerp(new THREE.Color(0x54efac), 0.5))).toBe(true);
    expect(light.emissiveIntensity).toBeCloseTo(0.775);
    door.update([near], 450);
    expect(light.color.getHex()).toBe(0x54efac);
    expect(light.emissiveIntensity).toBeCloseTo(1.1);
    door.update([], 750);
    expect(light.color.getHex()).toBe(0x54efac);
    door.update([], 850);
    const closingIntensity = light.emissiveIntensity;
    expect(closingIntensity).toBeLessThan(1.1);
    door.update([near], 900);
    expect(light.emissiveIntensity).toBeGreaterThan(closingIntensity);
    door.update([], 0);
    expect(light.color.getHex()).toBe(0xffad55);
    door.update([near], 5000);
    expect(light.color.getHex()).toBe(0x54efac);
    const dispose = vi.spyOn(light, 'dispose');
    door.dispose();
    door.dispose();
    door.update([], 5100);
    expect(light.color.getHex()).toBe(0x54efac);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fits the closed frame and keeps the telescopic leaves separated throughout their travel', async () => {
    const scene = new THREE.Scene();
    const model = await asset();
    const door = new EntranceDoorModel(scene, async () => model);
    const fallback = scene.children[0]!;
    const checkClosed = (object: THREE.Object3D) => {
      const bounds = ['L', 'R'].flatMap((side) => [0, 1, 2].map((index) =>
        new THREE.Box3().setFromObject(object.getObjectByName(`EntranceLeaf${side}${index}_Runtime`)!)))
        .sort((a, b) => a.min.x - b.min.x);
      expect(bounds[0]!.min.x).toBeLessThanOrEqual(-2.75);
      expect(bounds[5]!.max.x).toBeGreaterThanOrEqual(2.75);
      for (const [index, bound] of bounds.entries()) {
        expect(bound.min.y).toBeCloseTo(0.12);
        expect(bound.max.y).toBeCloseTo(2.4);
        if (index) expect(bound.min.x - bounds[index - 1]!.max.x).toBeLessThan(0.011);
      }
    };
    door.update([], 0);
    checkClosed(fallback);
    await door.ready;
    checkClosed(model);
    for (let time = 0; time <= 450; time += 15) {
      door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], time);
      const leaves = ['L', 'R'].flatMap((side) => [0, 1, 2].map((index) =>
        new THREE.Box3().setFromObject(model.getObjectByName(`EntranceLeaf${side}${index}_Runtime`)!)));
      for (let a = 0; a < leaves.length; a++) {
        expect(leaves[a]!.min.x).toBeGreaterThan(-3.08);
        expect(leaves[a]!.max.x).toBeLessThan(3.08);
        for (let b = a + 1; b < leaves.length; b++) {
          expect(leaves[a]!.intersectsBox(leaves[b]!)).toBe(false);
        }
      }
    }
    const left = new THREE.Box3().setFromObject(model.getObjectByName('EntranceLeafL0_Runtime')!);
    const right = new THREE.Box3().setFromObject(model.getObjectByName('EntranceLeafR0_Runtime')!);
    expect(right.min.x - left.max.x).toBeGreaterThan(4.1);
    door.dispose();
  });

  it('opens smoothly for any nearby staff, stays open near the edge and closes after the last leaves', async () => {
    const scene = new THREE.Scene();
    const model = await asset();
    const door = new EntranceDoorModel(scene, async () => model);
    await door.ready;
    const leaf = model.getObjectByName('EntranceLeafR0_Runtime')!;
    const near = { x: 480, y: WALK_BOUNDS.bottom - 48 };
    const far = { x: 480, y: WALK_BOUNDS.bottom - 128 };
    door.update([far], 0);
    expect(leaf.position.x).toBe(0);
    door.update([far, near], 100);
    expect(leaf.position.x).toBeGreaterThan(0);
    expect(leaf.position.x).toBeLessThan(2.055);
    for (let time = 200; time <= 1000; time += 100) door.update([near], time);
    expect(leaf.position.x).toBeCloseTo(2.055);
    // Staying just outside the activation area must not repeatedly close the door.
    door.update([{ x: 480, y: WALK_BOUNDS.bottom - 96 }], 1100);
    expect(leaf.position.x).toBeCloseTo(2.055);
    door.update([far], 1200);
    door.update([far], 1400);
    expect(leaf.position.x).toBeCloseTo(2.055);
    door.update([far], 1500);
    expect(leaf.position.x).toBeLessThan(2.055);
    const closing = leaf.position.x;
    door.update([near], 1600);
    expect(leaf.position.x).toBeGreaterThan(closing);
    for (let time = 1700; time <= 2800; time += 100) door.update([], time);
    expect(leaf.position.x).toBe(0);
    expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x).toBeCloseTo(6.16);
    door.dispose();
    door.update([near], 2900);
    expect(leaf.position.x).toBe(0);
  });

  it('preserves the current opening pose when the GLB replaces its fallback', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const door = new EntranceDoorModel(scene, () => new Promise((done) => { resolve = done; }));
    door.update([], 0);
    door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], 225);
    const fallback = scene.getObjectByName('EntranceLeafR0_Runtime')!;
    const offset = fallback.position.x;
    const fallbackLights: THREE.MeshStandardMaterial[] = [];
    scene.traverse((object) => {
      if (object.name === 'StatusGlow' && object instanceof THREE.Mesh) fallbackLights.push(object.material);
    });
    expect(fallbackLights).toHaveLength(2);
    const lightDisposes = fallbackLights.map((light) => vi.spyOn(light, 'dispose'));
    for (const light of fallbackLights) expect(light.emissiveIntensity).toBeCloseTo(0.775);
    expect(offset).toBeCloseTo(2.055 / 2);
    const model = await asset();
    resolve(model);
    await door.ready;
    expect(model.getObjectByName('EntranceLeafR0_Runtime')!.position.x).toBe(offset);
    const installedLight = (model.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    expect(installedLight.emissive.equals(fallbackLights[0]!.emissive)).toBe(true);
    expect(installedLight.emissiveIntensity).toBeCloseTo(0.775);
    for (const spy of lightDisposes) expect(spy).toHaveBeenCalledOnce();
    door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], 450);
    expect(model.getObjectByName('EntranceLeafR0_Runtime')!.position.x).toBeCloseTo(2.055);
    door.dispose();
  });

  it('uses frame time consistently and resets after a clock discontinuity', async () => {
    const offsets = [];
    for (const fps of [30, 60, 120]) {
      const model = await asset();
      const door = new EntranceDoorModel(new THREE.Scene(), async () => model);
      await door.ready;
      door.update([], 0);
      for (let frame = 1; frame <= fps / 5; frame++) door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], frame * 1000 / fps);
      const leaf = model.getObjectByName('EntranceLeafR0_Runtime')!;
      offsets.push(leaf.position.x);
      door.update([], 0);
      expect(leaf.position.x).toBe(0);
      door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], 5000);
      expect(leaf.position.x).toBeCloseTo(2.055);
      door.update([{ x: 800, y: WALK_BOUNDS.bottom - 48 }], 10000);
      expect(leaf.position.x).toBe(0);
      door.dispose();
    }
    for (const offset of offsets) expect(offset).toBeCloseTo(offsets[0]!, 8);
  });

  it('installs the real open doorway at the front edge with a clear view of all spawns', async () => {
    const scene = new THREE.Scene();
    const model = await asset();
    const door = new EntranceDoorModel(scene, async () => model);
    const fallbackSpies = spies(scene.children[0]!);
    expect(await door.ready).toBe(true);
    expect(scene.children).toEqual([model]);
    for (const spy of fallbackSpies) expect(spy).toHaveBeenCalledOnce();
    expect(model.position.toArray()).toEqual([ENTRANCE_3D_POSITION.x, 0, ENTRANCE_3D_POSITION.z]);
    expect(model.getObjectByName('EntranceHeader_Runtime')!.visible).toBe(false);
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.min.z).toBeCloseTo(worldPosition({ x: 480, y: WALK_BOUNDS.bottom }).z);
    const anchor = model.getObjectByName('EntranceAnchor')!.getWorldPosition(new THREE.Vector3());
    expect(anchor.x).toBeCloseTo(0);
    expect(anchor.y).toBeCloseTo(0.1);
    const visibleMeshes: THREE.Mesh[] = [];
    model.traverseVisible((object) => { if (object instanceof THREE.Mesh) visibleMeshes.push(object); });
    for (const spawn of SPAWN_POINTS) {
      expect(isWalkable(spawn)).toBe(true);
      const point = worldPosition(spawn);
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x, 1, point.z), new THREE.Vector3(0, 0, 1));
      expect(ray.intersectObjects(visibleMeshes, false)).toHaveLength(0);
    }
    const disposes = spies(model);
    door.dispose();
    door.dispose();
    expect(scene.children).toHaveLength(0);
    for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
  });

  it('keeps and disposes an open fallback after a failed load', async () => {
    const scene = new THREE.Scene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const door = new EntranceDoorModel(scene, async () => { throw new Error('404'); });
      const fallback = scene.children[0]!;
      const disposes = spies(fallback);
      expect(await door.ready).toBe(false);
      expect(scene.children).toEqual([fallback]);
      expect(fallback.name).toBe('EntranceDoorFallback');
      expect(fallback.children).toHaveLength(9);
      expect(warn).toHaveBeenCalledOnce();
      door.update([], 0);
      const light = (fallback.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
        THREE.MeshStandardMaterial>).material;
      expect(light.color.getHex()).toBe(0xffad55);
      door.update([{ x: 480, y: WALK_BOUNDS.bottom - 48 }], 450);
      expect(light.color.getHex()).toBe(0x54efac);
      door.dispose();
      expect(scene.children).toHaveLength(0);
      for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('disposes a late load after teardown without reattaching it', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const door = new EntranceDoorModel(scene, () => new Promise((done) => { resolve = done; }));
    const fallbackSpies = spies(scene.children[0]!);
    door.dispose();
    const model = await asset();
    const disposes = spies(model);
    resolve(model);
    expect(await door.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    for (const spy of [...fallbackSpies, ...disposes]) expect(spy).toHaveBeenCalledOnce();
  });
});

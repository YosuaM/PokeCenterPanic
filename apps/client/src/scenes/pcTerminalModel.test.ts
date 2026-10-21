import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RECEPTION_SLOT_POSITIONS } from '@pokecenter/shared';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PcTerminalModel, PC_TERMINAL_SURFACE_HEIGHT } from './pcTerminalModel.js';
import { CAMERA_HALF_HEIGHT, CAMERA_HALF_WIDTH, CENTER_3D_FOOTPRINTS, cameraPosition, worldPosition } from './center3dLayout.js';

async function asset() {
  const bytes = await readFile('apps/client/public/assets/original/models/pc-terminal.glb');
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

describe('PC terminal model', () => {
  it('processes staggered rows inside the screen while the reader pulses and the power light stays steady', async () => {
    const model = await asset();
    const names = ['DataLine1', 'DataLine2', 'DataLine3', 'ProgressGlow'];
    const rows = names.map((name) => model.getObjectByName(name) as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>);
    const fullBounds = rows.map((row) => new THREE.Box3().setFromObject(row));
    const power = (model.getObjectByName('StatusGlow') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    const reader = (model.getObjectByName('ReaderGlow') as THREE.Mesh<THREE.BufferGeometry,
      THREE.MeshStandardMaterial>).material;
    const powerIntensity = power.emissiveIntensity;
    const readerIntensity = reader.emissiveIntensity;
    const casing = model.getObjectByName('CoralEnamel')!;
    const casingMatrix = casing.matrix.clone();
    const terminal = new PcTerminalModel(new THREE.Scene(), async () => model);
    await terminal.ready;
    const start = rows.map((row) => row.scale.x);
    expect(new Set(start.slice(0, 3)).size).toBe(3);
    expect(start[0]).toBeCloseTo(0.3);
    terminal.update(1200);
    expect(rows[0]!.scale.x).toBeCloseTo(1);
    for (let time = 0; time <= 12000; time += 50) {
      terminal.update(time);
      model.updateMatrixWorld(true);
      for (const [index, row] of rows.entries()) {
        const bounds = new THREE.Box3().setFromObject(row);
        expect(bounds.min.x).toBeCloseTo(fullBounds[index]!.min.x + model.position.x);
        expect(bounds.max.x).toBeLessThanOrEqual(fullBounds[index]!.max.x + model.position.x + 1e-6);
        expect(row.scale.x).toBeGreaterThanOrEqual(0.12);
        expect(row.material.emissiveIntensity).toBeGreaterThan(0);
      }
      expect(power.emissiveIntensity).toBe(powerIntensity);
      expect(reader.emissiveIntensity).toBeGreaterThanOrEqual(readerIntensity * 0.35);
      expect(reader.emissiveIntensity).toBeLessThanOrEqual(readerIntensity * 1.2);
    }
    expect(casing.matrix.equals(casingMatrix)).toBe(true);
    for (const [index, row] of rows.entries()) expect(row.scale.x).toBeCloseTo(start[index]!);
    for (const fps of [30, 60, 120]) {
      for (let frame = 0; frame <= fps * 2; frame++) terminal.update(frame * 1000 / fps);
      expect(rows[3]!.scale.x).toBeCloseTo(1);
    }
    terminal.update(0);
    expect(rows.map((row) => row.scale.x)).toEqual(start);
    terminal.dispose();
    terminal.update(1200);
    expect(rows.map((row) => row.scale.x)).toEqual(start);
  });

  it('preserves the processing phase and left-aligned rows when the fallback is replaced', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const terminal = new PcTerminalModel(scene, () => new Promise((done) => { resolve = done; }));
    terminal.update(600);
    const fallback = scene.children[0]!;
    fallback.updateMatrixWorld(true);
    const row = fallback.getObjectByName('DataLine1')!;
    expect(row.scale.x).toBeCloseTo(0.65);
    const before = new THREE.Box3().setFromObject(row);
    const model = await asset();
    resolve(model);
    expect(await terminal.ready).toBe(true);
    model.updateMatrixWorld(true);
    const loaded = model.getObjectByName('DataLine1')!;
    expect(loaded.scale.x).toBeCloseTo(row.scale.x);
    const after = new THREE.Box3().setFromObject(loaded);
    expect(after.min.x).toBeCloseTo(before.min.x);
    expect(after.max.x).toBeCloseTo(before.max.x);
    terminal.dispose();
  });

  it('places the PC on the counter with clearance from the first patient and inside the camera', async () => {
    const scene = new THREE.Scene();
    const model = await asset();
    const terminal = new PcTerminalModel(scene, async () => model);
    const fallbackSpies = disposalSpies(scene.children[0]!);
    expect(await terminal.ready).toBe(true);
    expect(scene.children).toEqual([model]);
    for (const spy of fallbackSpies) expect(spy).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(PC_TERMINAL_SURFACE_HEIGHT);
    const reception = CENTER_3D_FOOTPRINTS[0]!;
    expect(bounds.min.x).toBeGreaterThan(reception.x - reception.width / 2);
    expect(bounds.max.x).toBeLessThan(worldPosition(RECEPTION_SLOT_POSITIONS[0]!).x - 40 / 48);
    expect(bounds.min.z).toBeGreaterThan(reception.z - reception.depth / 2);
    expect(bounds.max.z).toBeLessThan(reception.z + reception.depth / 2);
    const counterBytes = await readFile('apps/client/public/assets/original/models/reception-counter.glb');
    const counter = (await new GLTFLoader().parseAsync(new Uint8Array(counterBytes).buffer, '')).scene;
    counter.position.set(reception.x, 0, reception.z);
    counter.updateMatrixWorld(true);
    for (const x of [bounds.min.x + 0.04, bounds.max.x - 0.04]) {
      for (const z of [bounds.min.z + 0.04, bounds.max.z - 0.04]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(counter)[0]!.point.y).toBeCloseTo(bounds.min.y);
      }
    }
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
    terminal.dispose();
    terminal.dispose();
    expect(scene.children).toHaveLength(0);
    for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
  });

  it('retains a luminous fallback on load failure and cleans it up', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const scene = new THREE.Scene();
      const terminal = new PcTerminalModel(scene, async () => { throw new Error('404'); });
      const fallback = scene.children[0]!;
      const disposes = disposalSpies(fallback);
      expect(await terminal.ready).toBe(false);
      expect(scene.children).toEqual([fallback]);
      expect(fallback.name).toBe('PcTerminalFallback');
      expect(fallback.children.filter((object) => object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial && object.material.emissiveIntensity > 0)).toHaveLength(7);
      expect(warn).toHaveBeenCalledOnce();
      terminal.update(1200);
      expect(fallback.getObjectByName('DataLine1')!.scale.x).toBeCloseTo(1);
      terminal.update(2400);
      expect(fallback.getObjectByName('DataLine1')!.scale.x).toBeCloseTo(0.3);
      terminal.dispose();
      expect(scene.children).toHaveLength(0);
      for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('disposes a late load after the view is destroyed', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const terminal = new PcTerminalModel(scene, () => new Promise((done) => { resolve = done; }));
    const fallbackSpies = disposalSpies(scene.children[0]!);
    terminal.dispose();
    const model = await asset();
    const disposes = disposalSpies(model);
    resolve(model);
    expect(await terminal.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    for (const spy of [...fallbackSpies, ...disposes]) expect(spy).toHaveBeenCalledOnce();
  });
});

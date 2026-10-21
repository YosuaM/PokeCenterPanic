import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MEDICINE_DISPOSAL_POINT } from '@pokecenter/shared';
import { MedicineBottleModels } from './medicineBottleModels.js';
import { Center3DView } from './center3dView.js';
import { MedicineDisposalModel } from './medicineDisposalModel.js';
import { CENTER_3D_FOOTPRINTS, worldPosition } from './center3dLayout.js';
import { fitsStationFootprint } from './center3dEnvironment.js';

async function asset(id: string) {
  const bytes = await readFile(`apps/client/public/assets/original/models/${id}.glb`);
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

function disposalSpies(model: THREE.Object3D) {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    spies.push(vi.spyOn(object.geometry, 'dispose'));
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      spies.push(vi.spyOn(material, 'dispose'));
    }
  });
  return spies;
}

describe('medicine disposal model', () => {
  it('drops both real bottles, flashes the light, and releases only effect instances', async () => {
    const scene = new THREE.Scene();
    const bottles = new MedicineBottleModels((kind) => asset(kind === 'burnHeal' ? 'burn-heal-bottle' : 'antidote-bottle'));
    const model = await asset('medicine-disposal-bin');
    const bin = new MedicineDisposalModel(scene, async () => model);
    await Promise.all([bin.ready, bottles.ready]);
    const held = bottles.create('burnHeal');
    const geometry = (held.getObjectByName('CoralEnamel') as THREE.Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const light = (model.getObjectByName('StatusGlow') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const view = Object.create(Center3DView.prototype) as Center3DView;
    const medicines = new Map([['dose', held]]);
    scene.add(held);
    Object.assign(view, { scene, medicines, medicineBottles: bottles, medicineDisposal: bin,
      discardedMedicines: new Set<string>() });
    view.showMedicineDiscard({ roundId: 'round', doseId: 'dose', kind: 'burnHeal' });
    view.syncMedicines([{ id: 'dose', kind: 'burnHeal', location: 'carrier', carrierId: 'staff', slotIndex: -1 }],
      new Map([['staff', { x: 480, y: 350 }]]), 0);
    expect(medicines.size).toBe(0);
    expect(held.parent).toBeNull();
    bin.play('antidote', bottles);
    bin.update(1000);
    const effects = scene.children.filter((object) => object.name === 'DiscardedMedicine');
    expect(effects).toHaveLength(2);
    expect(effects[0]!.getObjectByName('BurnHealBottle')).toBeDefined();
    expect(effects[1]!.getObjectByName('AntidoteBottle')).toBeDefined();
    const startY = effects[0]!.position.y;
    expect(light.emissiveIntensity).toBe(0.65);
    bin.update(1350);
    expect(light.emissiveIntensity).toBeGreaterThan(3);
    expect(effects[0]!.position.y).toBeLessThan(startY);
    expect(effects[0]!.rotation.z).toBeGreaterThan(0);
    expect(effects[0]!.position.x).toBeCloseTo(model.position.x);
    bin.update(1650);
    expect(effects[0]!.scale.x).toBeLessThan(0.2);
    bin.update(1700);
    expect(light.emissiveIntensity).toBe(0.65);
    expect(scene.children).toEqual([model]);
    expect(dispose).not.toHaveBeenCalled();
    view.syncMedicines([], new Map(), 1800);
    view.clearMedicineDiscards();
    bin.dispose();
    bottles.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('preserves an active flash across loading, bounds bursts and clears on clock resets and teardown', async () => {
    const scene = new THREE.Scene();
    const bottles = new MedicineBottleModels(async () => new THREE.Group());
    let resolve!: (model: THREE.Object3D) => void;
    const bin = new MedicineDisposalModel(scene, () => new Promise((done) => { resolve = done; }));
    for (let i = 0; i < 10; i++) bin.play('burnHeal', bottles);
    expect(scene.children.filter((object) => object.name === 'DiscardedMedicine')).toHaveLength(8);
    bin.update(1000);
    bin.update(1350);
    const model = await asset('medicine-disposal-bin');
    resolve(model);
    expect(await bin.ready).toBe(true);
    const light = (model.getObjectByName('StatusGlow') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(light.emissiveIntensity).toBeGreaterThan(3);
    bin.update(0);
    expect(scene.children).toEqual([model]);
    expect(light.emissiveIntensity).toBe(0.65);
    bin.play('antidote', bottles);
    bin.update(100);
    bin.dispose();
    bin.dispose();
    bin.play('burnHeal', bottles);
    bin.update(200);
    expect(scene.children).toHaveLength(0);
    bottles.dispose();
  });

  it('replaces its fallback on the central table inset and keeps the aisle clear', async () => {
    const scene = new THREE.Scene();
    const model = await asset('medicine-disposal-bin');
    const table = await asset('medicine-table');
    const station = CENTER_3D_FOOTPRINTS[3]!;
    table.position.set(station.x, 0, station.z);
    const load = vi.fn(async () => model);
    const bin = new MedicineDisposalModel(scene, load);
    const fallback = scene.getObjectByName('MedicineDisposalFallback')!;
    const fallbackSpies = disposalSpies(fallback);
    expect(await bin.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(scene.children).toEqual([model]);
    for (const spy of fallbackSpies) expect(spy).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    expect(fitsStationFootprint(station, center.x, center.z, size.x, size.z)).toBe(true);
    expect(size.x).toBeLessThanOrEqual(0.7);
    expect(bounds.max.y).toBeLessThan(1.6);
    expect(bounds.min.y).toBeCloseTo(0.705);
    const front = model.getObjectByName('MedicineDisposalAnchor')!.getWorldPosition(new THREE.Vector3());
    const target = worldPosition(MEDICINE_DISPOSAL_POINT);
    expect(front.x).toBeCloseTo(target.x);
    expect(front.z).toBeLessThan(target.z);
    expect(target.z - front.z).toBeLessThan(1);
    table.updateMatrixWorld(true);
    // The front part of the base rests on the existing central inset.
    const ray = new THREE.Raycaster(new THREE.Vector3(center.x, 0.71, center.z + 0.4), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(table, true)[0]!.point.y).toBeCloseTo(bounds.min.y, 2);
    const spies = disposalSpies(model);
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(object.castShadow && object.receiveShadow).toBe(true);
    });
    bin.dispose();
    bin.dispose();
    expect(scene.children).toHaveLength(0);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('retains and releases a visible fallback when loading fails', async () => {
    const scene = new THREE.Scene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const bin = new MedicineDisposalModel(scene, async () => { throw new Error('404'); });
      const fallback = scene.children[0]!;
      const spies = disposalSpies(fallback);
      expect(await bin.ready).toBe(false);
      expect(scene.children).toEqual([fallback]);
      expect(new THREE.Box3().setFromObject(fallback).min.y).toBeCloseTo(0.705);
      expect(warn).toHaveBeenCalledOnce();
      bin.dispose();
      bin.dispose();
      expect(scene.children).toHaveLength(0);
      for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('releases pending and late assets without reattaching after teardown', async () => {
    const scene = new THREE.Scene();
    let resolve!: (model: THREE.Object3D) => void;
    const bin = new MedicineDisposalModel(scene, () => new Promise((done) => { resolve = done; }));
    const fallbackSpies = disposalSpies(scene.children[0]!);
    bin.dispose();
    const model = await asset('medicine-disposal-bin');
    const spies = disposalSpies(model);
    resolve(model);
    expect(await bin.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    for (const spy of [...fallbackSpies, ...spies]) expect(spy).toHaveBeenCalledOnce();
  });
});

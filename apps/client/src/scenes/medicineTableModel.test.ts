import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MEDICINE_PREPARATION_POINTS, MEDICINE_DISPOSAL_POINT } from '@pokecenter/shared';
import { MedicineTableModel } from './medicineTableModel.js';
import { CENTER_3D_FOOTPRINTS, worldPosition } from './center3dLayout.js';
import { fitsStationFootprint } from './center3dEnvironment.js';

function fixture() {
  const scene = new THREE.Scene();
  const fallback = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  fallback.add(mesh);
  scene.add(fallback);
  return { scene, fallback, mesh };
}

describe('medicine table model', () => {
  it('replaces the fallback with the real GLB within collision and interaction bounds', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/medicine-table.glb');
    const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    const { scene, fallback, mesh } = fixture();
    const fallbackDispose = vi.spyOn(mesh.geometry, 'dispose');
    const load = vi.fn(async () => asset.scene);
    const model = new MedicineTableModel(scene, fallback, load);
    expect(scene.children).toEqual([fallback]);
    expect(await model.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(scene.children).toEqual([asset.scene]);
    expect(fallbackDispose).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(asset.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    expect(fitsStationFootprint(CENTER_3D_FOOTPRINTS[3]!, center.x, center.z, size.x, size.z)).toBe(true);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThan(1.2);
    const names = ['BurnHealAnchor', 'AntidoteAnchor', 'DisposalAnchor'];
    for (const [index, point] of [...MEDICINE_PREPARATION_POINTS, MEDICINE_DISPOSAL_POINT].entries()) {
      const position = asset.scene.getObjectByName(names[index]!)!.getWorldPosition(new THREE.Vector3());
      const interaction = worldPosition(point);
      expect(position.x).toBeCloseTo(interaction.x);
      expect(position.y).toBeCloseTo(0.66);
      expect(position.z).toBeLessThan(interaction.z);
      expect(interaction.z - position.z).toBeLessThan(0.4);
    }
    const disposes: ReturnType<typeof vi.spyOn>[] = [];
    asset.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.castShadow && object.receiveShadow).toBe(true);
      disposes.push(vi.spyOn(object.geometry, 'dispose'));
    });
    model.dispose();
    model.dispose();
    expect(scene.children).toHaveLength(0);
    for (const dispose of disposes) expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps the fallback when loading fails', async () => {
    const { scene, fallback } = fixture();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const model = new MedicineTableModel(scene, fallback, async () => { throw new Error('404'); });
      expect(await model.ready).toBe(false);
      expect(scene.children).toEqual([fallback]);
      expect(warn).toHaveBeenCalledOnce();
      model.dispose();
    } finally { warn.mockRestore(); }
  });

  it('releases a late model without reattaching it after teardown', async () => {
    const { scene, fallback } = fixture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    let resolve!: (object: THREE.Object3D) => void;
    const model = new MedicineTableModel(scene, fallback,
      () => new Promise((done) => { resolve = done; }));
    model.dispose();
    scene.clear();
    resolve(mesh);
    expect(await model.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

it('pulses each medicine independently and returns to idle when its owner clears', async () => {
  const bytes = await readFile('apps/client/public/assets/original/models/medicine-table.glb');
  const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const { scene, fallback } = fixture();
  const table = new MedicineTableModel(scene, fallback, async () => asset.scene);
  const owners = ['staff', ''];
  table.update(owners, 300);
  owners[0] = '';
  expect(await table.ready).toBe(true);
  const burnMesh = asset.scene.getObjectByName('BurnHealGlow') as THREE.Mesh;
  const antidoteMesh = asset.scene.getObjectByName('AntidoteGlow') as THREE.Mesh;
  const burn = burnMesh.material as THREE.MeshStandardMaterial;
  const antidote = antidoteMesh.material as THREE.MeshStandardMaterial;
  expect(burn).not.toBe(antidote);
  expect(new THREE.Box3().setFromObject(burnMesh).max.x).toBeLessThan(0);
  expect(new THREE.Box3().setFromObject(antidoteMesh).min.x).toBeGreaterThan(0);
  expect(burn.color.getHex()).toBe(0xf18b65);
  expect(antidote.color.getHex()).toBe(0xb97bf0);
  const peak = burn.emissiveIntensity;
  const idle = antidote.emissiveIntensity;
  expect(peak).toBeGreaterThan(idle);
  table.update(['staff', ''], 900);
  expect(burn.emissiveIntensity).toBeLessThan(peak);
  expect(antidote.emissiveIntensity).toBe(idle);
  table.update(['', 'staff'], 450);
  expect(burn.emissiveIntensity).toBe(idle);
  const antidotePeak = antidote.emissiveIntensity;
  table.update(['', 'staff'], 1350);
  expect(antidote.emissiveIntensity).toBeLessThan(antidotePeak);
  table.update(['staff', 'other'], 300);
  expect(burn.emissiveIntensity).toBeGreaterThan(idle);
  expect(antidote.emissiveIntensity).toBeGreaterThan(idle);
  expect(burn.emissiveIntensity).not.toBeCloseTo(antidote.emissiveIntensity);
  table.update([], 5000);
  expect(burn.emissiveIntensity).toBe(idle);
  expect(antidote.emissiveIntensity).toBe(idle);
  const burnDispose = vi.spyOn(burn, 'dispose');
  const antidoteDispose = vi.spyOn(antidote, 'dispose');
  table.dispose();
  table.dispose();
  table.update(['staff', 'other'], 300);
  expect(burn.emissiveIntensity).toBe(idle);
  expect(burnDispose).toHaveBeenCalledOnce();
  expect(antidoteDispose).toHaveBeenCalledOnce();
});

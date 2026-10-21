import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RECEPTION_SLOT_POSITIONS, DISCHARGE_POSITION, TREATMENT, type PatientRecord } from '@pokecenter/shared';
import { ReceptionCounterModel } from './receptionCounterModel.js';
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

describe('reception counter model', () => {
  it('replaces the fallback with the real GLB within collision and interaction bounds', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/reception-counter.glb');
    const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    const { scene, fallback, mesh } = fixture();
    const fallbackDispose = vi.spyOn(mesh.geometry, 'dispose');
    const load = vi.fn(async () => asset.scene);
    const model = new ReceptionCounterModel(scene, fallback, load);
    expect(scene.children).toEqual([fallback]);
    expect(await model.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(scene.children).toEqual([asset.scene]);
    expect(fallbackDispose).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(asset.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    expect(fitsStationFootprint(CENTER_3D_FOOTPRINTS[0]!, center.x, center.z, size.x, size.z)).toBe(true);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(1.5);
    const names = ['ReceptionAnchor1', 'ReceptionAnchor2', 'ReceptionAnchor3', 'ReceptionAnchor4', 'DischargeAnchor'];
    for (const [index, point] of [...RECEPTION_SLOT_POSITIONS, DISCHARGE_POSITION].entries()) {
      const position = asset.scene.getObjectByName(names[index]!)!.getWorldPosition(new THREE.Vector3());
      const interaction = worldPosition(point);
      expect(position.x).toBeCloseTo(interaction.x);
      expect(position.y).toBeCloseTo(0.93);
      expect(position.z).toBeCloseTo(interaction.z);
      const pad = asset.scene.getObjectByName(index === 4 ? 'DischargeGreen' : 'MintCushion')!;
      const ray = new THREE.Raycaster(new THREE.Vector3(position.x, 2, position.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(pad)[0];
      expect(hit).toBeDefined();
      expect(hit!.point.y).toBeCloseTo(position.y);
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
      const model = new ReceptionCounterModel(scene, fallback, async () => { throw new Error('404'); });
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
    const model = new ReceptionCounterModel(scene, fallback,
      () => new Promise((done) => { resolve = done; }));
    model.dispose();
    scene.clear();
    resolve(mesh);
    expect(await model.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

it('animates isolated reception lights and follows complete treatment and lifecycle state', async () => {
  const bytes = await readFile('apps/client/public/assets/original/models/reception-counter.glb');
  const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const { scene, fallback } = fixture();
  const counter = new ReceptionCounterModel(scene, fallback, async () => asset.scene);
  const patient = (slotIndex: number, completedTreatments = 0): PatientRecord => ({
    id: `patient-${slotIndex}`, species: 'Pikachu', lifecycle: 'active', location: 'reception',
    slotIndex, carrierId: '', requiredTreatments: TREATMENT.healing | TREATMENT.antidote,
    completedTreatments, initialPatienceMs: 90_000, remainingPatienceMs: 45_000,
  });
  const occupied = patient(0, TREATMENT.healing);
  const ready = patient(2, TREATMENT.healing | TREATMENT.antidote);
  counter.update([occupied, ready], 350);
  // Simulate mutable network records changing while the GLB is still loading.
  occupied.slotIndex = 1;
  expect(await counter.ready).toBe(true);
  const lights = ['ReceptionGlow1', 'ReceptionGlow2', 'ReceptionGlow3', 'ReceptionGlow4', 'DischargeGlow']
    .map((name) => (asset.scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial);
  expect(new Set(lights).size).toBe(5);
  const colors = () => lights.map((light) => light.color.getHex());
  expect(colors()).toEqual([0xf3bc64, 0x79b7ab, 0x68ee91, 0x79b7ab, 0x68ee91]);
  const readyPeak = lights[2]!.emissiveIntensity;
  expect(lights[4]!.emissiveIntensity).toBe(readyPeak);
  counter.update([patient(0, TREATMENT.healing), ready], 1050);
  expect(lights[2]!.emissiveIntensity).toBeLessThan(readyPeak);
  counter.update([patient(0)], 600);
  const occupiedPeak = lights[0]!.emissiveIntensity;
  counter.update([patient(0)], 1800);
  expect(lights[0]!.emissiveIntensity).toBeLessThan(occupiedPeak);
  expect(lights[4]!.color.getHex()).toBe(0x79b7ab);
  counter.update([0, 1, 2, 3].map((slot) => patient(slot)), 0);
  expect(colors()).toEqual([0xf3bc64, 0xf3bc64, 0xf3bc64, 0xf3bc64, 0x79b7ab]);
  for (const location of ['waiting', 'carrier', 'healingMachine', 'recovery'] as const) {
    counter.update([{ ...ready, location }], 350);
    expect(colors()).toEqual([0x79b7ab, 0x79b7ab, 0x79b7ab, 0x79b7ab, 0x68ee91]);
  }
  for (const lifecycle of ['discharged', 'lost', 'unfinished'] as const) {
    counter.update([{ ...ready, lifecycle }], 350);
    expect(colors()).toEqual(Array(5).fill(0x79b7ab));
  }
  counter.update([{ ...ready, location: 'none' }, patient(-1), patient(4)], 350);
  expect(colors()).toEqual(Array(5).fill(0x79b7ab));
  counter.update([ready], 350);
  counter.update([], 5000);
  expect(colors()).toEqual(Array(5).fill(0x79b7ab));
  expect(lights.every((light) => light.emissiveIntensity === 0.12)).toBe(true);
  const disposes = lights.map((light) => vi.spyOn(light, 'dispose'));
  counter.dispose();
  counter.dispose();
  counter.update([ready], 350);
  expect(colors()).toEqual(Array(5).fill(0x79b7ab));
  for (const dispose of disposes) expect(dispose).toHaveBeenCalledOnce();
});

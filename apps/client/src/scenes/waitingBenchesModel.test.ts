import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WAITING_SLOT_POSITIONS, WAITING_BENCH_OBSTACLE_INDICES, WAITING_SEATS_PER_BENCH, TREATMENT, type PatientRecord } from '@pokecenter/shared';
import { WaitingBenchesModel } from './waitingBenchesModel.js';
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

describe('waiting benches model', () => {
  it('replaces the fallback with the real GLB within collision and interaction bounds', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/waiting-benches.glb');
    const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    const { scene, fallback, mesh } = fixture();
    const fallbackDispose = vi.spyOn(mesh.geometry, 'dispose');
    const load = vi.fn(async () => asset.scene);
    const model = new WaitingBenchesModel(scene, fallback, load);
    expect(scene.children).toEqual([fallback]);
    expect(await model.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(1);
    const benches = scene.children[0]!.children;
    expect(benches).toHaveLength(2);
    expect(fallbackDispose).toHaveBeenCalledOnce();
    for (const [benchIndex, bench] of benches.entries()) {
      const bounds = new THREE.Box3().setFromObject(bench);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      expect(fitsStationFootprint(CENTER_3D_FOOTPRINTS[WAITING_BENCH_OBSTACLE_INDICES[benchIndex]!]!,
        center.x, center.z, size.x, size.z)).toBe(true);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeLessThanOrEqual(1.04);
      for (let seat = 0; seat < WAITING_SEATS_PER_BENCH; seat++) {
        const position = bench.getObjectByName(`WaitingAnchor${seat + 1}`)!.getWorldPosition(new THREE.Vector3());
        const expected = worldPosition(WAITING_SLOT_POSITIONS[benchIndex * WAITING_SEATS_PER_BENCH + seat]!);
        expect(position.x).toBeCloseTo(expected.x);
        expect(position.y).toBeCloseTo(0.5);
        expect(position.z).toBeCloseTo(expected.z);
        const ray = new THREE.Raycaster(new THREE.Vector3(position.x, 2, position.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(bench.getObjectByName('LavenderEnamel')!)[0];
        expect(hit?.point.y).toBeCloseTo(position.y);
      }
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
      const model = new WaitingBenchesModel(scene, fallback, async () => { throw new Error('404'); });
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
    const model = new WaitingBenchesModel(scene, fallback,
      () => new Promise((done) => { resolve = done; }));
    model.dispose();
    scene.clear();
    resolve(mesh);
    expect(await model.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });
});


it('animates each waiting seat from complete treatment and current occupancy', async () => {
  const bytes = await readFile('apps/client/public/assets/original/models/waiting-benches.glb');
  const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const { scene, fallback } = fixture();
  const benches = new WaitingBenchesModel(scene, fallback, async () => asset.scene);
  const patient = (slotIndex: number, completedTreatments = 0): PatientRecord => ({
    id: `patient-${slotIndex}`, species: 'Pikachu', lifecycle: 'active', location: 'waiting',
    slotIndex, carrierId: '', requiredTreatments: TREATMENT.healing | TREATMENT.antidote,
    completedTreatments, initialPatienceMs: 90_000, remainingPatienceMs: 45_000,
  });
  const occupied = patient(0, TREATMENT.healing);
  const ready = patient(2, TREATMENT.healing | TREATMENT.antidote);
  benches.update([occupied, ready], 350);
  // Network records may mutate while the GLB is still loading.
  occupied.slotIndex = 1;
  expect(await benches.ready).toBe(true);
  const lights = scene.children[0]!.children.flatMap((bench) => [1, 2, 3, 4].map((slot) =>
    (bench.getObjectByName(`WaitingGlow${slot}`) as THREE.Mesh).material as THREE.MeshStandardMaterial));
  expect(new Set(lights).size).toBe(8);
  const colors = () => lights.map((light) => light.color.getHex());
  expect(colors()).toEqual([0xf3bc64, 0x79b7ab, 0x68ee91, 0x79b7ab, ...Array(4).fill(0x79b7ab)]);
  const readyPeak = lights[2]!.emissiveIntensity;
  benches.update([patient(0, TREATMENT.healing), ready], 1050);
  expect(lights[2]!.emissiveIntensity).toBeLessThan(readyPeak);
  benches.update([patient(0)], 600);
  const occupiedPeak = lights[0]!.emissiveIntensity;
  benches.update([patient(0)], 1800);
  expect(lights[0]!.emissiveIntensity).toBeLessThan(occupiedPeak);
  benches.update(WAITING_SLOT_POSITIONS.map((_, slot) => patient(slot)), 0);
  expect(colors()).toEqual(Array(8).fill(0xf3bc64));
  for (const location of ['reception', 'carrier', 'healingMachine', 'recovery', 'none'] as const) {
    benches.update([{ ...ready, location }], 350);
    expect(colors()).toEqual(Array(8).fill(0x79b7ab));
  }
  for (const lifecycle of ['discharged', 'lost', 'unfinished'] as const) {
    benches.update([{ ...ready, lifecycle }], 350);
    expect(colors()).toEqual(Array(8).fill(0x79b7ab));
  }
  benches.update([-1, 8, 0.5, NaN].map((slot) => patient(slot)), 350);
  expect(colors()).toEqual(Array(8).fill(0x79b7ab));
  benches.update([ready], 350);
  benches.update([], 5000);
  expect(colors()).toEqual(Array(8).fill(0x79b7ab));
  expect(lights.every((light) => light.emissiveIntensity === 0.12)).toBe(true);
  benches.update([patient(4), patient(7, TREATMENT.healing | TREATMENT.antidote)], 350);
  expect(colors()).toEqual([...Array(4).fill(0x79b7ab), 0xf3bc64, 0x79b7ab, 0x79b7ab, 0x68ee91]);
  benches.update([], 0);
  const disposes = lights.map((light) => vi.spyOn(light, 'dispose'));
  benches.dispose();
  benches.dispose();
  benches.update([ready], 350);
  expect(colors()).toEqual(Array(8).fill(0x79b7ab));
  for (const dispose of disposes) expect(dispose).toHaveBeenCalledOnce();
});

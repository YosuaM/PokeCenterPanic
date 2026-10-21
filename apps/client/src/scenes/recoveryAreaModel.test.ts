import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RECOVERY_POSITION, TREATMENT, type PatientRecord } from '@pokecenter/shared';
import { RecoveryAreaModel } from './recoveryAreaModel.js';
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

describe('recovery area model', () => {
  it('replaces the fallback with the real GLB within collision and interaction bounds', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/recovery-area.glb');
    const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    const { scene, fallback, mesh } = fixture();
    const fallbackDispose = vi.spyOn(mesh.geometry, 'dispose');
    const load = vi.fn(async () => asset.scene);
    const model = new RecoveryAreaModel(scene, fallback, load);
    expect(scene.children).toEqual([fallback]);
    expect(await model.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(scene.children).toEqual([asset.scene]);
    expect(fallbackDispose).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(asset.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    expect(fitsStationFootprint(CENTER_3D_FOOTPRINTS[5]!, center.x, center.z, size.x, size.z)).toBe(true);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(1.2);
    const position = asset.scene.getObjectByName('RecoveryAnchor')!.getWorldPosition(new THREE.Vector3());
    const interaction = worldPosition(RECOVERY_POSITION);
    expect(position.x).toBeCloseTo(interaction.x);
    expect(position.y).toBeCloseTo(0.57);
    expect(position.z).toBeCloseTo(interaction.z);
    const pad = asset.scene.getObjectByName('MintCushion')!;
    const ray = new THREE.Raycaster(new THREE.Vector3(position.x, 2, position.z), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(pad)[0]!.point.y).toBeCloseTo(position.y);
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
      const model = new RecoveryAreaModel(scene, fallback, async () => { throw new Error('404'); });
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
    const model = new RecoveryAreaModel(scene, fallback,
      () => new Promise((done) => { resolve = done; }));
    model.dispose();
    scene.clear();
    resolve(mesh);
    expect(await model.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });
});



it('animates the queue and monitor using only the first patient for discharge readiness', async () => {
  const bytes = await readFile('apps/client/public/assets/original/models/recovery-area.glb');
  const asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const { scene, fallback } = fixture();
  const area = new RecoveryAreaModel(scene, fallback, async () => asset.scene);
  const patient = (slotIndex: number, completedTreatments: number = TREATMENT.healing): PatientRecord => ({
    id: `patient-${slotIndex}`, species: 'Eevee', lifecycle: 'active', location: 'recovery',
    slotIndex, carrierId: '', requiredTreatments: TREATMENT.healing | TREATMENT.antidote,
    completedTreatments, initialPatienceMs: 90_000, remainingPatienceMs: 45_000,
  });
  const complete = TREATMENT.healing | TREATMENT.antidote;
  const front = patient(0);
  const readyBehind = patient(1, complete);
  area.update([readyBehind, front], 600);
  // Capture derived state before asynchronously loaded geometry arrives.
  front.completedTreatments = complete;
  expect(await area.ready).toBe(true);
  const meshes = ['StatusGlow', 'ScreenTrace', 'ReadyMark']
    .map((name) => asset.scene.getObjectByName(name) as THREE.Mesh);
  const lights = meshes.map((mesh) => mesh.material as THREE.MeshStandardMaterial);
  const trace = meshes[1]!;
  const readyMark = meshes[2]!;
  const colors = () => lights.map((light) => light.color.getHex());
  expect(new Set(lights).size).toBe(3);
  expect(colors()).toEqual(Array(3).fill(0xf3bc64));
  expect(trace.visible).toBe(true);
  expect(readyMark.visible).toBe(false);
  const waitingPeak = lights[0]!.emissiveIntensity;
  area.update([patient(0), readyBehind], 1800);
  expect(lights.every((light) => light.emissiveIntensity < waitingPeak)).toBe(true);

  area.update([patient(1), front], 350);
  expect(colors()).toEqual(Array(3).fill(0x68ee91));
  expect(trace.visible).toBe(false);
  expect(readyMark.visible).toBe(true);
  const readyPeak = lights[0]!.emissiveIntensity;
  area.update([front, patient(1)], 1050);
  expect(lights.every((light) => light.emissiveIntensity < readyPeak)).toBe(true);
  // Picking up the first patient exposes the next entry's own treatment state.
  area.update([patient(0)], 350);
  expect(colors()).toEqual(Array(3).fill(0xf3bc64));
  expect(trace.visible).toBe(true);
  expect(readyMark.visible).toBe(false);
  area.update([readyBehind], 350);
  expect(colors()).toEqual(Array(3).fill(0xf3bc64));

  for (const location of ['reception', 'waiting', 'carrier', 'healingMachine', 'none'] as const) {
    area.update([{ ...front, location }], 350);
    expect(colors()).toEqual(Array(3).fill(0x79b7ab));
  }
  for (const lifecycle of ['discharged', 'lost', 'unfinished'] as const) {
    area.update([{ ...front, lifecycle }], 350);
    expect(colors()).toEqual(Array(3).fill(0x79b7ab));
  }
  area.update([-1, 0.5, NaN].map((slot) => patient(slot, complete)), 350);
  expect(colors()).toEqual(Array(3).fill(0x79b7ab));
  area.update([front], 350);
  area.update([], 9999);
  expect(colors()).toEqual(Array(3).fill(0x79b7ab));
  expect(lights.every((light) => light.emissiveIntensity === 0.12)).toBe(true);
  expect(trace.visible).toBe(true);
  expect(readyMark.visible).toBe(false);
  const disposes = lights.map((light) => vi.spyOn(light, 'dispose'));
  area.dispose();
  area.dispose();
  area.update([front], 350);
  expect(colors()).toEqual(Array(3).fill(0x79b7ab));
  expect(readyMark.visible).toBe(false);
  for (const dispose of disposes) expect(dispose).toHaveBeenCalledOnce();
});

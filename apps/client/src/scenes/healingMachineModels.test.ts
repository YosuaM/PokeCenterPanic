import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HealingMachineModels } from './healingMachineModels.js';
import { CENTER_3D_FOOTPRINTS } from './center3dLayout.js';
import { fitsStationFootprint } from './center3dEnvironment.js';
import { Center3DView, characterElevation } from './center3dView.js';
import { visualFixture } from './visualFixtures.js';

function setup() {
  const scene = new THREE.Scene();
  const fallbacks = [new THREE.Group(), new THREE.Group()];
  for (const fallback of fallbacks) {
    fallback.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()));
    scene.add(fallback);
  }
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  model.add(mesh);
  return { scene, fallbacks, model, mesh };
}

describe('healing machine model integration', () => {
  it('loads one asset, replaces both stations and releases shared resources once', async () => {
    const { scene, fallbacks, model, mesh } = setup();
    const load = vi.fn(async () => model);
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(mesh.material, 'dispose');
    const fallbackDisposes = fallbacks.map((group) =>
      vi.spyOn((group.children[0] as THREE.Mesh).geometry, 'dispose'));
    const models = new HealingMachineModels(scene, fallbacks, load);
    expect(scene.children).toEqual(fallbacks);
    expect(await models.ready).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(2);
    for (const [index, instance] of scene.children.entries()) {
      const station = CENTER_3D_FOOTPRINTS[index + 1]!;
      expect(instance.position.toArray()).toEqual([station.x, 0, station.z]);
      const clone = instance.children[0] as THREE.Mesh;
      expect(clone.geometry).toBe(mesh.geometry);
      expect(clone.material).toBe(mesh.material);
      expect(clone.castShadow && clone.receiveShadow).toBe(true);
      expect(fallbackDisposes[index]).toHaveBeenCalledTimes(1);
    }
    models.dispose();
    models.dispose();
    expect(scene.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps procedural stations when the asset cannot load', async () => {
    const { scene, fallbacks } = setup();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const models = new HealingMachineModels(scene, fallbacks, async () => {
        throw new Error('404');
      });
      expect(await models.ready).toBe(false);
      expect(scene.children).toEqual(fallbacks);
      expect(warning).toHaveBeenCalledOnce();
      models.dispose();
    } finally {
      warning.mockRestore();
    }
  });

  it('does not attach an asset that finishes loading after scene destruction', async () => {
    const { scene, fallbacks, model, mesh } = setup();
    let resolve!: (value: THREE.Object3D) => void;
    const pending = new Promise<THREE.Object3D>((done) => { resolve = done; });
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const models = new HealingMachineModels(scene, fallbacks, () => pending);
    models.dispose();
    scene.clear();
    resolve(model);
    expect(await models.ready).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('places the actual GLB inside both collision rectangles at the patient elevation', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/healing-machine.glb');
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const { scene, fallbacks } = setup();
    const models = new HealingMachineModels(scene, fallbacks, async () => gltf.scene);
    expect(await models.ready).toBe(true);
    for (const [index, instance] of scene.children.entries()) {
      const bounds = new THREE.Box3().setFromObject(instance);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      expect(fitsStationFootprint(CENTER_3D_FOOTPRINTS[index + 1]!,
        center.x, center.z, size.x, size.z)).toBe(true);
      const anchor = instance.getObjectByName('PatientAnchor')!.getWorldPosition(new THREE.Vector3());
      expect(anchor.y).toBeCloseTo(characterElevation('healingMachine'));
      expect(anchor.x).toBeCloseTo(instance.position.x);
      expect(anchor.z).toBeCloseTo(instance.position.z);
    }
    models.dispose();
  });
});

describe('healing machine status lights', () => {
  it('forwards authoritative status and frame time before drawing the 3D view', () => {
    const view = Object.create(Center3DView.prototype) as Center3DView;
    const update = vi.fn();
    const medicineUpdate = vi.fn();
    const disposalUpdate = vi.fn();
    const signUpdate = vi.fn();
    const pcUpdate = vi.fn();
    const receptionUpdate = vi.fn();
    const waitingUpdate = vi.fn();
    const recoveryUpdate = vi.fn();
    const render = vi.fn();
    Object.assign(view, { healingMachines: { update }, medicineTable: { update: medicineUpdate },
      medicineDisposal: { update: disposalUpdate },
      centerSign: { update: signUpdate },
      pcTerminal: { update: pcUpdate },
      receptionCounter: { update: receptionUpdate }, waitingBenches: { update: waitingUpdate },
      recoveryArea: { update: recoveryUpdate }, renderer: { render },
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
    const patients = visualFixture('recovery-area')!.patients;
    view.render(1200, 'broken', ['staff', 'other'], patients);
    expect(update).toHaveBeenCalledWith('broken', 1200);
    expect(medicineUpdate).toHaveBeenCalledWith(['staff', 'other'], 1200);
    expect(disposalUpdate).toHaveBeenCalledWith(1200);
    expect(signUpdate).toHaveBeenCalledWith(1200);
    expect(pcUpdate).toHaveBeenCalledWith(1200);
    expect(pcUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(signUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(disposalUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(receptionUpdate).toHaveBeenCalledWith(patients, 1200);
    expect(waitingUpdate).toHaveBeenCalledWith(patients, 1200);
    expect(recoveryUpdate).toHaveBeenCalledWith(patients, 1200);
    expect(recoveryUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(waitingUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(receptionUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(medicineUpdate.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
  });

  it('animates the real GLB independently, including state received before loading', async () => {
    const bytes = await readFile('apps/client/public/assets/original/models/healing-machine.glb');
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const { scene, fallbacks } = setup();
    const models = new HealingMachineModels(scene, fallbacks, async () => gltf.scene);
    models.update('treating', 400);
    expect(await models.ready).toBe(true);
    const lights = scene.children.map((instance) => ['StatusGlow', 'ScreenTrace'].map((name) =>
      (instance.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial));
    const left = lights[0]!;
    const right = lights[1]!;
    const originals = ['StatusGlow', 'ScreenTrace'].map((name) =>
      (gltf.scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial);
    const originalColors = originals.map((material) => material.color.getHex());
    const idle = right.map((material) => [material.color.getHex(), material.emissiveIntensity]);
    for (const [index, material] of left.entries()) {
      expect(material).not.toBe(right[index]);
      expect(material).not.toBe(originals[index]);
      expect(material.color.getHex()).toBe(0x36bff5);
    }
    const peak = left[0]!.emissiveIntensity;
    models.update('treating', 1200);
    expect(left[0]!.emissiveIntensity).toBeLessThan(peak);
    models.update('completed', 1200);
    const completed = left[0]!.emissiveIntensity;
    expect(left.every((material) => material.color.getHex() === 0x62e985)).toBe(true);
    models.update('completed', 2400);
    expect(left[0]!.emissiveIntensity).toBe(completed);
    models.update('broken', 2400);
    const flash = left[0]!.emissiveIntensity;
    expect(left.every((material) => material.color.getHex() === 0xff5e42)).toBe(true);
    models.update('broken', 3000);
    expect(left[0]!.emissiveIntensity).toBeLessThan(flash);
    expect(right.map((material) => [material.color.getHex(), material.emissiveIntensity])).toEqual(idle);
    expect(originals.map((material) => material.color.getHex())).toEqual(originalColors);
    models.update('empty', 3000);
    expect(left.map((material) => [material.color.getHex(), material.emissiveIntensity])).toEqual(idle);
    const lightDisposes = lights.flat().map((material) => vi.spyOn(material, 'dispose'));
    models.dispose();
    models.dispose();
    models.update('broken', 4000);
    for (const dispose of lightDisposes) expect(dispose).toHaveBeenCalledOnce();
  });
});

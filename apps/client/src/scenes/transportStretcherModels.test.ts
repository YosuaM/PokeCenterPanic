import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransportStretcherMotion } from './transportStretcherMotion.js';
import { TransportStretcherModels, TRANSPORT_STRETCHER_ELEVATION } from './transportStretcherModels.js';
import { Center3DView, STRETCHER_LYING_OFFSET, characterElevation, type Center3DCharacter } from './center3dView.js';
import { worldPosition } from './center3dLayout.js';

async function asset() {
  const bytes = await readFile('apps/client/public/assets/original/models/transport-stretcher.glb');
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

describe('transport stretchers', () => {
  it('loads once for independent carriers and releases shared resources only at teardown', async () => {
    const template = await asset();
    const load = vi.fn(async () => template);
    const models = new TransportStretcherModels(load);
    const first = models.create();
    const removed = models.create();
    const fallbackMesh = first.children[0] as THREE.Mesh;
    const fallbackDispose = vi.spyOn(fallbackMesh.geometry, 'dispose');
    const removedDispose = vi.spyOn((removed.children[0] as THREE.Mesh).geometry, 'dispose');
    models.release(removed);
    first.position.set(2, TRANSPORT_STRETCHER_ELEVATION, 3);
    first.visible = true;
    expect(await models.ready).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(fallbackDispose).toHaveBeenCalledOnce();
    expect(removedDispose).toHaveBeenCalledOnce();
    expect(removed.children).toHaveLength(0);
    expect(first.position.toArray()).toEqual([2, TRANSPORT_STRETCHER_ELEVATION, 3]);
    expect(first.visible).toBe(true);
    const second = models.create();
    expect(second.visible).toBe(false);
    expect(first.children[0]).not.toBe(second.children[0]);
    const one = first.getObjectByName('MintCushion') as THREE.Mesh;
    const two = second.getObjectByName('MintCushion') as THREE.Mesh;
    expect(one.geometry).toBe(two.geometry);
    expect(one.material).toBe(two.material);
    expect(one.castShadow && one.receiveShadow).toBe(true);
    const geometryDispose = vi.spyOn(one.geometry, 'dispose');
    const materialDispose = vi.spyOn(one.material as THREE.Material, 'dispose');
    const scene = new THREE.Scene();
    scene.add(first, second);
    const position = first.getObjectByName('TransportAnchor')!.getWorldPosition(new THREE.Vector3());
    expect(position.y).toBeCloseTo(characterElevation('carrier'));
    models.release(first);
    models.release(first);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(second.getObjectByName('MintCushion')).toBe(two);
    models.dispose();
    models.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
    expect(models.create().children).toHaveLength(0);
  });

  it('keeps usable fallback stretchers on load failure and disposes them once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const models = new TransportStretcherModels(async () => { throw new Error('404'); });
      const group = models.create();
      const mesh = group.children[0] as THREE.Mesh;
      const dispose = vi.spyOn(mesh.geometry, 'dispose');
      expect(await models.ready).toBe(false);
      expect(group.children).toHaveLength(2);
      expect(new THREE.Box3().setFromObject(group).max.y + TRANSPORT_STRETCHER_ELEVATION)
        .toBeCloseTo(characterElevation('carrier'));
      models.dispose();
      models.release(group);
      expect(dispose).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('disposes a late model without restoring removed carriers', async () => {
    let resolve!: (model: THREE.Object3D) => void;
    const models = new TransportStretcherModels(() => new Promise((done) => { resolve = done; }));
    const group = models.create();
    models.dispose();
    const late = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const dispose = vi.spyOn(late.geometry, 'dispose');
    resolve(late);
    expect(await models.ready).toBe(false);
    expect(group.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('follows carried patient positions, hides on placement and releases removed characters', async () => {
    const models = new TransportStretcherModels(asset);
    await models.ready;
    const scene = new THREE.Scene();
    const group = models.create();
    scene.add(group);
    const visual = {
      sprite: new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()),
      shadow: new THREE.Mesh(new THREE.CircleGeometry(), new THREE.MeshBasicMaterial()),
      locator: new THREE.Mesh(new THREE.RingGeometry(), new THREE.MeshBasicMaterial()),
      texture: new THREE.Texture(), stretcher: group, footOffset: 0,
      transportMotion: new TransportStretcherMotion(),
    };
    const view = Object.create(Center3DView.prototype) as Center3DView;
    Object.assign(view, { entranceDoor: { update: vi.fn() }, scene, transportStretchers: models,
      characters: new Map([['patient', visual]]), drawCharacter: vi.fn() });
    const patient: Center3DCharacter = { id: 'patient', species: 'Pikachu',
      point: { x: 480, y: 375 }, elevation: characterElevation('carrier'),
      facing: 'down', moving: false, isPlayer: false, carried: true };
    for (const facing of ['down', 'left', 'up', 'right'] as const) {
      patient.facing = facing;
      patient.point.x += 12;
      patient.point.y -= 4;
      view.syncCharacters([patient], 0);
      expect((view as unknown as { entranceDoor: { update: ReturnType<typeof vi.fn> } })
        .entranceDoor.update).toHaveBeenLastCalledWith([], 0);
      const position = worldPosition(patient.point);
      expect(group.position.toArray()).toEqual([position.x, TRANSPORT_STRETCHER_ELEVATION, position.z]);
      expect(group.visible).toBe(true);
      expect(group.rotation.y).toBe(0);
    }
    view.syncCharacters([{ ...patient, isPlayer: true }], 0);
    expect((view as unknown as { entranceDoor: { update: ReturnType<typeof vi.fn> } })
      .entranceDoor.update).toHaveBeenLastCalledWith([patient.point], 0);
    visual.footOffset = 0.16;
    visual.sprite.rotation.y = 0.12;
    for (let frame = 1; frame <= 60; frame++) {
      patient.point.x += 1;
      view.syncCharacters([patient], frame * 1000 / 60);
      // The patient rests at a fixed spot of the mattress, offset from the anchor and swaying with it.
      group.updateMatrixWorld(true);
      const node = group.getObjectByName('TransportAnchor')!;
      const anchor = node.parent!.localToWorld(node.position.clone().add(STRETCHER_LYING_OFFSET));
      const feet = visual.sprite.position.clone().add(
        new THREE.Vector3(0, visual.footOffset, 0).applyQuaternion(visual.sprite.quaternion));
      expect(feet.distanceTo(anchor)).toBeLessThan(0.00001);
      expect(visual.sprite.rotation.z).toBe(group.rotation.z);
    }
    expect(Math.abs(group.rotation.z)).toBeGreaterThan(0.01);
    for (let frame = 61; frame <= 120; frame++) view.syncCharacters([patient], frame * 1000 / 60);
    expect(group.rotation.z).toBe(0);
    expect(group.position.y).toBe(TRANSPORT_STRETCHER_ELEVATION);
    patient.point.x += 1;
    view.syncCharacters([patient], 2020);
    expect(group.rotation.z).not.toBe(0);
    view.syncCharacters([{ ...patient, carried: false, elevation: characterElevation('waiting') }], 2040);
    expect((view as unknown as { entranceDoor: { update: ReturnType<typeof vi.fn> } })
      .entranceDoor.update).toHaveBeenLastCalledWith([patient.point], 2040);
    expect(visual.sprite.rotation.z).toBe(0);
    expect(visual.sprite.position.y).toBeCloseTo(characterElevation('waiting') - visual.footOffset);
    expect(group.rotation.z).toBe(0);
    expect(group.visible).toBe(false);
    view.syncCharacters([{ ...patient, carried: false, elevation: 0.5,
      patienceRatio: 0, faintProgress: 0.7 }], 2200);
    expect(visual.sprite.rotation.z).toBe(-Math.PI / 2);
    expect(visual.sprite.material.opacity).toBeCloseTo(0.5);
    expect(visual.sprite.material.color.getHex()).toBe(0xb3b7c4);
    expect((view as unknown as { entranceDoor: { update: ReturnType<typeof vi.fn> } })
      .entranceDoor.update).toHaveBeenLastCalledWith([], 2200);
    view.syncCharacters([patient], 0);
    expect(visual.sprite.material.opacity).toBe(1);
    expect(visual.sprite.material.color.getHex()).toBe(0xffffff);
    expect(group.visible).toBe(true);
    view.syncCharacters([], 0);
    expect(group.parent).toBeNull();
    expect(group.children).toHaveLength(0);
    models.dispose();
  });
});

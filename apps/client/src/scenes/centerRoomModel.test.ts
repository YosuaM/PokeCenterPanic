import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CenterRoomModel } from './centerRoomModel.js';

async function asset() {
  const bytes = await readFile('apps/client/public/assets/original/models/center-room.glb');
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

function fixture() {
  const scene = new THREE.Scene();
  const fallback = new THREE.Group();
  const texture = new THREE.Texture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshLambertMaterial({ map: texture }));
  fallback.add(floor);
  const furniture = new THREE.Group();
  scene.add(fallback, furniture);
  const disposes = [vi.spyOn(texture, 'dispose'), vi.spyOn(floor.geometry, 'dispose'),
    vi.spyOn(floor.material, 'dispose')];
  return { scene, fallback, furniture, disposes };
}

describe('center room model', () => {
  it('replaces only the room fallback and frees its floor texture', async () => {
    const { scene, fallback, furniture, disposes } = fixture();
    const model = await asset();
    const room = new CenterRoomModel(scene, fallback, async () => model);
    expect(scene.children).toEqual([fallback, furniture]);
    expect(await room.ready).toBe(true);
    expect(scene.children).toEqual([furniture, model]);
    for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);
    const installedDisposes: ReturnType<typeof vi.spyOn>[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.receiveShadow).toBe(true);
      expect(object.castShadow).toBe(!object.name.startsWith('Floor'));
      installedDisposes.push(vi.spyOn(object.geometry, 'dispose'));
    });
    room.dispose();
    room.dispose();
    expect(scene.children).toEqual([furniture]);
    for (const spy of installedDisposes) expect(spy).toHaveBeenCalledOnce();
  });

  it('keeps a complete fallback on failure and removes it on teardown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { scene, fallback, furniture, disposes } = fixture();
      const room = new CenterRoomModel(scene, fallback, async () => { throw new Error('404'); });
      expect(await room.ready).toBe(false);
      expect(scene.children).toEqual([fallback, furniture]);
      for (const spy of disposes) expect(spy).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
      room.dispose();
      expect(scene.children).toEqual([furniture]);
      for (const spy of disposes) expect(spy).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('cleans up a late asset without restoring the room after teardown', async () => {
    const { scene, fallback, furniture, disposes } = fixture();
    let resolve!: (model: THREE.Object3D) => void;
    const room = new CenterRoomModel(scene, fallback, () => new Promise((done) => { resolve = done; }));
    room.dispose();
    const model = await asset();
    const lateDisposes: ReturnType<typeof vi.spyOn>[] = [];
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) lateDisposes.push(vi.spyOn(object.geometry, 'dispose'));
    });
    resolve(model);
    expect(await room.ready).toBe(false);
    expect(scene.children).toEqual([furniture]);
    for (const spy of [...disposes, ...lateDisposes]) expect(spy).toHaveBeenCalledOnce();
  });
});

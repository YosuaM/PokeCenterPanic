import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WALK_BOUNDS, isWalkable } from '@pokecenter/shared';
import { ENTRANCE_3D_POSITION, ENTRANCE_3D_WIDTH, worldPosition } from '../apps/client/src/scenes/center3dLayout.js';

describe('center room GLB', () => {
  const bytes = readFileSync('apps/client/public/assets/original/models/center-room.glb');
  const manifest = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    buffers: { uri?: string }[]; scenes: { nodes: number[] }[];
    materials: unknown[]; images?: unknown[]; cameras?: unknown[];
  };
  let model: THREE.Object3D;
  beforeAll(async () => {
    model = (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
    model.updateMatrixWorld(true);
  });

  it('exports original geometry without studio objects or external resources', () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]!.nodes).toHaveLength(1);
    expect(manifest.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toHaveLength(0);
    expect(manifest.cameras ?? []).toHaveLength(0);
    expect(model.getObjectByName('CenterRoom')).toBeDefined();
    expect(model.getObjectByName('StudioGround')).toBeUndefined();
  });

  it('supports every sampled walkable position without raised floor or wall intersections', () => {
    let samples = 0;
    for (let x = WALK_BOUNDS.left; x <= WALK_BOUNDS.right; x += 16) {
      for (let y = WALK_BOUNDS.top; y <= WALK_BOUNDS.bottom; y += 16) {
        if (!isWalkable({ x, y })) continue;
        const point = worldPosition({ x, y });
        const ray = new THREE.Raycaster(new THREE.Vector3(point.x, 1.2, point.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(model)[0];
        expect(hit).toBeDefined();
        expect(hit!.point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(hit!.point.y).toBeLessThanOrEqual(0.013);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(200);
  });

  it('matches the existing entrance, sign mount and cutaway heights', () => {
    const grout = new THREE.Box3().setFromObject(model.getObjectByName('FloorGrout')!);
    const foundation = new THREE.Box3().setFromObject(model.getObjectByName('SlateRubber')!);
    expect(grout.max.y).toBeGreaterThan(foundation.max.y + 0.002);
    expect(grout.max.y).toBeLessThan(0.012);
    const anchor = model.getObjectByName('RoomEntranceAnchor')!.getWorldPosition(new THREE.Vector3());
    expect(anchor.x).toBeCloseTo(ENTRANCE_3D_POSITION.x);
    expect(anchor.z).toBeCloseTo(ENTRANCE_3D_POSITION.z);
    const step = new THREE.Box3().setFromObject(model.getObjectByName('EntranceStep')!);
    expect(step.getSize(new THREE.Vector3()).x).toBeCloseTo(ENTRANCE_3D_WIDTH);
    expect(step.max.y).toBeCloseTo(0);
    const front = worldPosition({ x: 480, y: WALK_BOUNDS.bottom }).z;
    expect(step.min.z).toBeCloseTo(front);
    for (const x of [-2.9, 0, 2.9]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.1, front - 0.2), new THREE.Vector3(0, 0, 1));
      expect(ray.intersectObject(model)).toHaveLength(0);
    }
    const sign = model.getObjectByName('RoomSignAnchor')!.getWorldPosition(new THREE.Vector3());
    expect(sign.toArray()).toEqual([0, expect.closeTo(2.36),
      expect.closeTo(worldPosition({ x: 480, y: WALK_BOUNDS.top }).z - 0.02)]);
    expect(new THREE.Box3().setFromObject(model).max.y).toBeCloseTo(2.36);
    const sideWall = worldPosition({ x: WALK_BOUNDS.right, y: 0 }).x + 0.11;
    for (const x of [-sideWall, sideWall]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(model)[0]!.point.y).toBeCloseTo(1.48);
    }
  });

  it('stays within geometry and download budgets', () => {
    const meshes: THREE.Mesh[] = [];
    model.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes.length).toBeLessThanOrEqual(30);
    expect(manifest.materials.length).toBeLessThanOrEqual(28);
    expect(meshes.reduce((sum, mesh) => sum +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0)).toBeLessThanOrEqual(22_000);
    expect(bytes.byteLength).toBeLessThan(1_200_000);
  });
});

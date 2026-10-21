import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MAP_OBSTACLES, TILE_SIZE } from '@pokecenter/shared';

const bytes = readFileSync(new URL(
  '../apps/client/public/assets/original/models/waiting-benches.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const manifest = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as {
  scenes: { nodes: number[] }[];
  buffers: { uri?: string }[];
  images?: unknown[];
  cameras?: unknown[];
  materials: unknown[];
};
let asset: GLTF;

beforeAll(async () => {
  asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
});

describe('waiting benches GLB', () => {
  it('loads one self-contained model without studio objects or external resources', () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]!.nodes).toHaveLength(1);
    expect(manifest.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toHaveLength(0);
    expect(manifest.cameras ?? []).toHaveLength(0);
    expect(asset.scene.getObjectByName('WaitingBenches')).toBeDefined();
    expect(asset.scene.getObjectByName('StudioGround')).toBeUndefined();
    expect(asset.scene.getObjectByName('Cube')).toBeUndefined();
  });

  it('fits the shared waiting footprint and preserves all four seats', () => {
    asset.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(asset.scene);
    for (const station of MAP_OBSTACLES.slice(4, 5)) {
      expect(bounds.min.x).toBeGreaterThanOrEqual(-station.width / TILE_SIZE / 2);
      expect(bounds.max.x).toBeLessThanOrEqual(station.width / TILE_SIZE / 2);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-station.height / TILE_SIZE / 2);
      expect(bounds.max.z).toBeLessThanOrEqual(station.height / TILE_SIZE / 2);
    }
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(1.04);
    for (const [name, x] of [['WaitingAnchor1', -72/48], ['WaitingAnchor2', -18/48],
      ['WaitingAnchor3', 36/48], ['WaitingAnchor4', 90/48]] as const) {
      const position = asset.scene.getObjectByName(name)!.getWorldPosition(new Vector3());
      expect(position.x).toBeCloseTo(x);
      expect(position.y).toBeCloseTo(0.5);
      expect(position.z).toBeCloseTo(-6/48);
    }
  });

  it('stays within the mesh, triangle and download budgets', () => {
    const meshes: Mesh[] = [];
    asset.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const triangles = meshes.reduce((count, mesh) => count +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(10);
    expect(manifest.materials.length).toBeLessThanOrEqual(10);
    expect(triangles).toBeLessThanOrEqual(8_000);
    expect(bytes.byteLength).toBeLessThanOrEqual(280_000);
    expect(asset.scene.getObjectByName('LavenderEnamel')).toBeDefined();
    for (let slot = 1; slot <= 4; slot++) {
      const light = asset.scene.getObjectByName(`WaitingGlow${slot}`)!;
      expect(light).toBeInstanceOf(Mesh);
      const bounds = new Box3().setFromObject(light);
      const anchor = asset.scene.getObjectByName(`WaitingAnchor${slot}`)!.position;
      expect(bounds.min.x).toBeGreaterThan(anchor.x - 0.3);
      expect(bounds.max.x).toBeLessThan(anchor.x + 0.3);
    }
  });
});

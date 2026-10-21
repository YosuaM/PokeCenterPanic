import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT, TILE_SIZE } from '@pokecenter/shared';

const bytes = readFileSync(new URL(
  '../apps/client/public/assets/original/models/transport-stretcher.glb', import.meta.url));
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

describe('transport stretcher GLB', () => {
  it('loads one self-contained model without studio objects or external resources', () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]!.nodes).toHaveLength(1);
    expect(manifest.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toHaveLength(0);
    expect(manifest.cameras ?? []).toHaveLength(0);
    expect(asset.scene.getObjectByName('TransportStretcher')).toBeDefined();
    expect(asset.scene.getObjectByName('StudioGround')).toBeUndefined();
    expect(asset.scene.getObjectByName('Cube')).toBeUndefined();
  });

  it('fits the carrier collision footprint and supports patient feet at the existing height', () => {
    asset.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(asset.scene);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-PLAYER_HALF_WIDTH / TILE_SIZE);
    expect(bounds.max.x).toBeLessThanOrEqual(PLAYER_HALF_WIDTH / TILE_SIZE);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-PLAYER_HALF_HEIGHT / TILE_SIZE);
    expect(bounds.max.z).toBeLessThanOrEqual(PLAYER_HALF_HEIGHT / TILE_SIZE);
    expect(bounds.min.y).toBeCloseTo(-0.1);
    expect(bounds.max.y).toBeLessThanOrEqual(0.161);
    const position = asset.scene.getObjectByName('TransportAnchor')!.getWorldPosition(new Vector3());
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0.11);
    expect(position.z).toBeCloseTo(0);
    const pad = asset.scene.getObjectByName('MintCushion')!;
    const ray = new Raycaster(new Vector3(0, 2, 0), new Vector3(0, -1, 0));
    expect(ray.intersectObject(pad)[0]!.point.y).toBeCloseTo(position.y);
  });

  it('stays within the mesh, triangle and download budgets', () => {
    const meshes: Mesh[] = [];
    asset.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const triangles = meshes.reduce((count, mesh) => count +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(6);
    expect(manifest.materials.length).toBeLessThanOrEqual(6);
    expect(triangles).toBeLessThanOrEqual(2_500);
    expect(bytes.byteLength).toBeLessThanOrEqual(95_000);
    expect(asset.scene.getObjectByName('MintCushion')).toBeDefined();

  });
});

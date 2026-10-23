import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MAP_OBSTACLES, TILE_SIZE } from '@pokecenter/shared';
import { CENTER_3D_FOOTPRINTS, MEDICINE_STOCK_3D, MEDICINE_STOCK_SHELF_HEIGHT } from '../apps/client/src/scenes/center3dLayout.js';

const bytes = readFileSync(new URL(
  '../apps/client/public/assets/original/models/medicine-table.glb', import.meta.url));
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

describe('medicine table GLB', () => {
  it('loads one self-contained model without studio objects or external resources', () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]!.nodes).toHaveLength(1);
    expect(manifest.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toHaveLength(0);
    expect(manifest.cameras ?? []).toHaveLength(0);
    expect(asset.scene.getObjectByName('MedicineTable')).toBeDefined();
    expect(asset.scene.getObjectByName('StudioGround')).toBeUndefined();
    expect(asset.scene.getObjectByName('Cube')).toBeUndefined();
  });

  it('fits the shared table footprint and preserves preparation anchors', () => {
    asset.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(asset.scene);
    for (const station of MAP_OBSTACLES.slice(3, 4)) {
      expect(bounds.min.x).toBeGreaterThanOrEqual(-station.width / TILE_SIZE / 2);
      expect(bounds.max.x).toBeLessThanOrEqual(station.width / TILE_SIZE / 2);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-station.height / TILE_SIZE / 2);
      expect(bounds.max.z).toBeLessThanOrEqual(station.height / TILE_SIZE / 2);
    }
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(1.2);
    for (const [name, x] of [['BurnHealAnchor', -80/48], ['AntidoteAnchor', 80/48],
      ['DisposalAnchor', 0]] as const) {
      const position = asset.scene.getObjectByName(name)!.getWorldPosition(new Vector3());
      expect(position.x).toBeCloseTo(x);
      expect(position.y).toBeCloseTo(0.66);
      expect(position.z).toBeCloseTo(1.04);
    }
  });

  it('marks an empty three-dose shelf per station where the runtime shows prepared doses', () => {
    asset.scene.updateMatrixWorld(true);
    const table = CENTER_3D_FOOTPRINTS[3]!;
    for (let slot = 0; slot < 6; slot++) {
      const anchor = asset.scene.getObjectByName(`StockAnchor${slot + 1}`)!.getWorldPosition(new Vector3());
      expect(anchor.x).toBeCloseTo(MEDICINE_STOCK_3D[slot]!.x - table.x);
      expect(anchor.z).toBeCloseTo(MEDICINE_STOCK_3D[slot]!.z - table.z);
      expect(anchor.y).toBeCloseTo(MEDICINE_STOCK_SHELF_HEIGHT);
      expect(anchor.x < 0).toBe(slot < 3);
    }
    // The decorative reagent bottles (topping out at 1.19) are gone from the back row.
    const bounds = new Box3().setFromObject(asset.scene);
    expect(bounds.max.y).toBeLessThan(1.1);
  });

  it('stays within the mesh, triangle and download budgets', () => {
    const meshes: Mesh[] = [];
    asset.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const triangles = meshes.reduce((count, mesh) => count +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(11);
    expect(manifest.materials.length).toBeLessThanOrEqual(11);
    expect(triangles).toBeLessThanOrEqual(12_000);
    expect(bytes.byteLength).toBeLessThanOrEqual(420_000);
    expect(asset.scene.getObjectByName('BurnHealGlow')).toBeDefined();
    expect(asset.scene.getObjectByName('AntidoteGlow')).toBeDefined();
    expect(asset.scene.getObjectByName('LavenderEnamel')).toBeDefined();
  });
});

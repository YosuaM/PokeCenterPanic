import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const id = 'entrance-door';
const root = 'EntranceDoor';
const bodyName = 'CoralEnamel';
describe(id + ' GLB', () => {
  const bytes = readFileSync('apps/client/public/assets/original/models/' + id + '.glb');
  const manifest = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    scenes: { nodes: number[] }[]; buffers: { uri?: string }[];
    materials: unknown[]; images?: unknown[]; cameras?: unknown[];
  };
  let asset: GLTF;
  beforeAll(async () => {
    asset = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  });

  it('contains one self-contained original entrance door without studio objects', () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]!.nodes).toHaveLength(1);
    expect(manifest.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toHaveLength(0);
    expect(manifest.cameras ?? []).toHaveLength(0);
    expect(asset.scene.getObjectByName(root)).toBeDefined();
    expect(asset.scene.getObjectByName('StudioGround')).toBeUndefined();
  });

  it('rests on its base origin and keeps a doorway silhouette with six separate sliding leaves', () => {
    const bounds = new Box3().setFromObject(asset.scene);
    const size = bounds.getSize(new Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.x).toBeCloseTo(6.16);
    expect(size.z).toBeLessThanOrEqual(0.81);
    expect(size.y).toBeGreaterThan(2.7);
    expect(size.y).toBeLessThan(2.9);
    const anchor = asset.scene.getObjectByName('EntranceAnchor')!.getWorldPosition(new Vector3());
    expect(anchor.x).toBeCloseTo(0);
    expect(anchor.y).toBeCloseTo(0.1);
    expect(anchor.z).toBeCloseTo(0);
    expect(asset.scene.getObjectByName(bodyName)).toBeDefined();
    expect(asset.scene.getObjectByName('CeramicCream')).toBeDefined();
    expect(asset.scene.getObjectByName('EntranceHeader_Runtime')).toBeDefined();
    for (const side of ['L', 'R']) for (let index = 0; index < 3; index++) {
      const leaf = asset.scene.getObjectByName(`EntranceLeaf${side}${index}_Runtime`)!;
      const leafBounds = new Box3().setFromObject(leaf);
      expect(leafBounds.getSize(new Vector3()).x).toBeCloseTo(0.92);
      expect(leaf.children.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('stays within mesh, triangle and download budgets', () => {
    const meshes: Mesh[] = [];
    asset.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const triangles = meshes.reduce((sum, mesh) => sum +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(meshes).toHaveLength(36);
    expect(manifest.materials).toHaveLength(6);
    expect(triangles).toBeLessThanOrEqual(5500);
    expect(bytes.byteLength).toBeLessThan(195_000);
  });
});

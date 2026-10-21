import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const id = 'pc-terminal';
const root = 'PcTerminal';
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

  it('contains one self-contained original PC terminal without studio objects', () => {
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

  it('rests on its base origin and keeps a compact monitor and keyboard silhouette on the desk', () => {
    const bounds = new Box3().setFromObject(asset.scene);
    const size = bounds.getSize(new Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.x).toBeCloseTo(0.962);
    expect(size.z).toBeCloseTo(0.964);
    expect(size.y).toBeGreaterThan(1.1);
    expect(size.y).toBeLessThan(1.2);
    const anchor = asset.scene.getObjectByName('PcDeskAnchor')!.getWorldPosition(new Vector3());
    expect(anchor.x).toBeCloseTo(0);
    expect(anchor.y).toBeCloseTo(0);
    expect(anchor.z).toBeCloseTo(0);
    expect(asset.scene.getObjectByName(bodyName)).toBeDefined();
    expect(asset.scene.getObjectByName('CeramicCream')).toBeDefined();
    const marks = new Box3().setFromObject(asset.scene.getObjectByName('ScreenTrace')!);
    expect(marks.max.z).toBeGreaterThan(0.11);
  });

  it('exports emissive screen symbols and indicators independent of the casing', () => {
    for (const name of ['ScreenTrace', 'StatusGlow', 'ReaderGlow', 'ProgressGlow', 'DataLine1', 'DataLine2', 'DataLine3']) {
      const mesh = asset.scene.getObjectByName(name) as Mesh;
      expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
      const material = mesh.material as MeshStandardMaterial;
      expect(material.emissive.g).toBeGreaterThan(0.4);
      expect(material.emissiveIntensity).toBeGreaterThan(0);
      expect(material.map).toBeNull();
    }
  });

  it('stays within mesh, triangle and download budgets', () => {
    const meshes: Mesh[] = [];
    asset.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const triangles = meshes.reduce((sum, mesh) => sum +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(meshes).toHaveLength(14);
    expect(manifest.materials).toHaveLength(14);
    expect(triangles).toBeLessThanOrEqual(5300);
    expect(bytes.byteLength).toBeLessThan(190_000);
  });
});

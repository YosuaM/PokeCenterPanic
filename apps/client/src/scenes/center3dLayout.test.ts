import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WALK_BOUNDS, MAP_OBSTACLES, RECEPTION_SLOT_POSITIONS, SPAWN_POINTS,
  WAITING_SLOT_POSITIONS } from '@pokecenter/shared';
import { CAMERA_ELEVATION, CAMERA_HALF_HEIGHT, CAMERA_HALF_WIDTH, CENTER_3D_FOOTPRINTS,
  CENTER_3D_ROSTER, RECEPTION_3D_SLOTS, STAFF_3D_SPAWNS, cameraPosition,
  WAITING_3D_SLOTS, WORLD_DEPTH, WORLD_WIDTH, orbitFromDrag, worldFootprint,
  worldPosition } from './center3dLayout.js';
import { fitsStationFootprint, createCenter3DEnvironment } from './center3dEnvironment.js';
import { characterElevation, characterRenderOrder, createUprightCharacterPlane, spriteWorldSize,
  visibleBottomPadding } from './center3dView.js';

describe('3D center layout', () => {
  it('keeps the 2D server map centered on the 3D floor', () => {
    expect(worldPosition({ x: 480, y: 270 })).toEqual({ x: 0, z: 0 });
    expect(worldPosition({ x: WALK_BOUNDS.left, y: 270 }).x).toBe(-WORLD_WIDTH / 2);
    expect(worldPosition({ x: WALK_BOUNDS.right, y: 270 }).x).toBe(WORLD_WIDTH / 2);
    expect(worldPosition({ x: 480, y: WALK_BOUNDS.bottom }).z -
      worldPosition({ x: 480, y: WALK_BOUNDS.top }).z).toBeCloseTo(WORLD_DEPTH);
    expect(CAMERA_HALF_WIDTH / CAMERA_HALF_HEIGHT).toBeCloseTo(16 / 9);
    expect(CAMERA_HALF_WIDTH).toBeGreaterThan(CENTER_3D_FOOTPRINTS[0]!.width / 2);
    const camera = cameraPosition();
    expect(CAMERA_ELEVATION).toBeCloseTo(Math.PI / 4);
    expect(camera.y).toBeCloseTo(Math.hypot(camera.x, camera.z));
  });

  it('frames the enlarged shell and sign within the fixed game canvas', () => {
    const camera = new THREE.OrthographicCamera(-CAMERA_HALF_WIDTH, CAMERA_HALF_WIDTH,
      CAMERA_HALF_HEIGHT, -CAMERA_HALF_HEIGHT, 0.1, 100);
    const position = cameraPosition();
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(0, 0.65, 0);
    camera.updateMatrixWorld();
    for (const x of [WALK_BOUNDS.left - 10, WALK_BOUNDS.right + 10]) {
      for (const y of [WALK_BOUNDS.top - 10, WALK_BOUNDS.bottom + 42]) {
        const point = worldPosition({ x, y });
        const projected = new THREE.Vector3(point.x, y < 0 ? 2.36 : 0, point.z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(0.72);
      }
    }
  });

  it('projects every station footprint and character anchor from shared coordinates', () => {
    expect(CENTER_3D_FOOTPRINTS).toEqual(MAP_OBSTACLES.map(worldFootprint));
    expect(RECEPTION_3D_SLOTS).toEqual(RECEPTION_SLOT_POSITIONS.map(worldPosition));
    expect(WAITING_3D_SLOTS).toEqual(WAITING_SLOT_POSITIONS.map(worldPosition));
    expect(STAFF_3D_SPAWNS).toEqual(SPAWN_POINTS.map(worldPosition));
    expect(CENTER_3D_FOOTPRINTS.every(({ width, depth }) => width > 0 && depth > 0)).toBe(true);
    expect(CENTER_3D_ROSTER.map(({ name }) => name)).toEqual(['Pikachu', 'Bulbasaur',
      'Charmander', 'Squirtle', 'Eevee', 'Psyduck', 'Chansey', 'Audino', 'Machoke', 'Meowth']);
    expect(CENTER_3D_ROSTER.slice(0, 4).map(({ point }) => point)).toEqual(RECEPTION_3D_SLOTS);
    expect(CENTER_3D_ROSTER.slice(6).map(({ point }) => point)).toEqual(STAFF_3D_SPAWNS);
  });

  it('rotates the inspection camera while keeping the room in view', () => {
    const rotated = orbitFromDrag(0, 0.7, 100, 20);
    expect(rotated.yaw).toBeCloseTo(0.35);
    expect(rotated.elevation).toBeCloseTo(0.63);
    expect(orbitFromDrag(0, 0.7, 1000, -1000)).toEqual({ yaw: 0.62, elevation: 1.08 });
    expect(orbitFromDrag(0, 0.7, -1000, 1000)).toEqual({ yaw: -0.62, elevation: 0.46 });
  });

  it('enlarges PMD frames while preserving their aspect ratio and foot anchors', () => {
    expect(spriteWorldSize(24, 40)).toEqual({ width: 1.25, height: 40 * 2.5 / 48 });
    expect(spriteWorldSize(40, 56).width).toBeCloseTo(40 * 2.5 / 48);
    expect(spriteWorldSize(40, 56).height).toBeCloseTo(56 * 2.5 / 48);
    expect(characterElevation('reception')).toBe(0.93);
    expect(characterElevation('waiting')).toBe(0.5);
    expect(characterElevation('recovery')).toBe(0.57);
    expect(characterElevation('healingMachine')).toBe(0.66);
    expect(characterElevation('carrier')).toBe(1.28);
    expect(characterElevation('player')).toBe(0.03);
    expect(characterRenderOrder({ x: 177, y: 194 }, false))
      .toBeGreaterThan(characterRenderOrder({ x: 177, y: 138 }, false));
    expect(characterRenderOrder({ x: 177, y: 194 }, true))
      .toBe(characterRenderOrder({ x: 177, y: 194 }, false) + 1);
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[(2 * 4 + 1) * 4 + 3] = 255;
    expect(visibleBottomPadding(pixels, 4, 4)).toBe(1);
    expect(visibleBottomPadding(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBe(0);
  });

  it('keeps character pixels vertically above their ground anchor at an oblique camera angle', () => {
    const texture = new THREE.Texture();
    const plane = createUprightCharacterPlane(texture, 0.3);
    plane.updateMatrixWorld();
    const vertices = plane.geometry.getAttribute('position');
    const upperLeft = new THREE.Vector3().fromBufferAttribute(vertices, 0).applyMatrix4(plane.matrixWorld);
    const lowerLeft = new THREE.Vector3().fromBufferAttribute(vertices, 2).applyMatrix4(plane.matrixWorld);
    expect(lowerLeft.y).toBeCloseTo(0);
    expect(upperLeft.y).toBeCloseTo(1);
    expect(upperLeft.z).toBeCloseTo(lowerLeft.z);
    expect(plane.rotation.x).toBe(0);
    expect(plane.material.depthTest).toBe(true);
    expect(plane.material.depthWrite).toBe(false);
    expect(plane.material.alphaTest).toBe(0.1);
    plane.geometry.dispose();
    plane.material.dispose();
    texture.dispose();
  });

  it('fits station geometry into the same rectangles used by collisions', () => {
    const station = CENTER_3D_FOOTPRINTS[1]!;
    expect(fitsStationFootprint(station, station.x, station.z,
      station.width, station.depth)).toBe(true);
    expect(fitsStationFootprint(station, station.x + 0.01, station.z,
      station.width, station.depth)).toBe(false);
    expect(fitsStationFootprint(station, station.x, station.z,
      station.width, station.depth + 0.01)).toBe(false);

    const context = { fillRect: () => {}, fillStyle: '' };
    const document = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true,
      value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
    try {
      const scene = new THREE.Scene();
      expect(() => createCenter3DEnvironment(scene)).not.toThrow();
      const room = scene.getObjectByName('CenterRoomFallback')!;
      expect(room.parent).toBe(scene);
      expect(room.children.length).toBeGreaterThan(20);
      expect(scene.getObjectByName('ReceptionCounterFallback')!.parent).toBe(scene);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
      expect(meshes.length).toBeGreaterThan(45);
      const step = scene.getObjectByName('EntranceStep')!;
      expect(step.parent).toBe(room);
      const stepBounds = new THREE.Box3().setFromObject(step);
      expect(stepBounds.max.y).toBeCloseTo(0);
      expect(stepBounds.getSize(new THREE.Vector3()).x).toBeCloseTo(6.16);
      expect(stepBounds.min.z).toBeCloseTo((WALK_BOUNDS.bottom - 270) / 48);
      expect(scene.getObjectByName('ReceptionCounterFallback')?.children.length).toBeGreaterThan(0);
      expect(scene.getObjectByName('RecoveryAreaFallback')?.children.length).toBe(4);
    } finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    }
  });
});

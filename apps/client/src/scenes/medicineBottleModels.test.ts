import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MEDICINE_SURFACE_POINTS, type MedicineKind, type MedicineDoseRecord } from '@pokecenter/shared';
import { MedicineBottleModels, MEDICINE_BOTTLE_CARRIED_HEIGHT,
  MEDICINE_BOTTLE_SURFACE_HEIGHT } from './medicineBottleModels.js';
import { Center3DView } from './center3dView.js';
import { worldPosition } from './center3dLayout.js';
import { visualFixture } from './visualFixtures.js';

async function asset(kind: MedicineKind) {
  const filename = kind === 'burnHeal' ? 'burn-heal-bottle' : 'antidote-bottle';
  const bytes = await readFile('apps/client/public/assets/original/models/' + filename + '.glb');
  return (await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')).scene;
}

describe('medicine bottle models', () => {
  it.each(['burnHeal', 'antidote'] as const)('sways carried %s smoothly and resets on placement and handoff', async (kind) => {
    const models = new MedicineBottleModels(asset);
    await models.ready;
    const scene = new THREE.Scene();
    const medicines = new Map<string, THREE.Group>();
    const view = Object.create(Center3DView.prototype) as Center3DView;
    Object.assign(view, { scene, medicines, medicineBottles: models, discardedMedicines: new Set<string>() });
    const doses: MedicineDoseRecord[] = [
      { id: 'walking', kind, location: 'carrier', carrierId: 'walker', slotIndex: -1 },
      { id: 'resting', kind, location: 'carrier', carrierId: 'rest', slotIndex: -1 },
      { id: 'surface', kind, location: 'surface', carrierId: '', slotIndex: 0 },
    ];
    const sync = (time: number, x: number) => view.syncMedicines(doses,
      new Map([['walker', { x, y: 375 }], ['rest', { x: 400, y: 435 }]]), time);
    sync(0, 400);
    const walking = medicines.get('walking')!;
    expect(walking.rotation.z).toBe(0);
    let peak = 0;
    let trough = 0;
    for (let frame = 1; frame <= 100; frame++) {
      sync(frame * 20, 400 + frame);
      const roll = walking.rotation.z;
      peak = Math.max(peak, roll);
      trough = Math.min(trough, roll);
      expect(Math.abs(roll)).toBeLessThanOrEqual(0.06);
      expect(walking.position.y).toBeGreaterThanOrEqual(MEDICINE_BOTTLE_CARRIED_HEIGHT);
      expect(walking.position.y).toBeLessThanOrEqual(MEDICINE_BOTTLE_CARRIED_HEIGHT + 0.015);
      expect(medicines.get('resting')!.rotation.z).toBe(0);
      expect(medicines.get('surface')!.position.y).toBe(MEDICINE_BOTTLE_SURFACE_HEIGHT);
      expect(medicines.get('surface')!.rotation.z).toBe(0);
    }
    expect(peak).toBeGreaterThan(0.055);
    expect(trough).toBeLessThan(-0.055);
    for (let time = 2020; time <= 3000; time += 20) sync(time, 500);
    expect(walking.rotation.z).toBe(0);
    expect(walking.position.y).toBe(MEDICINE_BOTTLE_CARRIED_HEIGHT);
    sync(3020, 502);
    expect(walking.rotation.z).not.toBe(0);
    doses[0] = { ...doses[0]!, location: 'surface', slotIndex: 1, carrierId: '' };
    sync(3040, 504);
    expect(walking.rotation.z).toBe(0);
    expect(walking.position.y).toBe(MEDICINE_BOTTLE_SURFACE_HEIGHT);
    doses[0] = { ...doses[0]!, location: 'carrier', slotIndex: -1, carrierId: 'walker' };
    sync(3060, 506);
    expect(walking.rotation.z).toBe(0);
    sync(3080, 508);
    expect(walking.rotation.z).not.toBe(0);
    doses[0]!.carrierId = 'rest';
    sync(3100, 510);
    expect(walking.rotation.z).toBe(0);
    view.syncMedicines([], new Map(), 3120);
    expect(scene.children).toHaveLength(0);
    expect(models.motion(walking, { x: 500, y: 0 }, 'rest', 3140)).toEqual({ lift: 0, roll: 0 });
    models.dispose();
  });

  it('keeps bottle motion frame-rate independent and preserves it while a model loads', async () => {
    const poses = [];
    for (const fps of [30, 60, 120]) {
      let resolve!: (model: THREE.Object3D) => void;
      const models = new MedicineBottleModels((kind) => kind === 'burnHeal' ? Promise.resolve(new THREE.Group()) :
        new Promise((done) => { resolve = done; }));
      const group = models.create('antidote');
      let pose = models.motion(group, { x: 0, y: 0 }, 'staff', 0);
      for (let frame = 1; frame <= fps; frame++) {
        pose = models.motion(group, { x: frame * 100 / fps, y: 0 }, 'staff', frame * 1000 / fps);
      }
      poses.push(pose);
      group.position.y = MEDICINE_BOTTLE_CARRIED_HEIGHT + pose.lift;
      group.rotation.z = pose.roll;
      resolve(await asset('antidote'));
      await models.ready;
      expect(group.getObjectByName('AntidoteBottle')).toBeDefined();
      expect(group.rotation.z).toBe(pose.roll);
      expect(group.position.y).toBe(MEDICINE_BOTTLE_CARRIED_HEIGHT + pose.lift);
      for (const [x, time] of [[500, 1020], [502, 3000], [504, 10]]) {
        expect(models.motion(group, { x: x!, y: 0 }, 'staff', time!)).toEqual({ lift: 0, roll: 0 });
      }
      models.dispose();
    }
    for (const pose of poses) {
      expect(pose.roll).toBeCloseTo(poses[0]!.roll, 8);
      expect(pose.lift).toBeCloseTo(poses[0]!.lift, 8);
    }
  });

  it('loads each kind once, replaces pending instances and shares resources until teardown', async () => {
    const templates = { burnHeal: await asset('burnHeal'), antidote: await asset('antidote') };
    const load = vi.fn(async (kind: MedicineKind) => templates[kind]);
    const models = new MedicineBottleModels(load);
    const burn = models.create('burnHeal');
    const antidote = models.create('antidote');
    const removed = models.create('burnHeal');
    const fallbackDispose = vi.spyOn((burn.children[0] as THREE.Mesh).geometry, 'dispose');
    models.release(removed);
    burn.position.set(1, 2, 3);
    expect(await models.ready).toEqual({ burnHeal: true, antidote: true });
    expect(load).toHaveBeenCalledTimes(2);
    expect(fallbackDispose).toHaveBeenCalledOnce();
    expect(removed.children).toHaveLength(0);
    expect(burn.position.toArray()).toEqual([1, 2, 3]);
    expect(burn.getObjectByName('BurnHealBottle')).toBeDefined();
    expect(antidote.getObjectByName('AntidoteBottle')).toBeDefined();
    const another = models.create('burnHeal');
    const body = burn.getObjectByName('CoralEnamel') as THREE.Mesh;
    const copy = another.getObjectByName('CoralEnamel') as THREE.Mesh;
    expect(copy).not.toBe(body);
    expect(copy.geometry).toBe(body.geometry);
    expect(copy.material).toBe(body.material);
    expect(copy.castShadow && copy.receiveShadow).toBe(true);
    const dispose = vi.spyOn(body.geometry, 'dispose');
    const materialDispose = vi.spyOn(body.material as THREE.Material, 'dispose');
    const scene = new THREE.Scene();
    scene.add(burn, another, antidote);
    models.release(burn);
    models.release(burn);
    expect(dispose).not.toHaveBeenCalled();
    expect(another.children.length).toBeGreaterThan(0);
    models.dispose();
    models.dispose();
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(models.create('antidote').children).toHaveLength(0);
  });

  it('keeps a fallback for one failed kind while the other loads normally', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const models = new MedicineBottleModels(async (kind) => {
        if (kind === 'burnHeal') throw new Error('404');
        return asset(kind);
      });
      const burn = models.create('burnHeal');
      const antidote = models.create('antidote');
      const fallbackDispose = vi.spyOn((burn.children[0] as THREE.Mesh).geometry, 'dispose');
      expect(await models.ready).toEqual({ burnHeal: false, antidote: true });
      expect(burn.children).toHaveLength(2);
      expect(antidote.getObjectByName('AntidoteBottle')).toBeDefined();
      expect(new THREE.Box3().setFromObject(burn).min.y).toBeCloseTo(0);
      models.dispose();
      expect(fallbackDispose).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it('disposes late loads without reattaching removed bottles', async () => {
    const resolvers = new Map<MedicineKind, (value: THREE.Object3D) => void>();
    const models = new MedicineBottleModels((kind) => new Promise((resolve) => resolvers.set(kind, resolve)));
    const group = models.create('burnHeal');
    models.dispose();
    const disposes = [];
    for (const kind of ['burnHeal', 'antidote'] as const) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      disposes.push(vi.spyOn(mesh.geometry, 'dispose'));
      resolvers.get(kind)!(mesh);
    }
    expect(await models.ready).toEqual({ burnHeal: false, antidote: false });
    expect(group.children).toHaveLength(0);
    for (const dispose of disposes) expect(dispose).toHaveBeenCalledOnce();
  });

  it('places all surface and carried doses, follows transfers, and removes consumed or unavailable doses', async () => {
    const models = new MedicineBottleModels(asset);
    await models.ready;
    const scene = new THREE.Scene();
    const medicines = new Map<string, THREE.Group>();
    const view = Object.create(Center3DView.prototype) as Center3DView;
    Object.assign(view, { scene, medicines, medicineBottles: models, discardedMedicines: new Set<string>() });
    const fixture = visualFixture('medicine-bottles')!;
    const carriers = new Map(fixture.positions.map((position) => [position.id, position]));
    const doses = fixture.medicineDoses!;
    view.syncMedicines(doses, carriers);
    expect(medicines.size).toBe(6);
    for (const dose of doses) {
      const group = medicines.get(dose.id)!;
      const point = dose.location === 'surface' ? MEDICINE_SURFACE_POINTS[dose.slotIndex]! :
        carriers.get(dose.carrierId)!;
      const position = worldPosition(point);
      expect(group.position.toArray()).toEqual([position.x, dose.location === 'surface' ?
        MEDICINE_BOTTLE_SURFACE_HEIGHT : MEDICINE_BOTTLE_CARRIED_HEIGHT, position.z]);
      const name = dose.kind === 'burnHeal' ? 'BurnHealBottle' : 'AntidoteBottle';
      expect(group.getObjectByName(name)).toBeDefined();
    }
    const transferred = medicines.get('surface-0')!;
    const dose: MedicineDoseRecord = { ...doses[0]!, location: 'carrier',
      carrierId: fixture.players[0]!.id, slotIndex: -1 };
    view.syncMedicines([dose], new Map([[dose.carrierId, { x: 480, y: 400 }]]));
    expect(medicines.get(dose.id)).toBe(transferred);
    const position = worldPosition({ x: 480, y: 400 });
    expect(transferred.position.toArray()).toEqual([position.x, MEDICINE_BOTTLE_CARRIED_HEIGHT, position.z]);
    view.syncMedicines([{ ...dose, kind: 'antidote' }], carriers);
    expect(transferred.children).toHaveLength(0);
    expect(medicines.get(dose.id)!.getObjectByName('AntidoteBottle')).toBeDefined();
    view.syncMedicines([dose], new Map());
    expect(medicines.size).toBe(0);
    view.syncMedicines([{ ...dose, location: 'surface', slotIndex: 99 }], carriers);
    expect(medicines.size).toBe(0);
    view.syncMedicines(doses, carriers);
    view.syncMedicines([], carriers);
    expect(scene.children).toHaveLength(0);
    models.dispose();
  });
});

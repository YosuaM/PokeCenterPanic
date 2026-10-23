import { afterEach, describe, expect, it, vi } from 'vitest';
import { TREATMENT, WAITING_INTERACTION_POINTS, isWalkable } from '@pokecenter/shared';

vi.mock('phaser', () => ({ default: { Scene: class {}, Textures: { FilterMode: { NEAREST: 0 } } } }));

import { MapScene } from './MapScene.js';
import { HINT_TEXT } from './contextualHints.js';
import { mapViewportPoint } from './mapViewport.js';
import { visualFixture } from './visualFixtures.js';
import type { SpriteManifest } from '../sprites/pmd.js';
import type { HudAnchors, HudState } from '../ui/hud/hudState.js';

function setup(manifest?: SpriteManifest, mapArt = true, equipmentArt = true,
  fixtureArt = mapArt, viewport?: { width: number; height: number },
  initialRound?: [number, number]) {
  const keyboardListeners = new Map<string, (event: KeyboardEvent) => void>();
  const windowListeners = new Map<string, () => void>();
  const documentListeners = new Map<string, () => void>();
  let motionChanged = () => {};
  const motionPreference = { matches: false,
    addEventListener: vi.fn((_type: string, listener: () => void) => { motionChanged = listener; }),
    removeEventListener: vi.fn() };
  class InputElement {}
  vi.stubGlobal('HTMLInputElement', InputElement);
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => motionPreference),
    addEventListener: vi.fn((type: string, listener: () => void) => windowListeners.set(type, listener)),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', {
    activeElement: null,
    addEventListener: vi.fn((type: string, listener: () => void) => documentListeners.set(type, listener)),
    removeEventListener: vi.fn(),
  });
  let resizeViewport = () => {};
  const disconnectSize = vi.fn();
  if (viewport) {
    vi.stubGlobal('ResizeObserver', class {
      constructor(update: () => void) { resizeViewport = update; }
      observe() {}
      disconnect = disconnectSize;
    });
    Object.assign(document, { querySelector: (selector: string) => selector === '#game' ?
      { getBoundingClientRect: () => viewport } : null });
  }

  const graphics: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['fillStyle', 'fillRect', 'lineStyle', 'lineBetween']) {
    graphics[method] = vi.fn(() => graphics);
  }
  const text = vi.fn((x: number, y: number, content: string, style: unknown) => ({
    x, y, content, style, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setY: vi.fn().mockReturnThis(), setVisible: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(), setText: vi.fn().mockReturnThis() }));
  const rectangle = vi.fn((x: number, y: number, width: number, height: number,
    color: number, alpha?: number) => ({ x, y, width, height, color, alpha,
    setOrigin: vi.fn().mockReturnThis(), setDisplaySize: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(), setStrokeStyle: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis() }));
  const image = vi.fn((x: number, y: number, key: string) => ({ x, y, key,
    setDisplaySize: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis(),
  }));
  const sprite = vi.fn((x: number, y: number, key: string) => ({ x, y, key,
    setOrigin: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(), play: vi.fn().mockReturnThis(),
    anims: { currentAnim: null } }));
  const containers: Array<{ setPosition: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const newContainer = () => ({ setPosition: vi.fn(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn(),
    setAlpha: vi.fn().mockReturnThis(), setRotation: vi.fn().mockReturnThis() });
  const container = vi.fn<(...args: unknown[]) => ReturnType<typeof newContainer>>(() => {
    const avatar = newContainer();
    containers.push(avatar);
    return avatar;
  });
  const scene = new MapScene();
  const camera = { setSize: vi.fn().mockReturnThis(), setZoom: vi.fn().mockReturnThis(),
    centerOn: vi.fn().mockReturnThis() };
  const setGameSize = vi.fn();
  const setFilter = vi.fn();
  let onLoadComplete = () => {};
  Object.assign(scene, {
    add: { graphics: vi.fn(() => graphics), image, text, rectangle, container, sprite },
    scale: { setGameSize }, cameras: { main: camera },
    cache: { json: { get: vi.fn(() => manifest) } },
    load: { image: vi.fn(), json: vi.fn(), spritesheet: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => {
      onLoadComplete = callback;
    }), start: vi.fn(() => onLoadComplete()) },
    textures: { get: vi.fn(() => ({ setFilter })), exists: vi.fn((key: string) => key === 'center-floor' ? mapArt :
      key === 'center-fixtures' ? fixtureArt :
      key === 'stretcher' || key === 'medicine-bottle' ? equipmentArt : true) },
    anims: { create: vi.fn(), exists: vi.fn(() => true) },
    input: { keyboard: {
      on: vi.fn((type: string, listener: (event: KeyboardEvent) => void) => keyboardListeners.set(type, listener)),
      off: vi.fn(),
    } },
    events: { once: vi.fn() },
    sys: { isActive: () => true },
  });
  const hud = { render: vi.fn<(state: HudState, timeMs: number) => void>(),
    place: vi.fn<(anchors: HudAnchors, timeMs: number) => void>(), destroy: vi.fn() };
  scene.useHud(hud);
  if (initialRound) scene.setRoundProgress(...initialRound);
  scene.preload();
  scene.create();
  const hudState = () => hud.render.mock.lastCall![0];
  const anchors = () => hud.place.mock.lastCall![0];
  return { scene, hud, hudState, anchors, image, graphics, text, rectangle, container, containers, sprite, keyboardListeners, windowListeners,
    documentListeners, InputElement, camera, setGameSize, setFilter, resizeViewport, disconnectSize,
    motionPreference, setReducedMotion: (value: boolean) => { motionPreference.matches = value; motionChanged(); } };
}

afterEach(() => vi.unstubAllGlobals());

describe('MapScene', () => {
  it('targets the right machine for repair and medication', () => {
    const { scene, keyboardListeners, hudState } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setGameplayActive(true);
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 778, y: 0, facing: 'down', carriedPatientId: '' }]);
    const patient = { id: 'right-patient', species: 'Eevee' as const, requiredTreatments: 5,
      completedTreatments: 1, initialPatienceMs: 90000, remainingPatienceMs: 40000,
      lifecycle: 'active' as const, location: 'healingMachine' as const, slotIndex: 1, carrierId: '' };
    scene.setPatients([patient]);
    scene.setHealingMachine({ patientId: '', status: 'empty', remainingMs: 0 },
      { patientId: patient.id, status: 'broken', remainingMs: 0 });
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:1', expectedOccupantId: patient.id });
    expect(hudState().action).toMatchObject({ key: 'E', label: 'Repair outage', tone: 'hold', progress: 0 });
    keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
    scene.setMedicines([{ id: 'dose', kind: 'antidote', location: 'carrier', carrierId: 'red', slotIndex: -1 }],
      [], [], []);
    scene.setAuthoritativePositions([{ id: 'red', x: 778, y: 0, facing: 'left', carriedPatientId: '', carriedMedicineId: 'dose' }]);
    scene.setHealingMachine({ patientId: '', status: 'empty', remainingMs: 0 },
      { patientId: patient.id, status: 'completed', remainingMs: 0 });
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'medicine:apply:healing:1', expectedOccupantId: patient.id });
  });

  it('plays one outage cue per transition, including mutable snapshots, and respects hidden and inactive state', () => {
    const { scene } = setup();
    const audio = { play: vi.fn(), stop: vi.fn() };
    Object.assign(scene, { patientAudio: audio });
    scene.setGameplayActive(true);
    const machine = { patientId: '', status: 'empty' as 'empty' | 'broken', remainingMs: 0 };
    scene.setHealingMachine(machine);
    machine.status = 'broken';
    scene.setHealingMachine(machine);
    scene.setHealingMachine(machine);
    expect(audio.play).toHaveBeenCalledExactlyOnceWith(['outage']);
    machine.status = 'empty';
    scene.setHealingMachine(machine);
    Object.assign(document, { hidden: true });
    scene.setHealingMachine(machine, { ...machine, status: 'broken' });
    expect(audio.play).toHaveBeenCalledOnce();
    Object.assign(document, { hidden: false });
    scene.setHealingMachine(machine, { ...machine, status: 'broken' });
    expect(audio.play).toHaveBeenCalledOnce();
    scene.setGameplayActive(false);
    scene.setHealingMachine({ ...machine, status: 'broken' });
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('retains round state received before scene creation, including a results reconnect', () => {
    const { hudState } = setup(undefined, true, true, true, undefined, [0, 325]);
    expect(hudState()).toMatchObject({ remainingMs: 0, score: 325 });
  });

  it('shows the synchronized clock and score and clears them when leaving a room', () => {
    const { scene, hudState } = setup();
    expect(hudState()).toMatchObject({ remainingMs: 360_000, score: 0, streak: 0 });
    scene.setRoundProgress(29999, -50, 3);
    expect(hudState()).toMatchObject({ remainingMs: 29999, score: -50, streak: 3 });
    scene.setRoundProgress(0, 325);
    expect(hudState()).toMatchObject({ remainingMs: 0, score: 325, streak: 0 });
    scene.clearPlayers();
    expect(hudState()).toMatchObject({ remainingMs: 360_000, score: 0, discharged: 0, lost: 0, players: [] });
  });

  it.each([
    { id: 'reception:0', position: { x: 348, y: 210 } },
    { id: 'reception:1', position: { x: 412, y: 210 } },
    { id: 'reception:2', position: { x: 548, y: 210 } },
    { id: 'reception:3', position: { x: 612, y: 210 } },
    { id: 'discharge', position: { x: 480, y: 346 } },
    { id: 'discharge', position: { x: 480, y: 210 } },
    { id: 'waiting:0', position: { x: 20, y: 492 } },
    { id: 'waiting:3', position: { x: 252, y: 527 } },
    { id: 'waiting:4', position: { x: 708, y: 527 } },
    { id: 'waiting:7', position: { x: 958, y: 492 } },
    ...WAITING_INTERACTION_POINTS.flatMap(({ x, y }, index) =>
      [y, y - 12].map((top) => ({ id: `waiting:${index}`, position: { x, y: top } }))),
    { id: 'healing:1', position: { x: 910, y: 74 } },
    { id: 'recovery', position: { x: 888, y: 234 } },
    { id: 'recovery', position: { x: 728, y: 288 } },
    { id: 'recovery', position: { x: 888, y: 380 } },
    { id: 'medicine:prep:0', position: { x: 400, y: 58 } },
    { id: 'medicine:prep:0', position: { x: 302, y: 0 } },
    { id: 'medicine:prep:1', position: { x: 560, y: 58 } },
    { id: 'medicine:prep:1', position: { x: 658, y: 0 } },
    { id: 'medicine:disposal', position: { x: 480, y: 58 } },
    { id: 'medicine:disposal', position: { x: 480, y: 90 } },
    ...[390, 450, 510, 570].map((x, index) => ({ id: `medicine:surface:${index}`, position: { x, y: 156 } })),
  ])('sends the same adjacent $id target from $position for every facing', ({ id, position }) => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      scene.setAuthoritativePositions([{ id: 'red', ...position, facing, carriedPatientId: '' }]);
      keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
        preventDefault: vi.fn() } as unknown as KeyboardEvent);
      keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
      expect(send).toHaveBeenLastCalledWith({ targetId: id, expectedOccupantId: '' });
    }
    expect(send).toHaveBeenCalledTimes(4);
  });

  it.each([
    { id: 'reception:0', position: { x: 348, y: 210 }, location: 'reception' as const, index: 0 },
    { id: 'waiting:7', position: { x: 958, y: 480 }, location: 'waiting' as const, index: 7 },
    { id: 'recovery', position: { x: 888, y: 380 }, location: 'recovery' as const, index: 0 },
  ])('keeps the patient target and medicine action at $id reachable from $position', ({ id, position, location, index }) => {
    const { scene, keyboardListeners, hudState } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: TREATMENT.burnHeal,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location, slotIndex: index, carrierId: '' }]);
    scene.setMedicines([{ id: 'dose', kind: 'burnHeal', location: 'carrier', slotIndex: -1,
      carrierId: 'red' }], ['', '', '', ''], ['', ''], [0, 0]);
    scene.setAuthoritativePositions([{ id: 'red', ...position, facing: 'left',
      carriedPatientId: '', carriedMedicineId: 'dose' }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenCalledWith({ targetId: `medicine:apply:${id}`, expectedOccupantId: 'patient' });
    expect(hudState().action).toMatchObject({ key: 'E', label: 'Apply Burn Heal to Pikachu', tone: 'ready' });
    expect(hudState().focusedPatientId).toBe('patient');
  });

  it.each([
    { position: { x: 50, y: 74 }, perimeter: { x: 50, y: 74 } },
    { position: { x: 50, y: 122 }, perimeter: { x: 50, y: 74 } },
    { position: { x: 167, y: 0 }, perimeter: { x: 167, y: 0 } },
    { position: { x: 215, y: 0 }, perimeter: { x: 167, y: 0 } },
    { position: { x: 167, y: 74 }, perimeter: { x: 167, y: 74 } },
    { position: { x: 191, y: 98 }, perimeter: { x: 167, y: 74 } },
  ])('targets machine placement, pickup, and medicine from $position', ({ position, perimeter }) => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    const setTarget = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    const press = () => keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent);
    const patient = { id: 'patient-1', species: 'Pikachu' as const,
      requiredTreatments: TREATMENT.healing | TREATMENT.burnHeal, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active' as const,
      location: 'carrier' as const, slotIndex: -1, carrierId: 'red' };
    scene.setAuthoritativePositions([{ id: 'red', ...position, facing: 'up',
      carriedPatientId: patient.id }]);
    scene.setPatients([patient]);
    press();
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', ...position, facing: 'down', carriedPatientId: '' }]);
    scene.setHealingMachine({ patientId: patient.id, status: 'completed', remainingMs: 0 });
    scene.setPatients([{ ...patient, location: 'healingMachine', slotIndex: 0, carrierId: '',
      completedTreatments: TREATMENT.healing }]);
    press();
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: patient.id });

    scene.setMedicines([{ id: 'dose', kind: 'burnHeal', location: 'carrier', slotIndex: -1,
      carrierId: 'red' }], ['', '', '', ''], ['', ''], [0, 0]);
    scene.setAuthoritativePositions([{ id: 'red', ...position, facing: 'left',
      carriedPatientId: '', carriedMedicineId: 'dose' }]);
    Object.assign(scene, { center3D: { setTarget } });
    scene.setInteractionResult({ ok: true, reason: '' });
    press();
    expect(send).toHaveBeenLastCalledWith({ targetId: 'medicine:apply:healing:0',
      expectedOccupantId: patient.id });
    expect(setTarget).toHaveBeenLastCalledWith(perimeter);
  });

  it.each([{ x: 50, y: 123 }, { x: 216, y: 0 }, { x: 50, y: 0 }])(
    'does not send a machine interaction outside adjacent walkable space %j', (position) => {
      const { scene, keyboardListeners } = setup();
      const send = vi.fn();
      scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
      scene.setInteractionSender(send);
      scene.setAuthoritativePositions([{ id: 'red', ...position, facing: 'up', carriedPatientId: '' }]);
      keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
        preventDefault: vi.fn() } as unknown as KeyboardEvent);
      expect(send).not.toHaveBeenCalled();
    });

  it('plays patient sound transitions once, consumes hidden events and clears audio when play stops', () => {
    const { scene } = setup();
    const audio = { play: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
    Object.assign(scene, { patientAudio: audio });
    const fixture = visualFixture('patient-audio')!;
    const calm = fixture.patientsAtTime!(0);
    const critical = fixture.patientsAtTime!(3000);
    const ready = fixture.patientsAtTime!(6000);
    scene.setPatients(calm);
    expect(audio.play).not.toHaveBeenCalled();
    scene.setPatients(critical);
    expect(audio.play).toHaveBeenLastCalledWith(['critical']);
    scene.setPatients([...critical]);
    expect(audio.play).toHaveBeenCalledOnce();
    Object.assign(document, { hidden: true });
    scene.setPatients(ready);
    expect(audio.play).toHaveBeenCalledOnce();
    Object.assign(document, { hidden: false });
    scene.setPatients(ready);
    expect(audio.play).toHaveBeenCalledOnce();
    scene.setPatients(critical);
    scene.setPatients(ready);
    expect(audio.play).toHaveBeenLastCalledWith(['ready']);
    scene.setGameplayActive(false);
    expect(audio.stop).toHaveBeenCalledOnce();
    scene.setPatients(calm);
    scene.setGameplayActive(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
    scene.clearPlayers();
    expect(audio.stop).toHaveBeenCalledTimes(2);
    const shutdown = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'shutdown')![1];
    shutdown();
    expect(audio.dispose).toHaveBeenCalledOnce();
  });

  it('does not send movement or treatment actions while audio controls have keyboard focus', () => {
    const { scene, keyboardListeners } = setup();
    const interact = vi.fn();
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0 }], 'staff');
    scene.setInteractionSender(interact);
    Object.assign(document, { activeElement: { closest: () => ({ id: 'patient-audio' }) } });
    const preventDefault = vi.fn();
    keyboardListeners.get('keydown')!({ code: 'KeyE', repeat: false, preventDefault } as unknown as KeyboardEvent);
    keyboardListeners.get('keydown')!({ code: 'ArrowRight', preventDefault } as unknown as KeyboardEvent);
    expect(interact).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('releases the reduced-motion listener and destroys the HUD on shutdown', () => {
    const { scene, hud, motionPreference } = setup();
    const shutdown = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'shutdown')![1];
    shutdown();
    expect(motionPreference.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(hud.destroy).toHaveBeenCalledOnce();
  });

  it('publishes one brief ready notice on completion, then clears it when play stops', () => {
    const { scene, hudState } = setup();
    const patient = visualFixture('patient-indicators')!.patients[0]!;
    scene.setPatients([patient]);
    scene.update(1000, 0);
    expect(hudState().notice).toBe('');
    const ready = { ...patient, completedTreatments: patient.requiredTreatments };
    scene.setPatients([ready]);
    scene.update(1200, 0);
    expect(hudState().notice).toBe('Pikachu #1 is ready for discharge');
    scene.setPatients([{ ...ready }]);
    scene.update(4200, 0);
    expect(hudState().notice).toBe('');
    scene.setPatients([patient]);
    scene.setPatients([ready]);
    scene.update(4300, 0);
    expect(hudState().notice).not.toBe('');
    scene.setGameplayActive(false);
    expect(hudState()).toMatchObject({ notice: '', active: false });
    scene.update(4400, 0);
    expect(hudState().notice).toBe('');
  });
  it('increases render density while preserving the logical HUD and world framing on resize', () => {
    const viewport = { width: 1920, height: 1080 };
    const { scene, camera, setGameSize, text, resizeViewport, disconnectSize } =
      setup(undefined, true, true, true, viewport);
    expect(setGameSize).toHaveBeenLastCalledWith(1920, 1080);
    expect(camera.setZoom).toHaveBeenLastCalledWith(2);
    expect(camera.centerOn).toHaveBeenLastCalledWith(480, 270);
    expect(text.mock.calls.every((call) => (call[3] as { resolution: number }).resolution === 4)).toBe(true);
    viewport.width = 1280;
    viewport.height = 720;
    resizeViewport();
    expect(setGameSize).toHaveBeenLastCalledWith(1280, 720);
    expect(camera.setZoom).toHaveBeenLastCalledWith(1280 / 960);
    expect(camera.centerOn).toHaveBeenLastCalledWith(480, 270);
    const shutdown = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'shutdown')![1];
    shutdown();
    expect(disconnectSize).toHaveBeenCalledOnce();
  });
  it.each([false, true])('shows urgent HP and a terminal faint effect (3D: %s)', (threeDimensional) => {
    const { scene, container, hudState, anchors } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    if (threeDimensional) Object.assign(scene, { center3D: view });
    const patient = { id: 'urgent', species: 'Pikachu' as const, requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90000, remainingPatienceMs: 9000,
      lifecycle: 'active' as const, location: 'waiting' as const, slotIndex: 0, carrierId: '' };
    scene.setPatients([patient]);
    expect(hudState().patients).toEqual([patient]);
    scene.setPatients([{ ...patient, lifecycle: 'lost', location: 'none', slotIndex: -1,
      remainingPatienceMs: 0, travelKind: 'fainting', travelElapsedMs: 800,
      faintX: 20, faintY: 552, faintElevation: 0.5 }]);
    scene.setLostCount(1);
    scene.update(0, 0);
    expect(hudState().lost).toBe(1);
    expect(anchors().patients.get('urgent')).toEqual(threeDimensional ? { x: 20, y: 552 } :
      { x: mapViewportPoint({ x: 20, y: 552 }).x, y: mapViewportPoint({ x: 20, y: 552 }).y - 24 });
    if (threeDimensional) {
      expect(view.syncCharacters).toHaveBeenLastCalledWith([expect.objectContaining({
        point: { x: 20, y: 552 }, elevation: 0.5, carried: false, patienceRatio: 0, faintProgress: 0.5,
      })], 0);
    } else {
      expect(container.mock.results.at(-1)!.value.setRotation).toHaveBeenCalledWith(-Math.PI / 2);
    }
    scene.setPatients([]);
    scene.update(100, 100);
    if (threeDimensional) expect(view.syncCharacters).toHaveBeenLastCalledWith([], 100);
  });
  it('focuses the patient in front of the player from a full waiting room', () => {
    const { scene, hudState } = setup();
    const fixture = visualFixture('hud-overview')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    expect(hudState().patients).toHaveLength(8);
    expect(hudState().focusedPatientId).toBe(fixture.patients[0]!.id);
    expect(hudState().action).toMatchObject({ key: 'E', label: 'Pick up Pikachu', tone: 'ready' });
  });

  it('keeps the healing patient focused through treatment and clears focus when it leaves', () => {
    const { scene, hudState } = setup();
    const fixture = visualFixture('healing')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    scene.setHealingMachine(fixture.machine);
    expect(hudState().focusedPatientId).toBe(fixture.patients[0]!.id);
    expect(hudState().machines[0]).toMatchObject({ status: 'treating' });
    scene.setHealingMachine({ ...fixture.machine, status: 'completed', remainingMs: 0 });
    scene.setPatients([{ ...fixture.patients[0]!, completedTreatments: TREATMENT.healing }]);
    expect(hudState().focusedPatientId).toBe(fixture.patients[0]!.id);
    scene.setPatients([]);
    expect(hudState().focusedPatientId).toBe('');
  });
  it('keeps a carried patient lying with its head toward the pillow whichever way the carrier turns', () => {
    const { scene } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    Object.assign(scene, { center3D: view });
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Machoke' }], 'red');
    scene.setPatients([{ id: 'patient', species: 'Squirtle', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active', location: 'carrier',
      slotIndex: -1, carrierId: 'red' }]);
    for (const facing of ['left', 'up', 'right', 'down'] as const) {
      scene.setAuthoritativePositions([{ id: 'red', x: 480, y: 375, facing, carriedPatientId: 'patient' }]);
      scene.update(50, 16);
      expect(view.syncCharacters.mock.lastCall![0]).toContainEqual(
        expect.objectContaining({ id: 'patient:patient', carried: true, facing: 'down' }));
    }
  });

  it('seats waiting patients facing into the room and marks them as resting', () => {
    const { scene } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    Object.assign(scene, { center3D: view });
    const seated = { id: 'seated', species: 'Eevee' as const, requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90000, remainingPatienceMs: 90000, lifecycle: 'active' as const,
      location: 'waiting' as const, slotIndex: 2, carrierId: '' };
    scene.setPatients([seated, { ...seated, id: 'machine', location: 'healingMachine', slotIndex: 0 }]);
    scene.update(50, 50);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'patient:seated', facing: 'up', seated: true, moving: false }),
      expect.objectContaining({ id: 'patient:machine', facing: 'down', seated: false }),
    ], 50);
    scene.setPatients([{ ...seated, travelKind: 'arriving', travelElapsedMs: 1000 }]);
    scene.update(100, 50);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'patient:seated', seated: false, moving: true }),
    ], 100);
  });

  it('anchors walking arrivals and departures from authoritative travel', () => {
    const { scene, anchors } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    Object.assign(scene, { center3D: view });
    const arrival = { id: 'arrival', species: 'Pikachu' as const, requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90000, remainingPatienceMs: 90000,
      lifecycle: 'active' as const, location: 'waiting' as const, slotIndex: 0, carrierId: '',
      travelKind: 'arriving' as const, travelElapsedMs: 1000 };
    scene.setPatients([arrival]);
    scene.update(50, 50);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'patient:arrival', facing: 'up', moving: true, elevation: 0.03,
        point: { x: 480, y: 581.9 } }),
    ], 50);
    expect(anchors().patients.get('arrival')).toEqual({ x: 480, y: 581.9 });
    expect(view.project).toHaveBeenCalledWith({ x: 480, y: 581.9 }, 0.03 + 1.45);
    scene.setPatients([{ ...arrival, lifecycle: 'discharged', location: 'none', slotIndex: -1,
      travelKind: 'leaving', travelElapsedMs: 0, completedTreatments: 1 }]);
    scene.update(50, 0);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'patient:arrival', point: { x: 480, y: 334 },
        facing: 'down', moving: true, carried: false }),
    ], 50);
    scene.setPatients([]);
    scene.update(100, 50);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([], 100);
    expect(anchors().patients.size).toBe(0);
  });
  it('forwards disposal confirmations and clears effects when gameplay stops', () => {
    const { scene } = setup();
    const view = { showMedicineDiscard: vi.fn(), clearMedicineDiscards: vi.fn(), setTarget: vi.fn() };
    Object.assign(scene, { center3D: view });
    const event = { roundId: 'round', doseId: 'dose', kind: 'antidote' as const };
    scene.showMedicineDiscard(event);
    expect(view.showMedicineDiscard).toHaveBeenCalledWith(event);
    scene.setInteractionResult({ ok: false, reason: 'Target out of range' });
    expect(view.showMedicineDiscard).toHaveBeenCalledOnce();
    scene.setGameplayActive(false);
    expect(view.clearMedicineDiscards).toHaveBeenCalledOnce();
  });
  it('plays the disposal preview once per cycle using both medicines', () => {
    vi.stubGlobal('location', { search: '?artFixture=medicine-disposal-fx' });
    const { scene } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn(),
      showMedicineDiscard: vi.fn() };
    Object.assign(scene, { center3D: view });
    scene.update(0, 16);
    scene.update(300, 16);
    scene.update(2400, 16);
    expect(view.showMedicineDiscard.mock.calls.map(([event]) => event.kind)).toEqual(['burnHeal', 'antidote']);
  });

  it('passes the frame clock and moving carriers to the medicine sway preview', () => {
    vi.stubGlobal('location', { search: '?artFixture=medicine-sway' });
    const { scene } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    Object.assign(scene, { center3D: view });
    const fixture = visualFixture('medicine-sway')!;
    for (const time of [0, 1000, 2000, 2500, 4000]) {
      scene.update(time, 70);
      expect(view.syncMedicines).toHaveBeenLastCalledWith(fixture.medicineDoses,
        new Map(fixture.positionsAtTime!(time).map(({ id, x, y }) => [id, { x, y }])), time);
    }
  });

  it('initializes dose ownership and occupied surfaces in the medicine bottle preview', () => {
    vi.stubGlobal('location', { search: '?artFixture=medicine-bottles' });
    const { scene } = setup();
    const state = scene as unknown as { medicineDoses: unknown[]; medicineSurfaces: string[] };
    expect(state.medicineDoses).toEqual(visualFixture('medicine-bottles')!.medicineDoses);
    expect(state.medicineSurfaces).toEqual(['surface-0', 'surface-1', 'surface-2', 'surface-3']);
  });
  it('advances the development transport preview through walking and pauses', () => {
    const { scene } = setup();
    const fixture = visualFixture('transport-sway')!;
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    Object.assign(scene, { center3D: view, fixturePositionsAtTime: fixture.positionsAtTime });
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    for (const [time, x] of [[0, 400], [1000, 480], [2000, 560], [2500, 560], [4000, 480]]) {
      scene.update(time!, 70);
      expect(view.syncCharacters).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 'player:fixture-staff', point: { x, y: 375 } }),
        expect.objectContaining({ id: 'patient:fixture-patient', point: { x, y: 375 }, carried: true }),
      ], time);
    }
  });
  it('sends authoritative positions and interaction targets to the playable 3D view', () => {
    const { scene, sprite, anchors } = setup();
    const view = {
      project: vi.fn((point: { x: number; y: number }) => ({ x: point.x + 10, y: point.y + 20 })),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn(),
    };
    (scene as unknown as { center3D: typeof view }).center3D = view;
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0, character: 'Chansey' }], 'staff');
    scene.setAuthoritativePositions([{ id: 'staff', x: 348, y: 344, facing: 'up',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.setPatients([{ id: 'arrival', species: 'Pikachu', requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    scene.setMedicines([{ id: 'dose', kind: 'burnHeal', location: 'surface',
      carrierId: '', slotIndex: 0 }], ['dose', '', '', ''], ['', ''], [0, 0]);
    scene.update(100, 70);
    expect(view.setTarget).toHaveBeenLastCalledWith({ x: 348, y: 334 });
    expect(view.syncCharacters).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'player:staff', species: 'Chansey',
        point: { x: 348, y: 344 }, facing: 'up', elevation: 0.03 }),
      expect.objectContaining({ id: 'patient:arrival', species: 'Pikachu',
        point: { x: 348, y: 290 }, elevation: 0.93 }),
    ], 100);
    expect(view.syncMedicines).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'dose' }),
    ], new Map([['staff', { x: 348, y: 344 }]]), 100);
    expect(view.render).toHaveBeenCalledOnce();
    expect(anchors().players.get('staff')).toEqual({ x: 358, y: 364 });
    expect(anchors().patients.get('arrival')).toEqual({ x: 358, y: 310 });
    expect(anchors().machines).toHaveLength(2);
    expect(anchors().preparation).toHaveLength(2);
    expect(anchors().discharge).toEqual({ x: 490, y: 310 });
    expect(view.render).toHaveBeenLastCalledWith(100, ['empty', 'empty'], ['', ''],
      [expect.objectContaining({ id: 'arrival', location: 'reception', slotIndex: 0 })]);
    for (const status of ['treating', 'completed', 'broken', 'empty'] as const) {
      scene.setHealingMachine({ patientId: 'arrival', status, remainingMs: 0 });
      scene.update(200, 16);
      expect(view.render).toHaveBeenLastCalledWith(200, [status, 'empty'], ['', ''],
        [expect.objectContaining({ id: 'arrival' })]);
    }
    for (const owners of [['staff', ''], ['', 'staff'], ['staff', 'other'], ['', '']]) {
      scene.setMedicines([], ['', '', '', ''], owners, [1000, 1000]);
      scene.update(300, 16);
      expect(view.render).toHaveBeenLastCalledWith(300, ['empty', 'empty'], owners,
        [expect.objectContaining({ id: 'arrival' })]);
    }
    scene.setPatients([]);
    scene.update(400, 16);
    expect(view.render).toHaveBeenLastCalledWith(400, ['empty', 'empty'], ['', ''], []);
    expect(sprite).not.toHaveBeenCalled();
  });

  it('does not interpolate a character through a station after a delayed position update', () => {
    const { scene } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    (scene as unknown as { center3D: typeof view }).center3D = view;
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0, character: 'Audino' }], 'staff');
    const first = { x: 412, y: 344 };
    const second = { x: 348, y: 210 };
    expect(isWalkable(first)).toBe(true);
    expect(isWalkable(second)).toBe(true);
    expect(isWalkable({ x: 380, y: 277 })).toBe(false);
    scene.setAuthoritativePositions([{ id: 'staff', ...first, facing: 'up',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.update(100, 70);
    scene.setAuthoritativePositions([{ id: 'staff', ...second, facing: 'left',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.update(150, 35);
    expect(view.syncCharacters.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({ id: 'player:staff', point: second }),
    ]);
  });
  it('anchors player labels above the 2D avatars, higher while carrying a patient', () => {
    const { scene, anchors } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' },
      { id: 'blue', name: 'Blue', slot: 1, character: 'Audino' }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 456, y: 190, facing: 'up', carriedPatientId: 'patient' },
      { id: 'blue', x: 504, y: 190, facing: 'up', carriedPatientId: '' }]);
    scene.update(0, 70);
    const red = mapViewportPoint({ x: 456, y: 190 });
    const blue = mapViewportPoint({ x: 504, y: 190 });
    expect(anchors().players.get('red')).toEqual({ x: red.x, y: red.y - 77 });
    expect(anchors().players.get('blue')).toEqual({ x: blue.x, y: blue.y - 31 });
    expect(anchors().machines[0]).toEqual({ x: mapViewportPoint({ x: 50, y: 0 }).x, y: mapViewportPoint({ x: 50, y: 0 }).y - 34 });
  });
  it('does not accept gameplay input before the round and updates a selected character', () => {
    const { scene, container, containers, keyboardListeners } = setup();
    const sendInput = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' }], 'red');
    scene.setInputSender(sendInput);
    scene.setGameplayActive(false);
    keyboardListeners.get('keydown')?.({ code: 'KeyD', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    scene.update(0, 50);
    expect(sendInput).not.toHaveBeenCalled();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Audino' }], 'red');
    expect(containers[0]?.destroy).toHaveBeenCalledOnce();
    expect(container).toHaveBeenCalledTimes(2);
    scene.setGameplayActive(true);
    keyboardListeners.get('keydown')?.({ code: 'KeyD', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    scene.update(50, 50);
    expect(sendInput).toHaveBeenCalledWith('right', false, false);
  });
  it('renders all six patient species from a validated local sprite fixture', () => {
    const names = ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck'] as const;
    const ids = ['0025', '0001', '0004', '0007', '0133', '0054'];
    const manifest: SpriteManifest = { source: 'fixture', species: names.map((name, index) => ({
      name, id: ids[index]!, credits: 'Artist', idle: { frameWidth: 16, frameHeight: 24,
        durations: [4, 8], directions: 8, image: `${ids[index]}/Idle-Anim.png` },
    })) };
    const { scene, sprite } = setup(manifest);
    scene.setPatients(names.map((name, index) => ({
      id: String(index), species: name, requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active' as const, location: index < 4 ? 'reception' as const : 'waiting' as const,
      slotIndex: index < 4 ? index : index - 4, carrierId: '',
    })));
    expect(sprite.mock.calls.map((call) => call[2])).toEqual(names.map((name) => `${name}:idle`));
  });
  it('lays a carried patient down with its head on the 2D stretcher pillow and loads that pose', () => {
    const sheet = (id: string, name: string) => ({ frameWidth: 24, frameHeight: 24, durations: [12], directions: 8,
      image: `${id}/${name}-Anim.png` });
    const manifest: SpriteManifest = { source: 'fixture', species: [
      { name: 'Pikachu', id: '0025', credits: 'Artist', idle: sheet('0025', 'Idle'), laying: sheet('0025', 'Laying') },
      { name: 'Chansey', id: '0113', credits: 'Artist', idle: sheet('0113', 'Idle') },
    ] };
    const { scene, sprite } = setup(manifest);
    expect(vi.mocked(scene.load.spritesheet)).toHaveBeenCalledWith('Pikachu:laying',
      '/assets/external/pmd/0025/Laying-Anim.png', { frameWidth: 24, frameHeight: 24 });
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 470, y: 178, facing: 'right', carriedPatientId: 'patient' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active', location: 'carrier',
      slotIndex: -1, carrierId: 'red' }]);
    const patientSprite = sprite.mock.results.find(({ value }) => value.key === 'Pikachu:idle')!.value;
    expect(patientSprite.play).toHaveBeenLastCalledWith('Pikachu:laying:down');
    scene.update(50, 70);
    // The carrier faces right, but the patient keeps the row whose head rests on the pillow.
    expect(patientSprite.play).toHaveBeenLastCalledWith('Pikachu:laying:down');
    expect(patientSprite.play).not.toHaveBeenCalledWith('Pikachu:laying:right');
  });

  it('keeps differently sized PMD frames at native pixel scale', () => {
    const manifest: SpriteManifest = { source: 'fixture', species: [
      { name: 'Pikachu', id: '0025', credits: 'Artist', idle: { frameWidth: 40,
        frameHeight: 56, durations: [4], directions: 8, image: '0025/Idle-Anim.png' } },
      { name: 'Chansey', id: '0113', credits: 'Artist', idle: { frameWidth: 24,
        frameHeight: 40, durations: [4], directions: 8, image: '0113/Idle-Anim.png' } },
    ] };
    const { scene, sprite, setFilter } = setup(manifest);
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0, character: 'Chansey' }], 'staff');
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(sprite.mock.calls.map((call) => call[2])).toEqual(['Chansey:idle', 'Pikachu:idle']);
    expect(setFilter).toHaveBeenCalledTimes(2);
    expect(setFilter.mock.calls).toEqual([[0], [0]]);
    for (const result of sprite.mock.results) {
      expect(result.value.setScale).toHaveBeenCalledWith(1);
    }
  });
  it('starts and releases a medicine hold and renders synchronized doses', () => {
    const { scene, keyboardListeners, container } = setup();
    const sendInput = vi.fn();
    const interact = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInputSender(sendInput);
    scene.setInteractionSender(interact);
    scene.setAuthoritativePositions([{ id: 'red', x: 400, y: 70, facing: 'down',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.setMedicines([], ['', '', '', ''], ['', ''], [0, 0]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(interact).toHaveBeenCalledWith({ targetId: 'medicine:prep:0', expectedOccupantId: '' });
    expect(sendInput).toHaveBeenLastCalledWith(null, true, false);
    scene.update(100, 50);
    expect(sendInput).toHaveBeenLastCalledWith(null, true, false);
    keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
    expect(sendInput).toHaveBeenLastCalledWith(null, false, false);
    scene.setMedicines([{ id: 'dose-1', kind: 'burnHeal', location: 'carrier',
      carrierId: 'red', slotIndex: -1 }], ['', '', '', ''], ['', ''], [0, 0]);
    expect(container).toHaveBeenCalledTimes(2);
    scene.setMedicines([], ['', '', '', ''], ['', ''], [0, 0]);
  });

  it('publishes machine and preparation snapshots, keeping each healing duration', () => {
    const { scene, hudState } = setup();
    scene.setHealingMachine({ patientId: 'patient', status: 'treating', remainingMs: 2_000, durationMs: 2_857 },
      { patientId: '', status: 'broken', remainingMs: 3_000, repairOwnerId: 'red', repairRemainingMs: 1_000 });
    expect(hudState().machines).toEqual([
      { patientId: 'patient', status: 'treating', remainingMs: 2_000, durationMs: 2_857,
        repairOwnerId: undefined, repairRemainingMs: undefined },
      { patientId: '', status: 'broken', remainingMs: 3_000, durationMs: undefined,
        repairOwnerId: 'red', repairRemainingMs: 1_000 },
    ]);
    scene.setMedicines([], ['', '', '', ''], ['red', ''], [1_000, 0]);
    expect(hudState()).toMatchObject({ medicineOwners: ['red', ''], medicineRemainingMs: [1_000, 0] });
    scene.clearPlayers();
    expect(hudState().machines.map((machine) => machine.status)).toEqual(['empty', 'empty']);
  });
  it('renders a browser QA fixture through the real scene in development', () => {
    vi.stubGlobal('location', { search: '?artFixture=repair' });
    const { container, hudState } = setup();
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 50, y: 0 })), expect.any(Array));
    expect(hudState().machines[0]).toMatchObject({ status: 'broken', repairOwnerId: 'fixture-staff' });
    expect(hudState().action).toMatchObject({ label: 'Repairing outage', tone: 'hold', progress: 0.5 });
  });
  it('explains why a player carrying a patient cannot repair an outage', () => {
    const { scene, hudState } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 182, y: 0, facing: 'left',
      carriedPatientId: 'patient' }]);
    scene.setHealingMachine({ patientId: '', status: 'broken', remainingMs: 0 });
    expect(hudState().action).toMatchObject({ key: 'E', label: 'Empty hands to repair outage', tone: 'blocked' });
  });
  it('shows a first-use tip until the player performs that action', () => {
    const { scene, keyboardListeners, hudState } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setGameplayActive(true);
    const send = vi.fn();
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 182, y: 0, facing: 'left', carriedPatientId: '' }]);
    scene.setHealingMachine({ patientId: '', status: 'broken', remainingMs: 0 });
    expect(hudState().tip).toBe(HINT_TEXT.repair);
    scene.setInteractionResult({ ok: false, reason: 'Repair in progress' });
    expect(hudState().tip).toBe('');
    scene.setInteractionResult({ ok: true, reason: '' });
    expect(hudState().tip).toBe(HINT_TEXT.repair);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
    expect(send).toHaveBeenCalledWith({ targetId: 'healing:0', expectedOccupantId: '' });
    scene.setHealingMachine({ patientId: '', status: 'broken', remainingMs: 0 });
    expect(hudState().tip).toBe('');
  });
  it('uses Q for the local Pokémon ability on a seated patient and shows its progress', () => {
    const { scene, keyboardListeners, hudState } = setup();
    const ability = vi.fn();
    const input = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' }], 'red');
    scene.setGameplayActive(true);
    scene.setAbilitySender(ability);
    scene.setInputSender(input);
    const seat = WAITING_INTERACTION_POINTS[0]!;
    scene.setPatients([{ id: 'patient-1', species: 'Eevee', requiredTreatments: TREATMENT.healing,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 60_000, lifecycle: 'active',
      location: 'waiting', slotIndex: 0, carrierId: '' }]);
    scene.setAuthoritativePositions([{ id: 'red', x: seat.x, y: seat.y - 12, facing: 'down', carriedPatientId: '' }]);
    expect(hudState().action).toMatchObject({ key: 'E', label: 'Pick up Eevee', ability: 'Soft-Boiled' });
    keyboardListeners.get('keydown')!({ code: 'KeyQ', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    keyboardListeners.get('keydown')!({ code: 'KeyQ', repeat: true, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(ability).toHaveBeenCalledOnce();
    expect(ability).toHaveBeenCalledWith({ targetId: 'waiting:0', expectedOccupantId: 'patient-1' });
    expect(input).toHaveBeenLastCalledWith(null, false, true);
    scene.setAuthoritativePositions([{ id: 'red', x: seat.x, y: seat.y - 12, facing: 'down', carriedPatientId: '',
      abilityRemainingMs: 1500 }]);
    expect(hudState().action).toEqual({ key: 'Q', label: 'Soft-Boiled · 2s', tone: 'hold', progress: 0.5, ability: '' });
    keyboardListeners.get('keyup')!({ code: 'KeyQ' } as KeyboardEvent);
    expect(input).toHaveBeenLastCalledWith(null, false, false);

    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Machoke' }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: seat.x, y: seat.y - 12, facing: 'down', carriedPatientId: '' }]);
    expect(hudState().action).toMatchObject({ label: 'Pick up Eevee', ability: '' });
    keyboardListeners.get('keydown')!({ code: 'KeyQ', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(ability).toHaveBeenCalledOnce();
    expect(hudState().action).toMatchObject({ key: null, label: 'This Pokémon has no special ability', tone: 'rejected' });
  });

  it('labels rejected interactions and clears the rejection when target changes', () => {
    const { scene, hudState } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 348, y: 344, facing: 'up',
      carriedPatientId: '' }]);
    scene.setInteractionResult({ ok: false, reason: 'Patient already claimed or removed' });
    expect(hudState().action).toMatchObject({ label: 'Patient already claimed or removed', tone: 'rejected' });
    scene.setAuthoritativePositions([{ id: 'red', x: 456, y: 190, facing: 'up',
      carriedPatientId: '' }]);
    expect(hudState().action.tone).not.toBe('rejected');
    scene.setAuthoritativePositions([{ id: 'red', x: 700, y: 400, facing: 'up', carriedPatientId: '' }]);
    expect(hudState().action).toEqual({ key: null, label: 'Approach a station or patient', tone: 'idle',
      progress: 0, ability: '' });
  });
  it('targets a stationary patient for medicine and shows the pending condition', () => {
    const { scene, keyboardListeners, hudState } = setup();
    const interact = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(interact);
    scene.setAuthoritativePositions([{ id: 'red', x: 348, y: 344, facing: 'up',
      carriedPatientId: '', carriedMedicineId: 'dose-1' }]);
    scene.setMedicines([{ id: 'dose-1', kind: 'burnHeal', location: 'carrier',
      carrierId: 'red', slotIndex: -1 }], ['', '', '', ''], ['', ''], [0, 0]);
    scene.setPatients([{ id: 'patient-1', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(hudState()).toMatchObject({ focusedPatientId: 'patient-1',
      action: { label: 'Apply Burn Heal to Pikachu', tone: 'ready' } });
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(interact).toHaveBeenCalledWith({ targetId: 'medicine:apply:reception:0',
      expectedOccupantId: 'patient-1' });
  });
  it('renders original center art with distinct PMD avatars', () => {
    const { scene, image, text, container } = setup();
    expect(image).toHaveBeenCalledWith(480, 270, 'center-floor');
    expect(image).toHaveBeenCalledWith(480, 270, 'center-fixtures');
    expect(image.mock.results[0]?.value.setDepth).toHaveBeenCalledWith(-2);
    expect(image.mock.results[1]?.value.setDepth).toHaveBeenCalledWith(-1);
    expect(text.mock.calls.some((call) => call[2] === 'RECEPTION' || call[2] === 'POKÉCENTER')).toBe(false);

    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'red');
    expect(container).toHaveBeenCalledTimes(2);
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 456, y: 190 })));
    expect(container.mock.calls[1]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 504, y: 190 })));
  });
  it('uses the provisional geometry if the original map texture is unavailable', () => {
    const { image, graphics } = setup(undefined, false);
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-floor');
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-fixtures');
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
  });

  it('does not render a partial environment when the fixture layer is missing', () => {
    const { image, graphics } = setup(undefined, true, true, false);
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-floor');
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
  });

  it('sends local input and renders server positions for both avatars', () => {
    const { scene, containers, keyboardListeners, windowListeners } = setup();
    const sendInput = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'red');
    scene.setInputSender(sendInput);
    const preventDefault = vi.fn();
    keyboardListeners.get('keydown')?.({ code: 'KeyD', preventDefault } as unknown as KeyboardEvent);
    scene.update(0, 16);
    expect(preventDefault).toHaveBeenCalled();
    expect(sendInput).toHaveBeenCalledWith('right', false, false);
    scene.setAuthoritativePositions([
      { id: 'red', x: 470, y: 190, facing: 'right', carriedPatientId: '' },
      { id: 'blue', x: 518, y: 190, facing: 'left', carriedPatientId: '' },
    ]);
    scene.update(50, 70);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 470, y: 190 })));
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 518, y: 190 })));

    windowListeners.get('blur')?.();
    expect(sendInput).toHaveBeenLastCalledWith(null, false, false);
    scene.clearPlayers();
    expect(containers[0]?.destroy).toHaveBeenCalled();
    expect(containers[1]?.destroy).toHaveBeenCalled();
  });

  it('ignores movement while typing a room code', () => {
    const { scene, containers, keyboardListeners, InputElement } = setup();
    const sendInput = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInputSender(sendInput);
    (document as unknown as { activeElement: unknown }).activeElement = new InputElement();
    keyboardListeners.get('keydown')?.({ code: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    scene.update(0, 100);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 456, y: 190 })));
    expect(sendInput).not.toHaveBeenCalled();
  });

  it('reuses a vacated avatar slot without duplicating another player', () => {
    const { scene, container, containers } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'blue');
    scene.setPlayers([{ id: 'blue', name: 'Blue', slot: 1 }, { id: 'green', name: 'Green', slot: 0 }], 'blue');
    expect(container).toHaveBeenCalledTimes(3);
    expect(container.mock.calls[2]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 456, y: 190 })));
    expect(containers[0]?.destroy).toHaveBeenCalledOnce();
    expect(containers[1]?.destroy).not.toHaveBeenCalled();
  });

  it('uses an authoritative snapshot received before the roster', () => {
    const { scene, container } = setup();
    scene.setPlayers([], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 480, y: 190, facing: 'up', carriedPatientId: '' }]);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 480, y: 190 })));
  });

  it('renders and removes a synchronized reception patient', () => {
    const { scene, container, containers } = setup();
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 348, y: 290 })), expect.any(Array));
    scene.setPatients([]);
    expect(containers[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('keeps the carried patient attached to its carrier and raises the player label', () => {
    const { scene, image, containers, hudState, anchors } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 470, y: 178, facing: 'right',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    scene.update(50, 70);
    expect(image).toHaveBeenCalledWith(0, 9, 'stretcher');
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 470, y: 178 })));
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(mapViewportPoint({ x: 470, y: 178 }).x,
      mapViewportPoint({ x: 470, y: 178 }).y - 28);
    const carrier = mapViewportPoint({ x: 470, y: 178 });
    expect(anchors().players.get('red')).toEqual({ x: carrier.x, y: carrier.y - 77 });
    expect(anchors().patients.get('patient-1')).toEqual({ x: carrier.x, y: carrier.y - 52 });
    expect(hudState().focusedPatientId).toBe('patient-1');
  });

  it('clears the focused patient when it leaves the scene', () => {
    const { scene, hudState } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 348, y: 344, facing: 'up',
      carriedPatientId: '' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: TREATMENT.burnHeal, initialPatienceMs: 90_000,
      remainingPatienceMs: 22_500, lifecycle: 'active', location: 'reception',
      slotIndex: 0, carrierId: '' }]);
    expect(hudState().focusedPatientId).toBe('patient');
    scene.setPatients([]);
    expect(hudState().focusedPatientId).toBe('');
    expect(hudState().action.label).toBe('No patient');
  });

  it('uses one original bottle with a readable condition mark for each dose', () => {
    const { scene, image, text } = setup();
    scene.setMedicines([
      { id: 'burn', kind: 'burnHeal', location: 'surface', slotIndex: 0, carrierId: '' },
      { id: 'poison', kind: 'antidote', location: 'surface', slotIndex: 1, carrierId: '' },
    ], ['burn', 'poison', '', ''], ['', ''], [0, 0]);
    expect(image.mock.calls.filter((call) => call[2] === 'medicine-bottle')).toHaveLength(2);
    expect(text).toHaveBeenCalledWith(0, 3, 'B', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, 3, 'A', expect.any(Object));
  });

  it('retains equipment markers if an original texture is missing', () => {
    const { scene, image, rectangle } = setup(undefined, true, false);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'carrier', slotIndex: -1, carrierId: 'red' }]);
    scene.setMedicines([{ id: 'dose', kind: 'burnHeal', location: 'surface',
      slotIndex: 0, carrierId: '' }], ['dose', '', '', ''], ['', ''], [0, 0]);
    expect(image).not.toHaveBeenCalledWith(0, 9, 'stretcher');
    expect(image).not.toHaveBeenCalledWith(0, 0, 'medicine-bottle');
    expect(rectangle).toHaveBeenCalledWith(0, 9, 42, 16, 0xe7e3d3);
    expect(rectangle).toHaveBeenCalledWith(0, 0, 16, 24, 0xf28d66);
  });

  it('sends one contextual pickup request per E press with the expected patient', () => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 348, y: 344, facing: 'up', carriedPatientId: '' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    }]);
    scene.setInteractionSender(send);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: true, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ targetId: 'reception:0', expectedOccupantId: 'patient-1' });
  });

  it.each([0, 4, 7])('selects empty waiting seat %s while carrying and only the recovery front when empty-handed', (slotIndex) => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    const seat = WAITING_INTERACTION_POINTS[slotIndex]!;
    scene.setAuthoritativePositions([{ id: 'red', x: seat.x, y: seat.y - 12, facing: 'down',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: `waiting:${slotIndex}`, expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 888, y: 234, facing: 'down', carriedPatientId: '' }]);
    scene.setPatients([
      { id: 'patient-2', species: 'Eevee', requiredTreatments: 1, completedTreatments: 0,
        initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
        location: 'recovery', slotIndex: 0, carrierId: '' },
      { id: 'patient-3', species: 'Psyduck', requiredTreatments: 1, completedTreatments: 0,
        initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
        location: 'recovery', slotIndex: 1, carrierId: '' },
    ]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'recovery', expectedOccupantId: 'patient-2' });
  });

  it('keeps an occupied waiting slot selected rather than placing in a neighboring empty slot', () => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 38, y: 480, facing: 'down',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-2', species: 'Eevee', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'waiting', slotIndex: 0, carrierId: '',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenCalledWith({ targetId: 'waiting:0', expectedOccupantId: 'patient-2' });
  });

  it('targets healing placement, completed pickup, and discharge in sequence', () => {
    const { scene, keyboardListeners, container } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 182, y: 0, facing: 'left',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 182, y: 0, facing: 'left', carriedPatientId: '' }]);
    scene.setHealingMachine({ patientId: 'patient-1', status: 'completed', remainingMs: 0 });
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 1,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'healingMachine', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 50, y: 0 })), expect.any(Array));
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: 'patient-1' });

    scene.setAuthoritativePositions([{ id: 'red', x: 480, y: 340, facing: 'down',
      carriedPatientId: 'patient-1' }]);
    scene.setHealingMachine({ patientId: '', status: 'empty', remainingMs: 0 });
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 1,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'discharge', expectedOccupantId: 'patient-1' });
  });

  it('shows the synchronized discharge count', () => {
    const { scene, hudState } = setup();
    scene.setDischargedCount(1);
    scene.setLostCount(2);
    expect(hudState()).toMatchObject({ discharged: 1, lost: 2 });
  });
});

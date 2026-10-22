import { afterEach, describe, expect, it, vi } from 'vitest';
import { TREATMENT, isWalkable } from '@pokecenter/shared';

vi.mock('phaser', () => ({ default: { Scene: class {}, Textures: { FilterMode: { NEAREST: 0 } } } }));

import { MapScene } from './MapScene.js';
import { mapViewportPoint } from './mapViewport.js';
import { visualFixture } from './visualFixtures.js';
import type { SpriteManifest } from '../sprites/pmd.js';

function setup(manifest?: SpriteManifest, mapArt = true, equipmentArt = true,
  fixtureArt = mapArt, iconArt = true, viewport?: { width: number; height: number },
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
  const hudContainers: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  const newContainer = () => ({ setPosition: vi.fn(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn(),
    setAlpha: vi.fn().mockReturnThis(), setRotation: vi.fn().mockReturnThis() });
  const hudContainer = vi.fn<(...args: unknown[]) => ReturnType<typeof newContainer>>(() => {
    const value = newContainer();
    hudContainers.push(value);
    return value;
  });
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
    add: { graphics: vi.fn(() => graphics), image, text, rectangle, container: (x: number, y: number, children: unknown[]) =>
      x === 0 && y === 0 ? hudContainer(x, y, children) : container(x, y, children), sprite },
    scale: { setGameSize }, cameras: { main: camera },
    cache: { json: { get: vi.fn(() => manifest) } },
    load: { image: vi.fn(), json: vi.fn(), spritesheet: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => {
      onLoadComplete = callback;
    }), start: vi.fn(() => onLoadComplete()) },
    textures: { get: vi.fn(() => ({ setFilter })), exists: vi.fn((key: string) => key === 'center-floor' ? mapArt :
      key === 'center-fixtures' ? fixtureArt :
      key === 'stretcher' || key === 'medicine-bottle' ? equipmentArt :
        key.startsWith('icon-') ? iconArt : true) },
    anims: { create: vi.fn(), exists: vi.fn(() => true) },
    input: { keyboard: {
      on: vi.fn((type: string, listener: (event: KeyboardEvent) => void) => keyboardListeners.set(type, listener)),
      off: vi.fn(),
    } },
    events: { once: vi.fn() },
    sys: { isActive: () => true },
  });
  if (initialRound) scene.setRoundProgress(...initialRound);
  scene.preload();
  scene.create();
  return { scene, image, graphics, text, rectangle, container, containers, sprite, keyboardListeners, windowListeners,
    documentListeners, InputElement, hudContainer, hudContainers, camera, setGameSize, setFilter, resizeViewport, disconnectSize,
    motionPreference, setReducedMotion: (value: boolean) => { motionPreference.matches = value; motionChanged(); } };
}

afterEach(() => vi.unstubAllGlobals());

describe('MapScene', () => {
  it('targets the right machine for repair and medication', () => {
    const { scene, keyboardListeners, text } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setGameplayActive(true);
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 795, y: 33, facing: 'down', carriedPatientId: '' }]);
    const patient = { id: 'right-patient', species: 'Eevee' as const, requiredTreatments: 5,
      completedTreatments: 1, initialPatienceMs: 90000, remainingPatienceMs: 40000,
      lifecycle: 'active' as const, location: 'healingMachine' as const, slotIndex: 1, carrierId: '' };
    scene.setPatients([patient]);
    scene.setHealingMachine({ patientId: '', status: 'empty', remainingMs: 0 },
      { patientId: patient.id, status: 'broken', remainingMs: 0 });
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:1', expectedOccupantId: patient.id });
    expect(text.mock.results.some(({ value }) => value.setText.mock.calls.some(
      (call: string[]) => call[0] === 'Hold E: repair outage'))).toBe(true);
    keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
    scene.setMedicines([{ id: 'dose', kind: 'antidote', location: 'carrier', carrierId: 'red', slotIndex: -1 }],
      [], [], []);
    scene.setAuthoritativePositions([{ id: 'red', x: 795, y: 33, facing: 'left', carriedPatientId: '', carriedMedicineId: 'dose' }]);
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
    const { text } = setup(undefined, true, true, true, true, undefined, [0, 325]);
    expect(text.mock.calls.some((call) => call[2] === '0:00 · SCORE: 325')).toBe(true);
    expect(text.mock.calls.some((call) => call[2] === '6:00 · SCORE: 0')).toBe(false);
  });

  it('shows the synchronized clock and score and clears them when leaving a room', () => {
    const { scene, text } = setup();
    const clock = text.mock.results.map((result) => result.value).find((value) => value.content === '6:00 · SCORE: 0')!;
    scene.setRoundProgress(29999, -50);
    expect(clock.setText).toHaveBeenLastCalledWith('0:30 · SCORE: -50');
    scene.setRoundProgress(0, 325);
    expect(clock.setText).toHaveBeenLastCalledWith('0:00 · SCORE: 325');
    scene.clearPlayers();
    expect(clock.setText).toHaveBeenLastCalledWith('6:00 · SCORE: 0');
  });

  it.each([
    { id: 'reception:0', position: { x: 177, y: 208 } },
    { id: 'reception:1', position: { x: 369, y: 208 } },
    { id: 'reception:2', position: { x: 561, y: 208 } },
    { id: 'reception:3', position: { x: 690, y: 208 } },
    { id: 'discharge', position: { x: 840, y: 356 } },
    { id: 'discharge', position: { x: 942, y: 282 } },
    { id: 'waiting:0', position: { x: 18, y: 605 } },
    { id: 'waiting:3', position: { x: 386, y: 605 } },
    { id: 'waiting:4', position: { x: 694, y: 605 } },
    { id: 'waiting:7', position: { x: 1062, y: 605 } },
    ...[130, 184, 238, 292, 806, 860, 914, 968].flatMap((x, index) =>
      [533, 689].map((y) => ({ id: `waiting:${index}`, position: { x, y } }))),
    { id: 'healing:1', position: { x: 872, y: 113 } },
    { id: 'recovery', position: { x: 960, y: 269 } },
    { id: 'recovery', position: { x: 694, y: 185 } },
    { id: 'recovery', position: { x: 1062, y: 185 } },
    { id: 'medicine:prep:0', position: { x: 400, y: -76 } },
    { id: 'medicine:prep:0', position: { x: 278, y: 15 } },
    { id: 'medicine:prep:1', position: { x: 560, y: -76 } },
    { id: 'medicine:prep:1', position: { x: 682, y: 15 } },
    { id: 'medicine:disposal', position: { x: 480, y: -76 } },
    { id: 'medicine:disposal', position: { x: 480, y: 106 } },
    ...[390, 450, 510, 570].map((x, index) => ({ id: `medicine:surface:${index}`, position: { x, y: 149 } })),
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
    { id: 'reception:0', position: { x: 177, y: 208 }, location: 'reception' as const, index: 0 },
    { id: 'waiting:7', position: { x: 968, y: 689 }, location: 'waiting' as const, index: 7 },
    { id: 'recovery', position: { x: 1062, y: 185 }, location: 'recovery' as const, index: 0 },
  ])('keeps the patient target and medicine action at $id reachable from $position', ({ id, position, location, index }) => {
    const { scene, keyboardListeners, text } = setup();
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
    expect(text.mock.results.some(({ value }) => value.setText.mock.calls.some(
      ([label]: string[]) => label === 'E: Apply Burn Heal to Pikachu'))).toBe(true);
  });

  it.each([
    { position: { x: 40, y: -66 }, perimeter: { x: 40, y: -42 } },
    { position: { x: 40, y: 131 }, perimeter: { x: 40, y: 107 } },
    { position: { x: -102, y: 33 }, perimeter: { x: -78, y: 33 } },
    { position: { x: 181, y: 33 }, perimeter: { x: 157, y: 33 } },
    { position: { x: -102, y: -66 }, perimeter: { x: -78, y: -42 } },
    { position: { x: 181, y: 131 }, perimeter: { x: 157, y: 107 } },
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

  it.each([{ x: 40, y: 156 }, { x: 206, y: 33 }, { x: 40, y: 33 }])(
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
  it('pulses critical outlines in the world and roster while keeping values fully readable', () => {
    const { scene, rectangle, text, setReducedMotion, motionPreference } = setup();
    const fixture = visualFixture('patient-indicators')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    scene.update(900, 0);
    const worldOutline = rectangle.mock.results.filter(({ value }) => value.width === 28 && value.height === 16)[0]!.value;
    const rowOutline = rectangle.mock.results.filter(({ value }) => value.x === 24 && value.y === 127).at(-1)!.value;
    expect(worldOutline.setAlpha).toHaveBeenLastCalledWith(0.55);
    expect(rowOutline.setAlpha).toHaveBeenLastCalledWith(0.55);
    const hpText = text.mock.results.find(({ value }) => value.x === 492 && value.y === 516)!.value;
    expect(hpText.setAlpha).not.toHaveBeenCalled();
    setReducedMotion(true);
    scene.update(900, 0);
    expect(worldOutline.setAlpha).toHaveBeenLastCalledWith(1);
    expect(rowOutline.setAlpha).toHaveBeenLastCalledWith(1);
    const shutdown = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'shutdown')![1];
    shutdown();
    expect(motionPreference.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('pulses discharge arrows and shows one brief notice on completion, then clears it when play stops', () => {
    const { scene, text, image } = setup();
    const patient = visualFixture('patient-indicators')!.patients[0]!;
    scene.setPatients([patient]);
    scene.update(1000, 0);
    const ready = { ...patient, completedTreatments: patient.requiredTreatments };
    scene.setPatients([ready]);
    scene.update(1200, 0);
    const notice = text.mock.results.find(({ value }) => value.x === 480 && value.y === 92)!.value;
    expect(notice.setText).toHaveBeenLastCalledWith('> PIKACHU #1 READY FOR DISCHARGE');
    expect(notice.setVisible).toHaveBeenLastCalledWith(true);
    const arrow = image.mock.results.filter(({ value }) => value.key === 'icon-ready').at(-1)!.value;
    expect(arrow.setAlpha).toHaveBeenLastCalledWith(0.65);
    scene.setPatients([{ ...ready }]);
    scene.update(4200, 0);
    expect(notice.setVisible).toHaveBeenLastCalledWith(false);
    scene.setPatients([patient]);
    scene.setPatients([ready]);
    scene.update(4300, 0);
    expect(notice.setVisible).toHaveBeenLastCalledWith(true);
    scene.setGameplayActive(false);
    expect(notice.setVisible).toHaveBeenLastCalledWith(false);
    scene.update(4400, 0);
    expect(notice.setVisible).toHaveBeenLastCalledWith(false);
  });
  it('increases render density while preserving the logical HUD and world framing on resize', () => {
    const viewport = { width: 1920, height: 1080 };
    const { scene, camera, setGameSize, text, resizeViewport, disconnectSize } =
      setup(undefined, true, true, true, true, viewport);
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
    const { scene, text, container, rectangle } = setup();
    const view = { project: vi.fn((point: { x: number; y: number }) => point),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn() };
    if (threeDimensional) Object.assign(scene, { center3D: view });
    const patient = { id: 'urgent', species: 'Pikachu' as const, requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90000, remainingPatienceMs: 9000,
      lifecycle: 'active' as const, location: 'waiting' as const, slotIndex: 0, carrierId: '' };
    scene.setPatients([patient]);
    expect(text.mock.calls.some((call) => call[2] === '#1!')).toBe(true);
    expect(rectangle).toHaveBeenCalledWith(-12, threeDimensional ? -31 : 44, 1.2, 3, 0x73d8b3);
    expect(rectangle).toHaveBeenCalledWith(-12, threeDimensional ? -26 : 50,
      24 * 0.1, 3, 0xe87970);
    scene.setPatients([{ ...patient, lifecycle: 'lost', location: 'none', slotIndex: -1,
      remainingPatienceMs: 0, travelKind: 'fainting', travelElapsedMs: 800,
      faintX: 130, faintY: 605, faintElevation: 0.5 }]);
    scene.setLostCount(1);
    scene.update(0, 0);
    expect(text.mock.calls.some((call) => call[2] === 'Pikachu · FAINTED')).toBe(true);
    if (threeDimensional) {
      expect(view.syncCharacters).toHaveBeenLastCalledWith([expect.objectContaining({
        point: { x: 130, y: 605 }, elevation: 0.5, carried: false, patienceRatio: 0, faintProgress: 0.5,
      })], 0);
    } else {
      expect(container.mock.results.at(-1)!.value.setRotation).toHaveBeenCalledWith(-Math.PI / 2);
    }
    expect(text.mock.results.some(({ value }) => value.setText.mock.calls.some(
      ([value]: string[]) => value === 'LOST: 1'))).toBe(true);
    scene.setPatients([]);
    scene.update(100, 100);
    if (threeDimensional) expect(view.syncCharacters).toHaveBeenLastCalledWith([], 100);
  });
  it('reports full capacity only when all eight waiting seats are occupied or reserved', () => {
    const { scene, text } = setup();
    const patients = visualFixture('waiting-expansion')!.patients;
    const status = text.mock.results.find((_, index) => text.mock.calls[index]![0] === 260 && text.mock.calls[index]![1] === 31)!.value;
    scene.setPatients(patients.slice(0, 4));
    expect(status.setText).toHaveBeenLastCalledWith('WAITING 4/8');
    scene.setPatients(patients);
    expect(status.setText).toHaveBeenLastCalledWith('WAITING 8/8 · FULL');
  });
  it('keeps critical care details in the patient panel while eight bench markers stay compact', () => {
    const { scene, text } = setup();
    const fixture = visualFixture('hud-overview')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    const patientInfo = text.mock.results.find(({ value }) => value.x === 492 && value.y === 480)!.value;
    expect(patientInfo.setText).toHaveBeenLastCalledWith('PIKACHU\nNEEDS: HEALING · BURN HEAL');
    const vitals = text.mock.results.find(({ value }) => value.x === 492 && value.y === 516)!.value;
    expect(vitals.setText).toHaveBeenLastCalledWith('HP 10/100');
    const markers = text.mock.calls.filter(([x, y]) => x === 0 && y === 31).map((call) => call[2]);
    expect(markers).toEqual(['#1!', '#2', '#3', '#4', '#5', '#6', '#7>', '#8']);
  });
  it('keeps the waiting count separate from the contextual interaction hint', () => {
    const { text } = setup();
    expect(text.mock.calls.some(([x, y]) => x === 260 && y === 31)).toBe(true);
    expect(text.mock.calls.some(([x, y]) => x === 32 && y === 477)).toBe(true);
  });

  it('matches the eight-seat roster to world badges, highlights focus and separates health from patience', () => {
    const { scene, hudContainer, rectangle, text } = setup();
    const fixture = visualFixture('patient-indicators')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    const children = new Set(hudContainer.mock.calls.at(-1)![2] as unknown[]);
    const rosterText = text.mock.results.filter(({ value }) => children.has(value)).map(({ value }) => value.content);
    expect(rosterText).toEqual(expect.arrayContaining(['1!', 'PIKACHU', 'HP 10', 'WAIT 18s',
      '6!', 'PSYDUCK', 'WAIT 9s', '7', 'HP 89']));
    expect(rosterText.filter((value) => value.startsWith('HP '))).toHaveLength(8);
    expect(rosterText.filter((value) => value.startsWith('WAIT '))).toHaveLength(8);
    const firstRow = rectangle.mock.results.find(({ value }) => children.has(value) && value.x === 22 && value.y === 125)!.value;
    expect(firstRow.setStrokeStyle).toHaveBeenCalledWith(2, 0xffde8b);
    const health = rectangle.mock.results.find(({ value }) => value.x === 566 && value.color === 0x73d8b3)!.value;
    expect(health.setDisplaySize).toHaveBeenLastCalledWith(8.2, 7);
    const status = text.mock.results.find(({ value }) => value.x === 624 && value.y === 459)!.value;
    expect(status.setText).toHaveBeenLastCalledWith('! CRITICAL');
    const renders = hudContainer.mock.calls.length;
    scene.setPatients([...fixture.patients]);
    expect(hudContainer).toHaveBeenCalledTimes(renders);
  });

  it('updates urgency at the exact threshold even when HP and displayed seconds do not change', () => {
    const { scene, text, hudContainer } = setup();
    const patient = { ...visualFixture('hud-overview')!.patients[0]!, remainingPatienceMs: 22_501 };
    scene.setPatients([patient]);
    expect(text.mock.calls.some((call) => call[2] === '#1')).toBe(true);
    const renders = hudContainer.mock.calls.length;
    scene.setPatients([{ ...patient, remainingPatienceMs: 22_500 }]);
    expect(text.mock.calls.some((call) => call[2] === '#1!')).toBe(true);
    expect(hudContainer).toHaveBeenCalledTimes(renders + 1);
  });

  it('keeps textual care fallbacks, marks arriving reservations and clears roster entries after loss', () => {
    const { scene, text, hudContainer, hudContainers } = setup(undefined, true, true, true, false);
    const patient = { ...visualFixture('hud-overview')!.patients[0]!, travelKind: 'arriving' as const,
      remainingPatienceMs: 60_000 };
    scene.setPatients([patient]);
    let children = new Set(hudContainer.mock.calls.at(-1)![2] as unknown[]);
    let entries = text.mock.results.filter(({ value }) => children.has(value)).map(({ value }) => value.content);
    expect(entries).toEqual(expect.arrayContaining(['1>', 'PIKACHU', '+', 'B', 'WAIT 60s']));
    const previous = hudContainers.at(-1)!;
    scene.setPatients([{ ...patient, lifecycle: 'lost', location: 'none', travelKind: 'fainting',
      faintX: 130, faintY: 605, remainingPatienceMs: 0 }]);
    expect(previous.destroy).toHaveBeenCalledOnce();
    children = new Set(hudContainer.mock.calls.at(-1)![2] as unknown[]);
    entries = text.mock.results.filter(({ value }) => children.has(value)).map(({ value }) => value.content);
    expect(entries.filter((value) => value === 'EMPTY')).toHaveLength(8);
    expect(entries).not.toContain('PIKACHU');
  });

  it('distinguishes active healing pause, completed care and urgent discharge in the focused patient status', () => {
    const { scene, text } = setup();
    const fixture = visualFixture('healing')!;
    scene.setPlayers(fixture.players, fixture.players[0]!.id);
    scene.setAuthoritativePositions(fixture.positions);
    scene.setPatients(fixture.patients);
    scene.setHealingMachine(fixture.machine);
    const status = text.mock.results.find(({ value }) => value.x === 624 && value.y === 459)!.value;
    expect(status.setText).toHaveBeenLastCalledWith('HEALING · WAIT PAUSED');
    const patient = { ...fixture.patients[0]!, completedTreatments: TREATMENT.healing };
    scene.setHealingMachine({ ...fixture.machine, status: 'completed', remainingMs: 0 });
    scene.setPatients([patient]);
    expect(status.setText).toHaveBeenLastCalledWith('READY FOR DISCHARGE');
    scene.setPatients([{ ...patient, remainingPatienceMs: 9_000 }]);
    expect(status.setText).toHaveBeenLastCalledWith('! CRITICAL · DISCHARGE');
    scene.setPatients([]);
    expect(status.setVisible).toHaveBeenLastCalledWith(false);
    expect(status.setText).toHaveBeenLastCalledWith('');
  });
  it('shows walking arrivals, reserved seats, zone signs, and departures from authoritative travel', () => {
    const { scene, text } = setup();
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
        point: { x: 480, y: 693.9 } }),
    ], 50);
    expect(text.mock.results.some(({ value }) => value.setText.mock.calls.some(
      ([label]: string[]) => label!.includes('0 seated · 1 arriving')))).toBe(true);
    expect(text.mock.calls.map((call) => call[2])).toEqual(expect.arrayContaining([
      'WAITING ROOM', 'TREATMENT', 'MEDICINES', 'RECOVERY', 'DISCHARGE',
    ]));
    const waitingSign = text.mock.calls.find((call) => call[2] === 'WAITING ROOM')!;
    expect(waitingSign[1]).toBeLessThan(mapViewportPoint({ x: 130, y: 605 }).y - 30);
    scene.setPatients([{ ...arrival, lifecycle: 'discharged', location: 'none', slotIndex: -1,
      travelKind: 'leaving', travelElapsedMs: 0, completedTreatments: 1 }]);
    scene.update(50, 0);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'patient:arrival', point: { x: 840, y: 344 },
        facing: 'down', moving: true, carried: false }),
    ], 50);
    scene.setPatients([]);
    scene.update(100, 50);
    expect(view.syncCharacters).toHaveBeenLastCalledWith([], 100);
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
    const { scene, sprite } = setup();
    const view = {
      project: vi.fn((point: { x: number; y: number }) => ({ x: point.x + 10, y: point.y + 20 })),
      setTarget: vi.fn(), syncCharacters: vi.fn(), syncMedicines: vi.fn(), render: vi.fn(),
    };
    (scene as unknown as { center3D: typeof view }).center3D = view;
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0, character: 'Chansey' }], 'staff');
    scene.setAuthoritativePositions([{ id: 'staff', x: 177, y: 354, facing: 'up',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.setPatients([{ id: 'arrival', species: 'Pikachu', requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    scene.setMedicines([{ id: 'dose', kind: 'burnHeal', location: 'surface',
      carrierId: '', slotIndex: 0 }], ['dose', '', '', ''], ['', ''], [0, 0]);
    scene.update(100, 70);
    expect(view.setTarget).toHaveBeenLastCalledWith({ x: 177, y: 332 });
    expect(view.syncCharacters).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'player:staff', species: 'Chansey',
        point: { x: 177, y: 354 }, facing: 'up', elevation: 0.03 }),
      expect.objectContaining({ id: 'patient:arrival', species: 'Pikachu',
        point: { x: 177, y: 298 }, elevation: 0.93 }),
    ], 100);
    expect(view.syncMedicines).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'dose' }),
    ], new Map([['staff', { x: 177, y: 354 }]]), 100);
    expect(view.render).toHaveBeenCalledOnce();
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
    const first = { x: 285, y: 347 };
    const second = { x: 177, y: 198 };
    expect(isWalkable(first)).toBe(true);
    expect(isWalkable(second)).toBe(true);
    expect(isWalkable({ x: 231, y: 272.5 })).toBe(false);
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
  it('keeps identical species distinguishable by slot badge and player name', () => {
    const { scene, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' },
      { id: 'blue', name: 'Blue', slot: 1, character: 'Chansey' }], 'red');
    expect(text).toHaveBeenCalledWith(0, 0, '1', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, 0, '2', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Red', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Blue', expect.any(Object));
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
    expect(sendInput).toHaveBeenCalledWith('right', false);
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
  it('keeps adjacent waiting labels compact and marks pending and completed care with icons', () => {
    const { scene, text, image, rectangle } = setup();
    scene.setPatients([
      { id: 'one', species: 'Bulbasaur', requiredTreatments: TREATMENT.healing | TREATMENT.antidote,
        completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 60_000,
        lifecycle: 'active', location: 'waiting', slotIndex: 0, carrierId: '' },
      { id: 'two', species: 'Psyduck', requiredTreatments: TREATMENT.antidote,
        completedTreatments: TREATMENT.antidote, initialPatienceMs: 90_000,
        remainingPatienceMs: 60_000, lifecycle: 'active', location: 'waiting', slotIndex: 1,
        carrierId: '' },
    ]);
    expect(text).toHaveBeenCalledWith(0, 31, '#1', expect.objectContaining({ fontSize: '9px' }));
    expect(text).toHaveBeenCalledWith(0, 31, '#2>', expect.objectContaining({ fontSize: '9px' }));
    expect(image).toHaveBeenCalledWith(-6, -36, 'icon-heal');
    expect(image).toHaveBeenCalledWith(6, -36, 'icon-poison');
    expect(image).toHaveBeenCalledWith(0, -36, 'icon-ready');
    expect(rectangle).toHaveBeenCalledWith(-12, 50, 24 * (60000 / 90000), 3, 0xeab166);
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
    scene.setAuthoritativePositions([{ id: 'red', x: 400, y: 95, facing: 'down',
      carriedPatientId: '', carriedMedicineId: '' }]);
    scene.setMedicines([], ['', '', '', ''], ['', ''], [0, 0]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(interact).toHaveBeenCalledWith({ targetId: 'medicine:prep:0', expectedOccupantId: '' });
    expect(sendInput).toHaveBeenLastCalledWith(null, true);
    scene.update(100, 50);
    expect(sendInput).toHaveBeenLastCalledWith(null, true);
    keyboardListeners.get('keyup')?.({ code: 'KeyE' } as KeyboardEvent);
    expect(sendInput).toHaveBeenLastCalledWith(null, false);
    scene.setMedicines([{ id: 'dose-1', kind: 'burnHeal', location: 'carrier',
      carrierId: 'red', slotIndex: -1 }], ['', '', '', ''], ['', ''], [0, 0]);
    expect(container).toHaveBeenCalledTimes(2);
    scene.setMedicines([], ['', '', '', ''], ['', ''], [0, 0]);
  });

  it('shows synchronized healing and medicine preparation progress', () => {
    const { scene, rectangle, text } = setup();
    const healingFill = rectangle.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 65 && result.value.color === 0xb6db9d)?.value;
    const preparationFill = rectangle.mock.results.find((result) => result.value.x === mapViewportPoint({ x: 400, y: 82 }).x - 30 &&
      result.value.y === mapViewportPoint({ x: 400, y: 82 }).y && result.value.color === 0xb6db9d)?.value;
    scene.setHealingMachine({ patientId: 'patient', status: 'treating', remainingMs: 2_000 });
    expect(healingFill?.setVisible).toHaveBeenLastCalledWith(true);
    expect(healingFill?.setDisplaySize).toHaveBeenLastCalledWith(62.5, 6);
    expect(text).toHaveBeenCalledWith(500, 33, '', expect.any(Object));
    scene.setMedicines([], ['', '', '', ''], ['red', ''], [1_000, 0]);
    expect(preparationFill?.setVisible).toHaveBeenLastCalledWith(true);
    expect(preparationFill?.setDisplaySize).toHaveBeenLastCalledWith(30, 6);
    scene.setHealingMachine({ patientId: 'patient', status: 'completed', remainingMs: 0 });
    scene.setMedicines([], ['', '', '', ''], ['', ''], [0, 0]);
    expect(healingFill?.setVisible).toHaveBeenLastCalledWith(false);
    expect(preparationFill?.setVisible).toHaveBeenLastCalledWith(false);
  });
  it('shows a pulsing outage and repair progress without showing healing as active', () => {
    const { scene, rectangle, text } = setup();
    const healingTrack = rectangle.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 65 && result.value.color === 0x355362)?.value;
    const healingFill = rectangle.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 65 && result.value.color === 0xb6db9d)?.value;
    const warning = rectangle.mock.results.find((result) => result.value.color === 0xd74242)?.value;
    const repairFill = rectangle.mock.results.find((result) => result.value.color === 0xffdf6e &&
      result.value.y === 65)?.value;
    const repairText = text.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 51)?.value;
    const statusText = text.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 33)?.value;
    scene.setHealingMachine({ patientId: 'patient', status: 'broken', remainingMs: 3_000,
      repairOwnerId: 'red', repairRemainingMs: 1_000 });
    expect(statusText?.setText).toHaveBeenLastCalledWith('PAUSED 3s');
    expect(warning?.setVisible).toHaveBeenLastCalledWith(true);
    expect(healingTrack?.setVisible).toHaveBeenLastCalledWith(false);
    expect(healingFill?.setVisible).toHaveBeenLastCalledWith(false);
    expect(repairFill?.setDisplaySize).toHaveBeenLastCalledWith(62.5, 6);
    expect(repairText?.setText).toHaveBeenLastCalledWith('OUTAGE · REPAIR 1s');
    scene.update(500, 16);
    expect(warning?.setAlpha).toHaveBeenCalled();
    scene.setHealingMachine({ patientId: 'patient', status: 'treating', remainingMs: 3_000 });
    expect(warning?.setVisible).toHaveBeenLastCalledWith(false);
    expect(repairFill?.setVisible).toHaveBeenLastCalledWith(false);
    scene.setHealingMachine({ patientId: 'patient', status: 'broken', remainingMs: 3_000 });
    scene.clearPlayers();
    expect(warning?.setVisible).toHaveBeenLastCalledWith(false);
  });
  it('renders a browser QA fixture through the real scene in development', () => {
    vi.stubGlobal('location', { search: '?artFixture=repair' });
    const { rectangle, text, container } = setup();
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 40, y: 33 })), expect.any(Array));
    const warning = rectangle.mock.results.find((result) => result.value.color === 0xd74242)?.value;
    const repairText = text.mock.results.find((result) => result.value.x === 500 &&
      result.value.y === 51)?.value;
    expect(warning?.setVisible).toHaveBeenLastCalledWith(true);
    expect(repairText?.setText).toHaveBeenLastCalledWith('OUTAGE · REPAIR 1s');
  });
  it('explains why a player carrying a patient cannot repair an outage', () => {
    const { scene, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 180, y: 33, facing: 'left',
      carriedPatientId: 'patient' }]);
    scene.setHealingMachine({ patientId: '', status: 'broken', remainingMs: 0 });
    const hint = text.mock.results.find((result) => result.value.x === 32 &&
      result.value.y === 477)?.value;
    expect(hint?.setText).toHaveBeenLastCalledWith('E: Empty hands to repair outage');
  });
  it('labels rejected interactions and clears the rejection when target changes', () => {
    const { scene, text } = setup();
    const hint = text.mock.results.find((result) => result.value.x === 32 &&
      result.value.y === 477)?.value;
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 354, facing: 'up',
      carriedPatientId: '' }]);
    scene.setInteractionResult({ ok: false, reason: 'Patient already claimed or removed' });
    expect(hint?.setText).toHaveBeenLastCalledWith('REJECTED: Patient already claimed or removed');
    expect(hint?.setStyle).toHaveBeenLastCalledWith({ backgroundColor: '#8a2222', color: '#ffffff' });
    scene.setAuthoritativePositions([{ id: 'red', x: 456, y: 422, facing: 'up',
      carriedPatientId: '' }]);
    expect(hint?.setText).not.toHaveBeenLastCalledWith('REJECTED: Patient already claimed or removed');
    expect(hint?.setStyle).toHaveBeenLastCalledWith({ backgroundColor: '#10243bcc', color: '#ffffff' });
  });
  it('targets a stationary patient for medicine and shows the pending condition', () => {
    const { scene, keyboardListeners, text, image } = setup();
    const interact = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(interact);
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 354, facing: 'up',
      carriedPatientId: '', carriedMedicineId: 'dose-1' }]);
    scene.setMedicines([{ id: 'dose-1', kind: 'burnHeal', location: 'carrier',
      carrierId: 'red', slotIndex: -1 }], ['', '', '', ''], ['', ''], [0, 0]);
    scene.setPatients([{ id: 'patient-1', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(text).toHaveBeenCalledWith(0, -37, 'HP 50', expect.any(Object));
    expect(image).toHaveBeenCalledWith(6, -54, 'icon-burn');
    const care = text.mock.results.find(({ value }) => value.x === 492 && value.y === 480)!.value;
    expect(care.setText).toHaveBeenLastCalledWith('PIKACHU\nNEEDS: HEALING · BURN HEAL');
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
    expect(text).toHaveBeenCalledWith(60, 24, 'POKÉCENTER', expect.any(Object));
    expect(text.mock.calls.filter((call) => call[2] === 'RECEPTION')).toHaveLength(1);
    expect(text.mock.calls.some((call) => call[2] === 'TREATMENT')).toBe(true);

    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'red');
    expect(container).toHaveBeenCalledTimes(2);
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 456, y: 422 })));
    expect(container.mock.calls[1]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 504, y: 422 })));
    expect(text).toHaveBeenCalledWith(0, -31, 'Red', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Blue', expect.any(Object));
  });
  it('uses the provisional geometry if the original map texture is unavailable', () => {
    const { image, graphics, text } = setup(undefined, false);
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-floor');
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-fixtures');
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
    expect(text).toHaveBeenCalledWith(60, 24, 'POKÉCENTER',
      expect.any(Object));
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
    expect(sendInput).toHaveBeenCalledWith('right', false);
    scene.setAuthoritativePositions([
      { id: 'red', x: 470, y: 422, facing: 'right', carriedPatientId: '' },
      { id: 'blue', x: 518, y: 422, facing: 'left', carriedPatientId: '' },
    ]);
    scene.update(50, 70);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 470, y: 422 })));
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 518, y: 422 })));

    windowListeners.get('blur')?.();
    expect(sendInput).toHaveBeenLastCalledWith(null, false);
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
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 456, y: 422 })));
    expect(sendInput).not.toHaveBeenCalled();
  });

  it('reuses a vacated avatar slot without duplicating another player badge', () => {
    const { scene, container, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'blue');
    scene.setPlayers([{ id: 'blue', name: 'Blue', slot: 1 }, { id: 'green', name: 'Green', slot: 0 }], 'blue');
    expect(container.mock.calls[2]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 456, y: 422 })));
    expect(text).toHaveBeenCalledWith(0, 0, '1', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, 0, '2', expect.any(Object));
  });

  it('uses an authoritative snapshot received before the roster', () => {
    const { scene, container } = setup();
    scene.setPlayers([], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 480, y: 422, facing: 'up', carriedPatientId: '' }]);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual(Object.values(mapViewportPoint({ x: 480, y: 422 })));
  });

  it('renders and removes a synchronized reception patient', () => {
    const { scene, container, containers, text } = setup();
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 177, y: 298 })), expect.any(Array));
    expect(text).toHaveBeenCalledWith(0, -37, 'HP 50', expect.any(Object));
    scene.setPatients([]);
    expect(containers[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('keeps the carried patient attached to its carrier and raises the player label', () => {
    const { scene, image, containers, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 470, y: 410, facing: 'right',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    scene.update(50, 70);
    expect(image).toHaveBeenCalledWith(0, 9, 'stretcher');
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(...Object.values(mapViewportPoint({ x: 470, y: 410 })));
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(mapViewportPoint({ x: 470, y: 410 }).x,
      mapViewportPoint({ x: 470, y: 410 }).y - 28);
    const playerName = text.mock.results.find((result) => result.value.setY.mock.calls.length);
    expect(playerName?.value.setY).toHaveBeenLastCalledWith(-77);
    const patientInfo = text.mock.results.find((result) => result.value.x === 492 && result.value.y === 480)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('PIKACHU\nNEEDS: HEALING');
  });

  it('clears the treatment checklist when its patient leaves the scene', () => {
    const { scene, image, rectangle, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 354, facing: 'up',
      carriedPatientId: '' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: TREATMENT.burnHeal, initialPatienceMs: 90_000,
      remainingPatienceMs: 22_500, lifecycle: 'active', location: 'reception',
      slotIndex: 0, carrierId: '' }]);
    const patientInfo = text.mock.results.find((result) => result.value.x === 492 && result.value.y === 480)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith(
      'PIKACHU\nNEEDS: HEALING');
    const patienceText = text.mock.results.find((result) => result.value.x === 666 && result.value.y === 516)?.value;
    const patienceFill = rectangle.mock.results.find((result) => result.value.x === 824 &&
      result.value.color === 0xeab166)?.value;
    expect(patienceText?.setText).toHaveBeenLastCalledWith('WAIT 25% · 23s');
    expect(patienceFill?.setDisplaySize).toHaveBeenLastCalledWith(25, 8);
    expect(patienceFill?.setFillStyle).toHaveBeenLastCalledWith(0xe87970);
    const healIcon = image.mock.results.find((result) => result.value.key === 'icon-heal')?.value;
    const burnIcon = image.mock.results.find((result) => result.value.key === 'icon-burn')?.value;
    const readyIcon = image.mock.results.find((result) => result.value.key === 'icon-ready')?.value;
    expect(healIcon?.setVisible).toHaveBeenLastCalledWith(true);
    expect(healIcon?.setAlpha).toHaveBeenLastCalledWith(1);
    expect(burnIcon?.setVisible).toHaveBeenLastCalledWith(true);
    expect(burnIcon?.setAlpha).toHaveBeenLastCalledWith(0.55);
    expect(readyIcon?.setVisible).toHaveBeenLastCalledWith(false);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: 3, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(readyIcon?.setVisible).toHaveBeenLastCalledWith(true);
    const healComplete = image.mock.results.find((result) => result.value.key === 'icon-complete')?.value;
    expect(healComplete?.setVisible).toHaveBeenLastCalledWith(true);
    scene.setPatients([]);
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('No patient selected\nApproach a Pokémon to view its care needs.');
    expect(healIcon?.setVisible).toHaveBeenLastCalledWith(false);
    expect(patienceText?.setText).toHaveBeenLastCalledWith('');
    expect(patienceFill?.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('keeps the treatment checklist readable when icon textures are unavailable', () => {
    const { scene, image, text } = setup(undefined, true, true, true, false);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 354, facing: 'up',
      carriedPatientId: '' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: TREATMENT.healing,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(image.mock.calls.some((call) => call[2].startsWith('icon-'))).toBe(false);
    const patientInfo = text.mock.results.find((result) => result.value.x === 492 && result.value.y === 480)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('PIKACHU\nNEEDS: HEALING');
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
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 354, facing: 'up', carriedPatientId: '' }]);
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
    scene.setAuthoritativePositions([{ id: 'red', x: [130, 184, 238, 292, 806, 860, 914, 968][slotIndex]!, y: 530, facing: 'down',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: `waiting:${slotIndex}`, expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 960, y: 269, facing: 'down', carriedPatientId: '' }]);
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
    scene.setAuthoritativePositions([{ id: 'red', x: 157, y: 530, facing: 'down',
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
    scene.setAuthoritativePositions([{ id: 'red', x: 180, y: 33, facing: 'left',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 180, y: 33, facing: 'left', carriedPatientId: '' }]);
    scene.setHealingMachine({ patientId: 'patient-1', status: 'completed', remainingMs: 0 });
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 1,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'healingMachine', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(...Object.values(mapViewportPoint({ x: 40, y: 33 })), expect.any(Array));
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: 'patient-1' });

    scene.setAuthoritativePositions([{ id: 'red', x: 840, y: 340, facing: 'down',
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
    const { scene, text } = setup();
    scene.setDischargedCount(1);
    expect(text.mock.results.some((result) => result.value.setText.mock.calls.some(
      (call: string[]) => call[0] === 'DISCHARGED: 1'))).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TREATMENT } from '@pokecenter/shared';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));

import { MapScene } from './MapScene.js';
import type { SpriteManifest } from '../sprites/pmd.js';

function setup(manifest?: SpriteManifest, mapArt = true, equipmentArt = true,
  fixtureArt = mapArt, iconArt = true) {
  const keyboardListeners = new Map<string, (event: KeyboardEvent) => void>();
  const windowListeners = new Map<string, () => void>();
  const documentListeners = new Map<string, () => void>();
  class InputElement {}
  vi.stubGlobal('HTMLInputElement', InputElement);
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: () => void) => windowListeners.set(type, listener)),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', {
    activeElement: null,
    addEventListener: vi.fn((type: string, listener: () => void) => documentListeners.set(type, listener)),
    removeEventListener: vi.fn(),
  });

  const graphics: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['fillStyle', 'fillRect', 'lineStyle', 'lineBetween']) {
    graphics[method] = vi.fn(() => graphics);
  }
  const text = vi.fn((x: number, y: number, content: string, style: unknown) => ({
    x, y, content, style, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setY: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis() }));
  const rectangle = vi.fn((x: number, y: number, width: number, height: number,
    color: number, alpha?: number) => ({ x, y, width, height, color, alpha,
    setOrigin: vi.fn().mockReturnThis(), setDisplaySize: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(), setStrokeStyle: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis() }));
  const image = vi.fn((x: number, y: number, key: string) => ({ x, y, key,
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis(),
  }));
  const sprite = vi.fn((x: number, y: number, key: string) => ({ x, y, key,
    setOrigin: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(), play: vi.fn().mockReturnThis(),
    anims: { currentAnim: null } }));
  const containers: Array<{ setPosition: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const container = vi.fn(() => {
    const avatar = { setPosition: vi.fn(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
    containers.push(avatar);
    return avatar;
  });
  const scene = new MapScene();
  let onLoadComplete = () => {};
  Object.assign(scene, {
    add: { graphics: vi.fn(() => graphics), image, text, rectangle, container, sprite },
    cache: { json: { get: vi.fn(() => manifest) } },
    load: { image: vi.fn(), json: vi.fn(), spritesheet: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => {
      onLoadComplete = callback;
    }), start: vi.fn(() => onLoadComplete()) },
    textures: { exists: vi.fn((key: string) => key === 'center-floor' ? mapArt :
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
  scene.preload();
  scene.create();
  return { scene, image, graphics, text, rectangle, container, containers, sprite, keyboardListeners, windowListeners,
    documentListeners, InputElement };
}

afterEach(() => vi.unstubAllGlobals());

describe('MapScene', () => {
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
  it('keeps differently sized PMD frames at native pixel scale', () => {
    const manifest: SpriteManifest = { source: 'fixture', species: [
      { name: 'Pikachu', id: '0025', credits: 'Artist', idle: { frameWidth: 40,
        frameHeight: 56, durations: [4], directions: 8, image: '0025/Idle-Anim.png' } },
      { name: 'Chansey', id: '0113', credits: 'Artist', idle: { frameWidth: 24,
        frameHeight: 40, durations: [4], directions: 8, image: '0113/Idle-Anim.png' } },
    ] };
    const { scene, sprite } = setup(manifest);
    scene.setPlayers([{ id: 'staff', name: 'Staff', slot: 0, character: 'Chansey' }], 'staff');
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 1,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(sprite.mock.calls.map((call) => call[2])).toEqual(['Chansey:idle', 'Pikachu:idle']);
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
    scene.setAuthoritativePositions([{ id: 'red', x: 400, y: 350, facing: 'up',
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
  it('targets a stationary patient for medicine and shows the pending condition', () => {
    const { scene, keyboardListeners, text } = setup();
    const interact = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(interact);
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 194, facing: 'up',
      carriedPatientId: '', carriedMedicineId: 'dose-1' }]);
    scene.setMedicines([{ id: 'dose-1', kind: 'burnHeal', location: 'carrier',
      carrierId: 'red', slotIndex: -1 }], ['', '', '', ''], ['', ''], [0, 0]);
    scene.setPatients([{ id: 'patient-1', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(text).toHaveBeenCalledWith(0, 42, 'Pikachu  50/100  BURNED', expect.any(Object));
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
    expect(text).toHaveBeenCalledWith(26, 16, 'POKÉCENTER PANIC  /  CENTER 01', expect.any(Object));
    expect(text).toHaveBeenCalledWith(92, 97, 'RECEPTION  ·  4 SLOTS', expect.any(Object));
    expect(text).toHaveBeenCalledWith(733, 223, 'HEALING 02', expect.any(Object));

    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'red');
    expect(container).toHaveBeenCalledTimes(2);
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual([456, 422]);
    expect(container.mock.calls[1]?.slice(0, 2)).toEqual([504, 422]);
    expect(text).toHaveBeenCalledWith(0, -31, 'Red', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Blue', expect.any(Object));
  });
  it('uses the provisional geometry if the original map texture is unavailable', () => {
    const { image, graphics, text } = setup(undefined, false);
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-floor');
    expect(image).not.toHaveBeenCalledWith(480, 270, 'center-fixtures');
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
    expect(text).toHaveBeenCalledWith(26, 16, 'POKÉCENTER PANIC  /  PROTOTYPE MAP',
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
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470, 422);
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(518, 422);

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
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(456, 422);
    expect(sendInput).not.toHaveBeenCalled();
  });

  it('reuses a vacated avatar slot without duplicating another player badge', () => {
    const { scene, container, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'blue');
    scene.setPlayers([{ id: 'blue', name: 'Blue', slot: 1 }, { id: 'green', name: 'Green', slot: 0 }], 'blue');
    expect(container.mock.calls[2]?.slice(0, 2)).toEqual([456, 422]);
    expect(text).toHaveBeenCalledWith(0, 0, '1', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, 0, '2', expect.any(Object));
  });

  it('uses an authoritative snapshot received before the roster', () => {
    const { scene, container } = setup();
    scene.setPlayers([], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 480, y: 422, facing: 'up', carriedPatientId: '' }]);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual([480, 422]);
  });

  it('renders and removes a synchronized reception patient', () => {
    const { scene, container, containers, text } = setup();
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(177, 138, expect.any(Array));
    expect(text).toHaveBeenCalledWith(0, 42, 'Pikachu  50/100', expect.any(Object));
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
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470, 410);
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(470, 382);
    const playerName = text.mock.results.find((result) => result.value.setY.mock.calls.length);
    expect(playerName?.value.setY).toHaveBeenLastCalledWith(-77);
    const patientInfo = text.mock.results.find((result) => result.value.y === 521)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('PIKACHU  ·  ANY ORDER  ·  HEAL TODO');
  });

  it('clears the treatment checklist when its patient leaves the scene', () => {
    const { scene, image, rectangle, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 194, facing: 'up',
      carriedPatientId: '' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: 3,
      completedTreatments: TREATMENT.burnHeal, initialPatienceMs: 90_000,
      remainingPatienceMs: 22_500, lifecycle: 'active', location: 'reception',
      slotIndex: 0, carrierId: '' }]);
    const patientInfo = text.mock.results.find((result) => result.value.y === 521)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith(
      'PIKACHU  ·  ANY ORDER  ·  HEAL TODO  ·  BURN DONE');
    const patienceText = text.mock.results.find((result) => result.value.x === 687)?.value;
    const patienceFill = rectangle.mock.results.find((result) => result.value.x === 824 &&
      result.value.color === 0xeab166)?.value;
    expect(patienceText?.setText).toHaveBeenLastCalledWith('PATIENCE 25%');
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
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('');
    expect(healIcon?.setVisible).toHaveBeenLastCalledWith(false);
    expect(patienceText?.setText).toHaveBeenLastCalledWith('');
    expect(patienceFill?.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('keeps the treatment checklist readable when icon textures are unavailable', () => {
    const { scene, image, text } = setup(undefined, true, true, true, false);
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 194, facing: 'up',
      carriedPatientId: '' }]);
    scene.setPatients([{ id: 'patient', species: 'Pikachu', requiredTreatments: TREATMENT.healing,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' }]);
    expect(image.mock.calls.some((call) => call[2].startsWith('icon-'))).toBe(false);
    const patientInfo = text.mock.results.find((result) => result.value.y === 521)?.value;
    expect(patientInfo?.setText).toHaveBeenLastCalledWith('PIKACHU  ·  ANY ORDER  ·  HEAL TODO');
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
    scene.setAuthoritativePositions([{ id: 'red', x: 177, y: 194, facing: 'up', carriedPatientId: '' }]);
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

  it('selects an empty waiting slot while carrying and only the recovery front when empty-handed', () => {
    const { scene, keyboardListeners } = setup();
    const send = vi.fn();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setInteractionSender(send);
    scene.setAuthoritativePositions([{ id: 'red', x: 130, y: 350, facing: 'down',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'waiting:0', expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 752, y: 350, facing: 'down', carriedPatientId: '' }]);
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
    scene.setAuthoritativePositions([{ id: 'red', x: 157, y: 350, facing: 'down',
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
    scene.setAuthoritativePositions([{ id: 'red', x: 280, y: 273, facing: 'left',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: '' });

    scene.setAuthoritativePositions([{ id: 'red', x: 280, y: 273, facing: 'left', carriedPatientId: '' }]);
    scene.setHealingMachine({ patientId: 'patient-1', status: 'completed', remainingMs: 0 });
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 1,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'healingMachine', slotIndex: 0, carrierId: '',
    }]);
    expect(container).toHaveBeenCalledWith(160, 273, expect.any(Array));
    keyboardListeners.get('keydown')?.({ code: 'KeyE', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ targetId: 'healing:0', expectedOccupantId: 'patient-1' });

    scene.setAuthoritativePositions([{ id: 'red', x: 840, y: 180, facing: 'down',
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

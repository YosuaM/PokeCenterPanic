import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));

import { MapScene } from './MapScene.js';
import type { SpriteManifest } from '../sprites/pmd.js';

function setup(manifest?: SpriteManifest) {
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
  const text = vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setY: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis() }));
  const rectangle = vi.fn(() => ({ setStrokeStyle: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis() }));
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
    add: { graphics: vi.fn(() => graphics), text, rectangle, container, sprite },
    cache: { json: { get: vi.fn(() => manifest) } },
    load: { spritesheet: vi.fn(), once: vi.fn((_event: string, callback: () => void) => {
      onLoadComplete = callback;
    }), start: vi.fn(() => onLoadComplete()) },
    textures: { exists: vi.fn(() => true) },
    anims: { create: vi.fn(), exists: vi.fn(() => true) },
    input: { keyboard: {
      on: vi.fn((type: string, listener: (event: KeyboardEvent) => void) => keyboardListeners.set(type, listener)),
      off: vi.fn(),
    } },
    events: { once: vi.fn() },
    sys: { isActive: () => true },
  });
  scene.create();
  return { scene, text, container, containers, sprite, keyboardListeners, windowListeners,
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
  it('renders the provisional stations and distinct avatars for the room roster', () => {
    const { scene, text, container } = setup();
    expect(text).toHaveBeenCalledWith(92, 97, 'RECEPTION  ·  4 SLOTS', expect.any(Object));
    expect(text).toHaveBeenCalledWith(733, 223, 'HEALING 02', expect.any(Object));

    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }], 'red');
    expect(container).toHaveBeenCalledTimes(2);
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual([456, 422]);
    expect(container.mock.calls[1]?.slice(0, 2)).toEqual([504, 422]);
    expect(text).toHaveBeenCalledWith(0, -31, 'Red', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Blue', expect.any(Object));
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
    const { scene, containers, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red', slot: 0 }], 'red');
    scene.setAuthoritativePositions([{ id: 'red', x: 470, y: 410, facing: 'right',
      carriedPatientId: 'patient-1' }]);
    scene.setPatients([{
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'carrier', slotIndex: -1, carrierId: 'red',
    }]);
    scene.update(50, 70);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470, 410);
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(470, 382);
    const playerName = text.mock.results.find((result) => result.value.setY.mock.calls.length);
    expect(playerName?.value.setY).toHaveBeenLastCalledWith(-77);
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

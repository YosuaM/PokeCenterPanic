import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));

import { MapScene } from './MapScene.js';

function setup() {
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
    setText: vi.fn().mockReturnThis() }));
  const rectangle = vi.fn(() => ({ setStrokeStyle: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis() }));
  const containers: Array<{ setPosition: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const container = vi.fn(() => {
    const avatar = { setPosition: vi.fn(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
    containers.push(avatar);
    return avatar;
  });
  const scene = new MapScene();
  Object.assign(scene, {
    add: { graphics: vi.fn(() => graphics), text, rectangle, container },
    input: { keyboard: {
      on: vi.fn((type: string, listener: (event: KeyboardEvent) => void) => keyboardListeners.set(type, listener)),
      off: vi.fn(),
    } },
    events: { once: vi.fn() },
    sys: { isActive: () => true },
  });
  scene.create();
  return { scene, text, container, containers, keyboardListeners, windowListeners, documentListeners, InputElement };
}

afterEach(() => vi.unstubAllGlobals());

describe('MapScene', () => {
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
    expect(sendInput).toHaveBeenCalledWith('right');
    scene.setAuthoritativePositions([
      { id: 'red', x: 470, y: 422, facing: 'right', carriedPatientId: '' },
      { id: 'blue', x: 518, y: 422, facing: 'left', carriedPatientId: '' },
    ]);
    scene.update(50, 70);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470, 422);
    expect(containers[1]?.setPosition).toHaveBeenLastCalledWith(518, 422);

    windowListeners.get('blur')?.();
    expect(sendInput).toHaveBeenLastCalledWith(null);
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

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
  const text = vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis() }));
  const rectangle = vi.fn(() => ({ setStrokeStyle: vi.fn().mockReturnThis() }));
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

    scene.setPlayers([{ id: 'red', name: 'Red' }, { id: 'blue', name: 'Blue' }], 'red');
    expect(container).toHaveBeenCalledTimes(2);
    expect(container.mock.calls[0]?.slice(0, 2)).toEqual([456, 422]);
    expect(container.mock.calls[1]?.slice(0, 2)).toEqual([504, 422]);
    expect(text).toHaveBeenCalledWith(0, -31, 'Red', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, -31, 'Blue', expect.any(Object));
  });

  it('moves only the local avatar and clears held input on blur and disconnect', () => {
    const { scene, containers, keyboardListeners, windowListeners } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red' }, { id: 'blue', name: 'Blue' }], 'red');
    const preventDefault = vi.fn();
    keyboardListeners.get('keydown')?.({ code: 'KeyD', preventDefault } as unknown as KeyboardEvent);
    scene.update(0, 100);
    expect(preventDefault).toHaveBeenCalled();
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470.4, 422);
    expect(containers[1]?.setPosition).not.toHaveBeenCalled();

    windowListeners.get('blur')?.();
    scene.update(0, 100);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(470.4, 422);
    scene.clearPlayers();
    expect(containers[0]?.destroy).toHaveBeenCalled();
    expect(containers[1]?.destroy).toHaveBeenCalled();
  });

  it('ignores movement while typing a room code', () => {
    const { scene, containers, keyboardListeners, InputElement } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red' }], 'red');
    (document as unknown as { activeElement: unknown }).activeElement = new InputElement();
    keyboardListeners.get('keydown')?.({ code: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    scene.update(0, 100);
    expect(containers[0]?.setPosition).toHaveBeenLastCalledWith(456, 422);
  });

  it('reuses a vacated avatar slot without duplicating another player badge', () => {
    const { scene, container, text } = setup();
    scene.setPlayers([{ id: 'red', name: 'Red' }, { id: 'blue', name: 'Blue' }], 'blue');
    scene.setPlayers([{ id: 'blue', name: 'Blue' }, { id: 'green', name: 'Green' }], 'blue');
    expect(container.mock.calls[2]?.slice(0, 2)).toEqual([456, 422]);
    expect(text).toHaveBeenCalledWith(0, 0, '1', expect.any(Object));
    expect(text).toHaveBeenCalledWith(0, 0, '2', expect.any(Object));
  });
});

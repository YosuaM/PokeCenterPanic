import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class {} },
}));

import { BootScene } from './BootScene.js';

describe('BootScene', () => {
  it('renders the shared project title and prototype status', () => {
    const scene = new BootScene();
    const setOrigin = vi.fn();
    const text = vi.fn(() => ({ setOrigin }));
    Object.assign(scene, { add: { text } });

    scene.create();

    expect(text).toHaveBeenCalledWith(480, 250, 'PokéCenter Panic', expect.any(Object));
    expect(text).toHaveBeenCalledWith(480, 300, 'Technical prototype', expect.any(Object));
    expect(setOrigin).toHaveBeenCalledTimes(2);
  });
});

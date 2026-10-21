import { expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: { FIT: 3, CENTER_BOTH: 1 },
    Scene: class {},
  },
}));

import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig.js';

it('fits and centers the game within the browser viewport', () => {
  expect(GAME_CONFIG.scale).toEqual({
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: 960,
    height: 540,
  });
});

it('smooths the scene and HUD instead of applying a global pixel-art filter', () => {
  expect(GAME_CONFIG).toMatchObject({
    pixelArt: false, antialias: true, antialiasGL: true, roundPixels: false,
  });
});

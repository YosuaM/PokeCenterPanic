import Phaser from 'phaser';
import { MapScene } from './scenes/MapScene.js';

export const GAME_CONFIG = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: 960,
    height: 540,
  },
  backgroundColor: '#172d46',
  transparent: true,
  pixelArt: false,
  antialias: true,
  antialiasGL: true,
  roundPixels: false,
  scene: [MapScene],
} satisfies Phaser.Types.Core.GameConfig;

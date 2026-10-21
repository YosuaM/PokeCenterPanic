import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';

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
  scene: [BootScene],
} satisfies Phaser.Types.Core.GameConfig;

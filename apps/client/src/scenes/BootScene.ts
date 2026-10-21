import Phaser from 'phaser';
import { PROJECT_INFO, type ProjectInfo } from '@pokecenter/shared';

const project: ProjectInfo = PROJECT_INFO;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.add.text(480, 250, project.title, {
      color: '#f7f5e8',
      fontFamily: 'sans-serif',
      fontSize: '40px',
    }).setOrigin(0.5);
    this.add.text(480, 300, 'Technical prototype', {
      color: '#cbd5e1',
      fontFamily: 'sans-serif',
      fontSize: '20px',
    }).setOrigin(0.5);
  }
}

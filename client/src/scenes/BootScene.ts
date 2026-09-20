// Candy Friends — Boot Scene
// Initializes scale, loads minimal assets

import { Scene } from 'phaser';

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene', active: false });
  }

  preload(): void {
    // Load a minimal loading bar graphic
    this.load.image('loading-bar', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  }

  create(): void {
    // Configure scale for mobile
    this.scale.setResizeCallback(() => {
      this.game.canvas.style.width = '100%';
      this.game.canvas.style.height = '100%';
    });

    // Prevent context menu on right-click
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Start preload
    this.scene.start('PreloadScene');
  }
}
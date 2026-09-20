// Candy Friends — Preload Scene
// Generates procedural assets (no external files needed)

import { Scene, GameObjects } from 'phaser';
import { CHARACTER_CONFIGS, CHARACTER_ORDER } from '@candy-friends/shared';

export class PreloadScene extends Scene {
  private loadingText!: GameObjects.Text;
  private progressBar!: GameObjects.Graphics;
  private progressBg!: GameObjects.Graphics;

  constructor() {
    super({ key: 'PreloadScene', active: false });
  }

  create(): void {
    const { width, height } = this.scale;

    // Loading UI
    this.loadingText = this.add.text(width / 2, height / 2 - 30, 'LOADING...', {
      fontSize: '24px',
      color: '#ffd700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);

    this.progressBg = this.add.graphics();
    this.progressBg.fillStyle(0x333333, 1);
    this.progressBg.fillRoundedRect(width / 2 - 150, height / 2 + 10, 300, 20, 10);
    this.progressBg.setDepth(100);

    this.progressBar = this.add.graphics();
    this.progressBar.setDepth(101);

    // Generate procedural assets
    this.generateAssets();

    // Simulate loading progress
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 800,
      onUpdate: (tween) => {
        const value = tween.getValue();
        this.updateProgress(value / 100);
      },
      onComplete: () => {
        this.scene.start('MenuScene');
      },
    });
  }

  private updateProgress(p: number): void {
    this.progressBar.clear();
    this.progressBar.fillStyle(0x00aa00, 1);
    this.progressBar.fillRoundedRect(
      this.scale.width / 2 - 145,
      this.scale.height / 2 + 15,
      290 * p,
      10,
      5
    );
    this.loadingText.setText(`LOADING... ${Math.round(p * 100)}%`);
  }

  private generateAssets(): void {
    // Generate character sprites as textures
    CHARACTER_ORDER.forEach((charId) => {
      const config = CHARACTER_CONFIGS[charId];
      this.generateCharacterTexture(charId, config.color);
    });

    // Generate tilemap textures
    this.generateTileTextures();

    // Generate core/substation textures
    this.generateCoreTextures();

    // Generate UI textures
    this.generateUITextures();
  }

  private generateCharacterTexture(charId: string, color: number): void {
    const size = 64;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Body
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(20, 20, 24, 36, 12);
    // Head
    graphics.fillCircle(32, 14, 14);
    // Eyes
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(27, 12, 3);
    graphics.fillCircle(37, 12, 3);

    graphics.generateTexture(charId, size, size);
    graphics.destroy();
  }

  private generateTileTextures(): void {
    const tiles = [
      { key: 'tile_floor', color: 0x2a2a3a, pattern: 'dots' },
      { key: 'tile_wall', color: 0x1a1a2a, pattern: 'bricks' },
      { key: 'tile_hazard', color: 0x4a1a1a, pattern: 'stripes' },
      { key: 'tile_conveyor', color: 0x3a3a2a, pattern: 'arrows' },
      { key: 'tile_ice', color: 0x1a3a4a, pattern: 'cracks' },
    ];

    tiles.forEach((tile) => {
      const size = 32;
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(tile.color, 1);
      graphics.fillRect(0, 0, size, size);

      if (tile.pattern === 'dots') {
        graphics.fillStyle(Phaser.Display.Color.ValueToColor(tile.color).brighten(20).color, 1);
        for (let x = 4; x < size; x += 8) {
          for (let y = 4; y < size; y += 8) {
            graphics.fillCircle(x, y, 1);
          }
        }
      } else if (tile.pattern === 'bricks') {
        graphics.lineStyle(1, Phaser.Display.Color.ValueToColor(tile.color).darken(20).color, 1);
        for (let y = 0; y < size; y += 8) {
          const offset = (y / 8) % 2 === 0 ? 0 : 16;
          for (let x = offset; x < size; x += 32) {
            graphics.strokeRect(x, y, 16, 8);
          }
        }
      } else if (tile.pattern === 'stripes') {
        graphics.fillStyle(0xff4444, 0.5);
        for (let x = -size; x < size * 2; x += 8) {
          graphics.fillTriangle(x, 0, x + 4, size, x, size);
        }
      } else if (tile.pattern === 'arrows') {
        graphics.fillStyle(0xffff00, 0.7);
        graphics.fillTriangle(16, 4, 12, 12, 20, 12);
        graphics.fillTriangle(16, 20, 12, 28, 20, 20);
      } else if (tile.pattern === 'cracks') {
        graphics.lineStyle(1, 0x88aacc, 0.5);
        graphics.beginPath();
        graphics.moveTo(8, 0);
        graphics.lineTo(12, 8);
        graphics.lineTo(6, 16);
        graphics.lineTo(14, 24);
        graphics.lineTo(10, 32);
        graphics.strokePath();
      }

      graphics.generateTexture(tile.key, size, size);
      graphics.destroy();
    });
  }

  private generateCoreTextures(): void {
    // Core texture
    const coreGfx = this.make.graphics({ x: 0, y: 0, add: false });
    coreGfx.fillStyle(0xffd700, 1);
    coreGfx.fillCircle(16, 16, 12);
    coreGfx.fillStyle(0xffaa00, 1);
    coreGfx.fillCircle(16, 16, 7);
    coreGfx.generateTexture('core', 32, 32);
    coreGfx.destroy();

    // Substation texture
    const subGfx = this.make.graphics({ x: 0, y: 0, add: false });
    subGfx.fillStyle(0x0044aa, 1);
    subGfx.fillRect(4, 4, 24, 24);
    subGfx.fillStyle(0x0088ff, 1);
    subGfx.fillRect(8, 8, 16, 16);
    subGfx.fillStyle(0x00ffff, 1);
    subGfx.fillCircle(16, 16, 5);
    subGfx.generateTexture('substation', 32, 32);
    subGfx.destroy();
  }

  private generateUITextures(): void {
    // Button textures
    const btnStates = ['btn_normal', 'btn_hover', 'btn_pressed', 'btn_disabled'];
    const colors = [0x333355, 0x444477, 0x222244, 0x1a1a2a];

    btnStates.forEach((key, i) => {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(colors[i], 1);
      graphics.fillRoundedRect(0, 0, 200, 56, 28);
      graphics.lineStyle(2, Phaser.Display.Color.ValueToColor(colors[i]).brighten(30).color, 1);
      graphics.strokeRoundedRect(0, 0, 200, 56, 28);
      graphics.generateTexture(key, 200, 56);
      graphics.destroy();
    });
  }
}
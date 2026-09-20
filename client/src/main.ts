// Candy Friends — Client Entry Point
// Phaser 4 + TypeScript

import 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { GAME_CONSTANTS } from '@candy-friends/shared';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  input: {
    touch: true,
    gamepad: false,
  },
  scene: [BootScene, PreloadScene, MenuScene, CharacterSelectScene, LobbyScene, GameScene],
  callbacks: {
    postBoot: (game: Phaser.Game) => {
      // Prevent zoom on mobile
      game.scale.on('resize', (gameSize) => {
        game.canvas.style.width = '100%';
        game.canvas.style.height = '100%';
      });
    },
  },
};

// Global game instance for debugging
declare global {
  interface Window {
    __CANDY_FRIENDS_GAME__: Phaser.Game;
  }
}

const game = new Phaser.Game(config);
window.__CANDY_FRIENDS_GAME__ = game;

// Handle visibility change for reconnection
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && game.scene.isActive('GameScene')) {
    const gameScene = game.scene.getScene('GameScene') as GameScene;
    gameScene?.handleVisibilityChange?.();
  }
});
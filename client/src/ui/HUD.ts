// Candy Friends — HUD (Heads-Up Display)

import { GameObjects, Scene } from 'phaser';
import type { PlayerState, CharacterId } from '@candy-friends/shared';
import { CHARACTER_CONFIGS, GAME_CONSTANTS } from '@candy-friends/shared';

export class HUD extends GameObjects.Container {
  private scene: Scene;
  private coreCounter: GameObjects.Text;
  private substationCounter: GameObjects.Text;
  private timerBar: GameObjects.Graphics;
  private timerBg: GameObjects.Graphics;
  private playerList: GameObjects.Container;
  private matchTimerText: GameObjects.Text;
  private batchProgress = 0;

  constructor(scene: Scene) {
    super(scene, 0, 0);
    this.scene = scene;
    scene.add.existing(this);
    this.setDepth(100);
    this.setScrollFactor(0);
    this.create();
  }

  private create(): void {
    const { width, height } = this.scene.scale;

    // Top-left: Core counter
    const coreIcon = this.scene.add.graphics();
    coreIcon.fillStyle(0xffd700, 1);
    coreIcon.fillCircle(16, 16, 12);
    coreIcon.fillStyle(0xffaa00, 1);
    coreIcon.fillCircle(16, 16, 8);
    this.add(coreIcon);

    this.coreCounter = this.scene.add.text(40, 8, '0 / 50', {
      fontSize: '18px',
      color: '#ffd700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(101);
    this.add(this.coreCounter);

    // Top-center: Substation counter
    this.substationCounter = this.scene.add.text(width / 2, 12, '⚡ 0 / 3', {
      fontSize: '16px',
      color: '#00ffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(101);
    this.add(this.substationCounter);

    // Top-right: Match timer / Batch progress
    this.timerBg = this.scene.add.graphics();
    this.timerBg.fillStyle(0x000000, 0.7);
    this.timerBg.fillRoundedRect(width - 220, 10, 200, 30, 15);
    this.add(this.timerBg);

    this.timerBar = this.scene.add.graphics();
    this.timerBar.setDepth(101);
    this.add(this.timerBar);

    this.matchTimerText = this.scene.add.text(width - 120, 25, '15:00', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(102);
    this.add(this.matchTimerText);

    // Bottom-left: Player list (compact)
    this.playerList = this.scene.add.container(10, height - 10);
    this.playerList.setDepth(100);
    this.add(this.playerList);
  }

  update(worldState: any, localPlayerId: string): void {
    // Update core counter
    this.coreCounter.setText(`${GAME_CONSTANTS.CORE_TARGET - worldState.coresRemaining} / ${GAME_CONSTANTS.CORE_TARGET}`);

    // Update substation counter
    this.substationCounter.setText(`⚡ ${worldState.substationsActive} / ${GAME_CONSTANTS.SUBSTATION_TARGET}`);

    // Update batch progress timer
    this.batchProgress = worldState.batchProgress || 0;
    const { width } = this.scene.scale;
    
    this.timerBar.clear();
    const barWidth = 190;
    const barHeight = 20;
    const barX = width - 215;
    const barY = 15;
    
    // Background
    this.timerBar.fillStyle(0x333333, 1);
    this.timerBar.fillRoundedRect(barX, barY, barWidth, barHeight, 10);
    
    // Progress
    const progressColor = this.batchProgress > 0.75 ? 0xff0000 : 
                          this.batchProgress > 0.5 ? 0xffaa00 : 0x00ff00;
    this.timerBar.fillStyle(progressColor, 1);
    this.timerBar.fillRoundedRect(barX, barY, barWidth * this.batchProgress, barHeight, 10);

    // Time remaining
    const remaining = Math.max(0, GAME_CONSTANTS.MATCH_TIME_MS * (1 - this.batchProgress));
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    this.matchTimerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
    this.matchTimerText.setColor(this.batchProgress > 0.75 ? '#ff4444' : '#ffffff');
  }

  updatePlayerList(players: PlayerState[], localPlayerId: string): void {
    this.playerList.removeAll(true);
    
    const yStart = 0;
    const itemHeight = 22;
    
    players.forEach((player, index) => {
      const config = CHARACTER_CONFIGS[player.characterId];
      const isLocal = player.id === localPlayerId;
      
      const bg = this.scene.add.graphics();
      bg.fillStyle(isLocal ? 0x444488 : 0x333333, 0.8);
      bg.fillRoundedRect(0, yStart - index * itemHeight - 2, 140, itemHeight, 8);
      this.playerList.add(bg);
      
      // Character color indicator
      const indicator = this.scene.add.graphics();
      indicator.fillStyle(config.color, 1);
      indicator.fillCircle(10, yStart - index * itemHeight + 8, 7);
      this.playerList.add(indicator);
      
      // Name
      const name = this.scene.add.text(24, yStart - index * itemHeight + 1, config.name, {
        fontSize: '11px',
        color: isLocal ? '#ffff00' : '#ffffff',
        fontFamily: 'Arial',
      }).setOrigin(0, 0.5).setDepth(101);
      this.playerList.add(name);
      
      // HP
      const hpText = this.scene.add.text(110, yStart - index * itemHeight + 1, `${player.hp}`, {
        fontSize: '10px',
        color: player.hp > 30 ? '#00ff00' : '#ff4444',
        fontFamily: 'Arial',
      }).setOrigin(1, 0.5).setDepth(101);
      this.playerList.add(hpText);
      
      // Status icons
      let iconX = 120;
      if (player.flags.downed) {
        const skull = this.scene.add.text(iconX, yStart - index * itemHeight + 1, '☠', {
          fontSize: '12px',
        }).setOrigin(0.5, 0.5).setDepth(101);
        this.playerList.add(skull);
        iconX += 14;
      }
      if (player.flags.stunned) {
        const stun = this.scene.add.text(iconX, yStart - index * itemHeight + 1, '⚡', {
          fontSize: '12px',
        }).setOrigin(0.5, 0.5).setDepth(101);
        this.playerList.add(stun);
      }
    });
  }

  resize(width: number, height: number): void {
    this.substationCounter.setPosition(width / 2, 12);
    this.timerBg.clear();
    this.timerBg.fillStyle(0x000000, 0.7);
    this.timerBg.fillRoundedRect(width - 220, 10, 200, 30, 15);
    this.matchTimerText.setPosition(width - 120, 25);
    this.playerList.setPosition(10, height - 10);
  }

  showMatchEnd(result: 'won' | 'lost', stats: any): void {
    const { width, height } = this.scene.scale;
    
    const overlay = this.scene.add.graphics();
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(200).setScrollFactor(0);
    this.add(overlay);
    
    const title = this.scene.add.text(width / 2, height / 2 - 60, result === 'won' ? '🎉 ESCAPED!' : '💀 THE BATCH COMPLETE', {
      fontSize: '48px',
      color: result === 'won' ? '#00ff00' : '#ff4444',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(201);
    this.add(title);
    
    const statsText = this.scene.add.text(width / 2, height / 2 + 20, 
      `Cores: ${stats.coresCollected}/${GAME_CONSTANTS.CORE_TARGET}\n` +
      `Substations: ${stats.substationsActivated}/${GAME_CONSTANTS.SUBSTATION_TARGET}\n` +
      `Survivors: ${stats.playersSurvived}\n` +
      `Time: ${Math.floor(stats.durationMs / 60000)}:${Math.floor((stats.durationMs % 60000) / 1000).toString().padStart(2, '0')}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5).setDepth(201);
    this.add(statsText);
    
    // Rematch button
    const rematchBtn = this.scene.add.graphics();
    rematchBtn.fillStyle(0x00aa00, 1);
    rematchBtn.fillRoundedRect(width / 2 - 100, height / 2 + 120, 200, 50, 25);
    rematchBtn.setDepth(200).setScrollFactor(0).setInteractive(
      new Phaser.Geom.Rectangle(width / 2 - 100, height / 2 + 120, 200, 50),
      Phaser.Geom.Rectangle.Contains
    );
    this.add(rematchBtn);
    
    const rematchText = this.scene.add.text(width / 2, height / 2 + 145, 'REMATCH', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(201);
    this.add(rematchText);
    
    rematchBtn.on('pointerdown', () => {
      this.scene.scene.restart();
    });
  }
}
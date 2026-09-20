// Candy Friends — Character Select UI

import { GameObjects, Scene } from 'phaser';
import type { CharacterId, PlayerInfo } from '@candy-friends/shared';
import { CHARACTER_CONFIGS, CHARACTER_ORDER, GAME_CONSTANTS } from '@candy-friends/shared';

export interface CharacterSelectCallbacks {
  onSelect: (characterId: CharacterId) => void;
  onReady: () => void;
  onLeave: () => void;
}

export class CharacterSelectUI extends GameObjects.Container {
  private scene: Scene;
  private callbacks: CharacterSelectCallbacks;
  private selectedChar: CharacterId | null = null;
  private playerInfos: Map<string, PlayerInfo> = new Map();
  private cardContainers: Map<CharacterId, GameObjects.Container> = new Map();
  private readyButton: GameObjects.Container | null = null;
  private leaveButton: GameObjects.Container | null = null;
  private isHost = false;
  private localPlayerId: string;

  constructor(scene: Scene, callbacks: CharacterSelectCallbacks, localPlayerId: string) {
    super(scene, 0, 0);
    this.scene = scene;
    this.callbacks = callbacks;
    this.localPlayerId = localPlayerId;
    scene.add.existing(this);
    this.setDepth(100);
    this.setScrollFactor(0);
    this.create();
  }

  private create(): void {
    const { width, height } = this.scene.scale;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, width, height);
    this.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 60, 'SELECT YOUR CANDY FRIEND', {
      fontSize: '32px',
      color: '#ffd700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(101);
    this.add(title);

    // Subtitle
    const subtitle = this.scene.add.text(width / 2, 100, 'First come, first served — click to claim', {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(101);
    this.add(subtitle);

    // Character grid (3x3)
    const cardWidth = 160;
    const cardHeight = 200;
    const spacing = 20;
    const startX = (width - (cardWidth * 3 + spacing * 2)) / 2;
    const startY = 150;

    CHARACTER_ORDER.forEach((charId, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = startX + col * (cardWidth + spacing);
      const y = startY + row * (cardHeight + spacing);
      
      const card = this.createCharacterCard(charId, x, y, cardWidth, cardHeight);
      this.cardContainers.set(charId, card);
      this.add(card);
    });

    // Ready button (bottom center)
    this.readyButton = this.createButton(width / 2, height - 100, 200, 56, 'READY', 0x00aa00, () => {
      if (this.selectedChar) this.callbacks.onReady();
    });
    this.readyButton.setVisible(false);
    this.add(this.readyButton);

    // Leave button (bottom left)
    this.leaveButton = this.createButton(80, height - 80, 140, 48, 'LEAVE', 0xaa0000, () => {
      this.callbacks.onLeave();
    });
    this.add(this.leaveButton);
  }

  private createCharacterCard(
    charId: CharacterId, 
    x: number, 
    y: number, 
    w: number, 
    h: number
  ): GameObjects.Container {
    const config = CHARACTER_CONFIGS[charId];
    const container = this.scene.add.container(x, y);
    container.setData('charId', charId);

    // Card background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x2a2a4a, 0.95);
    bg.fillRoundedRect(0, 0, w, h, 16);
    bg.lineStyle(2, 0x444466, 1);
    bg.strokeRoundedRect(0, 0, w, h, 16);
    container.add(bg);

    // Character preview (procedural)
    const preview = this.scene.add.graphics();
    preview.setPosition(w / 2, 60);
    this.drawCharacterPreview(preview, config.color);
    container.add(preview);

    // Name
    const name = this.scene.add.text(w / 2, 130, config.name, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(101);
    container.add(name);

    // Ability info
    const ability = this.scene.add.text(w / 2, 155, config.ability.id.replace('_', ' '), {
      fontSize: '11px',
      color: '#00ffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(101);
    container.add(ability);

    // Passive info
    const passive = this.scene.add.text(w / 2, 170, config.passive, {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'Arial',
      wordWrap: { width: w - 20 },
    }).setOrigin(0.5).setDepth(101);
    container.add(passive);

    // Selection overlay (hidden initially)
    const selectOverlay = this.scene.add.graphics();
    selectOverlay.setVisible(false);
    selectOverlay.setData('isOverlay', true);
    container.add(selectOverlay);

    // Taken indicator (hidden initially)
    const takenText = this.scene.add.text(w / 2, h - 25, 'TAKEN', {
      fontSize: '14px',
      color: '#ff4444',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(102);
    takenText.setVisible(false);
    takenText.setData('isTaken', true);
    container.add(takenText);

    // Click handler
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', () => this.onCardClick(charId));
    container.on('pointerover', () => this.onCardHover(charId, true));
    container.on('pointerout', () => this.onCardHover(charId, false));

    return container;
  }

  private drawCharacterPreview(graphics: GameObjects.Graphics, color: number): void {
    graphics.clear();
    graphics.fillStyle(color, 1);
    // Body
    graphics.fillRoundedRect(-12, -18, 24, 36, 12);
    // Head
    graphics.fillCircle(0, -26, 14);
    // Eyes
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(-5, -28, 3);
    graphics.fillCircle(5, -28, 3);
  }

  private createButton(
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    text: string, 
    color: number, 
    callback: () => void
  ): GameObjects.Container {
    const container = this.scene.add.container(x, y);
    
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w/2, -h/2, w, h, h/2);
    container.add(bg);
    
    const label = this.scene.add.text(0, 0, text, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(101);
    container.add(label);

    container.setSize(w, h);
    container.setInteractive(new Phaser.Geom.Rectangle(-w/2, -h/2, w, h), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', callback);
    container.on('pointerover', () => { bg.clear(); bg.fillStyle(Phaser.Display.Color.ValueToColor(color).brighten(30).color, 1); bg.fillRoundedRect(-w/2, -h/2, w, h, h/2); });
    container.on('pointerout', () => { bg.clear(); bg.fillStyle(color, 1); bg.fillRoundedRect(-w/2, -h/2, w, h, h/2); });

    return container;
  }

  private onCardClick(charId: CharacterId): void {
    const playerInfo = this.getPlayerForChar(charId);
    if (playerInfo && playerInfo.id !== this.localPlayerId) return; // Taken by someone else

    this.selectedChar = charId;
    this.callbacks.onSelect(charId);
    this.updateCards();
    this.readyButton?.setVisible(true);
  }

  private onCardHover(charId: CharacterId, hover: boolean): void {
    const container = this.cardContainers.get(charId);
    if (!container) return;
    
    const bg = container.list[0] as GameObjects.Graphics;
    if (hover && !this.getPlayerForChar(charId)) {
      bg.clear();
      bg.fillStyle(0x3a3a5a, 0.95);
      bg.fillRoundedRect(0, 0, 160, 200, 16);
      bg.lineStyle(2, 0x00ffff, 1);
      bg.strokeRoundedRect(0, 0, 160, 200, 16);
    } else if (!this.getPlayerForChar(charId)) {
      bg.clear();
      bg.fillStyle(0x2a2a4a, 0.95);
      bg.fillRoundedRect(0, 0, 160, 200, 16);
      bg.lineStyle(2, 0x444466, 1);
      bg.strokeRoundedRect(0, 0, 160, 200, 16);
    }
  }

  private getPlayerForChar(charId: CharacterId): PlayerInfo | undefined {
    for (const info of this.playerInfos.values()) {
      if (info.characterId === charId) return info;
    }
    return undefined;
  }

  updatePlayers(players: PlayerInfo[]): void {
    this.playerInfos.clear();
    for (const p of players) {
      this.playerInfos.set(p.id, p);
    }
    this.updateCards();
  }

  private updateCards(): void {
    for (const [charId, container] of this.cardContainers) {
      const playerInfo = this.getPlayerForChar(charId);
      const isTaken = !!playerInfo && playerInfo.id !== this.localPlayerId;
      const isMine = !!playerInfo && playerInfo.id === this.localPlayerId;
      
      // Update taken indicator
      const takenText = container.list.find((c) => c.getData('isTaken')) as GameObjects.Text;
      if (takenText) takenText.setVisible(isTaken);
      
      // Update selection overlay
      const overlay = container.list.find((c) => c.getData('isOverlay')) as GameObjects.Graphics;
      if (overlay) {
        overlay.clear();
        if (isMine) {
          overlay.setVisible(true);
          overlay.lineStyle(4, 0x00ff00, 1);
          overlay.strokeRoundedRect(2, 2, 156, 196, 14);
        } else if (this.selectedChar === charId) {
          overlay.setVisible(true);
          overlay.lineStyle(4, 0x00ffff, 1);
          overlay.strokeRoundedRect(2, 2, 156, 196, 14);
        } else {
          overlay.setVisible(false);
        }
      }
      
      // Dim taken cards
      const bg = container.list[0] as GameObjects.Graphics;
      if (isTaken) {
        bg.clear();
        bg.fillStyle(0x1a1a2a, 0.95);
        bg.fillRoundedRect(0, 0, 160, 200, 16);
        bg.lineStyle(2, 0x333344, 1);
        bg.strokeRoundedRect(0, 0, 160, 200, 16);
      } else if (!isMine && this.selectedChar !== charId) {
        bg.clear();
        bg.fillStyle(0x2a2a4a, 0.95);
        bg.fillRoundedRect(0, 0, 160, 200, 16);
        bg.lineStyle(2, 0x444466, 1);
        bg.strokeRoundedRect(0, 0, 160, 200, 16);
      }
    }
  }

  setHost(isHost: boolean): void {
    this.isHost = isHost;
    if (this.readyButton) {
      const label = this.readyButton.list[1] as GameObjects.Text;
      label.setText(isHost ? 'START GAME' : 'READY');
    }
  }

  setSelectedChar(charId: CharacterId | null): void {
    this.selectedChar = charId;
    this.readyButton?.setVisible(!!charId);
    this.updateCards();
  }

  resize(width: number, height: number): void {
    // Reposition buttons
    this.readyButton?.setPosition(width / 2, height - 100);
    this.leaveButton?.setPosition(80, height - 80);
  }
}
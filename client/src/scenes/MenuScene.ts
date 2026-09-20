// Candy Friends — Menu Scene
// Create/Join room, enter name

import { Scene, GameObjects } from 'phaser';
import { NetworkManager, ConnectionState } from '../network/NetworkManager';

export class MenuScene extends Scene {
  private nameInput!: HTMLInputElement;
  private createBtn!: GameObjects.Container;
  private joinBtn!: GameObjects.Container;
  private codeInput!: HTMLInputElement;
  private statusText!: GameObjects.Text;
  private networkManager: NetworkManager | null = null;
  private playerName = 'Player';

  constructor() {
    super({ key: 'MenuScene', active: false });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, width, height);
    bg.setScrollFactor(0);

    // Title
    this.add.text(width / 2, 80, 'CANDY FRIENDS', {
      fontSize: '48px',
      color: '#ffd700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    this.add.text(width / 2, 130, 'Escape the Factory Together', {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Name input
    this.createNameInput(width, height);

    // Create Game button
    this.createBtn = this.createButton(width / 2, height / 2 + 20, 280, 60, 'CREATE GAME', 0x00aa00, () => {
      this.createGame();
    });
    this.createBtn.setDepth(10).setScrollFactor(0);

    // Or divider
    this.add.text(width / 2, height / 2 + 100, 'OR', {
      fontSize: '16px',
      color: '#666666',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Join Game section
    this.createJoinSection(width, height);

    // Status text
    this.statusText = this.add.text(width / 2, height - 80, '', {
      fontSize: '14px',
      color: '#00ff00',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Handle resize
    this.scale.on('resize', this.onResize, this);
  }

  private createNameInput(width: number, height: number): void {
    const inputContainer = document.createElement('div');
    inputContainer.style.position = 'absolute';
    inputContainer.style.left = `${width / 2 - 140}px`;
    inputContainer.style.top = `${height / 2 - 120}px`;
    inputContainer.style.zIndex = '100';
    inputContainer.innerHTML = `
      <label style="display:block; color:#fff; font:14px Arial; margin-bottom:8px; text-align:center;">
        YOUR NAME
      </label>
      <input type="text" id="player-name-input" maxlength="16" value="Player" 
        style="width:280px; height:48px; padding:0 16px; font:18px Arial; 
        background:#2a2a4a; border:2px solid #444466; border-radius:8px; color:#fff; 
        text-align:center; outline:none;" />
    `;
    document.body.appendChild(inputContainer);
    this.nameInput = document.getElementById('player-name-input') as HTMLInputElement;

    this.nameInput.addEventListener('input', () => {
      this.playerName = this.nameInput.value.trim() || 'Player';
    });
  }

  private createJoinSection(width: number, height: number): void {
    const joinContainer = document.createElement('div');
    joinContainer.style.position = 'absolute';
    joinContainer.style.left = `${width / 2 - 140}px`;
    joinContainer.style.top = `${height / 2 + 130}px`;
    joinContainer.style.zIndex = '100';
    joinContainer.innerHTML = `
      <input type="text" id="room-code-input" maxlength="6" placeholder="ROOM CODE" 
        style="width:280px; height:48px; padding:0 16px; font:18px Arial; 
        background:#2a2a4a; border:2px solid #444466; border-radius:8px; color:#fff; 
        text-align:center; outline:none; text-transform:uppercase;" />
    `;
    document.body.appendChild(joinContainer);
    this.codeInput = document.getElementById('room-code-input') as HTMLInputElement;

    this.joinBtn = this.createButton(width / 2, height / 2 + 210, 280, 60, 'JOIN GAME', 0x0066aa, () => {
      this.joinGame();
    });
    this.joinBtn.setDepth(10).setScrollFactor(0);
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
    const container = this.add.container(x, y);
    
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w/2, -h/2, w, h, h/2);
    container.add(bg);
    
    const label = this.add.text(0, 0, text, {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);
    container.add(label);

    container.setSize(w, h);
    container.setInteractive(new Phaser.Geom.Rectangle(-w/2, -h/2, w, h), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', callback);
    container.on('pointerover', () => { 
      bg.clear(); 
      bg.fillStyle(Phaser.Display.Color.ValueToColor(color).brighten(30).color, 1); 
      bg.fillRoundedRect(-w/2, -h/2, w, h, h/2); 
    });
    container.on('pointerout', () => { 
      bg.clear(); 
      bg.fillStyle(color, 1); 
      bg.fillRoundedRect(-w/2, -h/2, w, h, h/2); 
    });

    return container;
  }

  private async createGame(): void {
    if (!this.playerName.trim()) return;
    
    this.setButtonsEnabled(false);
    this.statusText.setText('Creating room...').setColor('#ffff00');

    try {
      const response = await fetch(`${window.location.origin}/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) throw new Error('Failed to create room');
      
      const data = await response.json();
      this.startGame(data.code);
    } catch (e) {
      this.statusText.setText('Failed to create room').setColor('#ff4444');
      this.setButtonsEnabled(true);
    }
  }

  private joinGame(): void {
    const code = this.codeInput.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      this.statusText.setText('Enter a 6-character room code').setColor('#ff4444');
      return;
    }
    
    if (!this.playerName.trim()) return;
    
    this.setButtonsEnabled(false);
    this.statusText.setText('Joining room...').setColor('#ffff00');
    this.startGame(code);
  }

  private startGame(roomCode: string): void {
    this.cleanupDOM();
    this.scene.start('CharacterSelectScene', { roomCode, playerName: this.playerName });
  }

  private setButtonsEnabled(enabled: boolean): void {
    [this.createBtn, this.joinBtn].forEach((btn) => {
      if (btn) {
        btn.disableInteractive();
        if (enabled) btn.setInteractive();
        const bg = btn.list[0] as GameObjects.Graphics;
        bg.clear();
        bg.fillStyle(enabled ? 0x00aa00 : 0x333333, 1);
        bg.fillRoundedRect(-140, -30, 280, 60, 30);
      }
    });
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    if (this.nameInput) {
      this.nameInput.style.left = `${gameSize.width / 2 - 140}px`;
      this.nameInput.style.top = `${gameSize.height / 2 - 120}px`;
    }
    if (this.codeInput) {
      this.codeInput.style.left = `${gameSize.width / 2 - 140}px`;
      this.codeInput.style.top = `${gameSize.height / 2 + 130}px`;
    }
  }

  private cleanupDOM(): void {
    this.nameInput?.remove();
    this.codeInput?.remove();
    this.nameInput = null as any;
    this.codeInput = null as any;
  }

  shutdown(): void {
    this.cleanupDOM();
    this.scale.off('resize', this.onResize, this);
  }
}
// Candy Friends — Lobby Scene
// Shows all players, ready status, host starts when all ready

import { Scene, GameObjects } from 'phaser';
import { NetworkManager, ConnectionState } from '../network/NetworkManager';
import type { PlayerInfo, RoomLobbyState } from '@candy-friends/shared';
import { CHARACTER_CONFIGS } from '@candy-friends/shared';

interface LobbyData {
  roomCode: string;
  playerName: string;
  playerId: string;
}

export class LobbyScene extends Scene {
  private data!: LobbyData;
  private networkManager!: NetworkManager;
  private playerListContainer!: GameObjects.Container;
  private startBtn!: GameObjects.Container | null;
  private leaveBtn!: GameObjects.Container;
  private statusText!: GameObjects.Text;
  private connectionState: ConnectionState = 'disconnected';
  private localPlayerId: string;

  constructor() {
    super({ key: 'LobbyScene', active: false });
  }

  init(data: LobbyData): void {
    this.data = data;
    this.localPlayerId = data.playerId;
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, width, height);
    bg.setScrollFactor(0);

    // Title
    this.add.text(width / 2, 40, 'LOBBY', {
      fontSize: '36px',
      color: '#ffd700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    this.add.text(width / 2, 80, `ROOM: ${this.data.roomCode}`, {
      fontSize: '16px',
      color: '#00ffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Player list area
    this.playerListContainer = this.add.container(width / 2, 140);
    this.playerListContainer.setDepth(10).setScrollFactor(0);

    // Status text
    this.statusText = this.add.text(width / 2, height - 140, 'Waiting for players...', {
      fontSize: '16px',
      color: '#ffff00',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Start button (host only)
    this.startBtn = this.createButton(width / 2, height - 80, 240, 56, 'START GAME', 0x00aa00, () => {
      this.networkManager.sendReady(); // Host sends ready to start
    });
    this.startBtn.setVisible(false);
    this.startBtn.setDepth(10).setScrollFactor(0);

    // Leave button
    this.leaveBtn = this.createButton(width - 80, 40, 120, 44, 'LEAVE', 0xaa0000, () => {
      this.onLeave();
    });
    this.leaveBtn.setDepth(10).setScrollFactor(0);

    // Connection status
    const connStatus = this.add.text(20, 20, 'CONNECTING...', {
      fontSize: '12px',
      color: '#ffff00',
      fontFamily: 'Arial',
    }).setOrigin(0, 0).setDepth(10).setScrollFactor(0);

    // Initialize network
    this.networkManager = new NetworkManager({
      roomCode: this.data.roomCode,
      playerName: this.data.playerName,
      playerId: this.data.playerId,
      onState: () => {}, // Not used in lobby
      onLobbyUpdate: (lobby) => this.handleLobbyUpdate(lobby),
      onError: (code, msg) => this.handleError(code, msg),
      onConnectionChange: (state) => {
        this.connectionState = state;
        connStatus.setText(state.toUpperCase());
        connStatus.setColor(
          state === 'connected' ? '#00ff00' :
          state === 'reconnecting' ? '#ffff00' :
          state === 'error' ? '#ff4444' : '#ffff00'
        );
      },
      onJoined: () => {},
    });

    this.networkManager.connect();
    this.scale.on('resize', this.onResize, this);
  }

  private handleLobbyUpdate(lobby: RoomLobbyState): void {
    this.renderPlayerList(lobby.players);
    
    const isHost = lobby.hostId === this.localPlayerId;
    const allReady = lobby.players.length >= 2 && lobby.players.every((p) => p.ready);
    
    if (isHost) {
      this.startBtn?.setVisible(allReady);
      this.statusText.setText(allReady ? 'All ready — press START!' : `Waiting for players (${lobby.players.length}/9)`);
      this.statusText.setColor(allReady ? '#00ff00' : '#ffff00');
    } else {
      const localPlayer = lobby.players.find((p) => p.id === this.localPlayerId);
      this.statusText.setText(localPlayer?.ready ? 'Ready! Waiting for host...' : 'Press READY in character select');
      this.statusText.setColor(localPlayer?.ready ? '#00ff00' : '#ffff00');
    }

    // Transition to game
    if (lobby.status === 'active') {
      this.networkManager.disconnect();
      this.scene.start('GameScene', { 
        roomCode: this.data.roomCode, 
        playerName: this.data.playerName,
        playerId: this.localPlayerId,
      });
    }
  }

  private renderPlayerList(players: PlayerInfo[]): void {
    this.playerListContainer.removeAll(true);
    
    const itemHeight = 56;
    const startY = -(players.length - 1) * itemHeight / 2;

    players.forEach((player, index) => {
      const y = startY + index * itemHeight;
      const config = player.characterId ? CHARACTER_CONFIGS[player.characterId] : null;
      const isLocal = player.id === this.localPlayerId;
      const isHost = player.isHost;

      // Background
      const bg = this.add.graphics();
      bg.fillStyle(isLocal ? 0x333366 : 0x2a2a4a, 0.9);
      bg.fillRoundedRect(-180, y - itemHeight/2, 360, itemHeight - 8, 12);
      if (isLocal) {
        bg.lineStyle(2, 0x00ffff, 1);
        bg.strokeRoundedRect(-180, y - itemHeight/2, 360, itemHeight - 8, 12);
      }
      this.playerListContainer.add(bg);

      // Character color indicator
      if (config) {
        const indicator = this.add.graphics();
        indicator.fillStyle(config.color, 1);
        indicator.fillCircle(-150, y, 14);
        this.playerListContainer.add(indicator);
      }

      // Name
      const name = this.add.text(-120, y, player.name + (isLocal ? ' (YOU)' : ''), {
        fontSize: '16px',
        color: isLocal ? '#ffff00' : '#ffffff',
        fontFamily: 'Arial',
      }).setOrigin(0, 0.5).setDepth(11);
      this.playerListContainer.add(name);

      // Character name
      if (config) {
        const charName = this.add.text(-120, y + 18, config.name, {
          fontSize: '12px',
          color: config.color.toString(16).padStart(6, '0'),
          fontFamily: 'Arial',
        }).setOrigin(0, 0.5).setDepth(11);
        this.playerListContainer.add(charName);
      }

      // Host badge
      if (isHost) {
        const hostBadge = this.add.text(100, y, 'HOST', {
          fontSize: '11px',
          color: '#ffd700',
          fontFamily: 'Arial',
          backgroundColor: '#332200',
          padding: { x: 6, y: 2 },
        }).setOrigin(0.5, 0.5).setDepth(11);
        this.playerListContainer.add(hostBadge);
      }

      // Ready status
      const readyText = this.add.text(150, y, player.ready ? '✓ READY' : '○ WAITING', {
        fontSize: '14px',
        color: player.ready ? '#00ff00' : '#ffaa00',
        fontFamily: 'Arial',
      }).setOrigin(1, 0.5).setDepth(11);
      this.playerListContainer.add(readyText);
    });
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
      fontSize: '20px',
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

  private onLeave(): void {
    this.networkManager.disconnect();
    this.cleanup();
    this.scene.start('MenuScene');
  }

  private handleError(code: string, msg: string): void {
    console.error('Network error:', code, msg);
    this.statusText.setText(`Error: ${msg}`).setColor('#ff4444');
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.playerListContainer.setPosition(gameSize.width / 2, 140);
    this.startBtn?.setPosition(gameSize.width / 2, gameSize.height - 80);
    this.leaveBtn.setPosition(gameSize.width - 80, 40);
    this.statusText.setPosition(gameSize.width / 2, gameSize.height - 140);
  }

  private cleanup(): void {
    this.networkManager.disconnect();
    this.scale.off('resize', this.onResize, this);
  }

  shutdown(): void {
    this.cleanup();
  }
}
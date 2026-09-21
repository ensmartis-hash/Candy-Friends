// Candy Friends — Character Select Scene
// 9 character cards, pick one, ready up

import { Scene } from 'phaser';
import { NetworkManager, ConnectionState } from '../network/NetworkManager';
import { CharacterSelectUI, CharacterSelectCallbacks } from '../ui/CharacterSelectUI';
import { soundManager } from '../audio/SoundManager';
import type { PlayerInfo, CharacterId, RoomLobbyState } from '@candy-friends/shared';
import { CHARACTER_ORDER } from '@candy-friends/shared';

interface CharacterSelectData {
  roomCode: string;
  playerName: string;
}

export class CharacterSelectScene extends Scene {
  private data!: CharacterSelectData;
  private networkManager!: NetworkManager;
  private characterSelectUI!: CharacterSelectUI;
  private selectedChar: CharacterId | null = null;
  private playerId: string | null = null;
  private isHost = false;
  private connectionState: ConnectionState = 'disconnected';

  constructor() {
    super({ key: 'CharacterSelectScene', active: false });
  }

  init(data: CharacterSelectData): void {
    this.data = data;
  }

  create(): void {
    const { width, height } = this.scale;

    // Initialize sound manager
    soundManager.init();

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, width, height);
    bg.setScrollFactor(0);

    // Room code display
    this.add.text(width / 2, 30, `ROOM: ${this.data.roomCode}`, {
      fontSize: '16px',
      color: '#00ffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    // Connection status
    const statusText = this.add.text(width - 20, 20, 'CONNECTING...', {
      fontSize: '12px',
      color: '#ffff00',
      fontFamily: 'Arial',
    }).setOrigin(1, 0).setDepth(10).setScrollFactor(0);

    // Initialize network
    this.networkManager = new NetworkManager({
      roomCode: this.data.roomCode,
      playerName: this.data.playerName,
      onState: () => {}, // Not used in this scene
      onLobbyUpdate: (lobby) => this.handleLobbyUpdate(lobby),
      onError: (code, msg) => this.handleError(code, msg),
      onConnectionChange: (state) => {
        this.connectionState = state;
        statusText.setText(state.toUpperCase());
        statusText.setColor(
          state === 'connected' ? '#00ff00' :
          state === 'reconnecting' ? '#ffff00' :
          state === 'error' ? '#ff4444' : '#ffff00'
        );
      },
      onJoined: (playerInfo, assignedChar) => {
        this.playerId = playerInfo.id;
        this.isHost = playerInfo.isHost;
        if (!this.selectedChar && assignedChar) {
          this.selectedChar = assignedChar;
          this.characterSelectUI.setSelectedChar(assignedChar);
        }
      },
    });

    // Character select UI
    const callbacks: CharacterSelectCallbacks = {
      onSelect: (charId) => this.onCharacterSelect(charId),
      onReady: () => this.onReady(),
      onLeave: () => this.onLeave(),
    };

    this.characterSelectUI = new CharacterSelectUI(this, callbacks, this.playerId || '');
    this.characterSelectUI.setDepth(20).setScrollFactor(0);

    // Connect
    this.networkManager.connect();

    // Handle resize
    this.scale.on('resize', this.onResize, this);
  }

  private handleLobbyUpdate(lobby: RoomLobbyState): void {
    this.characterSelectUI.updatePlayers(lobby.players);
    this.characterSelectUI.setHost(this.isHost && lobby.status === 'lobby');
    
    // If host and all ready, transition to lobby
    if (this.isHost && lobby.status === 'active') {
      this.networkManager.disconnect();
      this.scene.start('LobbyScene', { 
        roomCode: this.data.roomCode, 
        playerName: this.data.playerName,
        playerId: this.playerId,
      });
    }
  }

  private onCharacterSelect(charId: CharacterId): void {
    this.selectedChar = charId;
    soundManager.playButton();
    // Character selection is handled by server on ready
  }

  private onReady(): void {
    if (!this.selectedChar) return;
    soundManager.playButton();
    this.networkManager.sendReady();
  }

  private onLeave(): void {
    this.networkManager.disconnect();
    this.cleanup();
    this.scene.start('MenuScene');
  }

  private handleError(code: string, msg: string): void {
    console.error('Network error:', code, msg);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.characterSelectUI.resize(gameSize.width, gameSize.height);
  }

  private cleanup(): void {
    this.networkManager.disconnect();
    this.scale.off('resize', this.onResize, this);
  }

  shutdown(): void {
    this.cleanup();
  }
}
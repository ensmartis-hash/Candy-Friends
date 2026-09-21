// Candy Friends — Game Scene
// Main gameplay: prediction, interpolation, procedural world, HUD

import { Scene, GameObjects, Tilemaps, Math as PhaserMath, Cameras } from 'phaser';
import { NetworkManager, ConnectionState } from '../network/NetworkManager';
import { InputManager, InputState } from '../input/InputManager';
import { PlayerEntity } from '../entities/PlayerEntity';
import { OtherPlayerEntity } from '../entities/OtherPlayerEntity';
import { HUD } from '../ui/HUD';
import { soundManager } from '../audio/SoundManager';
import type { 
  ServerSnapshot, 
  PlayerState, 
  WorldState, 
  GameEvent, 
  ClientInput, 
  CharacterId,
  Vec2,
  RoomLobbyState,
  PlayerInfo
} from '@candy-friends/shared';
import { 
  CHARACTER_CONFIGS, 
  CHARACTER_ORDER, 
  GAME_CONSTANTS, 
  GAME_CONSTANTS as GC,
  isServerSnapshot 
} from '@candy-friends/shared';

interface GameData {
  roomCode: string;
  playerName: string;
  playerId: string;
}

export class GameScene extends Scene {
  private data!: GameData;
  private networkManager!: NetworkManager;
  private inputManager!: InputManager;
  private localPlayer!: PlayerEntity;
  private otherPlayers: Map<string, OtherPlayerEntity> = new Map();
  private hud!: HUD;
  
  // Network state
  private playerId: string;
  private roomCode: string;
  private lastServerTick = 0;
  private pendingInputs: ClientInput[] = [];
  private inputSequence = 0;
  private lastSentInputSeq = 0;
  
  // Reconciliation
  private serverStates: Map<number, PlayerState> = new Map(); // tick -> state
  private readonly maxServerStates = 100;
  
  // Interpolation
  private previousSnapshots: Map<string, PlayerState[]> = new Map(); // playerId -> [prev, current]
  private interpolationAlpha = 0;
  
  // World
  private tilemap: Tilemaps.Tilemap | null = null;
  private worldLayer: Tilemaps.TilemapLayer | null = null;
  private worldEntities: Map<string, GameObjects.GameObject> = new Map();
  
  // Connection
  private connectionState: ConnectionState = 'disconnected';
  private reconnecting = false;
  private lastTick = 0;
  
  // Input
  private currentInput: InputState = {
    moveDir: { x: 0, y: 0 },
    abilityPressed: [false, false],
    interactPressed: false,
    isTouch: false,
  };

  constructor() {
    super({ key: 'GameScene', active: false, physics: { arcade: { debug: false } } });
  }

  init(data: GameData): void {
    this.data = data;
    this.playerId = data.playerId;
    this.roomCode = data.roomCode;
  }

  create(): void {
    const { width, height } = this.scale;

    // Initialize sound manager
    soundManager.init();

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d0d1a, 0x0d0d1a, 0x1a1a2e, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);
    bg.setScrollFactor(0);

    // Create procedural tilemap
    this.createTilemap();

    // Initialize network
    this.networkManager = new NetworkManager({
      roomCode: this.roomCode,
      playerName: this.data.playerName,
      playerId: this.playerId,
      lastTick: this.lastTick,
      onState: (snapshot) => this.handleServerSnapshot(snapshot),
      onLobbyUpdate: () => {},
      onError: (code, msg) => this.handleError(code, msg),
      onConnectionChange: (state) => {
        this.connectionState = state;
        if (state === 'reconnecting') this.reconnecting = true;
        if (state === 'connected' && this.reconnecting) {
          this.reconnecting = false;
          this.networkManager.requestState();
        }
      },
      onJoined: (playerInfo, assignedChar) => {
        // Rejoined after reconnect
        if (!this.localPlayer) {
          this.spawnLocalPlayer(playerInfo, assignedChar);
        }
      },
    });

    // Input manager
    this.inputManager = new InputManager(this);
    this.inputManager.onInput((state) => {
      this.currentInput = state;
    });

    // HUD
    this.hud = new HUD(this);
    this.hud.setDepth(200);

    // Camera follows local player
    this.cameras.main.setBounds(0, 0, 2000, 2000);
    this.cameras.main.setRoundPixels(true);

    // Connect
    this.networkManager.connect();

    // Input send loop (60Hz)
    this.time.addEvent({
      delay: 1000 / 60,
      callback: this.sendInputs,
      callbackScope: this,
      loop: true,
    });

    // Handle resize
    this.scale.on('resize', this.onResize, this);
    
    // Handle visibility change for reconnection
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
  }

  private createTilemap(): void {
    // Procedural factory tilemap (64x64 tiles = 2048x2048 pixels)
    const mapWidth = 64;
    const mapHeight = 64;
    const tileSize = GC.TILE_SIZE;

    this.tilemap = this.make.tilemap({ 
      tileWidth: tileSize, 
      tileHeight: tileSize,
      width: mapWidth,
      height: mapHeight,
    });

    // Add tilesets
    const floorTileset = this.tilemap.addTilesetImage('tile_floor');
    const wallTileset = this.tilemap.addTilesetImage('tile_wall');
    const hazardTileset = this.tilemap.addTilesetImage('tile_hazard');
    const conveyorTileset = this.tilemap.addTilesetImage('tile_conveyor');
    const iceTileset = this.tilemap.addTilesetImage('tile_ice');

    // Generate layers procedurally
    const floorLayer = this.tilemap.createBlankLayer('Floor', floorTileset!, 0, 0);
    const wallLayer = this.tilemap.createBlankLayer('Walls', wallTileset!, 0, 0);
    const hazardLayer = this.tilemap.createBlankLayer('Hazards', hazardTileset!, 0, 0);
    const conveyorLayer = this.tilemap.createBlankLayer('Conveyors', conveyorTileset!, 0, 0);
    const iceLayer = this.tilemap.createBlankLayer('Ice', iceTileset!, 0, 0);

    // Fill with base floor
    if (floorLayer) {
      floorLayer.fill(0);
      floorLayer.setDepth(0);
    }

    // Generate factory layout
    this.generateFactoryLayout(wallLayer, hazardLayer, conveyorLayer, iceLayer);

    // Wall collision
    if (wallLayer) {
      wallLayer.setCollisionBetween(0, 100);
      wallLayer.setDepth(5);
      this.physics.add.collider(this.localPlayer, wallLayer);
    }

    this.worldLayer = floorLayer!;
  }

  private generateFactoryLayout(
    wallLayer: Tilemaps.TilemapLayer | null,
    hazardLayer: Tilemaps.TilemapLayer | null,
    conveyorLayer: Tilemaps.TilemapLayer | null,
    iceLayer: Tilemaps.TilemapLayer | null
  ): void {
    if (!wallLayer || !hazardLayer || !conveyorLayer || !iceLayer) return;

    const rng = PhaserMath.RNG;
    const mapW = this.tilemap!.width;
    const mapH = this.tilemap!.height;

    // Outer walls
    for (let x = 0; x < mapW; x++) {
      wallLayer.putTileAt(0, x, 0);
      wallLayer.putTileAt(0, x, mapH - 1);
    }
    for (let y = 0; y < mapH; y++) {
      wallLayer.putTileAt(0, 0, y);
      wallLayer.putTileAt(0, mapW - 1, y);
    }

    // Inner walls - create rooms
    const rooms = [
      { x: 8, y: 8, w: 20, h: 15 },    // Reception
      { x: 35, y: 8, w: 20, h: 15 },   // Mixing Vats
      { x: 8, y: 30, w: 20, h: 15 },   // Cooling Tunnels
      { x: 35, y: 30, w: 20, h: 15 },  // Packaging
    ];

    rooms.forEach((room) => {
      // Room walls
      for (let x = room.x; x < room.x + room.w; x++) {
        wallLayer.putTileAt(0, x, room.y);
        wallLayer.putTileAt(0, x, room.y + room.h - 1);
      }
      for (let y = room.y; y < room.y + room.h; y++) {
        wallLayer.putTileAt(0, room.x, y);
        wallLayer.putTileAt(0, room.x + room.w - 1, y);
      }
      // Doorways
      wallLayer.removeTileAt(room.x + Math.floor(room.w/2), room.y);
      wallLayer.removeTileAt(room.x + Math.floor(room.w/2), room.y + room.h - 1);
      wallLayer.removeTileAt(room.x, room.y + Math.floor(room.h/2));
      wallLayer.removeTileAt(room.x + room.w - 1, room.y + Math.floor(room.h/2));
    });

    // Hazards in Mixing Vats
    for (let i = 0; i < 10; i++) {
      const x = 38 + rng().toFixed(1) * 15;
      const y = 11 + rng().toFixed(1) * 10;
      hazardLayer.putTileAt(0, Math.floor(x), Math.floor(y));
    }

    // Conveyors in Packaging
    for (let x = 38; x < 52; x += 4) {
      for (let y = 33; y < 42; y += 4) {
        conveyorLayer.putTileAt(0, x, y);
      }
    }

    // Ice in Cooling Tunnels
    for (let x = 11; x < 25; x++) {
      for (let y = 33; y < 42; y++) {
        if (rng() < 0.3) iceLayer.putTileAt(0, x, y);
      }
    }

    // Spawn cores
    const corePositions = [
      { x: 15, y: 15 }, { x: 22, y: 12 }, { x: 40, y: 15 }, { x: 48, y: 12 },
      { x: 15, y: 38 }, { x: 22, y: 35 }, { x: 40, y: 38 }, { x: 48, y: 35 },
      { x: 20, y: 23 }, { x: 44, y: 23 },
    ];
    corePositions.forEach((pos) => {
      const core = this.add.image(pos.x * GC.TILE_SIZE, pos.y * GC.TILE_SIZE, 'core');
      core.setDepth(8);
      core.setData('entityId', `core-${pos.x}-${pos.y}`);
      core.setData('type', 'core');
      this.worldEntities.set(`core-${pos.x}-${pos.y}`, core);
    });

    // Substations
    const subPositions = [
      { x: 18, y: 18 }, { x: 42, y: 18 }, { x: 18, y: 40 }, { x: 42, y: 40 }, { x: 32, y: 24 },
    ];
    subPositions.forEach((pos, i) => {
      const sub = this.add.image(pos.x * GC.TILE_SIZE, pos.y * GC.TILE_SIZE, 'substation');
      sub.setDepth(8);
      sub.setData('entityId', `substation-${i}`);
      sub.setData('type', 'substation');
      this.worldEntities.set(`substation-${i}`, sub);
    });
  }

  private spawnLocalPlayer(playerInfo: PlayerInfo, charId: CharacterId): void {
    const spawnPos = { x: 160, y: 160 }; // Reception area
    const initialState = {
      id: playerInfo.id,
      characterId: charId,
      pos: spawnPos,
      vel: { x: 0, y: 0 },
      facing: 1,
      anim: 'idle' as const,
      hp: GC.MAX_HP,
      maxHp: GC.MAX_HP,
      ability: { id: CHARACTER_CONFIGS[charId].ability.id, cooldownRemaining: 0, active: false },
      flags: {
        stunned: false, frozen: false, melting: false, invisible: false,
        intangible: false, downed: false, reviving: false,
      },
      coresCollected: 0,
      lastInputSeq: 0,
    };

    this.localPlayer = new PlayerEntity(this, initialState);
    this.localPlayer.setDepth(20);
    this.physics.add.existing(this.localPlayer);
    (this.localPlayer.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    (this.localPlayer.body as Phaser.Physics.Arcade.Body).setSize(24, 36);
    (this.localPlayer.body as Phaser.Physics.Arcade.Body).setOffset(-12, -18);

    // Camera follow
    this.cameras.main.startFollow(this.localPlayer, true, 0.1, 0.1);
  }

  private handleServerSnapshot(snapshot: ServerSnapshot): void {
    if (snapshot.t !== 'state') return;

    this.lastServerTick = snapshot.tick;
    this.lastTick = snapshot.tick;

    // Find local player in snapshot
    const localServerState = snapshot.players.find((p) => p.id === this.playerId);
    if (localServerState && this.localPlayer) {
      // Store for reconciliation
      this.serverStates.set(snapshot.tick, localServerState);
      if (this.serverStates.size > this.maxServerStates) {
        const oldestKey = Math.min(...this.serverStates.keys());
        this.serverStates.delete(oldestKey);
      }

      // Reconcile
      this.localPlayer.reconcile(localServerState);
    }

    // Update other players
    snapshot.players.forEach((playerState) => {
      if (playerState.id === this.playerId) return;

      let otherPlayer = this.otherPlayers.get(playerState.id);
      if (!otherPlayer) {
        otherPlayer = new OtherPlayerEntity(this, playerState);
        otherPlayer.setDepth(20);
        this.otherPlayers.set(playerState.id, otherPlayer);
      }

      // Store for interpolation
      const history = this.previousSnapshots.get(playerState.id) || [];
      history.push({ ...playerState });
      if (history.length > 2) history.shift();
      this.previousSnapshots.set(playerState.id, history);
    });

    // Remove disconnected players
    const snapshotIds = new Set(snapshot.players.map((p) => p.id));
    for (const [id, player] of this.otherPlayers) {
      if (!snapshotIds.has(id)) {
        player.destroy();
        this.otherPlayers.delete(id);
        this.previousSnapshots.delete(id);
      }
    }

    // Update HUD
    this.hud.update(snapshot.world, this.playerId);
    this.hud.updatePlayerList(snapshot.players, this.playerId);

    // Handle events
    snapshot.events.forEach((event) => this.handleGameEvent(event));

    // Check match end
    if (snapshot.world.matchState === 'won' || snapshot.world.matchState === 'lost') {
      this.handleMatchEnd(snapshot.world.matchState, snapshot.world);
    }
  }

  private handleGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'core_collected':
        // Visual feedback
        const coreEntity = this.worldEntities.get(event.entityId);
        if (coreEntity) {
          this.tweens.add({
            targets: coreEntity,
            scale: 0,
            alpha: 0,
            duration: 300,
            onComplete: () => coreEntity.destroy(),
          });
          this.worldEntities.delete(event.entityId);
        }
        soundManager.playCoreCollect();
        break;
      case 'substation_activated':
        const subEntity = this.worldEntities.get(event.entityId);
        if (subEntity) {
          subEntity.setTint(0x00ff00);
        }
        soundManager.playSubstation();
        break;
      case 'door_opened':
        // Visual effect
        soundManager.playButton();
        break;
      case 'player_downed':
        // Handle downed player
        soundManager.playHurt();
        break;
      case 'ability_used':
        if (event.playerId === this.playerId && this.localPlayer) {
          this.localPlayer.playAbilityEffect();
        }
        soundManager.playAbility();
        break;
      case 'match_start':
        // Match started
        soundManager.playMatchStart();
        break;
      case 'chat':
        // Could show chat bubble
        break;
    }
  }

  private handleMatchEnd(result: 'won' | 'lost', world: WorldState): void {
    this.networkManager.disconnect();
    this.inputManager.destroy();
    
    const stats = {
      durationMs: world.tick * GC.TICK_MS,
      coresCollected: GC.CORE_TARGET - world.coresRemaining,
      substationsActivated: world.substationsActive,
      playersSurvived: world.winnerIds?.length || 0,
      revives: 0,
    };
    
    if (result === 'won') {
      soundManager.playMatchWin();
    } else {
      soundManager.playMatchLose();
    }
    
    this.hud.showMatchEnd(result, stats);
  }

  private handleError(code: string, msg: string): void {
    console.error('Network error:', code, msg);
  }

  private sendInputs(): void {
    if (!this.networkManager || this.connectionState !== 'connected' || !this.localPlayer) return;

    const dt = 1 / 60;

    // Send movement
    if (this.currentInput.moveDir.x !== 0 || this.currentInput.moveDir.y !== 0) {
      this.inputSequence++;
      this.networkManager.sendMove(this.currentInput.moveDir, this.inputSequence);
      this.lastSentInputSeq = this.inputSequence;
    }

    // Send abilities
    if (this.currentInput.abilityPressed[0]) {
      this.inputSequence++;
      const abilityId = CHARACTER_CONFIGS[this.localPlayer.characterId].ability.id;
      this.networkManager.sendAbility(abilityId, undefined, this.inputSequence);
      this.currentInput.abilityPressed[0] = false; // One-shot
    }
    if (this.currentInput.abilityPressed[1]) {
      this.inputSequence++;
      // Second ability if exists
      this.currentInput.abilityPressed[1] = false;
    }

    // Send interact
    if (this.currentInput.interactPressed) {
      this.inputSequence++;
      // Find nearest interactable
      const interactable = this.findNearestInteractable();
      if (interactable) {
        this.networkManager.sendInteract(interactable, this.inputSequence);
      }
      this.currentInput.interactPressed = false;
    }
  }

  private findNearestInteractable(): string | null {
    if (!this.localPlayer) return null;
    
    let nearest: { id: string; dist: number } | null = null;
    
    this.worldEntities.forEach((entity, id) => {
      const type = entity.getData('type');
      if (['core', 'substation', 'door', 'valve', 'lever'].includes(type)) {
        const dx = entity.x - this.localPlayer!.state.pos.x;
        const dy = entity.y - this.localPlayer!.state.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 60 && (!nearest || dist < nearest.dist)) {
          nearest = { id, dist };
        }
      }
    });
    
    return nearest?.id || null;
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    // Update local player (prediction)
    if (this.localPlayer) {
      this.localPlayer.applyInput(this.currentInput.moveDir, dt);
    }

    // Interpolate other players (20Hz snapshots → 60Hz render)
    this.interpolationAlpha += dt * 20; // 20Hz
    if (this.interpolationAlpha >= 1) {
      this.interpolationAlpha = 1;
    }

    this.otherPlayers.forEach((player, id) => {
      const history = this.previousSnapshots.get(id);
      if (history && history.length >= 2) {
        player.interpolate(this.interpolationAlpha);
      }
      player.update(dt);
    });

    // Update input manager
    this.inputManager.update();

    // Update HUD resize
    this.hud.resize(this.scale.width, this.scale.height);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.hud.resize(gameSize.width, gameSize.height);
    this.inputManager.resize(gameSize.width, gameSize.height);
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
  }

  private onVisibilityChange(): void {
    if (!document.hidden && this.connectionState !== 'connected') {
      // Reconnect
      this.lastTick = this.lastServerTick;
      this.networkManager = new NetworkManager({
        roomCode: this.roomCode,
        playerName: this.data.playerName,
        playerId: this.playerId,
        lastTick: this.lastTick,
        onState: (snapshot) => this.handleServerSnapshot(snapshot),
        onLobbyUpdate: () => {},
        onError: (code, msg) => this.handleError(code, msg),
        onConnectionChange: (state) => {
          this.connectionState = state;
        },
        onJoined: (playerInfo, assignedChar) => {
          if (this.localPlayer) {
            this.localPlayer.reconcile({
              ...this.localPlayer.state,
              ...assignedChar, // This would need proper merge
            });
          }
        },
      });
      this.networkManager.connect();
    }
  }

  handleVisibilityChange(): void {
    this.onVisibilityChange();
  }

  private cleanup(): void {
    this.networkManager.disconnect();
    this.inputManager.destroy();
    this.otherPlayers.forEach((p) => p.destroy());
    this.otherPlayers.clear();
    this.previousSnapshots.clear();
    this.serverStates.clear();
    this.worldEntities.forEach((e) => e.destroy());
    this.worldEntities.clear();
    this.scale.off('resize', this.onResize, this);
    document.removeEventListener('visibilitychange', this.onVisibilityChange.bind(this));
  }

  shutdown(): void {
    this.cleanup();
  }
}
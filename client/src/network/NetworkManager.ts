// Candy Friends — Network Manager
// WebSocket + msgpack with auto-reconnect, exponential backoff

import { encode, decode } from '@msgpack/msgpack';
import type {
  ClientInput,
  ServerSnapshot,
  PlayerState,
  WorldState,
  GameEvent,
  CharacterId,
  Vec2,
  RoomLobbyState,
  PlayerInfo,
} from '@candy-friends/shared';
import { isClientInput, isServerSnapshot, GAME_CONSTANTS } from '@candy-friends/shared';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface NetworkConfig {
  roomCode: string;
  playerName: string;
  characterId?: CharacterId;
  playerId?: string;
  lastTick?: number;
  onState: (snapshot: ServerSnapshot) => void;
  onLobbyUpdate: (lobby: RoomLobbyState) => void;
  onError: (code: string, msg: string) => void;
  onConnectionChange: (state: ConnectionState) => void;
  onJoined: (playerInfo: PlayerInfo, assignedChar: CharacterId) => void;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private config: NetworkConfig;
  private reconnectAttempt = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000; // ms
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;
  private url: string;

  constructor(config: NetworkConfig) {
    this.config = config;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = new URLSearchParams();
    params.set('name', config.playerName);
    if (config.playerId) params.set('id', config.playerId);
    if (config.lastTick != null) params.set('lastTick', String(config.lastTick));
    this.url = `${protocol}//${host}/room/${config.roomCode.toUpperCase()}?${params.toString()}`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.setState('connecting');
    this.createWebSocket();
  }

  private createWebSocket(): void {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event) => {
      this.stopPing();
      if (event.code !== 1000 && event.code !== 4000) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      this.setState('error');
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.setState('error');
      this.config.onError('RECONNECT_FAILED', 'Max reconnection attempts reached');
      return;
    }

    this.setState('reconnecting');
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt) + Math.random() * 500;
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.createWebSocket();
    }, delay);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.send({ t: 'pong', clientTime: this.lastPingTime });
      }
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private handleMessage(data: ArrayBuffer): void {
    try {
      const decoded = decode(new Uint8Array(data));
      if (!isServerSnapshot(decoded)) {
        console.warn('Invalid server snapshot:', decoded);
        return;
      }

      const snapshot = decoded;

      switch (snapshot.t) {
        case 'joined':
          this.config.onJoined(snapshot.player, snapshot.assignedChar);
          this.config.onLobbyUpdate(snapshot.roomState);
          break;
        case 'room_update':
          this.config.onLobbyUpdate(snapshot.state);
          break;
        case 'state':
          this.config.onState(snapshot);
          break;
        case 'left':
          // Handled by state snapshots
          break;
        case 'error':
          this.config.onError(snapshot.code, snapshot.msg);
          break;
        case 'pong':
          // RTT = Date.now() - snapshot.clientTime
          break;
      }
    } catch (e) {
      console.error('Failed to decode message:', e);
    }
  }

  send(input: ClientInput): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        const encoded = encode(input);
        this.ws.send(encoded);
      } catch (e) {
        console.error('Failed to encode input:', e);
      }
    }
  }

  sendMove(dir: Vec2, seq: number): void {
    this.send({ t: 'move', dir, seq });
  }

  sendAbility(abilityId: string, target?: Vec2, seq = 0): void {
    this.send({ t: 'ability', abilityId, target, seq });
  }

  sendInteract(entityId: string, seq = 0): void {
    this.send({ t: 'interact', entityId, seq });
  }

  sendChat(msg: string): void {
    this.send({ t: 'chat', msg });
  }

  sendReady(): void {
    this.send({ t: 'ready' });
  }

  requestState(): void {
    this.send({ t: 'request_state' });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private setState(state: ConnectionState): void {
    this.config.onConnectionChange(state);
  }

  getState(): ConnectionState {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'reconnecting';
      default: return 'disconnected';
    }
  }

  getRTT(): number {
    return this.lastPingTime > 0 ? Date.now() - this.lastPingTime : -1;
  }
}
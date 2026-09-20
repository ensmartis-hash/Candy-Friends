// Candy Friends — GameRoom Durable Object tests
// Mocks DurableObjectState + WebSocket / WebSocketPair (no Cloudflare runtime)

import { decode, encode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_ORDER,
  CharacterId,
  ClientInput,
  GAME_CONSTANTS,
  PlayerState,
  RoomLobbyState,
  ServerSnapshot,
} from '@candy-friends/shared';
import {
  filterPlayersByInterest,
  GameRoom,
  isWithinInterest,
  RING_BUFFER_TICKS,
  TickSnapshot,
} from './GameRoom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MemoryStorage {
  readonly map = new Map<string, unknown>();
  alarmTime: number | null = null;

  async get(keyOrKeys: string | string[]): Promise<unknown> {
    if (Array.isArray(keyOrKeys)) {
      const out = new Map<string, unknown>();
      for (const key of keyOrKeys) {
        if (this.map.has(key)) out.set(key, this.map.get(key));
      }
      return out;
    }
    return this.map.get(keyOrKeys);
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.map.set(keyOrEntries, structuredClone(value));
      return;
    }
    for (const [key, val] of Object.entries(keyOrEntries)) {
      this.map.set(key, structuredClone(val));
    }
  }

  async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keyOrKeys)) {
      let n = 0;
      for (const key of keyOrKeys) {
        if (this.map.delete(key)) n += 1;
      }
      return n;
    }
    return this.map.delete(keyOrKeys);
  }

  async deleteAll(): Promise<void> {
    this.map.clear();
    this.alarmTime = null;
  }

  async list(options: { prefix?: string } = {}): Promise<Map<string, unknown>> {
    const prefix = options.prefix ?? '';
    const out = new Map<string, unknown>();
    for (const [key, value] of [...this.map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (key.startsWith(prefix)) out.set(key, value);
    }
    return out;
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarmTime = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime();
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmTime;
  }

  async deleteAlarm(): Promise<void> {
    this.alarmTime = null;
  }
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  peer: MockWebSocket | null = null;
  incoming: Uint8Array[] = [];
  outgoing: Uint8Array[] = [];
  closeCode: number | undefined;
  closeReason: string | undefined;
  private attachment: unknown;

  accept(): void {
    this.readyState = MockWebSocket.OPEN;
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    const bytes = toBytes(data);
    this.outgoing.push(bytes);
    if (this.peer) this.peer.incoming.push(bytes);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.closeCode = code;
    this.closeReason = reason;
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockWebSocketPair {
  0: MockWebSocket;
  1: MockWebSocket;

  constructor() {
    const client = new MockWebSocket();
    const server = new MockWebSocket();
    client.peer = server;
    server.peer = client;
    this[0] = client;
    this[1] = server;
  }
}

interface MockBundle {
  state: DurableObjectState;
  storage: MemoryStorage;
  sockets: Array<{ ws: MockWebSocket; tags: string[] }>;
}

function createMockState(name = 'C4NDY7'): MockBundle {
  const storage = new MemoryStorage();
  const sockets: Array<{ ws: MockWebSocket; tags: string[] }> = [];

  const state: DurableObjectState = {
    id: {
      toString: () => `id-${name}`,
      equals: () => false,
      name,
    },
    storage: storage as unknown as DurableObjectStorage,
    acceptWebSocket(ws: WebSocket, tags: string[] = []) {
      sockets.push({ ws: ws as unknown as MockWebSocket, tags });
    },
    getWebSockets(tag?: string) {
      return sockets
        .filter((s) => (tag ? s.tags.includes(tag) : true))
        .map((s) => s.ws) as unknown as WebSocket[];
    },
    getTags(ws: WebSocket) {
      return sockets.find((s) => s.ws === (ws as unknown as MockWebSocket))?.tags ?? [];
    },
    waitUntil() {},
    blockConcurrencyWhile: <T>(cb: () => Promise<T>) => cb(),
    abort() {},
    setWebSocketAutoResponse() {},
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    setHibernatableWebSocketEventTimeout() {},
    getHibernatableWebSocketEventTimeout: () => null,
  } as unknown as DurableObjectState;

  return { state, storage, sockets };
}

function toBytes(data: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function snapshotsOf(ws: MockWebSocket): ServerSnapshot[] {
  return ws.incoming.map((bytes) => decode(bytes) as ServerSnapshot);
}

function lastOfType<T extends ServerSnapshot['t']>(
  ws: MockWebSocket,
  t: T,
): Extract<ServerSnapshot, { t: T }> | undefined {
  const all = snapshotsOf(ws).filter((s): s is Extract<ServerSnapshot, { t: T }> => s.t === t);
  return all[all.length - 1];
}

function inputBytes(input: ClientInput): Uint8Array {
  return encode(input);
}

async function initRoom(name = 'C4NDY7'): Promise<{
  room: GameRoom;
  mock: MockBundle;
}> {
  const mock = createMockState(name);
  const room = new GameRoom(mock.state, {});
  const res = await room.fetch(new Request('http://internal/init', { method: 'POST' }));
  expect(res.status).toBe(200);
  return { room, mock };
}

async function connect(
  room: GameRoom,
  mock: MockBundle,
  opts: { name?: string; id?: string; lastTick?: number } = {},
): Promise<{ client: MockWebSocket; server: MockWebSocket; response: Response }> {
  const params = new URLSearchParams();
  if (opts.name) params.set('name', opts.name);
  if (opts.id) params.set('id', opts.id);
  if (opts.lastTick != null) params.set('lastTick', String(opts.lastTick));
  const url = `http://internal/room/C4NDY7${params.toString() ? `?${params}` : ''}`;
  const response = await room.fetch(
    new Request(url, { headers: { Upgrade: 'websocket' } }),
  );
  const accepted = mock.sockets[mock.sockets.length - 1];
  const server = accepted?.ws;
  const client = server?.peer;
  if (!server || !client) {
    return { client: new MockWebSocket(), server: new MockWebSocket(), response };
  }
  return { client, server, response };
}

async function disconnect(room: GameRoom, server: MockWebSocket): Promise<void> {
  server.close(1000, 'client leave');
  await room.webSocketClose(server as unknown as WebSocket, 1000, 'client leave', true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('WebSocketPair', MockWebSocketPair);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('interest radius', () => {
  it('uses a 20-tile radius (inclusive)', () => {
    expect(GAME_CONSTANTS.INTEREST_RADIUS).toBe(20);
    const origin = { x: 0, y: 0 };
    const edge = { x: 20 * GAME_CONSTANTS.TILE_SIZE, y: 0 };
    const outside = { x: 20 * GAME_CONSTANTS.TILE_SIZE + 1, y: 0 };
    expect(isWithinInterest(origin, edge)).toBe(true);
    expect(isWithinInterest(origin, outside)).toBe(false);
  });

  it('always includes the observer and nearby players only', () => {
    const observer: PlayerState = {
      id: 'self',
      characterId: CharacterId.GUMMY_GUS,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      facing: 1,
      anim: 'idle',
      hp: 100,
      maxHp: 100,
      ability: { id: 'stretch_reach', cooldownRemaining: 0, active: false },
      flags: {
        stunned: false,
        frozen: false,
        melting: false,
        invisible: false,
        intangible: false,
        downed: false,
        reviving: false,
      },
      coresCollected: 0,
      lastInputSeq: 0,
    };
    const near = { ...observer, id: 'near', pos: { x: GAME_CONSTANTS.TILE_SIZE * 5, y: 0 } };
    const far = { ...observer, id: 'far', pos: { x: GAME_CONSTANTS.TILE_SIZE * 40, y: 0 } };
    const filtered = filterPlayersByInterest(observer, [observer, near, far]);
    expect(filtered.map((p) => p.id).sort()).toEqual(['near', 'self']);
  });
});

describe('GameRoom HTTP', () => {
  it('POST /init creates a lobby and GET /info returns it', async () => {
    const { room } = await initRoom('C4NDY7');
    const infoRes = await room.fetch(new Request('http://internal/info'));
    expect(infoRes.status).toBe(200);
    const info = (await infoRes.json()) as RoomLobbyState;
    expect(info.code).toBe('C4NDY7');
    expect(info.players).toEqual([]);
    expect(info.maxPlayers).toBe(9);
    expect(info.status).toBe('lobby');
    expect(info.createdAt).toBe(1_000_000);
  });

  it('rejects non-websocket upgrades with 426', async () => {
    const { room } = await initRoom();
    const res = await room.fetch(new Request('http://internal/room/C4NDY7'));
    expect(res.status).toBe(426);
  });
});

describe('GameRoom WebSocket join', () => {
  it('accepts a websocket, assigns a character, and sends a msgpack joined snapshot', async () => {
    const { room, mock } = await initRoom();
    const { client, response } = await connect(room, mock, { name: 'Alice' });
    expect(response.status).toBe(101);
    expect(response.webSocket).toBe(client);

    const joined = lastOfType(client, 'joined');
    expect(joined).toBeDefined();
    expect(joined!.player.name).toBe('Alice');
    expect(joined!.player.isHost).toBe(true);
    expect(joined!.assignedChar).toBe(CHARACTER_ORDER[0]);
    expect(joined!.roomState.players).toHaveLength(1);

    const info = (await (await room.fetch(new Request('http://internal/info'))).json()) as RoomLobbyState;
    expect(info.players).toHaveLength(1);
    expect(info.hostId).toBe(joined!.player.id);
  });

  it('assigns unique characters to subsequent players and broadcasts room_update', async () => {
    const { room, mock } = await initRoom();
    const a = await connect(room, mock, { name: 'Alice' });
    const b = await connect(room, mock, { name: 'Bob' });

    const joinedA = lastOfType(a.client, 'joined')!;
    const joinedB = lastOfType(b.client, 'joined')!;
    expect(joinedA.assignedChar).toBe(CHARACTER_ORDER[0]);
    expect(joinedB.assignedChar).toBe(CHARACTER_ORDER[1]);
    expect(joinedB.player.isHost).toBe(false);

    const update = lastOfType(a.client, 'room_update');
    expect(update?.state.players).toHaveLength(2);
  });

  it('rejects the 10th player with ROOM_FULL', async () => {
    const { room, mock } = await initRoom();
    for (let i = 0; i < GAME_CONSTANTS.MAX_PLAYERS; i++) {
      const { response } = await connect(room, mock, { name: `P${i}` });
      expect(response.status).toBe(101);
    }
    const extra = await connect(room, mock, { name: 'Overflow' });
    expect(extra.response.status).toBe(503);
    const body = (await extra.response.json()) as { error: string };
    expect(body.error).toBe('ROOM_FULL');
  });
});

describe('20Hz tick', () => {
  it('schedules the next alarm 50ms out while players are connected', async () => {
    const { room, mock } = await initRoom();
    expect(mock.storage.alarmTime).toBe(1_000_000 + GAME_CONSTANTS.ROOM_EMPTY_TIMEOUT_MS);

    await connect(room, mock, { name: 'Alice' });
    expect(GAME_CONSTANTS.TICK_RATE).toBe(20);
    expect(GAME_CONSTANTS.TICK_MS).toBe(50);
    expect(mock.storage.alarmTime).toBe(1_000_000 + GAME_CONSTANTS.TICK_MS);
  });

  it('broadcasts a msgpack state snapshot each alarm tick', async () => {
    const { room, mock } = await initRoom();
    const { client, server } = await connect(room, mock, { name: 'Alice' });
    client.incoming.length = 0;

    await room.alarm();
    const state = lastOfType(client, 'state');
    expect(state).toBeDefined();
    expect(state!.tick).toBe(1);
    expect(state!.players).toHaveLength(1);
    expect(state!.world.tick).toBe(1);

    await room.webSocketMessage(
      server as unknown as WebSocket,
      inputBytes({ t: 'move', dir: { x: 1, y: 0 }, seq: 1 }),
    );
    await room.alarm();
    const moved = lastOfType(client, 'state')!;
    expect(moved.tick).toBe(2);
    expect(moved.players[0].pos.x).toBeGreaterThan(state!.players[0].pos.x);
    expect(moved.players[0].lastInputSeq).toBe(1);
  });

  it('replies to pong immediately over msgpack', async () => {
    const { room, mock } = await initRoom();
    const { client, server } = await connect(room, mock, { name: 'Alice' });
    client.incoming.length = 0;
    await room.webSocketMessage(
      server as unknown as WebSocket,
      inputBytes({ t: 'pong', clientTime: 42 }),
    );
    const pong = lastOfType(client, 'pong');
    expect(pong).toEqual({ t: 'pong', serverTime: 1_000_000, clientTime: 42 });
  });

  it('starts the match when every player is ready', async () => {
    const { room, mock } = await initRoom();
    const a = await connect(room, mock, { name: 'Alice' });
    const b = await connect(room, mock, { name: 'Bob' });

    await room.webSocketMessage(a.server as unknown as WebSocket, inputBytes({ t: 'ready' }));
    expect(lastOfType(a.client, 'room_update')?.state.status).toBe('lobby');

    await room.webSocketMessage(b.server as unknown as WebSocket, inputBytes({ t: 'ready' }));
    expect(lastOfType(a.client, 'room_update')?.state.status).toBe('active');
    expect(lastOfType(b.client, 'room_update')?.state.status).toBe('active');

    a.client.incoming.length = 0;
    await room.alarm();
    const events = lastOfType(a.client, 'state')!.events;
    expect(events.some((e) => e.type === 'match_start')).toBe(true);
  });
});

describe('interest management on snapshots', () => {
  it('omits players outside the 20-tile radius from state broadcasts', async () => {
    const { room, mock } = await initRoom();
    const a = await connect(room, mock, { name: 'Alice' });
    const b = await connect(room, mock, { name: 'Bob' });

    await room.webSocketMessage(
      a.server as unknown as WebSocket,
      inputBytes({ t: 'move', dir: { x: 1, y: 0 }, seq: 1 }),
    );

    // 5 tiles/sec * 50ms = 0.25 tiles/tick; 21 tiles requires 84 ticks
    for (let i = 0; i < 90; i++) await room.alarm();

    const stateA = lastOfType(a.client, 'state')!;
    const stateB = lastOfType(b.client, 'state')!;
    expect(stateA.players.map((p) => p.id)).toEqual([stateA.players[0].id]);
    expect(stateB.players.map((p) => p.id)).toEqual([stateB.players[0].id]);
    expect(stateA.players[0].id).not.toBe(stateB.players[0].id);

    const dx = (stateA.players[0].pos.x - stateB.players[0].pos.x) / GAME_CONSTANTS.TILE_SIZE;
    expect(Math.abs(dx)).toBeGreaterThan(GAME_CONSTANTS.INTEREST_RADIUS);
  });
});

describe('reconnection ring buffer', () => {
  it('keeps 100 ticks and replays missed snapshots on reconnect', async () => {
    expect(RING_BUFFER_TICKS).toBe(100);
    const { room, mock } = await initRoom();
    const first = await connect(room, mock, { name: 'Alice', id: 'player-alice' });
    const playerId = lastOfType(first.client, 'joined')!.player.id;
    expect(playerId).toBe('player-alice');

    for (let i = 0; i < 5; i++) await room.alarm();
    expect(lastOfType(first.client, 'state')!.tick).toBe(5);

    await disconnect(room, first.server);

    const other = await connect(room, mock, { name: 'Bob' });
    for (let i = 0; i < 3; i++) await room.alarm();
    expect(mock.storage.map.has('snap:8')).toBe(true);

    const re = await connect(room, mock, { name: 'Alice', id: 'player-alice', lastTick: 5 });
    expect(re.response.status).toBe(101);
    const replayed = snapshotsOf(re.client).filter((s) => s.t === 'state') as Extract<
      ServerSnapshot,
      { t: 'state' }
    >[];
    expect(replayed.map((s) => s.tick)).toEqual([6, 7, 8]);
    expect(lastOfType(re.client, 'joined')?.player.id).toBe('player-alice');
  });

  it('drops snapshots older than 100 ticks and sends latest state if lastTick is too old', async () => {
    const { room, mock } = await initRoom();
    const first = await connect(room, mock, { name: 'Alice', id: 'player-alice' });

    for (let i = 0; i < RING_BUFFER_TICKS + 5; i++) await room.alarm();
    expect(mock.storage.map.has('snap:1')).toBe(false);
    expect(mock.storage.map.has('snap:5')).toBe(false);
    expect(mock.storage.map.has(`snap:${RING_BUFFER_TICKS + 5}`)).toBe(true);

    const stored = [...mock.storage.map.keys()].filter((k) => k.startsWith('snap:'));
    expect(stored).toHaveLength(RING_BUFFER_TICKS);

    await disconnect(room, first.server);
    const re = await connect(room, mock, { name: 'Alice', id: 'player-alice', lastTick: 1 });
    const states = snapshotsOf(re.client).filter((s) => s.t === 'state') as Extract<
      ServerSnapshot,
      { t: 'state' }
    >[];
    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(states[states.length - 1].tick).toBe(RING_BUFFER_TICKS + 5);
  });
});

describe('60s empty room cleanup', () => {
  it('deletes storage 60s after init if nobody joins', async () => {
    const { room, mock } = await initRoom();
    expect(mock.storage.alarmTime).toBe(1_000_000 + 60_000);
    expect(mock.storage.map.has('room')).toBe(true);

    vi.setSystemTime(1_000_000 + 59_999);
    await room.alarm();
    expect(mock.storage.map.has('room')).toBe(true);

    vi.setSystemTime(1_000_000 + 60_000);
    await room.alarm();
    expect(mock.storage.map.size).toBe(0);
    expect(mock.storage.alarmTime).toBeNull();
  });

  it('resets the empty timer while a player is connected and cleans up 60s after the last disconnect', async () => {
    const { room, mock } = await initRoom();
    const { server } = await connect(room, mock, { name: 'Alice' });
    expect(mock.storage.alarmTime).toBe(1_000_000 + GAME_CONSTANTS.TICK_MS);

    vi.setSystemTime(1_010_000);
    await disconnect(room, server);
    expect(mock.storage.alarmTime).toBe(1_010_000 + GAME_CONSTANTS.ROOM_EMPTY_TIMEOUT_MS);

    vi.setSystemTime(1_010_000 + 60_000);
    await room.alarm();
    expect(mock.storage.map.size).toBe(0);
  });
});

describe('reconnect window', () => {
  it('restores the same player within 10s and treats later joins as a new occupant after expiry', async () => {
    const { room, mock } = await initRoom();
    const first = await connect(room, mock, { name: 'Alice', id: 'player-alice' });
    const char = lastOfType(first.client, 'joined')!.assignedChar;
    await disconnect(room, first.server);

    vi.setSystemTime(1_000_000 + GAME_CONSTANTS.RECONNECT_WINDOW_MS);
    const re = await connect(room, mock, { name: 'Alice', id: 'player-alice' });
    expect(lastOfType(re.client, 'joined')?.assignedChar).toBe(char);
    expect(lastOfType(re.client, 'joined')?.player.id).toBe('player-alice');

    await disconnect(room, re.server);
    vi.setSystemTime(1_000_000 + GAME_CONSTANTS.RECONNECT_WINDOW_MS + 1 + GAME_CONSTANTS.RECONNECT_WINDOW_MS);
    // expire the disconnected player, then a different person can take a slot
    const other = await connect(room, mock, { name: 'Carol', id: 'player-carol' });
    expect(other.response.status).toBe(101);
    expect(lastOfType(other.client, 'joined')?.player.id).toBe('player-carol');
  });
});

describe('msgpack protocol', () => {
  it('round-trips ClientInput bytes through webSocketMessage', async () => {
    const { room, mock } = await initRoom();
    const { client, server } = await connect(room, mock, { name: 'Alice' });
    client.incoming.length = 0;

    const raw = encode({ t: 'request_state' } satisfies ClientInput);
    await room.webSocketMessage(server as unknown as WebSocket, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const state = lastOfType(client, 'state');
    expect(state?.t).toBe('state');
    expect(state?.players[0].id).toBeDefined();
  });
});

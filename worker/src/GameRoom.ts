// Candy Friends — GameRoom Durable Object
// 20Hz simulation, MessagePack WebSocket protocol, interest management, reconnect buffer

import { decode, encode } from '@msgpack/msgpack';
import {
  CHARACTER_CONFIGS,
  CHARACTER_ORDER,
  CharacterId,
  ClientInput,
  createInitialPlayerState,
  createInitialWorldState,
  GAME_CONSTANTS,
  GameEvent,
  isClientInput,
  MatchStats,
  PlayerInfo,
  PlayerState,
  RoomLobbyState,
  ServerSnapshot,
  Vec2,
  vec2Dist,
  vec2Len,
  vec2Mul,
  WorldState,
} from '@candy-friends/shared';
import { executeAbilityServer, getAbilityConfig } from './abilities';

export const RING_BUFFER_TICKS = 100;
const MOVE_SPEED = GAME_CONSTANTS.TILE_SIZE * 5; // 5 tiles / second

export interface TickSnapshot {
  tick: number;
  players: PlayerState[];
  world: WorldState;
  events: GameEvent[];
}

interface WsAttachment {
  playerId: string;
}

interface PlayerRecord {
  info: PlayerInfo;
  state: PlayerState;
  disconnectedAt: number | null;
  lastTick: number;
  lastMoveDir: Vec2;
  inputs: ClientInput[];
}

interface RoomMeta {
  code: string;
  createdAt: number;
  status: RoomLobbyState['status'];
  hostId: string;
  mapSeed: string;
}

interface PersistedRoom {
  meta: RoomMeta;
  tick: number;
  emptySince: number | null;
  matchStartedAt: number | null;
  world: WorldState;
  players: Array<{
    info: PlayerInfo;
    state: PlayerState;
    disconnectedAt: number | null;
    lastTick: number;
    lastMoveDir: Vec2;
  }>;
}

export function tileDistance(a: Vec2, b: Vec2): number {
  return vec2Dist(a, b) / GAME_CONSTANTS.TILE_SIZE;
}

export function isWithinInterest(
  a: Vec2,
  b: Vec2,
  radiusTiles: number = GAME_CONSTANTS.INTEREST_RADIUS,
): boolean {
  return tileDistance(a, b) <= radiusTiles;
}

export function filterPlayersByInterest(
  observer: PlayerState,
  players: PlayerState[],
  radiusTiles: number = GAME_CONSTANTS.INTEREST_RADIUS,
): PlayerState[] {
  return players.filter(
    (p) => p.id === observer.id || isWithinInterest(observer.pos, p.pos, radiusTiles),
  );
}

function isSocketOpen(ws: WebSocket): boolean {
  const rs = ws.readyState;
  return rs === undefined || rs === 0 || rs === 1;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function decodeMsgpack(message: ArrayBuffer | ArrayBufferView | string): unknown {
  if (typeof message === 'string') {
    const bytes = new TextEncoder().encode(message);
    return decode(bytes);
  }
  if (message instanceof Uint8Array) return decode(message);
  if (message instanceof ArrayBuffer) return decode(new Uint8Array(message));
  return decode(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function upgradeResponse(client: WebSocket): Response {
  try {
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  } catch {
    return {
      status: 101,
      ok: true,
      webSocket: client,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response;
  }
}

function spawnPos(index: number): Vec2 {
  return { x: GAME_CONSTANTS.TILE_SIZE * 2 + index * 8, y: GAME_CONSTANTS.TILE_SIZE * 2 };
}

export class GameRoom {
  private readonly state: DurableObjectState;
  private readonly ready: Promise<void>;
  private meta: RoomMeta | null = null;
  private players = new Map<string, PlayerRecord>();
  private world: WorldState = createInitialWorldState('seed');
  private tickNum = 0;
  private events: GameEvent[] = [];
  private emptySince: number | null = null;
  private matchStartedAt: number | null = null;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(() => this.hydrate());
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && (path === '/init' || path.endsWith('/init'))) {
      await this.ensureInit();
      await this.persist();
      await this.scheduleAlarm();
      return jsonResponse({ ok: true, code: this.meta!.code });
    }

    if (request.method === 'GET' && (path === '/info' || path.endsWith('/info'))) {
      await this.ensureInit();
      this.expireDisconnected(Date.now());
      return jsonResponse(this.getLobbyState());
    }

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    await this.ensureInit();
    this.expireDisconnected(Date.now());

    const name = (url.searchParams.get('name') ?? url.searchParams.get('playerName') ?? 'Player')
      .trim()
      .slice(0, 24) || 'Player';
    const reconnectId = url.searchParams.get('id') ?? url.searchParams.get('playerId') ?? undefined;
    const lastTickRaw = url.searchParams.get('lastTick');
    const lastTick = lastTickRaw != null && lastTickRaw !== '' ? Number(lastTickRaw) : undefined;

    const existing = reconnectId ? this.players.get(reconnectId) : undefined;
    const canReconnect = !!existing && this.isReconnectEligible(existing, Date.now());

    if (!canReconnect && this.livingPlayerCount() >= GAME_CONSTANTS.MAX_PLAYERS) {
      return jsonResponse({ error: 'ROOM_FULL', msg: 'Room is full' }, 503);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const joined = await this.handleJoin(server, {
      name,
      reconnectId,
      lastTick: Number.isFinite(lastTick) ? lastTick : undefined,
    });

    if (!joined.ok) {
      return jsonResponse({ error: joined.code, msg: joined.msg }, joined.status);
    }

    return upgradeResponse(client);
  }

  async alarm(): Promise<void> {
    await this.ready;
    const now = Date.now();
    this.expireDisconnected(now);

    if (this.hasLiveConnections()) {
      await this.runTick();
      this.emptySince = null;
      await this.persist();
      await this.scheduleAlarm();
      return;
    }

    if (this.emptySince == null) {
      this.emptySince = now;
      await this.persist();
    }

    if (now - this.emptySince >= GAME_CONSTANTS.ROOM_EMPTY_TIMEOUT_MS) {
      await this.cleanup();
      return;
    }

    await this.scheduleAlarm();
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    await this.ready;
    const player = this.playerFromSocket(ws);
    if (!player) {
      this.send(ws, { t: 'error', code: 'UNKNOWN_PLAYER', msg: 'Not joined' });
      return;
    }

    let decoded: unknown;
    try {
      decoded = decodeMsgpack(message);
    } catch {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', msg: 'Invalid msgpack payload' });
      return;
    }

    if (!isClientInput(decoded)) {
      this.send(ws, { t: 'error', code: 'INVALID_INPUT', msg: 'Unrecognized client input' });
      return;
    }

    await this.handleInput(ws, player, decoded);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    await this.ready;
    const player = this.playerFromSocket(ws);
    if (!player) return;

    const stillLive = this.state
      .getWebSockets(player.info.id)
      .some((other) => other !== ws && isSocketOpen(other));
    if (stillLive) return;

    player.disconnectedAt = Date.now();
    player.lastMoveDir = { x: 0, y: 0 };
    player.state.vel = { x: 0, y: 0 };
    if (!this.hasLiveConnections()) {
      this.emptySince = Date.now();
    }
    await this.persist();
    await this.scheduleAlarm();
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1011, 'error', false);
  }

  // --------------------------------------------------------------------------
  // Init / persistence
  // --------------------------------------------------------------------------

  private async hydrate(): Promise<void> {
    const saved = await this.state.storage.get<PersistedRoom>('room');
    if (!saved) return;
    this.meta = saved.meta;
    this.tickNum = saved.tick;
    this.emptySince = saved.emptySince;
    this.matchStartedAt = saved.matchStartedAt;
    this.world = saved.world;
    this.players = new Map(
      saved.players.map((p) => [
        p.info.id,
        {
          info: p.info,
          state: p.state,
          disconnectedAt: p.disconnectedAt,
          lastTick: p.lastTick,
          lastMoveDir: p.lastMoveDir ?? { x: 0, y: 0 },
          inputs: [],
        },
      ]),
    );
  }

  private async persist(): Promise<void> {
    if (!this.meta) return;
    const room: PersistedRoom = {
      meta: this.meta,
      tick: this.tickNum,
      emptySince: this.emptySince,
      matchStartedAt: this.matchStartedAt,
      world: this.world,
      players: [...this.players.values()].map((p) => ({
        info: p.info,
        state: p.state,
        disconnectedAt: p.disconnectedAt,
        lastTick: p.lastTick,
        lastMoveDir: p.lastMoveDir,
      })),
    };
    await this.state.storage.put('room', room);
  }

  private async ensureInit(): Promise<void> {
    if (this.meta) return;
    const code = this.state.id.name ?? this.state.id.toString().slice(-GAME_CONSTANTS.ROOM_CODE_LENGTH).toUpperCase();
    const mapSeed = crypto.randomUUID();
    this.meta = {
      code,
      createdAt: Date.now(),
      status: 'lobby',
      hostId: '',
      mapSeed,
    };
    this.world = createInitialWorldState(mapSeed);
    this.tickNum = 0;
    this.emptySince = Date.now();
  }

  private async cleanup(): Promise<void> {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1000, 'room empty');
      } catch {
        // ignore
      }
    }
    await this.state.storage.deleteAll();
    this.meta = null;
    this.players.clear();
    this.events = [];
    this.tickNum = 0;
    this.emptySince = null;
    this.matchStartedAt = null;
    this.world = createInitialWorldState('seed');
  }

  private async scheduleAlarm(): Promise<void> {
    const now = Date.now();
    if (this.hasLiveConnections()) {
      await this.state.storage.setAlarm(now + GAME_CONSTANTS.TICK_MS);
      return;
    }
    const emptySince = this.emptySince ?? now;
    this.emptySince = emptySince;
    await this.state.storage.setAlarm(emptySince + GAME_CONSTANTS.ROOM_EMPTY_TIMEOUT_MS);
  }

  // --------------------------------------------------------------------------
  // Join / lobby
  // --------------------------------------------------------------------------

  private async handleJoin(
    server: WebSocket,
    opts: { name: string; reconnectId?: string; lastTick?: number },
  ): Promise<{ ok: true } | { ok: false; code: string; msg: string; status: number }> {
    const now = Date.now();
    let player: PlayerRecord | undefined;
    let assignedChar: CharacterId = CHARACTER_ORDER[0];
    let reconnected = false;

    if (opts.reconnectId) {
      const existing = this.players.get(opts.reconnectId);
      if (existing && this.isReconnectEligible(existing, now)) {
        player = existing;
        assignedChar = existing.info.characterId ?? this.assignCharacter();
        existing.info.characterId = assignedChar;
        existing.disconnectedAt = null;
        existing.info.name = opts.name || existing.info.name;
        reconnected = true;
      }
    }

    if (!player) {
      if (this.livingPlayerCount() >= GAME_CONSTANTS.MAX_PLAYERS) {
        return { ok: false, code: 'ROOM_FULL', msg: 'Room is full', status: 503 };
      }
      if (this.meta?.status === 'ended') {
        return { ok: false, code: 'MATCH_ENDED', msg: 'Match has ended', status: 400 };
      }

      const id = opts.reconnectId && !this.players.has(opts.reconnectId)
        ? opts.reconnectId
        : crypto.randomUUID();
      assignedChar = this.assignCharacter();
      const isHost = this.players.size === 0;
      const info: PlayerInfo = {
        id,
        name: opts.name,
        characterId: assignedChar,
        ready: false,
        isHost,
        joinedAt: now,
      };
      const state = createInitialPlayerState(id, assignedChar, spawnPos(this.players.size));
      player = {
        info,
        state,
        disconnectedAt: null,
        lastTick: this.tickNum,
        lastMoveDir: { x: 0, y: 0 },
        inputs: [],
      };
      this.players.set(id, player);
      if (isHost && this.meta) this.meta.hostId = id;
    }

    for (const old of this.state.getWebSockets(player.info.id)) {
      if (old !== server && isSocketOpen(old)) {
        try {
          old.close(4000, 'replaced');
        } catch {
          // ignore
        }
      }
    }

    this.state.acceptWebSocket(server, [player.info.id]);
    server.serializeAttachment({ playerId: player.info.id } satisfies WsAttachment);

    this.emptySince = null;
    this.send(server, {
      t: 'joined',
      player: player.info,
      assignedChar: player.info.characterId ?? assignedChar,
      roomState: this.getLobbyState(),
    });

    if (reconnected) {
      const fromTick = opts.lastTick ?? player.lastTick;
      await this.replayFrom(server, player, fromTick);
    }

    this.broadcast({ t: 'room_update', state: this.getLobbyState() });
    await this.persist();
    await this.scheduleAlarm();
    return { ok: true };
  }

  private assignCharacter(): CharacterId {
    const used = new Set(
      [...this.players.values()]
        .map((p) => p.info.characterId)
        .filter((id): id is CharacterId => id != null),
    );
    return CHARACTER_ORDER.find((id) => !used.has(id)) ?? CHARACTER_ORDER[0];
  }

  private getLobbyState(): RoomLobbyState {
    return {
      code: this.meta?.code ?? '',
      players: [...this.players.values()].map((p) => p.info),
      maxPlayers: GAME_CONSTANTS.MAX_PLAYERS,
      status: this.meta?.status ?? 'lobby',
      hostId: this.meta?.hostId ?? '',
      createdAt: this.meta?.createdAt ?? 0,
    };
  }

  private livingPlayerCount(): number {
    return this.players.size;
  }

  private isReconnectEligible(player: PlayerRecord, now: number): boolean {
    if (player.disconnectedAt == null) return true;
    return now - player.disconnectedAt <= GAME_CONSTANTS.RECONNECT_WINDOW_MS;
  }

  // --------------------------------------------------------------------------
  // Inputs
  // --------------------------------------------------------------------------

  private async handleInput(ws: WebSocket, player: PlayerRecord, input: ClientInput): Promise<void> {
    switch (input.t) {
      case 'pong':
        this.send(ws, { t: 'pong', serverTime: Date.now(), clientTime: input.clientTime });
        return;
      case 'request_state':
        this.sendState(ws, player, this.collectPlayerStates(), this.world, []);
        return;
      case 'ready':
        player.info.ready = true;
        this.maybeStartMatch();
        this.broadcast({ t: 'room_update', state: this.getLobbyState() });
        await this.persist();
        return;
      case 'chat':
        this.events.push({
          type: 'chat',
          playerId: player.info.id,
          playerName: player.info.name,
          message: input.msg.slice(0, 256),
        });
        return;
      default:
        player.inputs.push(input);
    }
  }

  private maybeStartMatch(): void {
    if (!this.meta) return;
    if (this.meta.status !== 'lobby') return;
    if (this.players.size === 0) return;
    if (![...this.players.values()].every((p) => p.info.ready)) return;

    this.meta.status = 'active';
    this.world.matchState = 'active';
    this.matchStartedAt = Date.now();
    this.events.push({ type: 'match_start', tick: this.tickNum });
  }

  // --------------------------------------------------------------------------
  // Simulation
  // --------------------------------------------------------------------------

  private async runTick(): Promise<void> {
    const dt = GAME_CONSTANTS.TICK_MS / 1000;
    this.tickNum += 1;
    this.world.tick = this.tickNum;

    for (const player of this.players.values()) {
      if (player.disconnectedAt != null) {
        player.state.vel = { x: 0, y: 0 };
        player.inputs = [];
        continue;
      }
      this.applyInputs(player, dt);
      this.tickAbility(player);
    }

    if (this.meta?.status === 'active' && this.matchStartedAt != null) {
      const elapsed = Date.now() - this.matchStartedAt;
      this.world.batchProgress = Math.min(1, elapsed / GAME_CONSTANTS.MATCH_TIME_MS);
      if (elapsed >= GAME_CONSTANTS.MATCH_TIME_MS && this.world.matchState === 'active') {
        this.endMatch('lost');
      }
    }

    const events = this.events;
    this.events = [];
    const players = this.collectPlayerStates();
    const world = clone(this.world);
    const snapshot: TickSnapshot = { tick: this.tickNum, players, world, events };

    await this.state.storage.put(`snap:${this.tickNum}`, snapshot);
    const stale = this.tickNum - RING_BUFFER_TICKS;
    if (stale > 0) {
      await this.state.storage.delete(`snap:${stale}`);
    }

    this.broadcastState(snapshot);
  }

  private applyInputs(player: PlayerRecord, dt: number): void {
    const queued = player.inputs.splice(0);
    for (const input of queued) {
      if ('seq' in input) {
        if (input.seq <= player.state.lastInputSeq) continue;
        player.state.lastInputSeq = input.seq;
      }
      if (input.t === 'move') {
        const len = vec2Len(input.dir);
        player.lastMoveDir = len > 1 ? vec2Mul(input.dir, 1 / len) : { ...input.dir };
      } else if (input.t === 'ability') {
        this.useAbility(player, input.abilityId, input.target);
      } else if (input.t === 'interact') {
        this.interact(player, input.entityId);
      }
    }

    const dir = player.lastMoveDir;
    const moving = vec2Len(dir) > 0.01 && !player.state.flags.stunned && !player.state.flags.frozen && !player.state.flags.downed;
    if (moving) {
      player.state.vel = vec2Mul(dir, MOVE_SPEED);
      player.state.pos = {
        x: player.state.pos.x + player.state.vel.x * dt,
        y: player.state.pos.y + player.state.vel.y * dt,
      };
      if (dir.x > 0.01) player.state.facing = 1;
      else if (dir.x < -0.01) player.state.facing = -1;
      if (player.state.anim !== 'ability' && player.state.anim !== 'hurt') {
        player.state.anim = 'walk';
      }
    } else {
      player.state.vel = { x: 0, y: 0 };
      if (player.state.flags.downed) player.state.anim = 'downed';
      else if (player.state.anim === 'walk' || player.state.anim === 'run') player.state.anim = 'idle';
    }
  }

  private tickAbility(player: PlayerRecord): void {
    if (player.state.ability.cooldownRemaining > 0) {
      player.state.ability.cooldownRemaining = Math.max(
        0,
        player.state.ability.cooldownRemaining - GAME_CONSTANTS.TICK_MS,
      );
    }
    if (player.state.ability.active && player.state.ability.activeUntil != null) {
      if (Date.now() >= player.state.ability.activeUntil) {
        player.state.ability.active = false;
        delete player.state.ability.activeUntil;
        if (player.state.anim === 'ability') player.state.anim = 'idle';
      }
    }
  }

  private useAbility(player: PlayerRecord, abilityId: string, target?: Vec2): void {
    if (player.state.flags.downed || player.state.flags.stunned) return;
    const cfg = CHARACTER_CONFIGS[player.state.characterId];
    if (abilityId !== cfg.ability.id) return;
    if (player.state.ability.cooldownRemaining > 0) return;

    // Use shared ability system
    const abilityConfig = getAbilityConfig(player.state.characterId);
    const result = executeAbilityServer(
      {
        playerState: player.state,
        worldState: this.world,
        target,
        deltaTime: GAME_CONSTANTS.TICK_MS / 1000,
      },
      abilityConfig
    );

    if (!result.success) return;

    // Apply cooldown
    player.state.ability.cooldownRemaining = result.cooldownMs;
    player.state.ability.active = true;
    if (result.flagChanges) {
      Object.assign(player.state.flags, result.flagChanges);
    }
    if (result.positionChange) {
      player.state.pos.x += result.positionChange.x;
      player.state.pos.y += result.positionChange.y;
    }
    player.state.anim = 'ability';
    this.events.push({ type: 'ability_used', playerId: player.info.id, abilityId, target });

    // Apply effects
    for (const effect of result.effects) {
      this.applyAbilityEffect(player, effect, target);
    }
  }

  private applyAbilityEffect(player: PlayerRecord, effect: any, target?: Vec2): void {
    switch (effect.type) {
      case 'area':
        if (effect.stunDuration) {
          // Stun nearby players (excluding self)
          for (const other of this.players.values()) {
            if (other.info.id === player.info.id) continue;
            const dist = vec2Dist(other.state.pos, player.state.pos);
            if (dist <= (effect.radius || 60)) {
              other.state.flags.stunned = true;
              setTimeout(() => {
                other.state.flags.stunned = false;
              }, effect.stunDuration);
            }
          }
        }
        if (effect.healPerSec && effect.duration) {
          // Heal nearby players
          for (const other of this.players.values()) {
            const dist = vec2Dist(other.state.pos, player.state.pos);
            if (dist <= (effect.radius || 80)) {
              const healAmount = Math.floor(effect.healPerSec * (effect.duration / 1000));
              other.state.hp = Math.min(other.state.maxHp, other.state.hp + healAmount);
            }
          }
        }
        break;
      case 'projectile':
        if (effect.pullForce && effect.canRescue && target) {
          // Pull target player toward caster (Taffy Tia rescue)
          for (const other of this.players.values()) {
            if (other.info.id === player.info.id) continue;
            const dist = vec2Dist(other.state.pos, target);
            if (dist <= 30) { // Close to target position
              const dx = player.state.pos.x - other.state.pos.x;
              const dy = player.state.pos.y - other.state.pos.y;
              const pullDist = Math.hypot(dx, dy);
              if (pullDist > 0) {
                const pullRatio = Math.min(effect.pullForce / pullDist, 1);
                other.state.pos.x += dx * pullRatio;
                other.state.pos.y += dy * pullRatio;
              }
            }
          }
        }
        break;
    }
  }

  private interact(player: PlayerRecord, entityId: string): void {
    const entity = this.world.entities.find((e) => e.id === entityId);
    if (!entity) return;
    if (!isWithinInterest(player.state.pos, entity.pos, GAME_CONSTANTS.INTEREST_RADIUS)) return;

    if (entity.type === 'core' && !entity.state.collected) {
      entity.state.collected = true;
      player.state.coresCollected += 1;
      this.world.coresRemaining = Math.max(0, this.world.coresRemaining - 1);
      this.events.push({
        type: 'core_collected',
        entityId,
        playerId: player.info.id,
        coresRemaining: this.world.coresRemaining,
      });
      if (this.world.coresRemaining === 0 && this.world.matchState === 'active') {
        this.endMatch('won');
      }
    } else if (entity.type === 'door') {
      entity.state.open = true;
      this.events.push({ type: 'door_opened', entityId, openerId: player.info.id });
    } else if (entity.type === 'valve') {
      const progress = Math.min(1, Number(entity.state.progress ?? 0) + 0.25);
      entity.state.progress = progress;
      this.events.push({ type: 'valve_turned', entityId, playerId: player.info.id, progress });
    } else if (entity.type === 'substation' && !entity.state.active) {
      entity.state.active = true;
      this.world.substationsActive += 1;
      this.events.push({
        type: 'substation_activated',
        entityId,
        playerId: player.info.id,
        activeCount: this.world.substationsActive,
      });
    }
  }

  private endMatch(result: 'won' | 'lost'): void {
    if (!this.meta) return;
    this.meta.status = 'ended';
    this.world.matchState = result;
    const winnerIds = result === 'won' ? [...this.players.keys()] : undefined;
    this.world.winnerIds = winnerIds;
    const stats: MatchStats = {
      durationMs: this.matchStartedAt != null ? Date.now() - this.matchStartedAt : 0,
      coresCollected: GAME_CONSTANTS.CORE_TARGET - this.world.coresRemaining,
      substationsActivated: this.world.substationsActive,
      playersSurvived: [...this.players.values()].filter((p) => !p.state.flags.downed).length,
      revives: 0,
    };
    this.events.push({ type: 'match_end', result, winnerIds, stats });
  }

  // --------------------------------------------------------------------------
  // Interest / broadcast / reconnect buffer
  // --------------------------------------------------------------------------

  private collectPlayerStates(): PlayerState[] {
    return [...this.players.values()].map((p) => clone(p.state));
  }

  private broadcastState(snapshot: TickSnapshot): void {
    for (const ws of this.state.getWebSockets()) {
      if (!isSocketOpen(ws)) continue;
      const player = this.playerFromSocket(ws);
      if (!player) continue;
      this.sendState(ws, player, snapshot.players, snapshot.world, snapshot.events);
    }
  }

  private sendState(
    ws: WebSocket,
    observer: PlayerRecord,
    players: PlayerState[],
    world: WorldState,
    events: GameEvent[],
  ): void {
    const nearby = filterPlayersByInterest(observer.state, players);
    const filteredWorld: WorldState = {
      ...world,
      entities: world.entities.filter((e) => isWithinInterest(observer.state.pos, e.pos)),
    };
    this.send(ws, { t: 'state', tick: world.tick, players: nearby, world: filteredWorld, events });
    observer.lastTick = world.tick;
    try {
      ws.serializeAttachment({ playerId: observer.info.id } satisfies WsAttachment);
    } catch {
      // ignore
    }
  }

  private broadcast(msg: ServerSnapshot): void {
    for (const ws of this.state.getWebSockets()) {
      if (!isSocketOpen(ws)) continue;
      this.send(ws, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerSnapshot): void {
    try {
      ws.send(encode(msg));
    } catch {
      // socket already closed
    }
  }

  private async replayFrom(ws: WebSocket, player: PlayerRecord, fromTick: number): Promise<void> {
    const oldestKept = Math.max(1, this.tickNum - RING_BUFFER_TICKS + 1);
    if (fromTick < oldestKept - 1) {
      this.sendState(ws, player, this.collectPlayerStates(), this.world, []);
      return;
    }

    const keys: string[] = [];
    for (let t = fromTick + 1; t <= this.tickNum; t++) keys.push(`snap:${t}`);
    if (keys.length === 0) {
      this.sendState(ws, player, this.collectPlayerStates(), this.world, []);
      return;
    }

    const snaps = await this.state.storage.get<TickSnapshot>(keys);
    let sent = 0;
    for (const key of keys) {
      const snap = snaps.get(key);
      if (!snap) continue;
      this.sendState(ws, player, snap.players, snap.world, snap.events);
      sent += 1;
    }
    if (sent === 0) {
      this.sendState(ws, player, this.collectPlayerStates(), this.world, []);
    }
  }

  // --------------------------------------------------------------------------
  // Connections / expiry
  // --------------------------------------------------------------------------

  private playerFromSocket(ws: WebSocket): PlayerRecord | undefined {
    const att = ws.deserializeAttachment() as WsAttachment | null | undefined;
    if (att?.playerId) return this.players.get(att.playerId);
    const tags = this.state.getTags(ws);
    if (tags[0]) return this.players.get(tags[0]);
    return undefined;
  }

  private hasLiveConnections(): boolean {
    return this.state.getWebSockets().some(isSocketOpen);
  }

  private expireDisconnected(now: number): void {
    let removed = false;
    for (const [id, player] of [...this.players.entries()]) {
      if (player.disconnectedAt == null) continue;
      if (now - player.disconnectedAt <= GAME_CONSTANTS.RECONNECT_WINDOW_MS) continue;
      this.players.delete(id);
      this.broadcast({ t: 'left', playerId: id, reason: 'disconnect' });
      removed = true;
    }
    if (removed) this.reassignHost();
  }

  private reassignHost(): void {
    if (!this.meta) return;
    if (this.players.size === 0) {
      this.meta.hostId = '';
      return;
    }
    if (this.players.has(this.meta.hostId)) return;
    const next = this.players.values().next().value as PlayerRecord;
    this.meta.hostId = next.info.id;
    next.info.isHost = true;
  }
}

// Candy Friends — Shared Types Tests
// Run: npx vitest run shared/types.test.ts

import { describe, it, expect } from 'vitest';
import * as T from './types';
import * as msgpack from '@msgpack/msgpack';

describe('Shared Types — Serialization Round-trip', () => {
  it('Vec2 operations', () => {
    const a = T.vec2(3, 4);
    const b = T.vec2(1, 2);
    expect(T.vec2Add(a, b)).toEqual({ x: 4, y: 6 });
    expect(T.vec2Sub(a, b)).toEqual({ x: 2, y: 2 });
    expect(T.vec2Mul(a, 2)).toEqual({ x: 6, y: 8 });
    expect(T.vec2Len(a)).toBe(5);
    expect(T.vec2Dist(a, b)).toBeCloseTo(Math.sqrt(8));
    expect(T.vec2Norm(a)).toEqual({ x: 0.6, y: 0.8 });
  });

  it('Character configs complete', () => {
    expect(Object.keys(T.CHARACTER_CONFIGS).length).toBe(9);
    T.CHARACTER_ORDER.forEach((id) => {
      const cfg = T.CHARACTER_CONFIGS[id];
      expect(cfg.id).toBe(id);
      expect(cfg.name).toBeTruthy();
      expect(typeof cfg.color).toBe('number');
      expect(cfg.ability.cooldown).toBeGreaterThan(0);
      expect(['dash', 'projectile', 'area', 'buff', 'interact']).toContain(cfg.ability.type);
    });
  });

  it('PlayerState serialization round-trip', () => {
    const state = T.createInitialPlayerState('player-1', T.CharacterId.GUMMY_GUS, { x: 100, y: 200 });
    state.hp = 75;
    state.anim = 'walk';
    state.facing = -1;
    state.ability.cooldownRemaining = 3000;

    const encoded = msgpack.encode(state);
    const decoded = msgpack.decode(encoded) as T.PlayerState;

    expect(decoded.id).toBe(state.id);
    expect(decoded.characterId).toBe(state.characterId);
    expect(decoded.pos).toEqual(state.pos);
    expect(decoded.hp).toBe(75);
    expect(decoded.anim).toBe('walk');
    expect(decoded.facing).toBe(-1);
    expect(decoded.ability.cooldownRemaining).toBe(3000);
  });

  it('WorldState serialization round-trip', () => {
    const world = T.createInitialWorldState('seed-123');
    world.tick = 420;
    world.coresRemaining = 42;
    world.substationsActive = 2;
    world.batchProgress = 0.35;
    world.matchState = 'active';
    world.entities = [
      { id: 'door-1', type: 'door', pos: { x: 5, y: 10 }, state: { open: true } },
      { id: 'core-7', type: 'core', pos: { x: 12, y: 8 }, state: { collected: false } },
    ];

    const encoded = msgpack.encode(world);
    const decoded = msgpack.decode(encoded) as T.WorldState;

    expect(decoded.tick).toBe(420);
    expect(decoded.coresRemaining).toBe(42);
    expect(decoded.substationsActive).toBe(2);
    expect(decoded.batchProgress).toBeCloseTo(0.35);
    expect(decoded.matchState).toBe('active');
    expect(decoded.entities).toHaveLength(2);
    expect(decoded.entities[0].type).toBe('door');
    expect(decoded.entities[1].type).toBe('core');
  });

  it('ClientInput serialization round-trip (all variants)', () => {
    const inputs: T.ClientInput[] = [
      { t: 'move', dir: { x: 1, y: 0 }, seq: 1 },
      { t: 'move', dir: { x: -0.7, y: 0.7 }, seq: 2 },
      { t: 'ability', abilityId: 'stretch_reach', target: { x: 150, y: 200 }, seq: 3 },
      { t: 'interact', entityId: 'valve-3', seq: 4 },
      { t: 'chat', msg: 'Hello!' },
      { t: 'ready' },
      { t: 'request_state' },
      { t: 'pong', clientTime: 1234567890 },
    ];

    inputs.forEach((input) => {
      const encoded = msgpack.encode(input);
      const decoded = msgpack.decode(encoded) as T.ClientInput;
      expect(decoded).toEqual(input);
      expect(T.isClientInput(decoded)).toBe(true);
    });
  });

  it('ServerSnapshot serialization round-trip (all variants)', () => {
    const snapshots: T.ServerSnapshot[] = [
      {
        t: 'state',
        tick: 100,
        players: [T.createInitialPlayerState('p1', T.CharacterId.MINTY_MOXIE, { x: 0, y: 0 })],
        world: T.createInitialWorldState('seed'),
        events: [{ type: 'core_collected', entityId: 'core-1', playerId: 'p1', coresRemaining: 49 }],
      },
      {
        t: 'joined',
        player: { id: 'p2', name: 'Test', ready: false, isHost: false, joinedAt: Date.now() },
        assignedChar: T.CharacterId.CHOCO_CHIP,
        roomState: {
          code: 'ABC123',
          players: [],
          maxPlayers: 9,
          status: 'lobby',
          hostId: 'p1',
          createdAt: Date.now(),
        },
      },
      { t: 'left', playerId: 'p3', reason: 'disconnect' },
      { t: 'error', code: 'ROOM_FULL', msg: 'Room is full' },
      { t: 'pong', serverTime: 1000, clientTime: 990 },
      {
        t: 'room_update',
        state: {
          code: 'ABC123',
          players: [{ id: 'p1', name: 'Host', characterId: T.CharacterId.GUMMY_GUS, ready: true, isHost: true, joinedAt: Date.now() }],
          maxPlayers: 9,
          status: 'starting',
          hostId: 'p1',
          createdAt: Date.now(),
        },
      },
    ];

    snapshots.forEach((snap) => {
      const encoded = msgpack.encode(snap);
      const decoded = msgpack.decode(encoded) as T.ServerSnapshot;
      expect(decoded).toEqual(snap);
      expect(T.isServerSnapshot(decoded)).toBe(true);
    });
  });

  it('GameEvent serialization round-trip (all variants)', () => {
    const events: T.GameEvent[] = [
      { type: 'door_opened', entityId: 'door-main', openerId: 'p1' },
      { type: 'valve_turned', entityId: 'valve-2', playerId: 'p3', progress: 0.66 },
      { type: 'core_collected', entityId: 'core-5', playerId: 'p2', coresRemaining: 45 },
      { type: 'substation_activated', entityId: 'sub-1', playerId: 'p1', activeCount: 1 },
      { type: 'player_downed', playerId: 'p4', position: { x: 300, y: 150 } },
      { type: 'player_revived', playerId: 'p4', reviverId: 'p2' },
      { type: 'player_eliminated', playerId: 'p5' },
      { type: 'ability_used', playerId: 'p1', abilityId: 'ice_slide', target: { x: 400, y: 200 } },
      { type: 'match_start', tick: 0 },
      {
        type: 'match_end',
        result: 'won',
        winnerIds: ['p1', 'p2', 'p3'],
        stats: { durationMs: 420000, coresCollected: 50, substationsActivated: 3, playersSurvived: 3, revives: 2 },
      },
      { type: 'chat', playerId: 'p1', playerName: 'Gus', message: 'Nice!' },
      { type: 'system', message: 'The Batch begins in 30 seconds!' },
    ];

    events.forEach((event) => {
      const encoded = msgpack.encode(event);
      const decoded = msgpack.decode(encoded) as T.GameEvent;
      expect(decoded).toEqual(event);
    });
  });

  it('RoomLobbyState serialization', () => {
    const lobby: T.RoomLobbyState = {
      code: 'C4NDY7',
      players: [
        { id: 'p1', name: 'Alice', characterId: T.CharacterId.GUMMY_GUS, ready: true, isHost: true, joinedAt: 1000 },
        { id: 'p2', name: 'Bob', characterId: T.CharacterId.MINTY_MOXIE, ready: false, isHost: false, joinedAt: 2000 },
      ],
      maxPlayers: 9,
      status: 'lobby',
      hostId: 'p1',
      createdAt: 1000,
    };

    const encoded = msgpack.encode(lobby);
    const decoded = msgpack.decode(encoded) as T.RoomLobbyState;
    expect(decoded).toEqual(lobby);
  });

  it('Constants are reasonable', () => {
    expect(T.GAME_CONSTANTS.MAX_PLAYERS).toBe(9);
    expect(T.GAME_CONSTANTS.TICK_RATE).toBe(20);
    expect(T.GAME_CONSTANTS.MATCH_TIME_MS).toBe(15 * 60 * 1000);
    expect(T.GAME_CONSTANTS.CORE_TARGET).toBe(50);
    expect(T.GAME_CONSTANTS.SUBSTATION_TARGET).toBe(3);
  });
});
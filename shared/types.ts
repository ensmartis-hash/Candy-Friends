// Candy Friends — Shared Types & Protocol
// Single source of truth for client ↔ server communication
// Compile target: ES2022, Module: ESNext, strict: true

// ============================================================================
// CORE PRIMITIVES
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const vec2Add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vec2Sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vec2Mul = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const vec2Len = (v: Vec2): number => Math.hypot(v.x, v.y);
export const vec2Dist = (a: Vec2, b: Vec2): number => vec2Len(vec2Sub(a, b));
export const vec2Norm = (v: Vec2): Vec2 => {
  const l = vec2Len(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

// ============================================================================
// GAME CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = {
  MAX_PLAYERS: 9,
  TICK_RATE: 20,                    // Server simulation Hz
  TICK_MS: 1000 / 20,               // 50ms per tick
  INTEREST_RADIUS: 20,              // Tiles - only broadcast nearby players
  ROOM_CODE_LENGTH: 6,              // e.g., "C4NDY7"
  ROOM_EMPTY_TIMEOUT_MS: 60_000,    // Auto-delete empty room after 60s
  RECONNECT_WINDOW_MS: 10_000,      // Client can reconnect within 10s
  MAX_HP: 100,
  DOWNED_HP: 0,
  REVIVE_TIME_MS: 30_000,           // 30s to revive downed player
  MATCH_TIME_MS: 15 * 60 * 1000,    // 15 minutes
  CORE_TARGET: 50,                  // Collect 50 Sweet Cores
  SUBSTATION_TARGET: 3,             // Restore 3 of 5 substations
  TILE_SIZE: 32,                    // World units per tile
} as const;

// ============================================================================
// CHARACTERS
// ============================================================================

export enum CharacterId {
  GUMMY_GUS = 'gummy_gus',
  MINTY_MOXIE = 'minty_moxie',
  CHOCO_CHIP = 'choco_chip',
  SOUR_SUE = 'sour_sue',
  LICORICE_LEX = 'licorice_lex',
  COTTON_CANDY = 'cotton_candy',
  JAWBREAKER_JACK = 'jawbreaker_jack',
  TAFFY_TIA = 'taffy_tia',
  POP_ROCKS = 'pop_rocks',
}

export const CHARACTER_ORDER: CharacterId[] = [
  CharacterId.GUMMY_GUS,
  CharacterId.MINTY_MOXIE,
  CharacterId.CHOCO_CHIP,
  CharacterId.SOUR_SUE,
  CharacterId.LICORICE_LEX,
  CharacterId.COTTON_CANDY,
  CharacterId.JAWBREAKER_JACK,
  CharacterId.TAFFY_TIA,
  CharacterId.POP_ROCKS,
];

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  color: number;              // Hex color for procedural placeholder (0xRRGGBB)
  passive: string;            // Description only - logic in ability system
  ability: AbilityConfig;
}

export const CHARACTER_CONFIGS: Readonly<Record<CharacterId, CharacterConfig>> = {
  [CharacterId.GUMMY_GUS]: {
    id: CharacterId.GUMMY_GUS,
    name: 'Gummy Gus',
    color: 0xFF6B9D,
    passive: 'Stretchy — interaction range +2 tiles',
    ability: {
      id: 'stretch_reach',
      cooldown: 8000,
      type: 'interact',
      params: { rangeBonus: 2, duration: 3000 },
    },
  },
  [CharacterId.MINTY_MOXIE]: {
    id: CharacterId.MINTY_MOXIE,
    name: 'Minty Moxie',
    color: 0x4ECDC4,
    passive: 'Ice Slide — move 50% faster on ice',
    ability: {
      id: 'ice_slide',
      cooldown: 10000,
      type: 'dash',
      params: { speed: 400, distance: 120, freezeDuration: 2000 },
    },
  },
  [CharacterId.CHOCO_CHIP]: {
    id: CharacterId.CHOCO_CHIP,
    name: 'Choco Chip',
    color: 0x5D3A2E,
    passive: 'Melty — can squeeze through 1-tile gaps',
    ability: {
      id: 'melt_form',
      cooldown: 12000,
      type: 'buff',
      params: { duration: 5000, intangible: true, speedMultiplier: 0.5 },
    },
  },
  [CharacterId.SOUR_SUE]: {
    id: CharacterId.SOUR_SUE,
    name: 'Sour Sue',
    color: 0x9B59B6,
    passive: 'Pucker — sour valves activate at 1.5x range',
    ability: {
      id: 'pucker_blast',
      cooldown: 9000,
      type: 'area',
      params: { radius: 60, stunDuration: 1500, valveRange: 120 },
    },
  },
  [CharacterId.LICORICE_LEX]: {
    id: CharacterId.LICORICE_LEX,
    name: 'Licorice Lex',
    color: 0x2C2C2C,
    passive: 'Flatten — hide in shadows, enemies lose sight',
    ability: {
      id: 'shadow_flatten',
      cooldown: 11000,
      type: 'buff',
      params: { duration: 6000, invisible: true, speedMultiplier: 1.2 },
    },
  },
  [CharacterId.COTTON_CANDY]: {
    id: CharacterId.COTTON_CANDY,
    name: 'Cotton Candy',
    color: 0xFFB6C1,
    passive: 'Cloud Form — float over hazards, slow fall',
    ability: {
      id: 'healing_cloud',
      cooldown: 15000,
      type: 'area',
      params: { radius: 80, healPerSec: 15, duration: 4000 },
    },
  },
  [CharacterId.JAWBREAKER_JACK]: {
    id: CharacterId.JAWBREAKER_JACK,
    name: 'Jawbreaker Jack',
    color: 0xE67E22,
    passive: 'Hard Candy — take 30% less damage',
    ability: {
      id: 'rolling_charge',
      cooldown: 14000,
      type: 'dash',
      params: { speed: 500, distance: 200, knockback: 100, breakWalls: true },
    },
  },
  [CharacterId.TAFFY_TIA]: {
    id: CharacterId.TAFFY_TIA,
    name: 'Taffy Tia',
    color: 0xF39C12,
    passive: 'Elastic — can pull levers from 3 tiles away',
    ability: {
      id: 'taffy_tether',
      cooldown: 7000,
      type: 'projectile',
      params: { range: 150, pullForce: 300, canRescue: true },
    },
  },
  [CharacterId.POP_ROCKS]: {
    id: CharacterId.POP_ROCKS,
    name: 'Pop Rocks',
    color: 0xE74C3C,
    passive: 'Volatile — explosions don\'t self-damage',
    ability: {
      id: 'micro_detonate',
      cooldown: 6000,
      type: 'projectile',
      params: { range: 100, explosionRadius: 50, damage: 25, chainChance: 0.3 },
    },
  },
};

// ============================================================================
// ABILITIES
// ============================================================================

export type AbilityType = 'dash' | 'projectile' | 'area' | 'buff' | 'interact';

export interface AbilityConfig {
  id: string;
  cooldown: number;           // Milliseconds
  type: AbilityType;
  params: Record<string, number>;  // Flexible per-type parameters
}

// Runtime ability state (per player)
export interface AbilityState {
  id: string;
  cooldownRemaining: number;  // Milliseconds until ready
  active: boolean;
  activeUntil?: number;       // For buffs/areas with duration
}

// ============================================================================
// PLAYER STATE
// ============================================================================

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'ability'
  | 'hurt'
  | 'downed'
  | 'reviving'
  | 'interact';

export interface PlayerFlags {
  stunned: boolean;
  frozen: boolean;
  melting: boolean;
  invisible: boolean;
  intangible: boolean;
  downed: boolean;
  reviving: boolean;          // Being revived by ally
}

export const emptyFlags = (): PlayerFlags => ({
  stunned: false,
  frozen: false,
  melting: false,
  invisible: false,
  intangible: false,
  downed: false,
  reviving: false,
});

export interface PlayerState {
  id: string;                 // Unique player session ID
  characterId: CharacterId;
  pos: Vec2;
  vel: Vec2;
  facing: 1 | -1;             // 1 = right, -1 = left
  anim: AnimationState;
  hp: number;
  maxHp: number;
  ability: AbilityState;
  flags: PlayerFlags;
  coresCollected: number;
  lastInputSeq: number;       // For reconciliation
}

// ============================================================================
// WORLD STATE
// ============================================================================

export interface WorldEntity {
  id: string;
  type: 'door' | 'valve' | 'lever' | 'conveyor' | 'laser' | 'core' | 'substation' | 'hazard' | 'spawn' | 'exit';
  pos: Vec2;
  state: Record<string, unknown>;  // Flexible: { open: true }, { progress: 0.5 }, etc.
  requiresAbilities?: CharacterId[];  // Co-op: needs these abilities simultaneously
}

export interface WorldState {
  tick: number;
  entities: WorldEntity[];
  coresRemaining: number;
  substationsActive: number;
  batchProgress: number;      // 0.0 to 1.0 (timer visual)
  matchState: 'waiting' | 'active' | 'won' | 'lost';
  winnerIds?: string[];       // Set when matchState === 'won'
}

// ============================================================================
// GAME EVENTS (Server → Client, reliable)
// ============================================================================

export type GameEvent =
  | { type: 'door_opened'; entityId: string; openerId: string }
  | { type: 'valve_turned'; entityId: string; playerId: string; progress: number }
  | { type: 'core_collected'; entityId: string; playerId: string; coresRemaining: number }
  | { type: 'substation_activated'; entityId: string; playerId: string; activeCount: number }
  | { type: 'player_downed'; playerId: string; position: Vec2 }
  | { type: 'player_revived'; playerId: string; reviverId: string }
  | { type: 'player_eliminated'; playerId: string }
  | { type: 'ability_used'; playerId: string; abilityId: string; target?: Vec2 }
  | { type: 'match_start'; tick: number }
  | { type: 'match_end'; result: 'won' | 'lost'; winnerIds?: string[]; stats: MatchStats }
  | { type: 'chat'; playerId: string; playerName: string; message: string }
  | { type: 'system'; message: string };

export interface MatchStats {
  durationMs: number;
  coresCollected: number;
  substationsActivated: number;
  playersSurvived: number;
  revives: number;
}

// ============================================================================
// NETWORK PROTOCOL
// ============================================================================

// Client → Server (sent every frame with input, or on action)
export type ClientInput =
  | { t: 'move'; dir: Vec2; seq: number }
  | { t: 'ability'; abilityId: string; target?: Vec2; seq: number }
  | { t: 'interact'; entityId: string; seq: number }
  | { t: 'chat'; msg: string }
  | { t: 'ready' }
  | { t: 'request_state' }
  | { t: 'pong'; clientTime: number };

// Server → Client (broadcast each tick + events)
export type ServerSnapshot =
  | { t: 'state'; tick: number; players: PlayerState[]; world: WorldState; events: GameEvent[] }
  | { t: 'joined'; player: PlayerInfo; assignedChar: CharacterId; roomState: RoomLobbyState }
  | { t: 'left'; playerId: string; reason: 'disconnect' | 'kick' | 'leave' }
  | { t: 'error'; code: string; msg: string }
  | { t: 'pong'; serverTime: number; clientTime: number }
  | { t: 'room_update'; state: RoomLobbyState };

// Lobby/room metadata (pre-game)
export interface PlayerInfo {
  id: string;
  name: string;
  characterId?: CharacterId;
  ready: boolean;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomLobbyState {
  code: string;
  players: PlayerInfo[];
  maxPlayers: number;
  status: 'lobby' | 'starting' | 'active' | 'ended';
  hostId: string;
  createdAt: number;
}

// ============================================================================
// ROOM CONFIG (Sent on join, immutable for session)
// ============================================================================

export interface RoomConfig {
  maxPlayers: number;
  tickRate: number;
  interestRadius: number;
  matchTimeMs: number;
  coreTarget: number;
  substationTarget: number;
  mapSeed: string;            // For procedural generation sync
}

// ============================================================================
// SERIALIZATION HELPERS (MessagePack-friendly)
// ============================================================================

// All types above are plain objects — MessagePack serializes them natively.
// No custom classes, no circular refs, no functions.
// Use `msgpack.encode(obj)` / `msgpack.decode(bytes)`.

// Type guards for discriminated unions
export const isClientInput = (msg: unknown): msg is ClientInput =>
  typeof msg === 'object' && msg !== null && 't' in msg &&
  ['move', 'ability', 'interact', 'chat', 'ready', 'request_state', 'pong'].includes((msg as any).t);

export const isServerSnapshot = (msg: unknown): msg is ServerSnapshot =>
  typeof msg === 'object' && msg !== null && 't' in msg &&
  ['state', 'joined', 'left', 'error', 'pong', 'room_update'].includes((msg as any).t);

// ============================================================================
// UTILITY: CREATE INITIAL STATE
// ============================================================================

export function createInitialPlayerState(id: string, characterId: CharacterId, spawnPos: Vec2): PlayerState {
  return {
    id,
    characterId,
    pos: { ...spawnPos },
    vel: { x: 0, y: 0 },
    facing: 1,
    anim: 'idle',
    hp: GAME_CONSTANTS.MAX_HP,
    maxHp: GAME_CONSTANTS.MAX_HP,
    ability: { id: CHARACTER_CONFIGS[characterId].ability.id, cooldownRemaining: 0, active: false },
    flags: emptyFlags(),
    coresCollected: 0,
    lastInputSeq: 0,
  };
}

export function createInitialWorldState(mapSeed: string): WorldState {
  return {
    tick: 0,
    entities: [],
    coresRemaining: GAME_CONSTANTS.CORE_TARGET,
    substationsActive: 0,
    batchProgress: 0,
    matchState: 'waiting',
  };
}
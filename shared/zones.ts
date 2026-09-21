// Candy Friends — Factory Zones & Puzzles
// Zone definitions, puzzle entities, co-op gates, core collectibles

import type { Vec2, WorldEntity, CharacterId } from './types';
import { GAME_CONSTANTS, CHARACTER_CONFIGS } from './types';

export interface ZoneConfig {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  tilemap: number[]; // 2D array flattened (tile indices)
  spawnPoints: Vec2[];
  puzzleEntities: PuzzleEntityConfig[];
  corePositions: Vec2[];
  substationPositions: Vec2[];
  theme: 'reception' | 'mixing' | 'cooling' | 'packaging' | 'quality' | 'roof';
}

export interface PuzzleEntityConfig {
  id: string;
  type: 'door' | 'valve' | 'lever' | 'conveyor' | 'laser' | 'hazard' | 'coop_gate';
  pos: Vec2;
  state: Record<string, unknown>;
  requiresAbilities?: CharacterId[]; // Co-op: needs these abilities simultaneously
  linkedEntities?: string[]; // Other entity IDs this affects
  cooldown?: number; // For valves/levers
}

export interface ZoneTransition {
  fromZone: string;
  toZone: string;
  entryPoint: Vec2; // Where player appears in target zone
  requiredConditions?: {
    coresCollected?: number;
    substationsActive?: number;
    abilitiesUsed?: CharacterId[];
  };
}

// ============================================================================
// ZONE DEFINITIONS
// ============================================================================

export const ZONE_CONFIGS: Record<string, ZoneConfig> = {
  reception: {
    id: 'reception',
    name: 'Reception & Security',
    bounds: { x: 0, y: 0, width: 28, height: 20 },
    tilemap: generateReceptionTilemap(),
    spawnPoints: [{ x: 14, y: 18 }], // Bottom center
    puzzleEntities: [
      {
        id: 'door-security',
        type: 'door',
        pos: { x: 14, y: 2 },
        state: { open: false },
        linkedEntities: ['lever-security'],
      },
      {
        id: 'lever-security',
        type: 'lever',
        pos: { x: 10, y: 16 },
        state: { active: false },
        linkedEntities: ['door-security'],
      },
      {
        id: 'door-exit-north',
        type: 'door',
        pos: { x: 14, y: 0 },
        state: { open: true },
        linkedEntities: [],
      },
    ],
    corePositions: [
      { x: 8, y: 8 }, { x: 20, y: 8 }, { x: 14, y: 12 },
      { x: 6, y: 15 }, { x: 22, y: 15 },
    ],
    substationPositions: [{ x: 14, y: 5 }],
    theme: 'reception',
  },

  mixing: {
    id: 'mixing',
    name: 'Mixing Vats',
    bounds: { x: 30, y: 0, width: 28, height: 20 },
    tilemap: generateMixingTilemap(),
    spawnPoints: [{ x: 32, y: 18 }],
    puzzleEntities: [
      {
        id: 'valve-vat-1',
        type: 'valve',
        pos: { x: 35, y: 12 },
        state: { progress: 0 },
        cooldown: 2000,
      },
      {
        id: 'valve-vat-2',
        type: 'valve',
        pos: { x: 45, y: 12 },
        state: { progress: 0 },
        cooldown: 2000,
      },
      {
        id: 'valve-vat-3',
        type: 'valve',
        pos: { x: 40, y: 8 },
        state: { progress: 0 },
        cooldown: 2000,
      },
      {
        id: 'door-mixing-exit',
        type: 'door',
        pos: { x: 40, y: 2 },
        state: { open: false },
        linkedEntities: ['valve-vat-1', 'valve-vat-2', 'valve-vat-3'],
        requiresAbilities: ['minty_moxie', 'choco_chip'], // Freeze + Melt
      },
      {
        id: 'hazard-acid-1',
        type: 'hazard',
        pos: { x: 38, y: 15 },
        state: { damage: 10, interval: 1000 },
      },
      {
        id: 'hazard-acid-2',
        type: 'hazard',
        pos: { x: 42, y: 15 },
        state: { damage: 10, interval: 1000 },
      },
    ],
    corePositions: [
      { x: 34, y: 6 }, { x: 46, y: 6 }, { x: 32, y: 14 }, { x: 48, y: 14 },
      { x: 40, y: 18 }, { x: 36, y: 10 }, { x: 44, y: 10 },
    ],
    substationPositions: [{ x: 40, y: 5 }],
    theme: 'mixing',
  },

  cooling: {
    id: 'cooling',
    name: 'Cooling Tunnels',
    bounds: { x: 0, y: 22, width: 28, height: 20 },
    tilemap: generateCoolingTilemap(),
    spawnPoints: [{ x: 14, y: 38 }],
    puzzleEntities: [
      {
        id: 'conveyor-ice-1',
        type: 'conveyor',
        pos: { x: 8, y: 28 },
        state: { direction: { x: 1, y: 0 }, speed: 2 },
      },
      {
        id: 'conveyor-ice-2',
        type: 'conveyor',
        pos: { x: 20, y: 28 },
        state: { direction: { x: -1, y: 0 }, speed: 2 },
      },
      {
        id: 'lever-freezer',
        type: 'lever',
        pos: { x: 14, y: 35 },
        state: { active: false },
        linkedEntities: ['door-cooling-exit'],
      },
      {
        id: 'door-cooling-exit',
        type: 'door',
        pos: { x: 14, y: 24 },
        state: { open: false },
        linkedEntities: ['lever-freezer'],
      },
      {
        id: 'coop-gate-ice',
        type: 'coop_gate',
        pos: { x: 10, y: 30 },
        state: { open: false },
        requiresAbilities: ['minty_moxie', 'sour_sue'], // Ice slide + Pucker blast
      },
    ],
    corePositions: [
      { x: 6, y: 26 }, { x: 22, y: 26 }, { x: 14, y: 32 },
      { x: 4, y: 36 }, { x: 24, y: 36 }, { x: 10, y: 34 }, { x: 18, y: 34 },
    ],
    substationPositions: [{ x: 14, y: 28 }],
    theme: 'cooling',
  },

  packaging: {
    id: 'packaging',
    name: 'Packaging & Labeling',
    bounds: { x: 30, y: 22, width: 28, height: 20 },
    tilemap: generatePackagingTilemap(),
    spawnPoints: [{ x: 44, y: 38 }],
    puzzleEntities: [
      {
        id: 'conveyor-pkg-1',
        type: 'conveyor',
        pos: { x: 35, y: 28 },
        state: { direction: { x: 0, y: -1 }, speed: 3 },
      },
      {
        id: 'conveyor-pkg-2',
        type: 'conveyor',
        pos: { x: 45, y: 28 },
        state: { direction: { x: 0, y: -1 }, speed: 3 },
      },
      {
        id: 'laser-scanner-1',
        type: 'laser',
        pos: { x: 40, y: 30 },
        state: { active: true, rotation: 0, range: 8 },
      },
      {
        id: 'laser-scanner-2',
        type: 'laser',
        pos: { x: 40, y: 34 },
        state: { active: true, rotation: Math.PI, range: 8 },
      },
      {
        id: 'coop-gate-pkg',
        type: 'coop_gate',
        pos: { x: 38, y: 36 },
        state: { open: false },
        requiresAbilities: ['licorice_lex', 'taffy_tia'], // Stealth + Tether
      },
      {
        id: 'door-packaging-exit',
        type: 'door',
        pos: { x: 44, y: 24 },
        state: { open: false },
        linkedEntities: ['coop-gate-pkg'],
      },
    ],
    corePositions: [
      { x: 34, y: 26 }, { x: 46, y: 26 }, { x: 38, y: 32 }, { x: 42, y: 32 },
      { x: 32, y: 38 }, { x: 48, y: 38 }, { x: 40, y: 38 },
    ],
    substationPositions: [{ x: 44, y: 28 }],
    theme: 'packaging',
  },

  quality: {
    id: 'quality',
    name: 'Quality Control',
    bounds: { x: 14, y: 44, width: 28, height: 12 },
    tilemap: generateQualityTilemap(),
    spawnPoints: [{ x: 28, y: 52 }],
    puzzleEntities: [
      {
        id: 'laser-grid-1',
        type: 'laser',
        pos: { x: 20, y: 48 },
        state: { active: true, rotation: 0, range: 12 },
      },
      {
        id: 'laser-grid-2',
        type: 'laser',
        pos: { x: 36, y: 48 },
        state: { active: true, rotation: Math.PI / 2, range: 12 },
      },
      {
        id: 'door-quality-exit',
        type: 'door',
        pos: { x: 28, y: 44 },
        state: { open: false },
        requiresAbilities: ['gummy_gus', 'pop_rocks'], // Stretch + Explode
      },
    ],
    corePositions: [
      { x: 18, y: 46 }, { x: 38, y: 46 }, { x: 28, y: 50 },
    ],
    substationPositions: [{ x: 28, y: 48 }],
    theme: 'quality',
  },

  roof: {
    id: 'roof',
    name: 'Roof Access — Escape Point',
    bounds: { x: 14, y: 32, width: 28, height: 12 },
    tilemap: generateRoofTilemap(),
    spawnPoints: [{ x: 28, y: 42 }],
    puzzleEntities: [
      {
        id: 'door-escape-hatch',
        type: 'door',
        pos: { x: 28, y: 34 },
        state: { open: false },
        requiresAbilities: ['jawbreaker_jack', 'cotton_candy'], // Charge + Cloud
      },
      {
        id: 'vent-1',
        type: 'lever',
        pos: { x: 20, y: 38 },
        state: { active: false },
        linkedEntities: ['door-escape-hatch'],
      },
      {
        id: 'vent-2',
        type: 'lever',
        pos: { x: 36, y: 38 },
        state: { active: false },
        linkedEntities: ['door-escape-hatch'],
      },
    ],
    corePositions: [
      { x: 22, y: 36 }, { x: 34, y: 36 }, { x: 28, y: 40 },
    ],
    substationPositions: [],
    theme: 'roof',
  },
};

// ============================================================================
// TILEMAP GENERATORS (Procedural)
// ============================================================================

function generateReceptionTilemap(): number[] {
  const w = 28, h = 20;
  const map = new Array(w * h).fill(0); // 0 = floor
  
  // Walls
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  // Doors (gaps in walls)
  map[14] = 0; // North door
  map[13] = 0; map[15] = 0;
  map[14 + (h-1)*w] = 0; // South door
  
  return map;
}

function generateMixingTilemap(): number[] {
  const w = 28, h = 20;
  const map = new Array(w * h).fill(0);
  
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  
  // Hazard stripes (tile index 3)
  for (let x = 8; x < 20; x += 2) {
    map[15*w + x] = 3;
    map[16*w + x] = 3;
  }
  
  // Vat platforms (tile index 4 = conveyor)
  for (let x = 10; x < 18; x++) map[12*w + x] = 4;
  for (let x = 20; x < 28; x++) map[12*w + x] = 4;
  
  map[14] = 0; // North exit
  map[14 + (h-1)*w] = 0; // South entry
  
  return map;
}

function generateCoolingTilemap(): number[] {
  const w = 28, h = 20;
  const map = new Array(w * h).fill(0);
  
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  
  // Ice patches (tile index 4)
  for (let y = 4; y < 16; y++) {
    for (let x = 4; x < 24; x++) {
      if (Math.random() < 0.3) map[y*w + x] = 4;
    }
  }
  
  // Conveyors (tile index 4)
  for (let x = 4; x < 12; x++) map[8*w + x] = 4;
  for (let x = 16; x < 24; x++) map[8*w + x] = 4;
  
  map[14] = 0; // North exit
  map[14 + 18*w] = 0; // South entry
  
  return map;
}

function generatePackagingTilemap(): number[] {
  const w = 28, h = 20;
  const map = new Array(w * h).fill(0);
  
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  
  // Conveyor belts
  for (let y = 4; y < 16; y++) {
    map[y*w + 5] = 4;
    map[y*w + 15] = 4;
  }
  
  map[14] = 0; // North exit
  map[14 + 18*w] = 0; // South entry (centered)
  
  return map;
}

function generateQualityTilemap(): number[] {
  const w = 28, h = 12;
  const map = new Array(w * h).fill(0);
  
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  
  map[14] = 0; // North exit
  map[14 + (h-1)*w] = 0; // South entry
  
  return map;
}

function generateRoofTilemap(): number[] {
  const w = 28, h = 12;
  const map = new Array(w * h).fill(0);
  
  for (let x = 0; x < w; x++) { map[x] = 1; map[(h-1)*w + x] = 1; }
  for (let y = 0; y < h; y++) { map[y*w] = 1; map[y*w + w-1] = 1; }
  
  // Vent platforms
  for (let x = 8; x < 12; x++) map[6*w + x] = 1;
  for (let x = 16; x < 20; x++) map[6*w + x] = 1;
  
  map[14] = 0; // Escape hatch
  map[14 + (h-1)*w] = 0; // Entry from quality
  
  return map;
}

// ============================================================================
// PUZZLE SYSTEM
// ============================================================================

export function createWorldEntitiesFromZones(activeZones: string[] = ['reception']): WorldEntity[] {
  const entities: WorldEntity[] = [];
  
  for (const zoneId of activeZones) {
    const zone = ZONE_CONFIGS[zoneId];
    if (!zone) continue;
    
    for (const puzzle of zone.puzzleEntities) {
      entities.push({
        id: puzzle.id,
        type: puzzle.type,
        pos: puzzle.pos,
        state: { ...puzzle.state },
        requiresAbilities: puzzle.requiresAbilities,
      });
    }
    
    // Add cores
    for (let i = 0; i < zone.corePositions.length; i++) {
      const pos = zone.corePositions[i];
      entities.push({
        id: `core-${zoneId}-${i}`,
        type: 'core',
        pos,
        state: { collected: false },
      });
    }
    
    // Add substations
    for (let i = 0; i < zone.substationPositions.length; i++) {
      const pos = zone.substationPositions[i];
      entities.push({
        id: `substation-${zoneId}-${i}`,
        type: 'substation',
        pos,
        state: { active: false },
      });
    }
  }
  
  return entities;
}

export function checkPuzzleActivation(
  entity: WorldEntity,
  playerAbilities: CharacterId[],
  worldEntities: WorldEntity[]
): boolean {
  if (!entity.requiresAbilities || entity.requiresAbilities.length === 0) return true;
  
  return entity.requiresAbilities.every((required) => 
    playerAbilities.includes(required)
  );
}

export function activateLinkedEntities(
  entityId: string,
  worldEntities: WorldEntity[],
  newState: Record<string, unknown>
): void {
  const entity = worldEntities.find((e) => e.id === entityId);
  if (!entity || !entity.linkedEntities) return;
  
  for (const linkedId of entity.linkedEntities) {
    const linked = worldEntities.find((e) => e.id === linkedId);
    if (linked) {
      Object.assign(linked.state, newState);
    }
  }
}

export function getZoneForPosition(pos: Vec2): string | null {
  for (const [zoneId, zone] of Object.entries(ZONE_CONFIGS)) {
    const b = zone.bounds;
    if (pos.x >= b.x && pos.x < b.x + b.width &&
        pos.y >= b.y && pos.y < b.y + b.height) {
      return zoneId;
    }
  }
  return null;
}

export function getZoneTransition(fromZone: string, targetZone: string): ZoneTransition | null {
  const transitions: Record<string, ZoneTransition[]> = {
    reception: [
      { fromZone: 'reception', toZone: 'mixing', entryPoint: { x: 32, y: 18 }, requiredConditions: { substationsActive: 1 } },
      { fromZone: 'reception', toZone: 'cooling', entryPoint: { x: 14, y: 38 }, requiredConditions: { substationsActive: 1 } },
    ],
    mixing: [
      { fromZone: 'mixing', toZone: 'reception', entryPoint: { x: 14, y: 18 } },
      { fromZone: 'mixing', toZone: 'packaging', entryPoint: { x: 44, y: 38 }, requiredConditions: { substationsActive: 2 } },
    ],
    cooling: [
      { fromZone: 'cooling', toZone: 'reception', entryPoint: { x: 14, y: 18 } },
      { fromZone: 'cooling', toZone: 'packaging', entryPoint: { x: 44, y: 38 }, requiredConditions: { substationsActive: 2 } },
    ],
    packaging: [
      { fromZone: 'packaging', toZone: 'mixing', entryPoint: { x: 32, y: 18 } },
      { fromZone: 'packaging', toZone: 'cooling', entryPoint: { x: 14, y: 38 } },
      { fromZone: 'packaging', toZone: 'quality', entryPoint: { x: 28, y: 52 }, requiredConditions: { coresCollected: 35 } },
    ],
    quality: [
      { fromZone: 'quality', toZone: 'packaging', entryPoint: { x: 44, y: 38 } },
      { fromZone: 'quality', toZone: 'roof', entryPoint: { x: 28, y: 42 }, requiredConditions: { substationsActive: 3 } },
    ],
    roof: [
      { fromZone: 'roof', toZone: 'quality', entryPoint: { x: 28, y: 52 } },
    ],
  };
  
  const list = transitions[fromZone];
  if (!list) return null;
  return list.find((t) => t.toZone === targetZone) || null;
}

// ============================================================================
// VALVE/LEVER/COOP LOGIC
// ============================================================================

export interface ValveState {
  progress: number; // 0-1
  lastActivated: number;
  cooldown: number;
}

export function tryActivateValve(
  entity: WorldEntity,
  playerId: string,
  now: number
): { success: boolean; progress: number; message?: string } {
  const state = entity.state as ValveState;
  const cooldown = entity.cooldown || 2000;
  
  // Allow if never activated before (lastActivated === 0) or cooldown expired
  if (state.lastActivated > 0 && now - state.lastActivated < cooldown) {
    return { success: false, progress: state.progress, message: 'Valve cooling down' };
  }
  
  state.progress = Math.min(1, (state.progress || 0) + 0.25);
  state.lastActivated = now;
  
  return { success: true, progress: state.progress };
}

export function tryActivateCoopGate(
  entity: WorldEntity,
  playerAbilities: CharacterId[]
): boolean {
  if (!entity.requiresAbilities) return false;
  return entity.requiresAbilities.every((req) => playerAbilities.includes(req));
}

export function checkAllValvesComplete(zoneId: string, worldEntities: WorldEntity[]): boolean {
  const zone = ZONE_CONFIGS[zoneId];
  if (!zone) return false;
  
  const valves = zone.puzzleEntities.filter((p) => p.type === 'valve');
  if (valves.length === 0) return true;
  
  return valves.every((valve) => {
    const entity = worldEntities.find((e) => e.id === valve.id);
    return entity && (entity.state.progress || 0) >= 1;
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ALL_ZONES = Object.keys(ZONE_CONFIGS);
export const ZONE_ORDER = ['reception', 'mixing', 'cooling', 'packaging', 'quality', 'roof'];
// Candy Friends — Zones & Puzzles Tests

import { describe, it, expect } from 'vitest';
import {
  ZONE_CONFIGS,
  ZONE_ORDER,
  createWorldEntitiesFromZones,
  checkPuzzleActivation,
  activateLinkedEntities,
  getZoneForPosition,
  getZoneTransition,
  tryActivateValve,
  tryActivateCoopGate,
  checkAllValvesComplete,
} from './zones';
import type { CharacterId, WorldEntity } from './types';

describe('Zone Configurations', () => {
  it('has 6 zones in correct order', () => {
    expect(ZONE_ORDER).toEqual(['reception', 'mixing', 'cooling', 'packaging', 'quality', 'roof']);
    expect(Object.keys(ZONE_CONFIGS)).toHaveLength(6);
  });

  it('each zone has required properties', () => {
    for (const [id, zone] of Object.entries(ZONE_CONFIGS)) {
      expect(zone.id).toBeTruthy();
      expect(zone.name).toBeTruthy();
      expect(zone.bounds).toBeDefined();
      expect(zone.bounds.width).toBeGreaterThan(0);
      expect(zone.bounds.height).toBeGreaterThan(0);
      expect(zone.tilemap).toBeInstanceOf(Array);
      // Debug logging
      if (zone.tilemap.length !== zone.bounds.width * zone.bounds.height) {
        console.log(`Zone ${id}: bounds ${zone.bounds.width}x${zone.bounds.height} = ${zone.bounds.width * zone.bounds.height}, tilemap ${zone.tilemap.length}`);
      }
      expect(zone.tilemap.length).toBe(zone.bounds.width * zone.bounds.height);
      expect(zone.spawnPoints).toBeInstanceOf(Array);
      expect(zone.spawnPoints.length).toBeGreaterThan(0);
      expect(zone.puzzleEntities).toBeInstanceOf(Array);
      expect(zone.corePositions).toBeInstanceOf(Array);
      expect(zone.substationPositions).toBeInstanceOf(Array);
      expect(zone.theme).toBeTruthy();
    }
  });

  it('reception is the starting zone with basic puzzle', () => {
    const zone = ZONE_CONFIGS.reception;
    expect(zone.theme).toBe('reception');
    expect(zone.puzzleEntities.some((e) => e.type === 'door')).toBe(true);
    expect(zone.puzzleEntities.some((e) => e.type === 'lever')).toBe(true);
    expect(zone.corePositions.length).toBeGreaterThan(0);
    expect(zone.substationPositions.length).toBeGreaterThan(0);
  });

  it('mixing has co-op gate requiring freeze + melt', () => {
    const zone = ZONE_CONFIGS.mixing;
    expect(zone.theme).toBe('mixing');
    const coopGate = zone.puzzleEntities.find((e) => e.type === 'door' && e.requiresAbilities);
    expect(coopGate).toBeDefined();
    expect(coopGate!.requiresAbilities).toContain('minty_moxie');
    expect(coopGate!.requiresAbilities).toContain('choco_chip');
  });

  it('cooling has ice slide co-op gate', () => {
    const zone = ZONE_CONFIGS.cooling;
    expect(zone.theme).toBe('cooling');
    const coopGate = zone.puzzleEntities.find((e) => e.type === 'coop_gate');
    expect(coopGate).toBeDefined();
    expect(coopGate!.requiresAbilities).toContain('minty_moxie');
    expect(coopGate!.requiresAbilities).toContain('sour_sue');
  });

  it('packaging has stealth + tether co-op gate', () => {
    const zone = ZONE_CONFIGS.packaging;
    expect(zone.theme).toBe('packaging');
    const coopGate = zone.puzzleEntities.find((e) => e.type === 'coop_gate');
    expect(coopGate).toBeDefined();
    expect(coopGate!.requiresAbilities).toContain('licorice_lex');
    expect(coopGate!.requiresAbilities).toContain('taffy_tia');
  });

  it('quality requires stretch + explode', () => {
    const zone = ZONE_CONFIGS.quality;
    expect(zone.theme).toBe('quality');
    const door = zone.puzzleEntities.find((e) => e.type === 'door' && e.requiresAbilities);
    expect(door).toBeDefined();
    expect(door!.requiresAbilities).toContain('gummy_gus');
    expect(door!.requiresAbilities).toContain('pop_rocks');
  });

  it('roof requires charge + cloud for escape', () => {
    const zone = ZONE_CONFIGS.roof;
    expect(zone.theme).toBe('roof');
    const door = zone.puzzleEntities.find((e) => e.type === 'door' && e.requiresAbilities);
    expect(door).toBeDefined();
    expect(door!.requiresAbilities).toContain('jawbreaker_jack');
    expect(door!.requiresAbilities).toContain('cotton_candy');
  });
});

describe('World Entity Generation', () => {
  it('creates entities for active zones', () => {
    const entities = createWorldEntitiesFromZones(['reception', 'mixing']);
    
    const receptionEntities = entities.filter((e) => e.id.startsWith('core-reception') || e.id.startsWith('substation-reception'));
    const mixingEntities = entities.filter((e) => e.id.startsWith('core-mixing') || e.id.startsWith('substation-mixing'));
    
    expect(receptionEntities.length).toBeGreaterThan(0);
    expect(mixingEntities.length).toBeGreaterThan(0);
  });

  it('includes puzzle entities', () => {
    const entities = createWorldEntitiesFromZones(['reception']);
    const puzzleEntities = entities.filter((e) => 
      ['door', 'lever', 'valve', 'coop_gate'].includes(e.type)
    );
    expect(puzzleEntities.length).toBeGreaterThan(0);
  });

  it('cores have collected: false', () => {
    const entities = createWorldEntitiesFromZones(['reception']);
    const cores = entities.filter((e) => e.type === 'core');
    for (const core of cores) {
      expect(core.state.collected).toBe(false);
    }
  });

  it('substations have active: false', () => {
    const entities = createWorldEntitiesFromZones(['reception']);
    const subs = entities.filter((e) => e.type === 'substation');
    for (const sub of subs) {
      expect(sub.state.active).toBe(false);
    }
  });
});

describe('Puzzle Activation', () => {
  it('allows activation when no abilities required', () => {
    const entity: WorldEntity = { id: 'door-1', type: 'door', pos: { x: 0, y: 0 }, state: {} };
    expect(checkPuzzleActivation(entity, [])).toBe(true);
  });

  it('requires all specified abilities', () => {
    const entity: WorldEntity = { 
      id: 'door-1', type: 'door', pos: { x: 0, y: 0 }, state: {}, 
      requiresAbilities: ['minty_moxie', 'choco_chip'] as CharacterId[] 
    };
    expect(checkPuzzleActivation(entity, ['minty_moxie'])).toBe(false);
    expect(checkPuzzleActivation(entity, ['choco_chip'])).toBe(false);
    expect(checkPuzzleActivation(entity, ['minty_moxie', 'choco_chip'])).toBe(true);
    expect(checkPuzzleActivation(entity, ['minty_moxie', 'choco_chip', 'gummy_gus'])).toBe(true);
  });
});

describe('Linked Entity Activation', () => {
  it('activates linked entities when trigger fires', () => {
    const entities: WorldEntity[] = [
      { id: 'lever-1', type: 'lever', pos: { x: 0, y: 0 }, state: { active: true }, linkedEntities: ['door-1'] },
      { id: 'door-1', type: 'door', pos: { x: 10, y: 0 }, state: { open: false } },
    ];
    
    activateLinkedEntities('lever-1', entities, { open: true });
    
    const door = entities.find((e) => e.id === 'door-1');
    expect(door?.state.open).toBe(true);
  });

  it('does nothing if no linked entities', () => {
    const entities: WorldEntity[] = [
      { id: 'lever-1', type: 'lever', pos: { x: 0, y: 0 }, state: { active: true } },
    ];
    
    activateLinkedEntities('lever-1', entities, { open: true });
    // Should not throw
  });
});

describe('Zone Detection', () => {
  it('returns correct zone for position', () => {
    expect(getZoneForPosition({ x: 10, y: 10 })).toBe('reception');
    expect(getZoneForPosition({ x: 40, y: 10 })).toBe('mixing');
    expect(getZoneForPosition({ x: 10, y: 30 })).toBe('cooling');
    expect(getZoneForPosition({ x: 40, y: 30 })).toBe('packaging');
    expect(getZoneForPosition({ x: 28, y: 50 })).toBe('quality');
    expect(getZoneForPosition({ x: 28, y: 40 })).toBe('roof');
  });

  it('returns null for out of bounds', () => {
    expect(getZoneForPosition({ x: -10, y: -10 })).toBeNull();
    expect(getZoneForPosition({ x: 100, y: 100 })).toBeNull();
  });
});

describe('Zone Transitions', () => {
  it('reception connects to mixing and cooling', () => {
    const toMixing = getZoneTransition('reception', 'mixing');
    const toCooling = getZoneTransition('reception', 'cooling');
    
    expect(toMixing).toBeDefined();
    expect(toMixing?.requiredConditions?.substationsActive).toBe(1);
    expect(toCooling).toBeDefined();
    expect(toCooling?.requiredConditions?.substationsActive).toBe(1);
  });

  it('quality connects to roof with 3 substations', () => {
    const toRoof = getZoneTransition('quality', 'roof');
    expect(toRoof).toBeDefined();
    expect(toRoof?.requiredConditions?.substationsActive).toBe(3);
  });

  it('returns null for invalid transitions', () => {
    expect(getZoneTransition('reception', 'roof')).toBeNull();
    expect(getZoneTransition('roof', 'reception')).toBeNull();
  });
});

describe('Valve Logic', () => {
  it('activates valve and increments progress', () => {
    const entity: WorldEntity = {
      id: 'valve-1', type: 'valve', pos: { x: 0, y: 0 },
      state: { progress: 0, lastActivated: 0 },
      cooldown: 2000,
    };

    const result = tryActivateValve(entity, 'player-1', 1000);
    expect(result.success).toBe(true);
    expect(result.progress).toBe(0.25);
  });

  it('respects cooldown', () => {
    const entity: WorldEntity = {
      id: 'valve-1', type: 'valve', pos: { x: 0, y: 0 },
      state: { progress: 0.25, lastActivated: 1000 },
      cooldown: 2000,
    };
    
    const result = tryActivateValve(entity, 'player-1', 1500);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Valve cooling down');
  });

  it('completes after 4 activations', () => {
    const entity: WorldEntity = {
      id: 'valve-1', type: 'valve', pos: { x: 0, y: 0 },
      state: { progress: 0, lastActivated: 0 },
      cooldown: 2000,
    };

    for (let i = 0; i < 4; i++) {
      const result = tryActivateValve(entity, 'player-1', 1000 + i * 2000);
      expect(result.success).toBe(true);
    }
    expect(entity.state.progress).toBe(1);
  });
});

describe('Co-op Gate Logic', () => {
  it('opens when all required abilities present', () => {
    const entity: WorldEntity = {
      id: 'coop-gate', type: 'coop_gate', pos: { x: 0, y: 0 }, state: {},
      requiresAbilities: ['minty_moxie', 'choco_chip'] as CharacterId[],
    };
    
    expect(tryActivateCoopGate(entity, ['minty_moxie'])).toBe(false);
    expect(tryActivateCoopGate(entity, ['choco_chip'])).toBe(false);
    expect(tryActivateCoopGate(entity, ['minty_moxie', 'choco_chip'])).toBe(true);
  });

  it('works with extra abilities', () => {
    const entity: WorldEntity = {
      id: 'coop-gate', type: 'coop_gate', pos: { x: 0, y: 0 }, state: {},
      requiresAbilities: ['minty_moxie'] as CharacterId[],
    };
    
    expect(tryActivateCoopGate(entity, ['minty_moxie', 'gummy_gus', 'pop_rocks'])).toBe(true);
  });
});

describe('Valve Completion Check', () => {
  it('returns true when all valves in zone complete', () => {
    const entities: WorldEntity[] = [
      { id: 'valve-vat-1', type: 'valve', pos: { x: 0, y: 0 }, state: { progress: 1 } },
      { id: 'valve-vat-2', type: 'valve', pos: { x: 10, y: 0 }, state: { progress: 1 } },
      { id: 'valve-vat-3', type: 'valve', pos: { x: 20, y: 0 }, state: { progress: 1 } },
    ];
    
    expect(checkAllValvesComplete('mixing', entities)).toBe(true);
  });

  it('returns false when any valve incomplete', () => {
    const entities: WorldEntity[] = [
      { id: 'valve-vat-1', type: 'valve', pos: { x: 0, y: 0 }, state: { progress: 1 } },
      { id: 'valve-vat-2', type: 'valve', pos: { x: 10, y: 0 }, state: { progress: 0.75 } },
      { id: 'valve-vat-3', type: 'valve', pos: { x: 20, y: 0 }, state: { progress: 1 } },
    ];
    
    expect(checkAllValvesComplete('mixing', entities)).toBe(false);
  });

  it('returns true for zone with no valves', () => {
    const entities: WorldEntity[] = [
      { id: 'door-1', type: 'door', pos: { x: 0, y: 0 }, state: { open: false } },
    ];
    
    expect(checkAllValvesComplete('reception', entities)).toBe(true);
  });
});
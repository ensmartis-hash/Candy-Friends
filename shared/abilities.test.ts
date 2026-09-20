// Candy Friends — Ability System Tests

import { describe, it, expect } from 'vitest';
import {
  executeAbilityServer,
  predictAbilityClient,
  getAbilityConfig,
  ABILITY_DEFINITIONS,
} from './abilities';
import type { PlayerState, WorldState, Vec2, CharacterId, PlayerFlags } from './types';
import { CHARACTER_CONFIGS, GAME_CONSTANTS } from './types';

function createMockPlayerState(characterId: CharacterId, overrides: Partial<PlayerState> = {}): PlayerState {
  const config = CHARACTER_CONFIGS[characterId];
  return {
    id: 'test-player',
    characterId,
    pos: { x: 100, y: 100 },
    vel: { x: 0, y: 0 },
    facing: 1,
    anim: 'idle',
    hp: GAME_CONSTANTS.MAX_HP,
    maxHp: GAME_CONSTANTS.MAX_HP,
    ability: { id: config.ability.id, cooldownRemaining: 0, active: false },
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
    ...overrides,
  };
}

function createMockWorldState(): WorldState {
  return {
    tick: 0,
    entities: [
      { id: 'valve-1', type: 'valve', pos: { x: 120, y: 100 }, state: { progress: 0 } },
      { id: 'core-1', type: 'core', pos: { x: 130, y: 100 }, state: { collected: false } },
      { id: 'door-1', type: 'door', pos: { x: 150, y: 100 }, state: { open: false } },
    ],
    coresRemaining: 50,
    substationsActive: 0,
    batchProgress: 0,
    matchState: 'active',
  };
}

describe('Ability System', () => {
  describe('getAbilityConfig', () => {
    it('returns correct config for each character', () => {
      expect(getAbilityConfig('gummy_gus').id).toBe('stretch_reach');
      expect(getAbilityConfig('minty_moxie').id).toBe('ice_slide');
      expect(getAbilityConfig('choco_chip').id).toBe('melt_form');
      expect(getAbilityConfig('sour_sue').id).toBe('pucker_blast');
      expect(getAbilityConfig('licorice_lex').id).toBe('shadow_flatten');
      expect(getAbilityConfig('cotton_candy').id).toBe('healing_cloud');
      expect(getAbilityConfig('jawbreaker_jack').id).toBe('rolling_charge');
      expect(getAbilityConfig('taffy_tia').id).toBe('taffy_tether');
      expect(getAbilityConfig('pop_rocks').id).toBe('micro_detonate');
    });

    it('all 9 characters have unique ability IDs', () => {
      const ids = Object.values(ABILITY_DEFINITIONS).map((a) => a.id);
      expect(new Set(ids).size).toBe(9);
    });

    it('all abilities have valid types', () => {
      const validTypes = ['dash', 'projectile', 'area', 'buff', 'interact'];
      for (const ability of Object.values(ABILITY_DEFINITIONS)) {
        expect(validTypes).toContain(ability.type);
        expect(ability.cooldown).toBeGreaterThan(0);
      }
    });
  });

  describe('Gummy Gus - stretch_reach (interact)', () => {
    it('extends interaction range', () => {
      const player = createMockPlayerState('gummy_gus');
      const world = createMockWorldState();
      // Use entityId for interact ability
      const entityId = 'valve-1'; // At { x: 120, y: 100 } - 20 units away, within base range

      const result = executeAbilityServer(
        { playerState: player, worldState: world, entityId, deltaTime: 1/60 },
        getAbilityConfig('gummy_gus')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'interact')).toBe(true);
      expect(result.cooldownMs).toBe(8000);
    });

    it('fails when on cooldown', () => {
      const player = createMockPlayerState('gummy_gus', {
        ability: { id: 'stretch_reach', cooldownRemaining: 4000, active: false },
      });
      const world = createMockWorldState();

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target: { x: 120, y: 100 }, deltaTime: 1/60 },
        getAbilityConfig('gummy_gus')
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Minty Moxie - ice_slide (dash)', () => {
    it('dashes to target position with freeze effect', () => {
      const player = createMockPlayerState('minty_moxie');
      const world = createMockWorldState();
      const target = { x: 200, y: 100 }; // 100 units away

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target, deltaTime: 1/60 },
        getAbilityConfig('minty_moxie')
      );

      expect(result.success).toBe(true);
      expect(result.positionChange).toBeDefined();
      expect(result.effects.some((e) => e.type === 'dash')).toBe(true);
      expect(result.effects.some((e) => e.type === 'area' && e.stunDuration)).toBe(true);
      expect(result.cooldownMs).toBe(10000);
    });

    it('clamps distance to max range', () => {
      const player = createMockPlayerState('minty_moxie');
      const world = createMockWorldState();
      const target = { x: 500, y: 100 }; // 400 units away, max is 120

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target, deltaTime: 1/60 },
        getAbilityConfig('minty_moxie')
      );

      expect(result.success).toBe(true);
      const dx = (result.positionChange?.x || 0);
      expect(Math.abs(dx)).toBeLessThanOrEqual(120);
    });
  });

  describe('Choco Chip - melt_form (buff)', () => {
    it('grants intangible and speed reduction', () => {
      const player = createMockPlayerState('choco_chip');
      const world = createMockWorldState();

      const result = executeAbilityServer(
        { playerState: player, worldState: world, deltaTime: 1/60 },
        getAbilityConfig('choco_chip')
      );

      expect(result.success).toBe(true);
      expect(result.flagChanges?.intangible).toBe(true);
      expect(result.flagChanges?.melting).toBe(true);
      expect(result.cooldownMs).toBe(12000);
    });
  });

  describe('Sour Sue - pucker_blast (area)', () => {
    it('stuns in radius and extends valve range', () => {
      const player = createMockPlayerState('sour_sue');
      const world = createMockWorldState();

      const result = executeAbilityServer(
        { playerState: player, worldState: world, deltaTime: 1/60 },
        getAbilityConfig('sour_sue')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'area' && e.stunDuration)).toBe(true);
      expect(result.effects.some((e) => e.type === 'interact' && e.rangeBonus)).toBe(true);
      expect(result.cooldownMs).toBe(9000);
    });
  });

  describe('Licorice Lex - shadow_flatten (buff)', () => {
    it('grants invisibility and speed boost', () => {
      const player = createMockPlayerState('licorice_lex');
      const world = createMockWorldState();

      const result = executeAbilityServer(
        { playerState: player, worldState: world, deltaTime: 1/60 },
        getAbilityConfig('licorice_lex')
      );

      expect(result.success).toBe(true);
      expect(result.flagChanges?.invisible).toBe(true);
      expect(result.flagChanges?.frozen).toBe(false);
      expect(result.cooldownMs).toBe(11000);
    });
  });

  describe('Cotton Candy - healing_cloud (area)', () => {
    it('heals allies in radius over time', () => {
      const player = createMockPlayerState('cotton_candy');
      const world = createMockWorldState();

      const result = executeAbilityServer(
        { playerState: player, worldState: world, deltaTime: 1/60 },
        getAbilityConfig('cotton_candy')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'area' && e.healPerSec)).toBe(true);
      expect(result.effects.some((e) => e.type === 'area' && e.duration)).toBe(true);
      expect(result.cooldownMs).toBe(15000);
    });
  });

  describe('Jawbreaker Jack - rolling_charge (dash)', () => {
    it('charges with knockback and wall breaking', () => {
      const player = createMockPlayerState('jawbreaker_jack');
      const world = createMockWorldState();
      const target = { x: 250, y: 100 };

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target, deltaTime: 1/60 },
        getAbilityConfig('jawbreaker_jack')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'dash')).toBe(true);
      expect(result.effects.some((e) => e.knockback)).toBe(true);
      expect(result.effects.some((e) => e.breakWalls)).toBe(true);
      expect(result.cooldownMs).toBe(14000);
    });
  });

  describe('Taffy Tia - taffy_tether (projectile)', () => {
    it('fires tether that can pull and rescue', () => {
      const player = createMockPlayerState('taffy_tia');
      const world = createMockWorldState();
      const target = { x: 200, y: 100 };

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target, deltaTime: 1/60 },
        getAbilityConfig('taffy_tia')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'projectile' && e.pullForce)).toBe(true);
      expect(result.effects.some((e) => e.type === 'projectile' && e.canRescue)).toBe(true);
      expect(result.cooldownMs).toBe(7000);
    });
  });

  describe('Pop Rocks - micro_detonate (projectile)', () => {
    it('explodes with chain chance', () => {
      const player = createMockPlayerState('pop_rocks');
      const world = createMockWorldState();
      const target = { x: 180, y: 100 };

      const result = executeAbilityServer(
        { playerState: player, worldState: world, target, deltaTime: 1/60 },
        getAbilityConfig('pop_rocks')
      );

      expect(result.success).toBe(true);
      expect(result.effects.some((e) => e.type === 'area' && e.radius)).toBe(true);
      expect(result.effects.some((e) => e.type === 'projectile' && e.chainChance && e.chainChance > 0)).toBe(true);
      expect(result.cooldownMs).toBe(6000);
    });
  });

  describe('Client prediction', () => {
    it('returns same result as server for valid input', () => {
      const player = createMockPlayerState('minty_moxie');
      const target = { x: 200, y: 100 };

      const serverResult = executeAbilityServer(
        { playerState: player, worldState: createMockWorldState(), target, deltaTime: 1/60 },
        getAbilityConfig('minty_moxie')
      );

      const clientResult = predictAbilityClient(player, getAbilityConfig('minty_moxie'), target);

      expect(clientResult.success).toBe(serverResult.success);
      expect(clientResult.cooldownMs).toBe(serverResult.cooldownMs);
    });
  });

  describe('Cooldown handling', () => {
    it('rejects ability when cooldown active', () => {
      const player = createMockPlayerState('gummy_gus', {
        ability: { id: 'stretch_reach', cooldownRemaining: 1000, active: false },
      });

      const result = executeAbilityServer(
        { playerState: player, worldState: createMockWorldState(), target: { x: 120, y: 100 }, deltaTime: 1/60 },
        getAbilityConfig('gummy_gus')
      );

      expect(result.success).toBe(false);
      expect(result.cooldownMs).toBe(1000);
    });

    it('rejects when stunned', () => {
      const player = createMockPlayerState('minty_moxie', {
        flags: { ...createMockPlayerState('minty_moxie').flags, stunned: true },
      });

      const result = executeAbilityServer(
        { playerState: player, worldState: createMockWorldState(), target: { x: 200, y: 100 }, deltaTime: 1/60 },
        getAbilityConfig('minty_moxie')
      );

      expect(result.success).toBe(false);
    });

    it('rejects when downed', () => {
      const player = createMockPlayerState('choco_chip', {
        flags: { ...createMockPlayerState('choco_chip').flags, downed: true },
      });

      const result = executeAbilityServer(
        { playerState: player, worldState: createMockWorldState(), deltaTime: 1/60 },
        getAbilityConfig('choco_chip')
      );

      expect(result.success).toBe(false);
    });
  });
});
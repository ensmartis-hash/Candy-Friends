// Candy Friends — Ability System (Shared)
// Data-driven ability configs used by both client and server

import type { CharacterId, AbilityConfig, AbilityType, Vec2, PlayerFlags } from './types';
import { CHARACTER_CONFIGS, GAME_CONSTANTS } from './types';

export interface AbilityEffect {
  type: 'dash' | 'projectile' | 'area' | 'buff' | 'interact';
  // Dash
  speed?: number;
  distance?: number;
  freezeDuration?: number;
  knockback?: number;
  breakWalls?: boolean;
  // Projectile
  range?: number;
  explosionRadius?: number;
  damage?: number;
  chainChance?: number;
  pullForce?: number;
  canRescue?: boolean;
  // Area
  radius?: number;
  stunDuration?: number;
  healPerSec?: number;
  duration?: number;
  valveRange?: number;
  // Buff
  intangible?: boolean;
  speedMultiplier?: number;
  invisible?: boolean;
  // Interact
  rangeBonus?: number;
}

export interface AbilityResult {
  success: boolean;
  effects: AbilityEffect[];
  cooldownMs: number;
  // For server to apply
  positionChange?: Vec2;
  velocityChange?: Vec2;
  flagChanges?: Partial<PlayerFlags>;
  // For visual effects
  visualEffect?: {
    type: 'flash' | 'particle' | 'trail' | 'area';
    color: number;
    duration: number;
    position?: Vec2;
    radius?: number;
  };
}

export interface AbilityContext {
  playerState: any; // PlayerState
  worldState: any;  // WorldState
  target?: Vec2;
  entityId?: string;
  deltaTime: number;
}

// Server-side ability execution (authoritative)
export function executeAbilityServer(
  context: AbilityContext,
  abilityConfig: AbilityConfig
): AbilityResult {
  const { playerState, worldState, target, entityId, deltaTime } = context;
  const params = abilityConfig.params;
  const cooldown = abilityConfig.cooldown;

  // Check cooldown
  if (playerState.ability.cooldownRemaining > 0) {
    return { success: false, effects: [], cooldownMs: playerState.ability.cooldownRemaining };
  }

  // Check if stunned/frozen/downed
  if (playerState.flags.stunned || playerState.flags.frozen || playerState.flags.downed) {
    return { success: false, effects: [], cooldownMs: 0 };
  }

  switch (abilityConfig.type) {
    case 'dash':
      return executeDash(context, params, cooldown);
    case 'projectile':
      return executeProjectile(context, params, cooldown);
    case 'area':
      return executeArea(context, params, cooldown);
    case 'buff':
      return executeBuff(context, params, cooldown);
    case 'interact':
      return executeInteract(context, params, cooldown);
    default:
      return { success: false, effects: [], cooldownMs: 0 };
  }
}

function executeDash(context: AbilityContext, params: any, cooldown: number): AbilityResult {
  const { playerState, target } = context;
  if (!target) return { success: false, effects: [], cooldownMs: 0 };

  const dx = target.x - playerState.pos.x;
  const dy = target.y - playerState.pos.y;
  const dist = Math.hypot(dx, dy);
  const maxDist = params.distance || 120;

  let finalTarget = target;
  if (dist > maxDist) {
    // Clamp to max distance
    const ratio = maxDist / dist;
    finalTarget = { x: playerState.pos.x + dx * ratio, y: playerState.pos.y + dy * ratio };
  }

  const effects: AbilityEffect[] = [{ type: 'dash', speed: params.speed, distance: maxDist }];
  
  // Add freeze effect if specified (Minty)
  if (params.freezeDuration) {
    effects.push({ type: 'area', radius: 40, stunDuration: params.freezeDuration, duration: params.freezeDuration });
  }
  
  // Add knockback/break walls if specified (Jack)
  if (params.knockback || params.breakWalls) {
    effects.push({ type: 'projectile', knockback: params.knockback, breakWalls: params.breakWalls });
  }

  return {
    success: true,
    effects,
    cooldownMs: cooldown,
    positionChange: { x: finalTarget.x - playerState.pos.x, y: finalTarget.y - playerState.pos.y },
    visualEffect: {
      type: 'trail',
      color: 0xffffff,
      duration: 300,
    },
  };
}

function executeProjectile(context: AbilityContext, params: any, cooldown: number): AbilityResult {
  const { playerState, target } = context;
  if (!target) return { success: false, effects: [], cooldownMs: 0 };

  const dx = target.x - playerState.pos.x;
  const dy = target.y - playerState.pos.y;
  const dist = Math.hypot(dx, dy);
  const maxRange = params.range || 100;

  let finalTarget = target;
  if (dist > maxRange) {
    const ratio = maxRange / dist;
    finalTarget = { x: playerState.pos.x + dx * ratio, y: playerState.pos.y + dy * ratio };
  }

  const effects: AbilityEffect[] = [{ type: 'projectile', range: maxRange }];

  // Explosion (Pop Rocks)
  if (params.explosionRadius && params.damage) {
    effects.push({ 
      type: 'area', 
      radius: params.explosionRadius, 
      // damage handled by server
    });
    if (params.chainChance && params.chainChance > 0) {
      effects.push({ type: 'projectile', chainChance: params.chainChance });
    }
  }

  // Pull tether (Taffy Tia)
  if (params.pullForce && params.canRescue) {
    effects.push({ type: 'projectile', pullForce: params.pullForce, canRescue: true });
  }

  return {
    success: true,
    effects,
    cooldownMs: cooldown,
    visualEffect: {
      type: 'particle',
      color: 0xff4444,
      duration: 500,
      position: finalTarget,
      radius: params.explosionRadius || 20,
    },
  };
}

function executeArea(context: AbilityContext, params: any, cooldown: number): AbilityResult {
  const { playerState, worldState } = context;
  
  const effects: AbilityEffect[] = [{ type: 'area', radius: params.radius || 60 }];

  // Stun (Sour Sue)
  if (params.stunDuration) {
    effects.push({ type: 'area', stunDuration: params.stunDuration });
  }

  // Heal (Cotton Candy)
  if (params.healPerSec && params.duration) {
    effects.push({ type: 'area', healPerSec: params.healPerSec, duration: params.duration });
  }

  // Valve range (Sour Sue passive boost)
  if (params.valveRange) {
    effects.push({ type: 'interact', rangeBonus: 2 });
  }

  return {
    success: true,
    effects,
    cooldownMs: cooldown,
    flagChanges: params.stunDuration ? { stunned: true } : undefined,
    visualEffect: {
      type: 'area',
      color: params.healPerSec ? 0x00ff00 : 0x9b59b6,
      duration: params.duration || 2000,
      position: playerState.pos,
      radius: params.radius || 60,
    },
  };
}

function executeBuff(context: AbilityContext, params: any, cooldown: number): AbilityResult {
  const { playerState } = context;
  
  const flagChanges: Partial<PlayerFlags> = {};
  const effects: AbilityEffect[] = [{ type: 'buff' }];

  if (params.intangible) {
    flagChanges.intangible = true;
    flagChanges.melting = true; // Visual indicator
  }
  if (params.invisible) {
    flagChanges.invisible = true;
  }
  if (params.speedMultiplier) {
    flagChanges.frozen = false; // Ensure not frozen
  }

  return {
    success: true,
    effects,
    cooldownMs: cooldown,
    flagChanges,
    visualEffect: {
      type: 'flash',
      color: params.intangible ? 0x5d3a2e : 0x2c2c2c,
      duration: params.duration || 5000,
    },
  };
}

function executeInteract(context: AbilityContext, params: any, cooldown: number): AbilityResult {
  const { playerState, entityId, worldState } = context;
  
  if (!entityId) return { success: false, effects: [], cooldownMs: 0 };

  const entity = worldState.entities.find((e: any) => e.id === entityId);
  if (!entity) return { success: false, effects: [], cooldownMs: 0 };

  const range = GAME_CONSTANTS.TILE_SIZE * (2 + (params.rangeBonus || 0));
  const dx = entity.pos.x - playerState.pos.x;
  const dy = entity.pos.y - playerState.pos.y;
  const dist = Math.hypot(dx, dy);

  if (dist > range) return { success: false, effects: [], cooldownMs: 0 };

  return {
    success: true,
    effects: [{ type: 'interact', rangeBonus: params.rangeBonus || 0 }],
    cooldownMs: cooldown,
    visualEffect: {
      type: 'flash',
      color: 0xff6b9d,
      duration: 300,
    },
  };
}

// Client-side prediction (visual only, server validates)
export function predictAbilityClient(
  playerState: any,
  abilityConfig: AbilityConfig,
  target?: Vec2
): AbilityResult {
  // Same logic but without world state checks for immediate feedback
  // Server will reconcile
  return executeAbilityServer({
    playerState,
    worldState: { entities: [] },
    target,
    deltaTime: 1/60,
  }, abilityConfig);
}

// Get ability config for a character
export function getAbilityConfig(characterId: CharacterId): AbilityConfig {
  return CHARACTER_CONFIGS[characterId].ability;
}

// All ability configs for reference
export const ABILITY_DEFINITIONS: Record<CharacterId, AbilityConfig> = {
  gummy_gus: { id: 'stretch_reach', cooldown: 8000, type: 'interact', params: { rangeBonus: 2, duration: 3000 } },
  minty_moxie: { id: 'ice_slide', cooldown: 10000, type: 'dash', params: { speed: 400, distance: 120, freezeDuration: 2000 } },
  choco_chip: { id: 'melt_form', cooldown: 12000, type: 'buff', params: { duration: 5000, intangible: true, speedMultiplier: 0.5 } },
  sour_sue: { id: 'pucker_blast', cooldown: 9000, type: 'area', params: { radius: 60, stunDuration: 1500, valveRange: 120 } },
  licorice_lex: { id: 'shadow_flatten', cooldown: 11000, type: 'buff', params: { duration: 6000, invisible: true, speedMultiplier: 1.2 } },
  cotton_candy: { id: 'healing_cloud', cooldown: 15000, type: 'area', params: { radius: 80, healPerSec: 15, duration: 4000 } },
  jawbreaker_jack: { id: 'rolling_charge', cooldown: 14000, type: 'dash', params: { speed: 500, distance: 200, knockback: 100, breakWalls: true } },
  taffy_tia: { id: 'taffy_tether', cooldown: 7000, type: 'projectile', params: { range: 150, pullForce: 300, canRescue: true } },
  pop_rocks: { id: 'micro_detonate', cooldown: 6000, type: 'projectile', params: { range: 100, explosionRadius: 50, damage: 25, chainChance: 0.3 } },
};
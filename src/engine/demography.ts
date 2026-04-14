/**
 * demography.ts — Aging, death, pregnancy/birth logic extracted from tick().
 *
 * Pure functions that handle population lifecycle:
 *   1. processDeaths — remove entities that reached maxAge or starved (energy <= 0)
 *   2. processBirths — handle birth when pregnancyTimer reaches 0, including
 *      infant mortality, maternal mortality, trait inheritance, baby placement
 *
 * Age increment, birthCooldown/pregnancyTimer decrement remain in tick()'s Step 0
 * because they are tightly coupled with the metabolism map (drain + eat) in a single pass.
 */

import type { Entity, House, Village, LogEntry, Traits, RGB, TribeId, DeathCause } from './types';
import {
  ECONOMY,
  TICKS_PER_YEAR,
  HOUSE_SIZE,
} from './types';
import { randomName } from './names';

// ── Helpers (mirrored from world.ts — kept local to avoid circular deps) ──

function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function homePosition(e: Entity, houses: House[]): { x: number; y: number } | undefined {
  if (!e.homeId) return undefined;
  const h = houses.find(h => h.id === e.homeId);
  if (!h) return undefined;
  const off = Math.floor(HOUSE_SIZE / 2);
  return { x: h.position.x + off, y: h.position.y + off };
}

function inheritTrait(a: number, b: number, mutation: number): number {
  const avg = (a + b) / 2;
  return clamp(Math.round(avg + (Math.random() * mutation * 2 - mutation)), 0, 100);
}

function inheritTraits(a: Traits, b: Traits): Traits {
  const dramaticMutation = Math.random() < 0.03;
  const MUTATION = 6;
  const traits: Traits = {
    strength: inheritTrait(a.strength, b.strength, MUTATION),
    dexterity: inheritTrait(a.dexterity, b.dexterity, MUTATION),
    intelligence: inheritTrait(a.intelligence, b.intelligence, MUTATION),
  };
  if (dramaticMutation) {
    const keys: (keyof Traits)[] = ['strength', 'dexterity', 'intelligence'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    traits[key] = Math.random() < 0.5 ? 0 : 100;
  }
  return traits;
}

function randomMaxAge(): number {
  const years = 45 + Math.floor(Math.random() * 16);
  return years * TICKS_PER_YEAR;
}

// ── ID generation — uses the same counter as world.ts ──
// The caller provides an ID generator to keep the counter in sync.
export type IdGenerator = (prefix?: string) => string;

// ── Starvation context — diagnostic string for death log ──

export function starvationContext(dead: Entity, allEntities: Entity[], villages: Village[]): string {
  const v = villages.find(vv => vv.tribe === dead.tribe);
  if (!v) return 'no village';
  const raw = v.meatStore + v.plantStore;
  const cooked = v.cookedMeatStore + v.driedFruitStore;
  let adults = 0, toddlers = 0;
  for (const e of allEntities) {
    if (e.tribe !== v.tribe) continue;
    const years = Math.floor(e.age / TICKS_PER_YEAR);
    if (years >= 3) adults++; // CHILD_AGE = 3
    else if (years >= ECONOMY.reproduction.infantAgeYears) toddlers++;
  }
  const energyPerDay = adults * 2 + toddlers * 2 * ECONOMY.reproduction.childDrainMultiplier;
  const stockpileEnergy =
      v.meatStore       * ECONOMY.meat.energyPerUnit
    + v.cookedMeatStore * ECONOMY.cooking.cookedMeatEnergyPerUnit
    + v.plantStore      * ECONOMY.fruit.energyPerUnit
    + v.driedFruitStore * ECONOMY.cooking.driedFruitEnergyPerUnit;
  const days = energyPerDay > 0 ? Math.floor(stockpileEnergy / energyPerDay) : Infinity;
  const daysLabel = !isFinite(days) ? '∞' : String(days);
  return `food=${raw}raw+${cooked}cooked (${daysLabel}d)`;
}

// ── Death processing ──

export interface DeathResult {
  alive: Entity[];
  log: LogEntry[];
}

/**
 * Process deaths: remove entities that died of old age (age >= maxAge)
 * or starvation (energy <= 0). Also removes dead from house occupants.
 *
 * @param entities - the aged entities (age already incremented, energy already drained)
 * @param houses - mutable house array (occupants are spliced in-place)
 * @param tickNum - current tick number for log entries
 * @param allEntities - original entities (before aging) for starvation context
 * @param villages - village data for starvation context
 */
export function processDeaths(
  entities: Entity[],
  houses: House[],
  tickNum: number,
  allEntities: Entity[],
  villages: Village[],
): DeathResult {
  const alive: Entity[] = [];
  const log: LogEntry[] = [];

  for (const e of entities) {
    if (e.age >= e.maxAge) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: e.id, name: e.name, gender: e.gender, age: e.age,
        cause: 'old_age' as DeathCause,
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else if (e.energy <= 0) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: e.id, name: e.name, gender: e.gender, age: e.age,
        cause: 'starvation' as DeathCause,
        detail: starvationContext(e, allEntities, villages),
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      alive.push(e);
    }
  }

  return { alive, log };
}

// ── Birth processing ──

export interface BirthResult {
  /** Entities array with mothers updated (birthCooldown set, fatherTraits cleared).
   *  Maternal deaths already removed. Babies appended. */
  entities: Entity[];
  log: LogEntry[];
}

/**
 * Process births for entities whose pregnancyTimer just hit 0.
 * Creates baby entities, applies infant mortality and maternal mortality.
 * Updates mother's birthCooldown and clears fatherTraits.
 *
 * @param entities - current alive entities (after death filtering, with age/timers updated)
 * @param prevEntities - entities from previous tick (to detect pregnancyTimer transition)
 * @param houses - mutable house array (maternal deaths remove occupants)
 * @param tickNum - current tick for log entries
 * @param generateId - ID generator function (shared counter with world.ts)
 */
export function processBirths(
  entities: Entity[],
  prevEntities: Entity[],
  houses: House[],
  tickNum: number,
  generateId: IdGenerator,
): BirthResult {
  const log: LogEntry[] = [];
  const babies: Entity[] = [];
  const deadMotherIds = new Set<string>();

  // Build lookup for previous-tick pregnancy state
  const prevMap = new Map<string, Entity>();
  for (const e of prevEntities) prevMap.set(e.id, e);

  for (let mi = 0; mi < entities.length; mi++) {
    const mother = entities[mi];
    const prev = prevMap.get(mother.id);
    const wasPregnant = (prev?.pregnancyTimer ?? 0) > 0;
    const stillPregnant = mother.pregnancyTimer > 0;
    if (!wasPregnant || stillPregnant) continue;

    // Birth happens
    const dadTraits = mother.fatherTraits ?? mother.traits;
    const birthHome = homePosition(mother, houses);
    const birthPos = birthHome ? { ...birthHome } : { ...mother.position };

    const babyTraits = inheritTraits(dadTraits, mother.traits);
    const babyGender = Math.random() < 0.5 ? 'male' : 'female' as const;
    const baby: Entity = {
      id: generateId('e'),
      name: randomName(babyGender),
      position: { ...birthPos },
      gender: babyGender,
      activity: { kind: 'idle' },
      age: 0,
      maxAge: randomMaxAge(),
      color: [...mother.color] as RGB,
      energy: ECONOMY.metabolism.energyStart,
      traits: babyTraits,
      birthCooldown: 0,
      pregnancyTimer: 0,
      tribe: (mother.fatherTribe === mother.tribe
        ? mother.tribe
        : (Math.random() < 0.5 ? mother.tribe : mother.fatherTribe!)) as TribeId,
      homeId: birthHome ? mother.homeId : undefined,
      motherId: mother.id,
    };

    if (Math.random() < ECONOMY.reproduction.infantMortality) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: baby.id, name: baby.name, gender: baby.gender, age: baby.age,
        cause: 'starvation' as DeathCause, detail: 'infant mortality',
      });
    } else {
      babies.push(baby);
      log.push({
        tick: tickNum, type: 'birth',
        entityId: baby.id, name: baby.name, gender: baby.gender, age: baby.age,
      });
    }

    // Reset reproductive state on mother
    entities[mi] = { ...mother, fatherTraits: undefined, birthCooldown: ECONOMY.reproduction.birthCooldown };

    // Maternal mortality
    if (Math.random() < ECONOMY.reproduction.maternalMortality) {
      deadMotherIds.add(mother.id);
      log.push({
        tick: tickNum, type: 'death',
        entityId: mother.id, name: mother.name, gender: mother.gender, age: mother.age,
        cause: 'childbirth' as DeathCause,
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(mother.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    }
  }

  const result = entities.filter(e => !deadMotherIds.has(e.id)).concat(babies);
  return { entities: result, log };
}

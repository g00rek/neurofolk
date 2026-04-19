/**
 * phases.ts — Deterministic passive-phase computation.
 *
 * Active phase runs tick-by-tick via tick() in world.ts. At the end of the
 * active phase, this module collapses N in-world years into a single step:
 * aging, old-age deaths, consumption, starvation, mating, births.
 */

import type { Entity, House, LogEntry, DeathRecord, Village, TribeId } from './types';
import { TICKS_PER_YEAR, ECONOMY, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from './types';

/** Age every entity by `years` Earth-years. Returns new array; does not mutate input. */
export function ageAll(entities: Entity[], years: number): Entity[] {
  return entities.map(e => ({ ...e, age: e.age + years * TICKS_PER_YEAR }));
}

/**
 * Remove entities whose age >= maxAge. Logs each death and appends a DeathRecord.
 * Mutates houses.occupants in place (removes dead ids). Returns the alive subset.
 */
export function applyOldAgeDeaths(
  entities: Entity[],
  houses: House[],
  tickNum: number,
  log: LogEntry[],
  deaths: DeathRecord[],
): Entity[] {
  const alive: Entity[] = [];
  for (const e of entities) {
    if (e.age >= e.maxAge) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: e.id, name: e.name, gender: e.gender, age: e.age,
        cause: 'old_age',
      });
      deaths.push({
        entityId: e.id, name: e.name, gender: e.gender,
        ageYears: Math.floor(e.age / TICKS_PER_YEAR),
        cause: 'old_age',
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      alive.push(e);
    }
  }
  return alive;
}

export interface ConsumptionResult {
  foodDeficitPeople: number;
  woodDeficitPeople: number;
}

/**
 * Drain food (cooked first, then dried, raw meat, raw plant) and wood from village.
 * **MUTATES village in place** — updates cookedMeatStore, driedFruitStore,
 * meatStore, plantStore, woodStore.
 *
 * Returns deficit expressed as "how many people cannot be supported".
 *
 * foodDeficitPeople = ceil(remaining_energy_shortfall / (years * foodEnergyPerPersonPerYear))
 * woodDeficitPeople = ceil(remaining_wood_shortfall / (years * woodPerPersonPerYear))
 */
export function applyConsumption(
  v: Village,
  population: number,
  years: number,
): ConsumptionResult {
  let foodNeeded = population * years * ECONOMY.winter.foodEnergyPerPersonPerYear;
  let woodNeeded = population * years * ECONOMY.winter.woodPerPersonPerYear;

  // Drain food in priority order: cooked > dried > raw meat > raw plant.
  const drain = (store: number, energyPerUnit: number): [number, number] => {
    if (foodNeeded <= 0 || store <= 0) return [0, store];
    const unitsNeeded = Math.ceil(foodNeeded / energyPerUnit);
    const taken = Math.min(store, unitsNeeded);
    foodNeeded -= taken * energyPerUnit;
    return [taken, store - taken];
  };

  [, v.cookedMeatStore] = drain(v.cookedMeatStore, ECONOMY.cooking.cookedMeatEnergyPerUnit);
  [, v.driedFruitStore] = drain(v.driedFruitStore, ECONOMY.cooking.driedFruitEnergyPerUnit);
  [, v.meatStore]       = drain(v.meatStore,       ECONOMY.meat.energyPerUnit);
  [, v.plantStore]      = drain(v.plantStore,      ECONOMY.fruit.energyPerUnit);

  // Wood drain.
  const woodTaken = Math.min(v.woodStore, woodNeeded);
  v.woodStore -= woodTaken;
  woodNeeded -= woodTaken;

  const perPersonYearFood = years * ECONOMY.winter.foodEnergyPerPersonPerYear;
  const perPersonYearWood = years * ECONOMY.winter.woodPerPersonPerYear;

  const foodDeficitPeople = foodNeeded > 0 ? Math.ceil(foodNeeded / perPersonYearFood) : 0;
  const woodDeficitPeople = woodNeeded > 0 ? Math.ceil(woodNeeded / perPersonYearWood) : 0;

  return { foodDeficitPeople, woodDeficitPeople };
}

/**
 * Kill N lowest-energy entities in the given tribe. Returns the alive subset.
 * Mutates house occupants. Appends log + deaths.
 */
export function applyStarvationDeaths(
  entities: Entity[],
  tribe: TribeId,
  n: number,
  houses: House[],
  tickNum: number,
  log: LogEntry[],
  deaths: DeathRecord[],
): Entity[] {
  if (n <= 0) return entities;
  const tribeMembers = entities.filter(e => e.tribe === tribe);
  const doomed = [...tribeMembers]
    .sort((a, b) => a.energy - b.energy)
    .slice(0, n);
  const doomedIds = new Set(doomed.map(e => e.id));

  for (const e of doomed) {
    log.push({
      tick: tickNum, type: 'death',
      entityId: e.id, name: e.name, gender: e.gender, age: e.age,
      cause: 'starvation', detail: 'Long Winter',
    });
    deaths.push({
      entityId: e.id, name: e.name, gender: e.gender,
      ageYears: Math.floor(e.age / TICKS_PER_YEAR),
      cause: 'starvation', detail: 'Long Winter',
    });
    for (const h of houses) {
      const idx = h.occupants.indexOf(e.id);
      if (idx >= 0) h.occupants.splice(idx, 1);
    }
  }

  return entities.filter(e => !doomedIds.has(e.id));
}

function attractiveness(e: Entity): number {
  return (e.traits.strength + e.traits.dexterity + e.traits.intelligence) / 3;
}

/**
 * Pair every eligible woman with the highest-attractiveness man of her tribe.
 * Sets pregnancyTimer = 1 (sentinel), stores fatherTraits/fatherTribe.
 * Returns new entity array; does not mutate input.
 */
export function runMatingRound(
  entities: Entity[],
  log: LogEntry[],
  tickNum: number,
): Entity[] {
  const topMaleByTribe = new Map<TribeId, Entity>();
  for (const e of entities) {
    if (e.gender !== 'male') continue;
    const ageYears = Math.floor(e.age / TICKS_PER_YEAR);
    if (ageYears < MIN_REPRODUCTIVE_AGE || ageYears > MAX_REPRODUCTIVE_AGE) continue;
    const current = topMaleByTribe.get(e.tribe);
    if (!current || attractiveness(e) > attractiveness(current)) {
      topMaleByTribe.set(e.tribe, e);
    }
  }

  return entities.map(e => {
    if (e.gender !== 'female') return e;
    const ageYears = Math.floor(e.age / TICKS_PER_YEAR);
    if (ageYears < MIN_REPRODUCTIVE_AGE || ageYears > MAX_REPRODUCTIVE_AGE) return e;
    if (e.pregnancyTimer > 0) return e;
    if (e.energy < ECONOMY.reproduction.pregnancyMinEnergy) return e;
    const mate = topMaleByTribe.get(e.tribe);
    if (!mate) return e;
    log.push({
      tick: tickNum, type: 'pregnant',
      entityId: e.id, name: e.name, gender: e.gender, age: e.age,
      detail: `father: ${mate.name}`,
    });
    return {
      ...e,
      pregnancyTimer: 1,
      fatherTraits: { ...mate.traits },
      fatherTribe: mate.tribe,
    };
  });
}

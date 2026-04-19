/**
 * phases.ts — Deterministic passive-phase computation.
 *
 * Active phase runs tick-by-tick via tick() in world.ts. At the end of the
 * active phase, this module collapses N in-world years into a single step:
 * aging, old-age deaths, consumption, starvation, mating, births.
 */

import type { Entity, House, LogEntry, DeathRecord, Village } from './types';
import { TICKS_PER_YEAR, ECONOMY } from './types';

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
  const drain = (store: number, energyPerUnit: number): [taken: number, remaining: number] => {
    if (foodNeeded <= 0 || store <= 0) return [0, store];
    const unitsNeeded = Math.ceil(foodNeeded / energyPerUnit);
    const taken = Math.min(store, unitsNeeded);
    foodNeeded -= taken * energyPerUnit;
    return [taken, store - taken];
  };

  let taken: number;
  [taken, v.cookedMeatStore] = drain(v.cookedMeatStore, ECONOMY.cooking.cookedMeatEnergyPerUnit);
  [taken, v.driedFruitStore] = drain(v.driedFruitStore, ECONOMY.cooking.driedFruitEnergyPerUnit);
  [taken, v.meatStore]       = drain(v.meatStore,       ECONOMY.meat.energyPerUnit);
  [taken, v.plantStore]      = drain(v.plantStore,      ECONOMY.fruit.energyPerUnit);
  void taken;

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

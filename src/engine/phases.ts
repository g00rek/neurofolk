/**
 * phases.ts — Deterministic passive-phase computation.
 *
 * Active phase runs tick-by-tick via tick() in world.ts. At the end of the
 * active phase, this module collapses N in-world years into a single step:
 * aging, old-age deaths, consumption, starvation, mating, births.
 */

import type {
  Entity, House, LogEntry, DeathRecord, Village, TribeId,
  BirthRecord, RGB, Traits, WorldState, PassiveSummary, TribeSummary, Stockpile,
} from './types';
import { TICKS_PER_YEAR, ECONOMY, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from './types';
import { randomName } from './names';

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
 * @internal — exported for unit tests only; callers should use computePassivePhase.
 *
 * Drain food (cooked first, then dried, raw meat, raw plant) and wood from village.
 *
 * **⚠️ MUTATES the `v` argument in place** — updates cookedMeatStore, driedFruitStore,
 * meatStore, plantStore, woodStore. Callers must clone the village if they want to preserve
 * the original. (computePassivePhase passes a cloned village.)
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

function randomMaxAgeTicks(): number {
  const years = 45 + Math.floor(Math.random() * 16);
  return years * TICKS_PER_YEAR;
}

function snapshotStockpile(v: Village): Stockpile {
  return {
    meat: v.meatStore,
    plant: v.plantStore,
    cookedMeat: v.cookedMeatStore,
    driedFruit: v.driedFruitStore,
    wood: v.woodStore,
    gold: v.goldStore,
  };
}

/**
 * Resolve all pending pregnancies (pregnancyTimer > 0). For each:
 *   1. Roll infant mortality → baby created or not
 *   2. Roll maternal mortality → mother removed or survives (with pregnancyTimer cleared)
 * Returns new entity array with survivors + surviving babies. Mutates houses.
 */
export function resolveBirths(
  entities: Entity[],
  houses: House[],
  tickNum: number,
  log: LogEntry[],
  births: BirthRecord[],
  deaths: DeathRecord[],
  generateId: () => string,
): Entity[] {
  const result: Entity[] = [];
  for (const mother of entities) {
    if (mother.pregnancyTimer <= 0) {
      result.push(mother);
      continue;
    }
    const infantDies = Math.random() < ECONOMY.reproduction.infantMortality;
    const dadTraits = mother.fatherTraits ?? mother.traits;
    const babyTraits = inheritTraits(dadTraits, mother.traits);
    const babyGender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
    const babyId = generateId();
    const babyName = randomName(babyGender);

    if (infantDies) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: babyId, name: babyName, gender: babyGender, age: 0,
        cause: 'starvation', detail: 'infant mortality',
      });
      deaths.push({
        entityId: babyId, name: babyName, gender: babyGender, ageYears: 0,
        cause: 'starvation', detail: 'infant mortality',
      });
    } else {
      const baby: Entity = {
        id: babyId,
        name: babyName,
        position: { ...mother.position },
        gender: babyGender,
        activity: { kind: 'idle' },
        age: 0,
        maxAge: randomMaxAgeTicks(),
        color: [...mother.color] as RGB,
        energy: ECONOMY.metabolism.energyStart,
        traits: babyTraits,
        pregnancyTimer: 0,
        tribe: (mother.fatherTribe === mother.tribe
          ? mother.tribe
          : (Math.random() < 0.5 ? mother.tribe : mother.fatherTribe ?? mother.tribe)),
        homeId: mother.homeId,
        motherId: mother.id,
      };
      result.push(baby);
      log.push({
        tick: tickNum, type: 'birth',
        entityId: baby.id, name: baby.name, gender: baby.gender, age: 0,
      });
      births.push({
        babyId: baby.id, babyName: baby.name, babyGender: baby.gender,
        motherId: mother.id, motherName: mother.name,
      });
    }

    const maternalDies = Math.random() < ECONOMY.reproduction.maternalMortality;
    if (maternalDies) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: mother.id, name: mother.name, gender: mother.gender, age: mother.age,
        cause: 'childbirth',
      });
      deaths.push({
        entityId: mother.id, name: mother.name, gender: mother.gender,
        ageYears: Math.floor(mother.age / TICKS_PER_YEAR),
        cause: 'childbirth',
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(mother.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      result.push({
        ...mother,
        pregnancyTimer: 0,
        fatherTraits: undefined,
        fatherTribe: undefined,
      });
    }
  }
  return result;
}

/**
 * Collapse N Earth-years of passive time into one deterministic step.
 * Steps: age → old-age deaths → consumption → starvation → mating → births.
 * Returns new world (phase='summary', phaseTick=0, lastPassiveSummary filled) + summary.
 */
export function computePassivePhase(
  world: WorldState,
  years: number,
  generateId: () => string,
): { world: WorldState; summary: PassiveSummary } {
  // Clone arrays we'll mutate.
  const houses = world.houses.map(h => ({ ...h, occupants: [...h.occupants] }));
  const villages = world.villages.map(v => ({
    ...v,
    color: [...v.color] as RGB,
    stockpile: v.stockpile ? { ...v.stockpile } : undefined,
  }));
  const log: LogEntry[] = [...world.log];

  const stockpileBeforeByTribe = new Map<TribeId, Stockpile>();
  for (const v of villages) stockpileBeforeByTribe.set(v.tribe, snapshotStockpile(v));

  // Per-tribe bookkeeping for summary.
  const birthsByTribe = new Map<TribeId, BirthRecord[]>();
  const deathsByTribe = new Map<TribeId, DeathRecord[]>();
  for (const v of villages) {
    birthsByTribe.set(v.tribe, []);
    deathsByTribe.set(v.tribe, []);
  }

  // 1. Aging.
  let entities = ageAll(world.entities, years);

  // 2. Old-age deaths, tracked per-tribe.
  {
    const tribeById = new Map(entities.map(e => [e.id, e.tribe]));
    const deathsBucket: DeathRecord[] = [];
    entities = applyOldAgeDeaths(entities, houses, world.tick, log, deathsBucket);
    for (const d of deathsBucket) {
      const tribe = tribeById.get(d.entityId) ?? 0;
      deathsByTribe.get(tribe)?.push(d);
    }
  }

  // 3 + 4. Consumption + starvation per tribe.
  for (const v of villages) {
    const pop = entities.filter(e => e.tribe === v.tribe).length;
    if (pop === 0) continue;
    const { foodDeficitPeople, woodDeficitPeople } = applyConsumption(v, pop, years);
    const deficit = Math.max(foodDeficitPeople, woodDeficitPeople);
    if (deficit > 0) {
      const deathsBucket: DeathRecord[] = [];
      entities = applyStarvationDeaths(entities, v.tribe, deficit, houses, world.tick, log, deathsBucket);
      for (const d of deathsBucket) deathsByTribe.get(v.tribe)?.push(d);
    }
  }

  // 5. Mating.
  entities = runMatingRound(entities, log, world.tick);

  // 6. Births. Per-tribe bookkeeping by looking up mother's tribe.
  {
    const birthBucket: BirthRecord[] = [];
    const deathBucket: DeathRecord[] = [];
    const before = new Map(entities.map(e => [e.id, e.tribe]));
    entities = resolveBirths(entities, houses, world.tick, log, birthBucket, deathBucket, generateId);
    for (const b of birthBucket) {
      const tribe = before.get(b.motherId) ?? 0;
      birthsByTribe.get(tribe)?.push(b);
    }
    for (const d of deathBucket) {
      const tribe = before.get(d.entityId) ?? 0;
      deathsByTribe.get(tribe)?.push(d);
    }
  }

  const perTribe: TribeSummary[] = villages.map(v => ({
    tribe: v.tribe,
    births: birthsByTribe.get(v.tribe) ?? [],
    deaths: deathsByTribe.get(v.tribe) ?? [],
    stockpileBefore: stockpileBeforeByTribe.get(v.tribe) ?? snapshotStockpile(v),
    stockpileAfter: snapshotStockpile(v),
  }));

  const summary: PassiveSummary = {
    endedAtTick: world.tick,
    passivePhaseYears: years,
    perTribe,
  };

  const nextWorld: WorldState = {
    ...world,
    entities,
    houses,
    villages,
    log,
    phase: 'summary',
    phaseTick: 0,
    lastPassiveSummary: summary,
  };

  return { world: nextWorld, summary };
}

# Seasonal Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the simulation into alternating active (tick-by-tick RTS) and passive (deterministic skip) phases so generational change becomes watchable.

**Architecture:** `WorldState` gains `phase: 'active' | 'passive' | 'summary'` and `phaseTick`. `tick()` only advances in active phase; on reaching `activePhaseTicks` it calls a new pure `computePassivePhase()` that folds aging, consumption, starvation, mating, and births into a single deterministic step, then stops the world in `'summary'` until the player dismisses a modal.

**Tech Stack:** TypeScript, Vitest, React, Web Worker. All existing.

**Design doc:** `docs/superpowers/specs/2026-04-19-seasonal-phases-design.md`

---

## Task 1: Foundation types & config

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/world.ts` (createWorld init)

This task lays groundwork. No logic change yet — all existing tests should still pass.

- [ ] **Step 1: Add new type interfaces to `types.ts`**

Append near existing `LogEntry` definition:

```ts
export interface Stockpile {
  meat: number;
  plant: number;
  cookedMeat: number;
  driedFruit: number;
  wood: number;
  gold: number;
}

export interface BirthRecord {
  babyId: string;
  babyName: string;
  babyGender: Gender;
  motherId: string;
  motherName: string;
  fatherId?: string;
  fatherName?: string;
}

export interface DeathRecord {
  entityId: string;
  name: string;
  gender: Gender;
  ageYears: number;
  cause: DeathCause;
  detail?: string;
}

export interface TribeSummary {
  tribe: TribeId;
  births: BirthRecord[];
  deaths: DeathRecord[];
  stockpileBefore: Stockpile;
  stockpileAfter: Stockpile;
}

export interface PassiveSummary {
  endedAtTick: number;
  passivePhaseYears: number;
  perTribe: TribeSummary[];
}

export type Phase = 'active' | 'passive' | 'summary';
```

- [ ] **Step 2: Extend WorldState with phase fields**

Modify existing `WorldState` interface:

```ts
export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  trees: Tree[];
  goldDeposits: GoldDeposit[];
  houses: House[];
  biomes: Biome[][];
  villages: Village[];
  grass: number[][];
  tick: number;
  gridSize: number;
  log: LogEntry[];
  phase: Phase;
  phaseTick: number;
  lastPassiveSummary?: PassiveSummary;
}
```

- [ ] **Step 3: Add `winter` block to ECONOMY**

Inside the `ECONOMY` const, add a new block after `gold`:

```ts
  // --- WINTER (passive phase consumption) ---
  // Per-person-per-passive-year drain. Calibrated so that a tribe of 10 adults
  // with 3-year skip needs ~6000 energy of food + 60 wood to survive.
  winter: {
    foodEnergyPerPersonPerYear: 200,
    woodPerPersonPerYear: 2,
  },
```

- [ ] **Step 4: Add phase values to RUNTIME_CONFIG**

Extend the existing `RUNTIME_CONFIG` object literal:

```ts
export const RUNTIME_CONFIG = {
  maxHerdSize: 30,
  herdLeash: 6,
  reproInterval: 800,
  grassGrowChance: 0.005,
  grazeEnergy: 12,
  animalFleeRange: 4,
  animalPanicDuration: 10,
  activePhaseTicks: 800,
  passivePhaseYears: 3,
};
```

- [ ] **Step 5: Initialize phase fields in `createWorld`**

In `src/engine/world.ts`, find the `return { ... }` at the end of `createWorld` and add:

```ts
    phase: 'active',
    phaseTick: 0,
```

- [ ] **Step 6: Run all tests**

Run: `cd /home/g00rek/neurofolk && npm test -- --run`
Expected: All existing tests pass. Any failures mean type additions broke something — fix before committing.

- [ ] **Step 7: Run typecheck**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/world.ts
git commit -m "feat(phases): types and config for seasonal phase system"
```

---

## Task 2: `ageAll` pure function

**Files:**
- Create: `src/engine/phases.ts`
- Create: `src/engine/__tests__/phases.test.ts`

First of six pure sub-functions that compose into `computePassivePhase`. Strict TDD.

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/phases.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ageAll } from '../phases';
import { TICKS_PER_YEAR } from '../types';
import type { Entity } from '../types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1', name: 'Test', position: { x: 0, y: 0 },
    gender: 'female', activity: { kind: 'idle' },
    age: 10 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR,
    color: [100, 100, 100], energy: 80,
    traits: { strength: 50, dexterity: 50, intelligence: 50 },
    tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
    ...overrides,
  };
}

describe('ageAll', () => {
  it('ages every entity by years * TICKS_PER_YEAR', () => {
    const entities = [
      makeEntity({ id: 'a', age: 5 * TICKS_PER_YEAR }),
      makeEntity({ id: 'b', age: 40 * TICKS_PER_YEAR }),
    ];
    const aged = ageAll(entities, 3);
    expect(aged[0].age).toBe(8 * TICKS_PER_YEAR);
    expect(aged[1].age).toBe(43 * TICKS_PER_YEAR);
  });

  it('does not mutate input entities', () => {
    const entities = [makeEntity({ id: 'a', age: 5 * TICKS_PER_YEAR })];
    ageAll(entities, 3);
    expect(entities[0].age).toBe(5 * TICKS_PER_YEAR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — module `../phases` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/phases.ts`:

```ts
/**
 * phases.ts — Deterministic passive-phase computation.
 *
 * Active phase runs tick-by-tick via tick() in world.ts. At the end of the
 * active phase, this module collapses N in-world years into a single step:
 * aging, old-age deaths, consumption, starvation, mating, births.
 */

import type { Entity } from './types';
import { TICKS_PER_YEAR } from './types';

/** Age every entity by `years` Earth-years. Returns new array; does not mutate input. */
export function ageAll(entities: Entity[], years: number): Entity[] {
  return entities.map(e => ({ ...e, age: e.age + years * TICKS_PER_YEAR }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): ageAll pure function"
```

---

## Task 3: `applyOldAgeDeaths` pure function

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `phases.test.ts`:

```ts
import { ageAll, applyOldAgeDeaths } from '../phases';
import type { House, LogEntry } from '../types';

describe('applyOldAgeDeaths', () => {
  it('removes entities whose age >= maxAge and logs each death', () => {
    const entities = [
      makeEntity({ id: 'alive', age: 30 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR }),
      makeEntity({ id: 'dead1', age: 55 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR, name: 'Stary' }),
      makeEntity({ id: 'dead2', age: 60 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR, name: 'Baba' }),
    ];
    const houses: House[] = [];
    const log: LogEntry[] = [];
    const deaths: DeathRecord[] = [];
    const alive = applyOldAgeDeaths(entities, houses, 1000, log, deaths);
    expect(alive.map(e => e.id)).toEqual(['alive']);
    expect(log).toHaveLength(2);
    expect(log[0].cause).toBe('old_age');
    expect(deaths).toHaveLength(2);
    expect(deaths[0].cause).toBe('old_age');
  });

  it('removes dead entities from their house occupants list', () => {
    const entities = [
      makeEntity({ id: 'dead', age: 99 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR, homeId: 'h1' }),
    ];
    const houses: House[] = [
      { id: 'h1', position: { x: 0, y: 0 }, tribe: 0, occupants: ['dead', 'other'] },
    ];
    applyOldAgeDeaths(entities, houses, 0, [], []);
    expect(houses[0].occupants).toEqual(['other']);
  });
});
```

Add this import at top of test file (update existing imports):
```ts
import type { DeathRecord } from '../types';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — `applyOldAgeDeaths` is not exported.

- [ ] **Step 3: Implement `applyOldAgeDeaths`**

Append to `src/engine/phases.ts`:

```ts
import type { House, LogEntry, DeathRecord } from './types';

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
```

Replace the existing import line at the top of `phases.ts` with:

```ts
import type { Entity, House, LogEntry, DeathRecord } from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): applyOldAgeDeaths"
```

---

## Task 4: `applyConsumption` pure function

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

Per tribe: drain food (cooked first, then dried, raw meat, raw plant) and wood from stockpile. Returns per-tribe deficit in people (how many cannot be supported by remaining stockpile).

- [ ] **Step 1: Write the failing test**

Append to `phases.test.ts`:

```ts
import { applyConsumption } from '../phases';
import { ECONOMY } from '../types';
import type { Village } from '../types';

function makeVillage(overrides: Partial<Village> = {}): Village {
  return {
    tribe: 0, color: [200, 60, 60], name: 'Red',
    meatStore: 0, plantStore: 0,
    cookedMeatStore: 0, driedFruitStore: 0,
    woodStore: 0, goldStore: 0,
    ...overrides,
  };
}

describe('applyConsumption', () => {
  it('drains enough stockpile for 5 people × 3 years without deficit', () => {
    const v = makeVillage({ cookedMeatStore: 1000, woodStore: 1000 });
    const { foodDeficitPeople, woodDeficitPeople } = applyConsumption(v, 5, 3);
    expect(foodDeficitPeople).toBe(0);
    expect(woodDeficitPeople).toBe(0);
    // Drained: 5 × 3 × 200 = 3000 energy. cookedMeat = 50/unit → 60 units drained.
    expect(v.cookedMeatStore).toBe(940);
    // Drained: 5 × 3 × 2 = 30 wood.
    expect(v.woodStore).toBe(970);
  });

  it('reports deficit when food insufficient', () => {
    // Required: 5 × 3 × 200 = 3000 energy. Provide 3 cooked meat = 150 energy. Deficit: 2850 energy.
    // Deficit per person per year = 200. Deficit people = ceil(2850 / (3 × 200)) = ceil(4.75) = 5.
    const v = makeVillage({ cookedMeatStore: 3, woodStore: 1000 });
    const { foodDeficitPeople } = applyConsumption(v, 5, 3);
    expect(v.cookedMeatStore).toBe(0);
    expect(foodDeficitPeople).toBeGreaterThan(0);
    expect(foodDeficitPeople).toBeLessThanOrEqual(5);
  });

  it('priority: cooked > dried > raw meat > raw plant', () => {
    // Each cooked meat = 50 energy. Need 1 unit for 1 person × 1 year (need 200 energy).
    // Provide 2 cooked + 10 dried: cooked drained first.
    const v = makeVillage({ cookedMeatStore: 2, driedFruitStore: 10, woodStore: 100 });
    applyConsumption(v, 1, 1);
    // Need 200 energy. 2 cooked = 100 energy. 10 dried × 35 = 350 but only 100 more needed → ~3 dried.
    expect(v.cookedMeatStore).toBe(0);
    expect(v.driedFruitStore).toBeLessThan(10);
    expect(v.driedFruitStore).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — `applyConsumption` not exported.

- [ ] **Step 3: Implement `applyConsumption`**

Append to `src/engine/phases.ts`:

```ts
import type { Village } from './types';
import { ECONOMY } from './types';

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
```

Update import line in `phases.ts`:

```ts
import type { Entity, House, LogEntry, DeathRecord, Village } from './types';
import { TICKS_PER_YEAR, ECONOMY } from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): applyConsumption drains stockpile, reports deficit"
```

---

## Task 5: `applyStarvationDeaths` pure function

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

Kills the N lowest-energy entities in a given tribe. N = max(foodDeficitPeople, woodDeficitPeople).

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { applyStarvationDeaths } from '../phases';

describe('applyStarvationDeaths', () => {
  it('kills the N lowest-energy entities in the given tribe', () => {
    const entities = [
      makeEntity({ id: 'a', tribe: 0, energy: 80 }),
      makeEntity({ id: 'b', tribe: 0, energy: 10 }),
      makeEntity({ id: 'c', tribe: 0, energy: 30 }),
      makeEntity({ id: 'd', tribe: 1, energy: 5 }),
    ];
    const houses: House[] = [];
    const log: LogEntry[] = [];
    const deaths: DeathRecord[] = [];
    const alive = applyStarvationDeaths(entities, 0, 2, houses, 500, log, deaths);
    // Tribe 0: kill 2 lowest = b (10) and c (30). a survives. d is tribe 1, untouched.
    expect(alive.map(e => e.id).sort()).toEqual(['a', 'd']);
    expect(log).toHaveLength(2);
    expect(log[0].cause).toBe('starvation');
    expect(deaths).toHaveLength(2);
  });

  it('no-op when N = 0', () => {
    const entities = [makeEntity({ id: 'a', tribe: 0, energy: 10 })];
    const alive = applyStarvationDeaths(entities, 0, 0, [], 0, [], []);
    expect(alive).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `src/engine/phases.ts`:

```ts
import type { TribeId } from './types';

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
```

Update `phases.ts` top import:

```ts
import type { Entity, House, LogEntry, DeathRecord, Village, TribeId } from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): applyStarvationDeaths targets lowest-energy per tribe"
```

---

## Task 6: `runMatingRound` pure function

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

For each tribe: pair every eligible woman with the most attractive man. Sets `pregnancyTimer = 1` sentinel (birth resolved immediately in Task 7).

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { runMatingRound } from '../phases';

describe('runMatingRound', () => {
  it('pairs each eligible woman with highest-attractiveness man in tribe', () => {
    const entities = [
      makeEntity({ id: 'w1', tribe: 0, gender: 'female', age: 20 * TICKS_PER_YEAR, energy: 80 }),
      makeEntity({ id: 'w2', tribe: 0, gender: 'female', age: 25 * TICKS_PER_YEAR, energy: 80 }),
      makeEntity({ id: 'm1', tribe: 0, gender: 'male', age: 30 * TICKS_PER_YEAR,
        traits: { strength: 90, dexterity: 80, intelligence: 70 } }),
      makeEntity({ id: 'm2', tribe: 0, gender: 'male', age: 30 * TICKS_PER_YEAR,
        traits: { strength: 30, dexterity: 20, intelligence: 10 } }),
    ];
    const log: LogEntry[] = [];
    const updated = runMatingRound(entities, log, 0);
    const w1 = updated.find(e => e.id === 'w1')!;
    const w2 = updated.find(e => e.id === 'w2')!;
    expect(w1.pregnancyTimer).toBe(1);
    expect(w2.pregnancyTimer).toBe(1);
    expect(w1.fatherTraits).toEqual({ strength: 90, dexterity: 80, intelligence: 70 });
    expect(w2.fatherTraits).toEqual({ strength: 90, dexterity: 80, intelligence: 70 });
  });

  it('skips women under 12, over 40, low energy, already pregnant', () => {
    const entities = [
      makeEntity({ id: 'young', gender: 'female', age: 10 * TICKS_PER_YEAR, energy: 80 }),
      makeEntity({ id: 'old', gender: 'female', age: 45 * TICKS_PER_YEAR, energy: 80 }),
      makeEntity({ id: 'weak', gender: 'female', age: 20 * TICKS_PER_YEAR, energy: 50 }),
      makeEntity({ id: 'preg', gender: 'female', age: 20 * TICKS_PER_YEAR, energy: 80, pregnancyTimer: 100 }),
      makeEntity({ id: 'm', gender: 'male', age: 30 * TICKS_PER_YEAR }),
    ];
    const updated = runMatingRound(entities, [], 0);
    for (const id of ['young', 'old', 'weak']) {
      const e = updated.find(x => x.id === id)!;
      expect(e.pregnancyTimer).toBe(0);
    }
    // 'preg' retains existing pregnancyTimer
    expect(updated.find(e => e.id === 'preg')!.pregnancyTimer).toBe(100);
  });

  it('no mating in a tribe with zero eligible men', () => {
    const entities = [
      makeEntity({ id: 'w', tribe: 0, gender: 'female', age: 20 * TICKS_PER_YEAR, energy: 80 }),
      makeEntity({ id: 'boy', tribe: 0, gender: 'male', age: 8 * TICKS_PER_YEAR }),
    ];
    const updated = runMatingRound(entities, [], 0);
    expect(updated.find(e => e.id === 'w')!.pregnancyTimer).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `src/engine/phases.ts`:

```ts
import { MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from './types';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): runMatingRound — women pair with top-attractiveness man"
```

---

## Task 7: `resolveBirths` pure function

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

For every woman with `pregnancyTimer > 0`: roll infant mortality, if baby survives create entity, roll maternal mortality. Seeded randomness is out of scope — tests pin mortality rolls by stubbing `Math.random`.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { resolveBirths } from '../phases';
import { vi } from 'vitest';

describe('resolveBirths', () => {
  it('creates baby entity per pregnant woman when rolls favor survival', () => {
    // Force Math.random = 0.99 → infant survives (< 0.30 = die), mother survives (< 0.05 = die).
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const entities = [
      makeEntity({
        id: 'mom', gender: 'female', tribe: 0, age: 25 * TICKS_PER_YEAR,
        pregnancyTimer: 1,
        fatherTraits: { strength: 70, dexterity: 60, intelligence: 50 },
        fatherTribe: 0,
        homeId: 'h1',
        position: { x: 5, y: 5 },
      }),
    ];
    const houses: House[] = [{ id: 'h1', position: { x: 4, y: 4 }, tribe: 0, occupants: ['mom'] }];
    const log: LogEntry[] = [];
    const births: BirthRecord[] = [];
    const deaths: DeathRecord[] = [];
    let nextId = 1000;
    const genId = () => `baby-${nextId++}`;
    const result = resolveBirths(entities, houses, 500, log, births, deaths, genId);
    // Mother alive, no longer pregnant.
    const mom = result.find(e => e.id === 'mom')!;
    expect(mom.pregnancyTimer).toBe(0);
    expect(mom.fatherTraits).toBeUndefined();
    // Baby created with age 0.
    const baby = result.find(e => e.id !== 'mom')!;
    expect(baby.age).toBe(0);
    expect(baby.motherId).toBe('mom');
    expect(births).toHaveLength(1);
    expect(deaths).toHaveLength(0);
    spy.mockRestore();
  });

  it('kills mother on maternal mortality roll, still produces surviving baby', () => {
    // Stepped random: first call = infant roll (0.99 survive), second = maternal (0.01 die).
    let n = 0;
    const rolls = [0.99, 0.01, 0.5];
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => rolls[n++] ?? 0.5);
    const entities = [
      makeEntity({
        id: 'mom', gender: 'female', tribe: 0, age: 25 * TICKS_PER_YEAR,
        pregnancyTimer: 1,
        fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
        fatherTribe: 0,
      }),
    ];
    const deaths: DeathRecord[] = [];
    const births: BirthRecord[] = [];
    const result = resolveBirths(entities, [], 0, [], births, deaths, () => 'baby-1');
    expect(result.find(e => e.id === 'mom')).toBeUndefined();
    expect(deaths.some(d => d.cause === 'childbirth')).toBe(true);
    expect(births).toHaveLength(1);
    spy.mockRestore();
  });

  it('does nothing for women who are not pregnant', () => {
    const entities = [makeEntity({ id: 'a', gender: 'female', pregnancyTimer: 0 })];
    const result = resolveBirths(entities, [], 0, [], [], [], () => 'x');
    expect(result).toEqual(entities);
  });
});
```

Add to imports at top:
```ts
import type { BirthRecord } from '../types';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — `resolveBirths` not exported.

- [ ] **Step 3: Implement**

Append to `src/engine/phases.ts`:

```ts
import type { BirthRecord, RGB, Traits } from './types';
import { randomName } from './names';

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
    const dadTraits = mother.fatherTraits ?? mother.traits;
    const babyTraits = inheritTraits(dadTraits, mother.traits);
    const babyGender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
    const babyId = generateId();
    const babyName = randomName(babyGender);
    const infantDies = Math.random() < ECONOMY.reproduction.infantMortality;
    let babyCreated = false;

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
        birthCooldown: 0,
        pregnancyTimer: 0,
        tribe: (mother.fatherTribe === mother.tribe
          ? mother.tribe
          : (Math.random() < 0.5 ? mother.tribe : mother.fatherTribe ?? mother.tribe)),
        homeId: mother.homeId,
        motherId: mother.id,
      };
      result.push(baby);
      babyCreated = true;
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

    void babyCreated;
  }
  return result;
}
```

Update top imports of `phases.ts`:

```ts
import type { Entity, House, LogEntry, DeathRecord, Village, TribeId, BirthRecord, RGB, Traits } from './types';
import { TICKS_PER_YEAR, ECONOMY, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from './types';
import { randomName } from './names';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): resolveBirths with infant and maternal mortality"
```

---

## Task 8: `computePassivePhase` composition

**Files:**
- Modify: `src/engine/phases.ts`
- Modify: `src/engine/__tests__/phases.test.ts`

Stitch the sub-functions together. Captures stockpile snapshots before/after per tribe.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { computePassivePhase } from '../phases';
import type { WorldState } from '../types';

function makeWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    entities: [],
    animals: [],
    trees: [],
    goldDeposits: [],
    houses: [],
    biomes: [],
    villages: [],
    grass: [],
    tick: 1000,
    gridSize: 30,
    log: [],
    phase: 'active',
    phaseTick: 800,
    ...overrides,
  };
}

describe('computePassivePhase', () => {
  it('returns phase=summary with populated lastPassiveSummary', () => {
    const world = makeWorld({
      entities: [
        makeEntity({ id: 'a', tribe: 0, age: 30 * TICKS_PER_YEAR, energy: 80 }),
      ],
      villages: [makeVillage({ tribe: 0, cookedMeatStore: 1000, woodStore: 1000 })],
    });
    const { world: next } = computePassivePhase(world, 3, () => 'baby-1');
    expect(next.phase).toBe('summary');
    expect(next.phaseTick).toBe(0);
    expect(next.lastPassiveSummary).toBeDefined();
    expect(next.lastPassiveSummary!.perTribe).toHaveLength(1);
    expect(next.lastPassiveSummary!.passivePhaseYears).toBe(3);
  });

  it('ages entities by passivePhaseYears', () => {
    const world = makeWorld({
      entities: [makeEntity({ id: 'a', tribe: 0, age: 10 * TICKS_PER_YEAR })],
      villages: [makeVillage({ tribe: 0, cookedMeatStore: 1000, woodStore: 1000 })],
    });
    const { world: next } = computePassivePhase(world, 3, () => 'baby-1');
    const a = next.entities.find(e => e.id === 'a')!;
    expect(a.age).toBe(13 * TICKS_PER_YEAR);
  });

  it('kills off entities past maxAge during skip', () => {
    const world = makeWorld({
      entities: [makeEntity({ id: 'old', tribe: 0, age: 48 * TICKS_PER_YEAR, maxAge: 50 * TICKS_PER_YEAR })],
      villages: [makeVillage({ tribe: 0, cookedMeatStore: 1000, woodStore: 1000 })],
    });
    const { world: next, summary } = computePassivePhase(world, 3, () => 'baby-1');
    expect(next.entities.find(e => e.id === 'old')).toBeUndefined();
    expect(summary.perTribe[0].deaths.some(d => d.cause === 'old_age')).toBe(true);
  });

  it('stockpile snapshots capture before/after drain', () => {
    const world = makeWorld({
      entities: [
        makeEntity({ id: 'a', tribe: 0, age: 30 * TICKS_PER_YEAR, energy: 80, gender: 'male' }),
        makeEntity({ id: 'b', tribe: 0, age: 30 * TICKS_PER_YEAR, energy: 80, gender: 'male' }),
      ],
      villages: [makeVillage({ tribe: 0, cookedMeatStore: 100, woodStore: 100 })],
    });
    const { summary } = computePassivePhase(world, 3, () => 'x');
    const t = summary.perTribe[0];
    expect(t.stockpileBefore.cookedMeat).toBe(100);
    expect(t.stockpileAfter.cookedMeat).toBeLessThan(100);
    expect(t.stockpileAfter.wood).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `src/engine/phases.ts`:

```ts
import type { WorldState, PassiveSummary, TribeSummary, Stockpile, BirthRecord as BR } from './types';

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
  const villages = world.villages.map(v => ({ ...v }));
  const log: LogEntry[] = [...world.log];

  const stockpileBeforeByTribe = new Map<TribeId, Stockpile>();
  for (const v of villages) stockpileBeforeByTribe.set(v.tribe, snapshotStockpile(v));

  // Per-tribe bookkeeping for summary.
  const birthsByTribe = new Map<TribeId, BR[]>();
  const deathsByTribe = new Map<TribeId, DeathRecord[]>();
  for (const v of villages) {
    birthsByTribe.set(v.tribe, []);
    deathsByTribe.set(v.tribe, []);
  }

  // 1. Aging.
  let entities = ageAll(world.entities, years);

  // 2. Old-age deaths, tracked per-tribe.
  {
    const deathsBucket: DeathRecord[] = [];
    entities = applyOldAgeDeaths(entities, houses, world.tick, log, deathsBucket);
    for (const d of deathsBucket) {
      const tribe = world.entities.find(e => e.id === d.entityId)?.tribe ?? 0;
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
    const birthBucket: BR[] = [];
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
```

Update `phases.ts` top imports to include everything now used:

```ts
import type {
  Entity, House, LogEntry, DeathRecord, Village, TribeId,
  BirthRecord, RGB, Traits, WorldState, PassiveSummary, TribeSummary, Stockpile,
} from './types';
import { TICKS_PER_YEAR, ECONOMY, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from './types';
import { randomName } from './names';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite to make sure nothing else broke**

Run: `cd /home/g00rek/neurofolk && npm test -- --run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/phases.ts src/engine/__tests__/phases.test.ts
git commit -m "feat(phases): computePassivePhase composition"
```

---

## Task 9: Integrate phase gate + transition into `tick()`

**Files:**
- Modify: `src/engine/world.ts`

At top of `tick()`: if `phase !== 'active'`, return world unchanged. At end: increment `phaseTick`; if ≥ `activePhaseTicks`, call `computePassivePhase` and return its result.

This task also **removes** the active-phase mating and pregnancy timer code. After this, active phase no longer decrements pregnancy timers, no longer calls `pheromoneMating`, no longer handles `processBirths`.

- [ ] **Step 1: Read current `tick()` layout**

Run: `cd /home/g00rek/neurofolk && grep -n "export function tick" src/engine/world.ts`

Note the line number. Open and inspect the start of `tick()` and the region around lines 923-946 (pregnancy decrement + processBirths) and line 1179 (pheromoneMating).

- [ ] **Step 2: Add phase gate at top of `tick()`**

In `src/engine/world.ts`, find the function signature `export function tick(state: WorldState): WorldState {` (or similar). Immediately after the opening brace, insert:

```ts
  if (state.phase !== 'active') return state;
```

- [ ] **Step 3: Remove `pheromoneMating` call**

Find the line at `src/engine/world.ts:1179`:

```ts
  entities = pheromoneMating(entities, updatedVillages, houses, log, tickNum);
```

Delete it. Also remove `pheromoneMating` from the import on line 21:

```ts
import { detectInteractions, fightWinner } from './interactions';
```

- [ ] **Step 4: Remove active-phase pregnancy timer decrement and processBirths**

Find in `tick()` the block around lines 923-924:

```ts
      birthCooldown: Math.max(0, e.birthCooldown - 1),
      pregnancyTimer: Math.max(0, e.pregnancyTimer - 1),
```

Delete both lines. (We'll remove `birthCooldown` from the type next task. For now leave it at `0` by not touching it — JavaScript default preserves the existing value.)

Find the `processBirths` call (around line 946 or search for `processBirths(`):

```ts
  // --- Step 0c: Births — pregnancyTimer just hit 0 for these mothers — demography.ts ---
  const birthResult = processBirths(entities, state.entities, houses, tickNum, generateId);
  entities = birthResult.entities;
  log.push(...birthResult.log);
```

Delete this block (the comment line and the 3 code lines).

Also remove `processBirths` from the import on line 20:

```ts
import { processDeaths } from './demography';
```

- [ ] **Step 5: Add phase-end transition before the final `return`**

Find the end of `tick()` — the `return { ... }` that produces the next world state. Immediately before it, add:

```ts
  const nextPhaseTick = state.phaseTick + 1;
  if (nextPhaseTick >= RUNTIME_CONFIG.activePhaseTicks) {
    const prelim: WorldState = {
      ...state,
      entities,
      animals,
      trees,
      goldDeposits,
      houses,
      villages: updatedVillages,
      grass,
      tick: tickNum,
      log,
      phase: 'active',
      phaseTick: nextPhaseTick,
    };
    const { world: withSummary } = computePassivePhase(prelim, RUNTIME_CONFIG.passivePhaseYears, generateId);
    return withSummary;
  }
```

Then in the final `return { ... }` object literal, add:

```ts
    phase: state.phase,
    phaseTick: nextPhaseTick,
    lastPassiveSummary: state.lastPassiveSummary,
```

Adjust variable names in the snippet above to match whatever locals the function actually uses (the actual names may differ — match what's already there).

- [ ] **Step 6: Add `computePassivePhase` import**

In `src/engine/world.ts` top imports:

```ts
import { computePassivePhase } from './phases';
```

- [ ] **Step 7: Run all tests**

Run: `cd /home/g00rek/neurofolk && npm test -- --run`
Expected: Some existing tests that depended on active-phase mating may fail. That's Task 15.

Critical: `phases.test.ts` still passes. `utility-ai.test.ts` still passes. World smoke test should pass — no entities getting pregnant in active phase is fine since the test doesn't run 800 ticks.

- [ ] **Step 8: Run typecheck**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success. If `birthCooldown` or `pregnancyTimer` references error, they're fixed in Task 10.

- [ ] **Step 9: Commit**

```bash
git add src/engine/world.ts
git commit -m "feat(phases): wire phase gate, active-phase mating removed"
```

---

## Task 10: Remove `birthCooldown` from the model

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/world.ts`
- Modify: `src/engine/utility-ai.ts`
- Modify: `src/engine/interactions.ts`
- Modify: `src/engine/demography.ts`
- Modify: `src/ui/EntityPanel.tsx`
- Modify: `src/ui/AnimalsPage.tsx`
- Modify: `src/engine/__tests__/utility-ai.test.ts`

Breaking change. Rip out the `birthCooldown` field everywhere.

- [ ] **Step 1: Remove from `Entity` interface and ECONOMY**

In `src/engine/types.ts`:
- Delete the line `birthCooldown: number;  // ticks until next pregnancy allowed`
- Delete the line `birthCooldown: 900,            // ~45 days after birth — postpartum recovery period`
- Update the comment block above `ECONOMY.reproduction` to remove references to `birthCooldown`.

- [ ] **Step 2: Find all remaining references**

Run: `cd /home/g00rek/neurofolk && grep -rn "birthCooldown" src/`

- [ ] **Step 3: Remove from every site**

For each match:
- `src/engine/world.ts:410`: delete `birthCooldown: 0,` line in the entity creation.
- `src/engine/utility-ai.ts:337`: delete the line `if (ctx.entity.gender === 'female' && ctx.entity.birthCooldown > 0) return 0;`.
- `src/engine/interactions.ts:158`: delete `if (female.birthCooldown > 0) continue;` (whole pheromoneMating func will be deleted in Task 11, but remove the line now to pass typecheck).
- `src/engine/demography.ts`: in `processBirths`, find and remove the line setting `birthCooldown: ECONOMY.reproduction.birthCooldown`. Replace the updated entity object literal to not reference the field.
- `src/ui/EntityPanel.tsx`: remove all 4 references (lines ~16, ~94, ~139, ~142). The "postpartum" status can simply be deleted; the block showing birthCooldown is also deleted.
- `src/ui/AnimalsPage.tsx:359`: delete `birthCooldown: 0,` from entity initialization.
- `src/engine/__tests__/utility-ai.test.ts`: in the `makeEntity` helper, delete `birthCooldown: 0,`.
- `src/engine/phases.ts` (our new file) — in `resolveBirths` we set `birthCooldown: 0,` on the baby entity. Delete that line too.

- [ ] **Step 4: Verify grep is clean**

Run: `cd /home/g00rek/neurofolk && grep -rn "birthCooldown" src/`
Expected: no matches.

- [ ] **Step 5: Run all tests**

Run: `cd /home/g00rek/neurofolk && npm test -- --run`
Expected: All passing tests from Task 9 continue to pass. Some older tests may still fail — that's Task 15.

- [ ] **Step 6: Run typecheck**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove birthCooldown field from model"
```

---

## Task 11: Delete `pheromoneMating`

**Files:**
- Modify: `src/engine/interactions.ts`
- Modify: `src/engine/__tests__/interactions.test.ts`

- [ ] **Step 1: Delete function body**

In `src/engine/interactions.ts`, delete the entire `export function pheromoneMating(...)` block (lines ~127 to ~190). Also delete its imports if they become unused (`ECONOMY`, `MIN_REPRODUCTIVE_AGE`, `MAX_REPRODUCTIVE_AGE` — check what `detectInteractions` still needs).

- [ ] **Step 2: Delete / update existing tests that exercise pheromoneMating**

Open `src/engine/__tests__/interactions.test.ts`. Any `describe('pheromoneMating', ...)` blocks: delete entirely. Keep tests for `detectInteractions` / `fightWinner` untouched.

- [ ] **Step 3: Run interactions tests**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/interactions.test.ts`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success.

- [ ] **Step 5: Commit**

```bash
git add src/engine/interactions.ts src/engine/__tests__/interactions.test.ts
git commit -m "refactor: delete pheromoneMating (replaced by passive phase)"
```

---

## Task 12: Simplify `demography.ts` — remove `processBirths`, strip old-age branch

**Files:**
- Modify: `src/engine/demography.ts`
- Modify: `src/engine/__tests__/demography.test.ts`

`processBirths` goes away — births only happen in passive phase. `processDeaths` stays in active phase but only for starvation (energy ≤ 0) — the old-age branch is removed per spec ("No old-age deaths in active phase"). Entities past maxAge during active phase simply wait for the next passive where `applyOldAgeDeaths` reaps them.

- [ ] **Step 1: Delete `processBirths`**

In `src/engine/demography.ts`, delete the entire `export function processBirths(...)` block, its helper imports (`inheritTrait`, `inheritTraits`, `randomMaxAge`, `randomName`, `homePosition`, etc.) if unused, and the `BirthResult` interface.

- [ ] **Step 2: Remove old-age branch from `processDeaths`**

Find in `processDeaths` the block:

```ts
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
```

Replace with:

```ts
    if (e.energy <= 0) {
```

The `else` becomes `if`, and drop the entire `if (e.age >= e.maxAge) { ... }` block. The result: `processDeaths` only removes entities that hit `energy <= 0`.

- [ ] **Step 3: Update demography tests**

In `src/engine/__tests__/demography.test.ts`:
- Delete any `describe('processBirths', ...)` blocks.
- Delete any `processDeaths` tests that assert old-age deaths (cause === 'old_age'). Keep starvation tests.

- [ ] **Step 4: Run demography tests**

Run: `cd /home/g00rek/neurofolk && npx vitest run src/engine/__tests__/demography.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success.

- [ ] **Step 6: Commit**

```bash
git add src/engine/demography.ts src/engine/__tests__/demography.test.ts
git commit -m "refactor: demography strips processBirths + old-age (moved to passive)"
```

---

## Task 13: Worker auto-pause on non-active phase + `advancePhase` message

**Files:**
- Modify: `src/engine/simulationWorker.ts`

When `world.phase === 'summary'`, the worker must stop ticking and post a snapshot immediately so UI can show the modal. A new message type `advancePhase` resumes: sets `phase = 'active'`, `phaseTick = 0`, continues.

- [ ] **Step 1: Extend `WorkerRequest` union**

In `src/engine/simulationWorker.ts`, add to the union type:

```ts
  | { type: 'advancePhase' };
```

- [ ] **Step 2: Auto-pause logic in `runSlice`**

Modify the `for (let i = 0; i < count; i++)` loop inside `runSlice`:

```ts
  for (let i = 0; i < count; i++) {
    if (world.entities.length === 0) {
      running = false;
      break;
    }
    if (world.phase !== 'active') {
      running = false;
      break;
    }
    world = tick(world);
    if (world.tick % POP_SAMPLE_INTERVAL === 0) {
      pendingSamples.push(populationSample(world));
    }
    if (world.phase !== 'active') {
      // tick triggered passive phase — pause so UI renders summary
      running = false;
      break;
    }
  }
```

- [ ] **Step 3: Handle `advancePhase` message**

Add a new case in the `switch (message.type)`:

```ts
    case 'advancePhase':
      if (!world) break;
      world = { ...world, phase: 'active', phaseTick: 0 };
      postSnapshot(world);
      break;
```

Also the `'skip'` handler should respect phase — add the phase check inside the skip loop:

```ts
      for (let i = 0; i < message.ticks; i++) {
        if (world.entities.length === 0) break;
        if (world.phase !== 'active') break;
        world = tick(world);
        if (world.tick % POP_SAMPLE_INTERVAL === 0) {
          pendingSamples.push(populationSample(world));
        }
      }
```

- [ ] **Step 4: Build**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Success.

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulationWorker.ts
git commit -m "feat(worker): auto-pause on non-active phase + advancePhase handler"
```

---

## Task 14: SummaryModal UI

**Files:**
- Create: `src/ui/SummaryModal.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Create SummaryModal component**

Create `src/ui/SummaryModal.tsx`:

```tsx
import type { PassiveSummary, Village } from '../engine/types';

interface Props {
  summary: PassiveSummary;
  villages: Village[];
  onContinue: () => void;
}

export function SummaryModal({ summary, villages, onContinue }: Props) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0 }}>Długa Zima minęła</h2>
        <p style={{ color: '#aaa', marginTop: 4 }}>
          Lat ziemskich: {summary.passivePhaseYears}
        </p>
        {summary.perTribe.map(t => {
          const v = villages.find(vv => vv.tribe === t.tribe);
          const name = v?.name ?? `Plemię ${t.tribe}`;
          const color = v?.color;
          return (
            <div key={t.tribe} style={tribeBlockStyle}>
              <h3 style={{
                color: color ? `rgb(${color[0]},${color[1]},${color[2]})` : undefined,
                margin: 0,
              }}>{name}</h3>
              <div style={statsRowStyle}>
                <span>Narodzeni: <b>{t.births.length}</b></span>
                <span>Zmarli: <b>{t.deaths.length}</b></span>
              </div>
              {t.deaths.length > 0 && (
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
                  {causeCount(t.deaths, 'old_age')} starość,{' '}
                  {causeCount(t.deaths, 'starvation')} głód,{' '}
                  {causeCount(t.deaths, 'childbirth')} poród
                </div>
              )}
              <div style={stockpileRowStyle}>
                <span>Jedzenie (cooked): {t.stockpileBefore.cookedMeat} → {t.stockpileAfter.cookedMeat}</span>
                <span>Drewno: {t.stockpileBefore.wood} → {t.stockpileAfter.wood}</span>
              </div>
            </div>
          );
        })}
        <button onClick={onContinue} style={buttonStyle}>Rozpocznij nowe Lato</button>
      </div>
    </div>
  );
}

function causeCount(deaths: { cause: string }[], cause: string): number {
  return deaths.filter(d => d.cause === cause).length;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#1a1b26', border: '1px solid #444', borderRadius: 8,
  padding: 24, minWidth: 360, maxWidth: 560, color: '#eee',
};
const tribeBlockStyle: React.CSSProperties = {
  marginTop: 16, padding: 12, background: '#22232e', borderRadius: 6,
};
const statsRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginTop: 4, fontSize: 14,
};
const stockpileRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#aaa',
};
const buttonStyle: React.CSSProperties = {
  marginTop: 20, padding: '8px 16px', background: '#9ece6a',
  color: '#1a1b26', border: 'none', borderRadius: 4,
  fontWeight: 'bold', cursor: 'pointer', fontSize: 14,
};
```

- [ ] **Step 2: Wire into App**

In `src/ui/App.tsx`, import the modal and render it when `world.phase === 'summary'`:

```tsx
import { SummaryModal } from './SummaryModal';
```

Find where the main app layout renders (typically near the bottom of the App component). Add just before the closing element:

```tsx
{world?.phase === 'summary' && world.lastPassiveSummary && (
  <SummaryModal
    summary={world.lastPassiveSummary}
    villages={world.villages}
    onContinue={() => worker.postMessage({ type: 'advancePhase' })}
  />
)}
```

Replace `worker` with whatever the actual worker reference is in App.tsx — inspect the file first to find the correct name.

- [ ] **Step 3: Run app**

Run: `cd /home/g00rek/neurofolk && npm run build`
Expected: Build succeeds.

Then start dev server: `cd /home/g00rek/neurofolk && npm run dev` and open browser. Speed up the simulation and wait 800 ticks — modal should appear. Click "Rozpocznij nowe Lato" — modal closes, simulation resumes.

- [ ] **Step 4: Commit**

```bash
git add src/ui/SummaryModal.tsx src/ui/App.tsx
git commit -m "feat(ui): SummaryModal shown at end of passive phase"
```

---

## Task 15: Controls sliders for phase lengths

**Files:**
- Modify: `src/ui/Controls.tsx`
- Modify: `src/ui/App.tsx`

Add two sliders to Controls: `activePhaseTicks` (range 200-2000, step 100) and `passivePhaseYears` (range 1-5, step 1). Both dispatch `setRuntimeConfig` to the worker.

- [ ] **Step 1: Extend `ControlsProps`**

Add to the interface at the top of `src/ui/Controls.tsx`:

```ts
  activePhaseTicks: number;
  passivePhaseYears: number;
  onConfigChange: (config: { activePhaseTicks?: number; passivePhaseYears?: number }) => void;
```

- [ ] **Step 2: Add sliders in JSX**

Inside the main `<div>` of `Controls`, after the skip buttons:

```tsx
<div style={{ display: 'flex', gap: 8, marginLeft: 12, alignItems: 'center', fontSize: 11 }}>
  <label title="Długość aktywnej fazy w tickach">
    Lato: {activePhaseTicks}t
    <input
      type="range" min={200} max={2000} step={100}
      value={activePhaseTicks}
      onChange={e => onConfigChange({ activePhaseTicks: +e.target.value })}
      style={{ width: 70, marginLeft: 4 }}
    />
  </label>
  <label title="Ile lat ziemskich trwa Długa Zima">
    Zima: {passivePhaseYears}r
    <input
      type="range" min={1} max={5} step={1}
      value={passivePhaseYears}
      onChange={e => onConfigChange({ passivePhaseYears: +e.target.value })}
      style={{ width: 50, marginLeft: 4 }}
    />
  </label>
</div>
```

Update the function signature to destructure the new props.

- [ ] **Step 3: Wire from App.tsx**

In `App.tsx`, add state for the two values (initialized from `RUNTIME_CONFIG` defaults: 800 and 3). Pass them to `Controls` and provide an `onConfigChange` handler that posts `setRuntimeConfig` to the worker:

```tsx
const [activePhaseTicks, setActivePhaseTicks] = useState(800);
const [passivePhaseYears, setPassivePhaseYears] = useState(3);

const handleConfigChange = (config: { activePhaseTicks?: number; passivePhaseYears?: number }) => {
  if (config.activePhaseTicks !== undefined) setActivePhaseTicks(config.activePhaseTicks);
  if (config.passivePhaseYears !== undefined) setPassivePhaseYears(config.passivePhaseYears);
  worker.postMessage({ type: 'setRuntimeConfig', config });
};
```

Pass `activePhaseTicks`, `passivePhaseYears`, and `onConfigChange={handleConfigChange}` to `<Controls>`.

- [ ] **Step 4: Persist to localStorage**

In `src/engine/types.ts`, confirm `loadRuntimeConfig`/`saveRuntimeConfig` cover the new keys (they use `Object.assign` with `JSON.parse` so they already do). Call `saveRuntimeConfig()` inside `handleConfigChange`:

```tsx
  ...
  worker.postMessage({ type: 'setRuntimeConfig', config });
  saveRuntimeConfig();
```

Import `saveRuntimeConfig` from `../engine/types`. Also ensure `loadRuntimeConfig()` is called at app start (probably already is — grep to confirm).

- [ ] **Step 5: Run app**

Run: `npm run dev`. Move the sliders, watch phase transitions occur at the new cadence.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Controls.tsx src/ui/App.tsx
git commit -m "feat(ui): sliders for active/passive phase length"
```

---

## Task 16: Phase indicator in Stats

**Files:**
- Modify: `src/ui/Stats.tsx`

Small touch: show current phase + progress.

- [ ] **Step 1: Read Stats.tsx**

Inspect the component — find a logical place to add a one-line indicator (often near tick display).

- [ ] **Step 2: Add phase line**

Where `world.tick` is rendered, add (or nearby):

```tsx
<div style={{ fontSize: 11, color: '#aaa' }}>
  {world.phase === 'active'
    ? `Lato — ${world.phaseTick}/${activePhaseTicks}t`
    : world.phase === 'summary'
      ? 'Długa Zima (podsumowanie)'
      : 'Długa Zima'}
</div>
```

You will need `activePhaseTicks` passed as a prop from `App.tsx`, or read from a shared source. If Stats already takes runtime-config props, extend them; otherwise add one prop.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Stats.tsx src/ui/App.tsx
git commit -m "feat(ui): phase indicator in Stats"
```

---

## Task 17: Clean up any remaining dead tests / symbols

**Files:**
- Test files under `src/engine/__tests__/`

Any tests that assumed active-phase mating or birthCooldown and now fail. Should mostly be covered by Tasks 11-12 but final pass to sweep.

- [ ] **Step 1: Run full test suite**

Run: `cd /home/g00rek/neurofolk && npm test -- --run`
Expected: Some failures from lingering references.

- [ ] **Step 2: Fix each failure by either**
- Deleting the obsolete test (if it tested the old pheromoneMating / active-phase pregnancy)
- Adapting it to the new model

Common cases:
- `world.test.ts` tests that let the world run 800+ ticks now hit the passive phase — update assertions accordingly, or cap the tick count.
- Any `makeEntity`-style helpers in test files still referencing `birthCooldown: 0` → delete.

- [ ] **Step 3: Re-run full suite**

Run: `npm test -- --run`
Expected: All pass.

- [ ] **Step 4: Run typecheck**

Run: `npm run build`
Expected: Success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: sweep dead references after phase refactor"
```

---

## Final Verification

- [ ] `npm test -- --run` — all green
- [ ] `npm run build` — no errors
- [ ] Manual smoke test: start the app, run at max speed, confirm modal appears after ~800 ticks, confirm clicking continues the simulation, confirm sliders work
- [ ] `grep -rn "pheromoneMating\|birthCooldown\|processBirths" src/` returns nothing

## Out of Scope (deferred)

Per spec:
- Cross-tribe mating
- Tech tree / per-tribe mortality modifiers
- Per-household stockpile
- Interactive mating board (beyond the summary modal)
- Attractiveness preferences per woman
- Day/night inside active phase

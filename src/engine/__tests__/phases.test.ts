import { describe, it, expect } from 'vitest';
import { ageAll, applyOldAgeDeaths, applyConsumption, applyStarvationDeaths } from '../phases';
import { TICKS_PER_YEAR } from '../types';
import type { Entity, House, LogEntry, DeathRecord, Village } from '../types';

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

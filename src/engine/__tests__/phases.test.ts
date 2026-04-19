import { describe, it, expect } from 'vitest';
import { ageAll, applyOldAgeDeaths } from '../phases';
import { TICKS_PER_YEAR } from '../types';
import type { Entity, House, LogEntry, DeathRecord } from '../types';

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

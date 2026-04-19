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

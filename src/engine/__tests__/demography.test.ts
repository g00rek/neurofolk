import { describe, it, expect, vi, afterEach } from 'vitest';
import { processDeaths, starvationContext } from '../demography';
import type { Entity, House, Village, RGB } from '../types';
import { TICKS_PER_YEAR } from '../types';

const T = TICKS_PER_YEAR;

// ── Helpers ──

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    name: 'Test',
    position: { x: 5, y: 5 },
    gender: 'male',
    activity: { kind: 'idle' },
    age: 20 * T,
    maxAge: 80 * T,
    color: [255, 0, 0] as RGB,
    energy: 80,
    traits: { strength: 50, dexterity: 50, intelligence: 50 },
    tribe: 0,
    pregnancyTimer: 0,
    ...overrides,
  };
}

function makeVillage(overrides: Partial<Village> = {}): Village {
  return {
    tribe: 0,
    color: [220, 60, 60] as RGB,
    name: 'Red',
    meatStore: 10,
    plantStore: 10,
    cookedMeatStore: 0,
    driedFruitStore: 0,
    woodStore: 5,
    goldStore: 0,
    ...overrides,
  };
}

function makeHouse(overrides: Partial<House> = {}): House {
  return {
    id: 'h1',
    position: { x: 5, y: 5 },
    tribe: 0,
    occupants: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// DEATH PROCESSING
// ═══════════════════════════════════════════════════════════════════════

describe('processDeaths', () => {
  it('entity dies when energy reaches 0', () => {
    const entity = makeEntity({ id: 'starved', energy: 0 });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(0);
    expect(result.log).toHaveLength(1);
    expect(result.log[0].cause).toBe('starvation');
    expect(result.log[0].entityId).toBe('starved');
  });

  it('alive entity with positive energy survives regardless of age', () => {
    const entity = makeEntity({ id: 'healthy', energy: 80, age: 20 * T });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(1);
    expect(result.alive[0].id).toBe('healthy');
    expect(result.log).toHaveLength(0);
  });

  it('entity past maxAge but with positive energy survives in active phase', () => {
    const entity = makeEntity({ id: 'old', age: 80 * T, maxAge: 80 * T, energy: 10 });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(1);
    expect(result.log).toHaveLength(0);
  });

  it('removes dead entity from house occupants', () => {
    const house = makeHouse({ occupants: ['dying', 'survivor'] });
    const dying = makeEntity({ id: 'dying', energy: 0 });
    const survivor = makeEntity({ id: 'survivor', energy: 50 });
    const result = processDeaths([dying, survivor], [house], 1, [], []);
    expect(result.alive).toHaveLength(1);
    expect(house.occupants).toEqual(['survivor']);
  });

  it('starvation death includes context detail', () => {
    const entity = makeEntity({ id: 'starved', energy: 0, tribe: 0 });
    const village = makeVillage({ meatStore: 5, plantStore: 3 });
    const result = processDeaths([entity], [], 1, [entity], [village]);
    expect(result.log[0].detail).toContain('food=');
    expect(result.log[0].detail).toContain('raw');
  });

  it('handles multiple deaths in same tick', () => {
    const starved1 = makeEntity({ id: 'starved1', energy: 0 });
    const starved2 = makeEntity({ id: 'starved2', energy: -5 });
    const alive = makeEntity({ id: 'alive', energy: 50, age: 30 * T });
    const result = processDeaths([starved1, starved2, alive], [], 1, [], []);
    expect(result.alive).toHaveLength(1);
    expect(result.alive[0].id).toBe('alive');
    expect(result.log).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STARVATION CONTEXT
// ═══════════════════════════════════════════════════════════════════════

describe('starvationContext', () => {
  it('returns "no village" when no matching village', () => {
    const entity = makeEntity({ tribe: 99 as any });
    expect(starvationContext(entity, [], [])).toBe('no village');
  });

  it('includes raw and cooked food counts', () => {
    const entity = makeEntity({ tribe: 0 });
    const village = makeVillage({ meatStore: 5, plantStore: 3, cookedMeatStore: 2, driedFruitStore: 1 });
    const ctx = starvationContext(entity, [entity], [village]);
    expect(ctx).toContain('food=8raw+3cooked');
  });
});

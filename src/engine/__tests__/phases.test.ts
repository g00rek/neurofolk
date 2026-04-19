import { describe, it, expect } from 'vitest';
import { ageAll, applyOldAgeDeaths, applyConsumption, applyStarvationDeaths, runMatingRound, resolveBirths, computePassivePhase } from '../phases';
import { TICKS_PER_YEAR } from '../types';
import type { Entity, House, LogEntry, DeathRecord, Village, BirthRecord, WorldState } from '../types';
import { vi } from 'vitest';

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
    // Math.random sequence: infant roll 0.99 (survive), inheritTrait rolls (several), gender roll,
    // maxAge rolls, then eventually maternal mortality. We need at least the first roll (infant)
    // to be > 0.30 (survive), and the maternal roll to be < 0.05 (die).
    // Simplest: make infant survive by returning > 0.30 and force maternal death via step sequence.
    // We use a mock implementation that returns predictable values.
    let callCount = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      // First call = infant mortality roll → 0.99 (survive)
      if (callCount === 1) return 0.99;
      // Later: force maternal mortality roll to die. We don't know which call index it is,
      // so we use 0.01 for everything after — this lets infant survive, then eventually
      // maternal mortality fires with 0.01 < 0.05.
      // Note: there are many intermediate rolls (inheritTraits, gender, maxAge) — they
      // receive 0.01 too but those are fine (they just pick specific outcomes).
      return 0.01;
    });
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
    // Mother removed from result
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

  it('does not mutate input world (entities/houses/villages)', () => {
    const origEntity = makeEntity({ id: 'a', tribe: 0, age: 30 * TICKS_PER_YEAR, energy: 80 });
    const origVillage = makeVillage({ tribe: 0, cookedMeatStore: 500, woodStore: 500 });
    const origHouse: House = { id: 'h1', position: { x: 4, y: 4 }, tribe: 0, occupants: ['a'] };
    const world = makeWorld({
      entities: [origEntity],
      villages: [origVillage],
      houses: [origHouse],
    });
    computePassivePhase(world, 3, () => 'x');
    expect(world.entities[0].age).toBe(30 * TICKS_PER_YEAR);
    expect(world.villages[0].cookedMeatStore).toBe(500);
    expect(world.villages[0].woodStore).toBe(500);
    expect(world.houses[0].occupants).toEqual(['a']);
  });
});

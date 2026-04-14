import { describe, it, expect, vi, afterEach } from 'vitest';
import { processDeaths, processBirths, starvationContext } from '../demography';
import type { Entity, House, Village, RGB, Traits } from '../types';
import { ECONOMY, TICKS_PER_YEAR } from '../types';

const T = TICKS_PER_YEAR;

// ── Helpers ──

let idCounter = 0;
function testGenerateId(prefix = 'e'): string {
  return `${prefix}-test-${idCounter++}`;
}

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
    birthCooldown: 0,
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
  idCounter = 0;
});

// ═══════════════════════════════════════════════════════════════════════
// DEATH PROCESSING
// ═══════════════════════════════════════════════════════════════════════

describe('processDeaths', () => {
  it('entity dies when age reaches maxAge', () => {
    const entity = makeEntity({ id: 'old', age: 80 * T, maxAge: 80 * T });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(0);
    expect(result.log).toHaveLength(1);
    expect(result.log[0].cause).toBe('old_age');
    expect(result.log[0].entityId).toBe('old');
  });

  it('entity dies when energy reaches 0', () => {
    const entity = makeEntity({ id: 'starved', energy: 0 });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(0);
    expect(result.log).toHaveLength(1);
    expect(result.log[0].cause).toBe('starvation');
    expect(result.log[0].entityId).toBe('starved');
  });

  it('alive entity with positive energy and young age survives', () => {
    const entity = makeEntity({ id: 'healthy', energy: 80, age: 20 * T });
    const result = processDeaths([entity], [], 1, [], []);
    expect(result.alive).toHaveLength(1);
    expect(result.alive[0].id).toBe('healthy');
    expect(result.log).toHaveLength(0);
  });

  it('removes dead entity from house occupants', () => {
    const house = makeHouse({ occupants: ['dying', 'survivor'] });
    const dying = makeEntity({ id: 'dying', age: 80 * T, maxAge: 80 * T });
    const survivor = makeEntity({ id: 'survivor', age: 20 * T });
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
    const old = makeEntity({ id: 'old', age: 80 * T, maxAge: 80 * T });
    const starved = makeEntity({ id: 'starved', energy: 0 });
    const alive = makeEntity({ id: 'alive', energy: 50, age: 30 * T });
    const result = processDeaths([old, starved, alive], [], 1, [], []);
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

// ═══════════════════════════════════════════════════════════════════════
// BIRTH PROCESSING
// ═══════════════════════════════════════════════════════════════════════

describe('processBirths', () => {
  it('pregnancy timer decrements each tick (verified via birth trigger)', () => {
    // Mother with pregnancyTimer=1 in prev tick → 0 in current → birth fires
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 60, dexterity: 60, intelligence: 60 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 60, dexterity: 60, intelligence: 60 },
      fatherTribe: 0 as any,
    });

    // Mock: infant survives (random >= 0.3), no maternal mortality (random >= 0.05)
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    // Should have mother + baby
    expect(result.entities).toHaveLength(2);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeDefined();
    expect(baby!.age).toBe(0);
  });

  it('birth happens when pregnancyTimer reaches 0', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 40, dexterity: 40, intelligence: 40 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 40, dexterity: 40, intelligence: 40 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5); // survives infant & maternal mortality

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const birthLog = result.log.find(l => l.type === 'birth');
    expect(birthLog).toBeDefined();
  });

  it('no birth when entity was not pregnant in previous tick', () => {
    const prevMother = makeEntity({ id: 'mom', gender: 'female', pregnancyTimer: 0 });
    const currentMother = makeEntity({ id: 'mom', gender: 'female', pregnancyTimer: 0 });

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    expect(result.entities).toHaveLength(1);
    expect(result.log).toHaveLength(0);
  });

  it('no birth when still pregnant (timer > 0)', () => {
    const prevMother = makeEntity({ id: 'mom', gender: 'female', pregnancyTimer: 5 });
    const currentMother = makeEntity({ id: 'mom', gender: 'female', pregnancyTimer: 4 });

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    expect(result.entities).toHaveLength(1);
    expect(result.log).toHaveLength(0);
  });

  it('infant mortality kills baby when random < 0.3', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    // Call sequence in processBirths for one birth (fatherTribe === motherTribe):
    //   1: dramaticMutation check    (inheritTraits)
    //   2: inheritTrait(strength)
    //   3: inheritTrait(dexterity)
    //   4: inheritTrait(intelligence)
    //   5: babyGender
    //   6: randomName
    //   7: randomMaxAge
    //   8: infant mortality           <-- we need this < 0.3
    //   9: maternal mortality
    let callCount = 0;
    random.mockImplementation(() => {
      callCount++;
      if (callCount === 8) return 0.1; // infant mortality triggers (0.1 < 0.3)
      return 0.5; // all others safe
    });

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    // Baby should NOT be in entities (died at birth)
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeUndefined();
    // But death log should exist
    const deathLog = result.log.find(l => l.type === 'death' && l.detail === 'infant mortality');
    expect(deathLog).toBeDefined();
  });

  it('infant survives when random >= 0.3', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5); // 0.5 >= 0.3, baby survives

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeDefined();
    const birthLog = result.log.find(l => l.type === 'birth');
    expect(birthLog).toBeDefined();
  });

  it('maternal mortality kills mother when random < 0.05', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    let callCount = 0;
    random.mockImplementation(() => {
      callCount++;
      // Call sequence (fatherTribe === motherTribe):
      //   1: dramaticMutation, 2-4: inheritTrait x3, 5: gender,
      //   6: randomName, 7: randomMaxAge,
      //   8: infant mortality (>= 0.3 → survives),
      //   9: maternal mortality (< 0.05 → dies)
      if (callCount === 9) return 0.01; // maternal mortality triggers
      return 0.5; // safe defaults
    });

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const mom = result.entities.find(e => e.id === 'mom');
    expect(mom).toBeUndefined(); // mother died
    const deathLog = result.log.find(l => l.type === 'death' && l.cause === 'childbirth');
    expect(deathLog).toBeDefined();
  });

  it('mother survives when random >= 0.05', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5); // >= 0.05, mother survives

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const mom = result.entities.find(e => e.id === 'mom');
    expect(mom).toBeDefined();
  });

  it('baby inherits blended traits from mother + fatherTraits', () => {
    const motherTraits: Traits = { strength: 20, dexterity: 80, intelligence: 40 };
    const fatherTraits: Traits = { strength: 80, dexterity: 20, intelligence: 60 };

    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      traits: motherTraits, fatherTraits, fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      traits: motherTraits, fatherTraits, fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    // Make inheritance deterministic: random returns 0.5 for all calls
    // inheritTrait: avg + (0.5 * 6 * 2 - 6) = avg + 0 = avg
    // dramaticMutation: 0.5 >= 0.03, no mutation
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeDefined();
    // With random=0.5, inheritTrait(a,b,6) = round((a+b)/2 + (0.5*12-6)) = round((a+b)/2)
    expect(baby!.traits.strength).toBe(50);  // (20+80)/2
    expect(baby!.traits.dexterity).toBe(50); // (80+20)/2
    expect(baby!.traits.intelligence).toBe(50); // (40+60)/2
  });

  it('birth cooldown applied to mother after birth', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1, birthCooldown: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0, birthCooldown: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const mom = result.entities.find(e => e.id === 'mom');
    expect(mom).toBeDefined();
    expect(mom!.birthCooldown).toBe(ECONOMY.reproduction.birthCooldown);
  });

  it('baby placed in mother\'s house if space available', () => {
    const house = makeHouse({ id: 'h1', position: { x: 10, y: 10 }, occupants: ['mom'] });
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1, homeId: 'h1',
      position: { x: 12, y: 12 },
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0, homeId: 'h1',
      position: { x: 12, y: 12 },
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [house], 100, testGenerateId);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeDefined();
    // Baby should be at house center (HOUSE_SIZE=2, so center = position + 1)
    expect(baby!.position.x).toBe(11); // 10 + floor(2/2)
    expect(baby!.position.y).toBe(11);
    expect(baby!.homeId).toBe('h1');
  });

  it('baby placed at mother position when no home', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      position: { x: 7, y: 8 },
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      position: { x: 7, y: 8 },
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby).toBeDefined();
    expect(baby!.position.x).toBe(7);
    expect(baby!.position.y).toBe(8);
    expect(baby!.homeId).toBeUndefined();
  });

  it('mother fatherTraits cleared after birth', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 70, dexterity: 70, intelligence: 70 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 70, dexterity: 70, intelligence: 70 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const mom = result.entities.find(e => e.id === 'mom');
    expect(mom!.fatherTraits).toBeUndefined();
  });

  it('maternal death removes mother from house occupants', () => {
    const house = makeHouse({ occupants: ['mom', 'other'] });
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 0 as any,
    });

    const random = vi.spyOn(Math, 'random');
    let callCount = 0;
    random.mockImplementation(() => {
      callCount++;
      // Call 9 = maternal mortality (fatherTribe === motherTribe, so no tribe random)
      if (callCount === 9) return 0.01; // maternal mortality triggers
      return 0.5;
    });

    processBirths([currentMother], [prevMother], [house], 100, testGenerateId);
    expect(house.occupants).toEqual(['other']);
  });

  it('baby inherits mother tribe when fatherTribe matches', () => {
    const prevMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 1,
      tribe: 1 as any,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 1 as any,
    });
    const currentMother = makeEntity({
      id: 'mom', gender: 'female', pregnancyTimer: 0,
      tribe: 1 as any,
      fatherTraits: { strength: 50, dexterity: 50, intelligence: 50 },
      fatherTribe: 1 as any,
    });

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.5);

    const result = processBirths([currentMother], [prevMother], [], 100, testGenerateId);
    const baby = result.entities.find(e => e.id !== 'mom');
    expect(baby!.tribe).toBe(1);
  });
});

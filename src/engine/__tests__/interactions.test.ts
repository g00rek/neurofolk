import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectInteractions, fightWinner } from '../interactions';
import type { Entity, House, LogEntry, RGB } from '../types';
import { TICKS_PER_YEAR, FIGHT_MIN_AGE } from '../types';

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


function makeHouse(overrides: Partial<House> = {}): House {
  return {
    id: 'h1',
    position: { x: 4, y: 4 },
    tribe: 0,
    occupants: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// detectInteractions
// ═══════════════════════════════════════════════════════════════════════════

describe('detectInteractions', () => {
  it('cross-tribe males on adjacent tiles start fighting', () => {
    const m1 = makeEntity({ id: 'm1', name: 'Red1', tribe: 0, position: { x: 3, y: 3 }, age: FIGHT_MIN_AGE * T });
    const m2 = makeEntity({ id: 'm2', name: 'Blue1', tribe: 1, position: { x: 3, y: 4 }, age: FIGHT_MIN_AGE * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([m1, m2], 30, [], [], log, 100);

    // Both should now be in fighting state
    expect(result[0].activity).toEqual({ kind: 'working', action: 'fighting', ticksLeft: 5 });
    expect(result[1].activity).toEqual({ kind: 'working', action: 'fighting', ticksLeft: 5 });
    expect(log.length).toBe(1);
    expect(log[0].type).toBe('fight');
  });

  it('same-tribe males do NOT fight', () => {
    const m1 = makeEntity({ id: 'm1', name: 'Red1', tribe: 0, position: { x: 3, y: 3 }, age: FIGHT_MIN_AGE * T });
    const m2 = makeEntity({ id: 'm2', name: 'Red2', tribe: 0, position: { x: 3, y: 4 }, age: FIGHT_MIN_AGE * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([m1, m2], 30, [], [], log, 100);

    expect(result[0].activity.kind).toBe('idle');
    expect(result[1].activity.kind).toBe('idle');
    expect(log.length).toBe(0);
  });

  it('females do not fight', () => {
    const f1 = makeEntity({ id: 'f1', name: 'RedF', tribe: 0, gender: 'female', position: { x: 3, y: 3 }, age: FIGHT_MIN_AGE * T });
    const f2 = makeEntity({ id: 'f2', name: 'BlueF', tribe: 1, gender: 'female', position: { x: 3, y: 4 }, age: FIGHT_MIN_AGE * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([f1, f2], 30, [], [], log, 100);

    expect(result[0].activity.kind).toBe('idle');
    expect(result[1].activity.kind).toBe('idle');
    expect(log.length).toBe(0);
  });

  it('males too young (< FIGHT_MIN_AGE) do not fight', () => {
    const m1 = makeEntity({ id: 'm1', tribe: 0, position: { x: 3, y: 3 }, age: 10 * T }); // 10 years < 16
    const m2 = makeEntity({ id: 'm2', tribe: 1, position: { x: 3, y: 4 }, age: 10 * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([m1, m2], 30, [], [], log, 100);

    expect(result[0].activity.kind).toBe('idle');
    expect(result[1].activity.kind).toBe('idle');
  });

  it('males too far apart (manhattan > 1) do not fight', () => {
    const m1 = makeEntity({ id: 'm1', tribe: 0, position: { x: 3, y: 3 }, age: FIGHT_MIN_AGE * T });
    const m2 = makeEntity({ id: 'm2', tribe: 1, position: { x: 6, y: 6 }, age: FIGHT_MIN_AGE * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([m1, m2], 30, [], [], log, 100);

    expect(result[0].activity.kind).toBe('idle');
    expect(result[1].activity.kind).toBe('idle');
  });

  it('males at home (inside house footprint) do not fight', () => {
    const house = makeHouse({ id: 'h1', position: { x: 3, y: 3 }, tribe: 0 });
    // Entity at (3,3) which is inside the house footprint
    const m1 = makeEntity({ id: 'm1', tribe: 0, position: { x: 3, y: 3 }, age: FIGHT_MIN_AGE * T, homeId: 'h1' });
    const m2 = makeEntity({ id: 'm2', tribe: 1, position: { x: 3, y: 4 }, age: FIGHT_MIN_AGE * T });
    const log: LogEntry[] = [];

    const result = detectInteractions([m1, m2], 30, [], [house], log, 100);

    // m1 is at home so should not fight
    expect(result[0].activity.kind).toBe('idle');
    expect(result[1].activity.kind).toBe('idle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fightWinner
// ═══════════════════════════════════════════════════════════════════════════

describe('fightWinner', () => {
  it('returns one of the two fighters', () => {
    const a = makeEntity({ id: 'a', traits: { strength: 50, dexterity: 50, intelligence: 50 } });
    const b = makeEntity({ id: 'b', traits: { strength: 50, dexterity: 50, intelligence: 50 } });

    const winner = fightWinner(a, b);
    expect([a.id, b.id]).toContain(winner.id);
  });

  it('higher-strength fighter wins more often (statistical)', () => {
    const strong = makeEntity({ id: 'strong', traits: { strength: 90, dexterity: 50, intelligence: 50 } });
    const weak = makeEntity({ id: 'weak', traits: { strength: 10, dexterity: 50, intelligence: 50 } });

    let strongWins = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (fightWinner(strong, weak).id === 'strong') strongWins++;
    }

    // With 90 vs 10 strength, strong should win ~90% of the time.
    // Allow margin: expect at least 85% and at most 95%.
    const winRate = strongWins / trials;
    expect(winRate).toBeGreaterThan(0.85);
    expect(winRate).toBeLessThan(0.95);
  });

  it('equal strength gives roughly 50-50 outcome', () => {
    const a = makeEntity({ id: 'a', traits: { strength: 50, dexterity: 50, intelligence: 50 } });
    const b = makeEntity({ id: 'b', traits: { strength: 50, dexterity: 50, intelligence: 50 } });

    let aWins = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (fightWinner(a, b).id === 'a') aWins++;
    }

    const winRate = aWins / trials;
    expect(winRate).toBeGreaterThan(0.45);
    expect(winRate).toBeLessThan(0.55);
  });
});

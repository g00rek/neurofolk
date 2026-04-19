import { describe, it, expect } from 'vitest';
import { createWorld, tick } from '../world';
import type { WorldState } from '../types';
import { TICKS_PER_YEAR } from '../types';

/** Top up all village stockpiles to the given floor values so passive phases don't starve. */
function topUpStockpiles(world: WorldState): WorldState {
  const villages = world.villages.map(v => ({
    ...v,
    color: [...v.color] as [number, number, number],
    cookedMeatStore: Math.max(v.cookedMeatStore, 5000),
    woodStore: Math.max(v.woodStore, 2000),
  }));
  return { ...world, villages };
}

describe('simulation smoke tests', () => {
  it('runs 1 year (2400 ticks) without crashing', () => {
    let world = createWorld({ gridSize: 30, entityCount: 6, villageCount: 1 });
    // Pre-populate stockpiles so the passive phase does not starve everyone.
    world = topUpStockpiles(world);
    for (let i = 0; i < TICKS_PER_YEAR; i++) {
      world = tick(world);
      // After a passive-phase summary the world pauses at phase='summary'.
      // Resume (simulating what the worker does) so the tick loop can continue.
      if (world.phase === 'summary') {
        world = { ...world, phase: 'active', phaseTick: 0 };
        // Re-stock so subsequent passive phases also have adequate food/wood.
        world = topUpStockpiles(world);
      }
    }
    expect(world.tick).toBe(TICKS_PER_YEAR);
    expect(world.entities.length).toBeGreaterThan(0);
  });

  it('runs 5 years without crash — population survives', () => {
    // Use a smaller world to keep the test fast while still exercising multiple
    // passive phase transitions (every 800 ticks → ~7-8 transitions over 5 years).
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    // Pre-populate stockpiles so passive phases do not starve everyone.
    world = topUpStockpiles(world);
    const ticks = TICKS_PER_YEAR * 5;
    for (let i = 0; i < ticks; i++) {
      world = tick(world);
      // After a passive-phase summary the world pauses at phase='summary'.
      // Resume (simulating what the worker does) so the tick loop can continue.
      if (world.phase === 'summary') {
        world = { ...world, phase: 'active', phaseTick: 0 };
        // Re-stock so subsequent passive phases also have adequate food/wood.
        world = topUpStockpiles(world);
      }
    }
    expect(world.tick).toBe(ticks);
    expect(world.entities.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

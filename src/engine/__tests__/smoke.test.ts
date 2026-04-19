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
    world = topUpStockpiles(world);
    // Loop until world.tick has advanced at least one in-game year. Each active-phase
    // tick bumps world.tick by 1; each passive phase bumps it by passivePhaseYears * TICKS_PER_YEAR.
    let activeTicks = 0;
    while (world.tick < TICKS_PER_YEAR && activeTicks < 50_000) {
      world = tick(world);
      activeTicks++;
      if (world.phase === 'summary') {
        world = { ...world, phase: 'active', phaseTick: 0 };
        world = topUpStockpiles(world);
      }
    }
    expect(world.tick).toBeGreaterThanOrEqual(TICKS_PER_YEAR);
    expect(world.entities.length).toBeGreaterThan(0);
  });

  it('runs 5 years without crash — population survives', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    world = topUpStockpiles(world);
    const targetTick = TICKS_PER_YEAR * 5;
    let activeTicks = 0;
    while (world.tick < targetTick && activeTicks < 200_000) {
      world = tick(world);
      activeTicks++;
      if (world.phase === 'summary') {
        world = { ...world, phase: 'active', phaseTick: 0 };
        world = topUpStockpiles(world);
      }
    }
    expect(world.tick).toBeGreaterThanOrEqual(targetTick);
    expect(world.entities.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

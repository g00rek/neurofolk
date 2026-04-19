/**
 * demography.ts — Aging, death, starvation logic extracted from tick().
 *
 * Pure functions that handle population lifecycle during the active phase:
 *   1. processDeaths — remove entities that starved (energy <= 0)
 *
 * Old-age deaths and births live in phases.ts (passive phase only).
 *
 * Age increment, pregnancyTimer decrement remain in tick()'s Step 0
 * because they are tightly coupled with the metabolism map (drain + eat) in a single pass.
 */

import type { Entity, House, Village, LogEntry, DeathCause } from './types';
import {
  ECONOMY,
  TICKS_PER_YEAR,
} from './types';

// ── Starvation context — diagnostic string for death log ──

export function starvationContext(dead: Entity, allEntities: Entity[], villages: Village[]): string {
  const v = villages.find(vv => vv.tribe === dead.tribe);
  if (!v) return 'no village';
  const raw = v.meatStore + v.plantStore;
  const cooked = v.cookedMeatStore + v.driedFruitStore;
  let adults = 0, toddlers = 0;
  for (const e of allEntities) {
    if (e.tribe !== v.tribe) continue;
    const years = Math.floor(e.age / TICKS_PER_YEAR);
    if (years >= 3) adults++; // CHILD_AGE = 3
    else if (years >= ECONOMY.reproduction.infantAgeYears) toddlers++;
  }
  const energyPerDay = adults * 2 + toddlers * 2 * ECONOMY.reproduction.childDrainMultiplier;
  const stockpileEnergy =
      v.meatStore       * ECONOMY.meat.energyPerUnit
    + v.cookedMeatStore * ECONOMY.cooking.cookedMeatEnergyPerUnit
    + v.plantStore      * ECONOMY.fruit.energyPerUnit
    + v.driedFruitStore * ECONOMY.cooking.driedFruitEnergyPerUnit;
  const days = energyPerDay > 0 ? Math.floor(stockpileEnergy / energyPerDay) : Infinity;
  const daysLabel = !isFinite(days) ? '∞' : String(days);
  return `food=${raw}raw+${cooked}cooked (${daysLabel}d)`;
}

// ── Death processing ──

export interface DeathResult {
  alive: Entity[];
  log: LogEntry[];
}

/**
 * Process deaths: remove entities that starved (energy <= 0).
 * Also removes dead from house occupants.
 *
 * Old-age deaths are handled in phases.ts (passive phase only).
 *
 * @param entities - the aged entities (age already incremented, energy already drained)
 * @param houses - mutable house array (occupants are spliced in-place)
 * @param tickNum - current tick number for log entries
 * @param allEntities - original entities (before aging) for starvation context
 * @param villages - village data for starvation context
 */
export function processDeaths(
  entities: Entity[],
  houses: House[],
  tickNum: number,
  allEntities: Entity[],
  villages: Village[],
): DeathResult {
  const alive: Entity[] = [];
  const log: LogEntry[] = [];

  for (const e of entities) {
    if (e.energy <= 0) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: e.id, name: e.name, gender: e.gender, age: e.age,
        cause: 'starvation' as DeathCause,
        detail: starvationContext(e, allEntities, villages),
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      alive.push(e);
    }
  }

  return { alive, log };
}

// ── ID generator type — kept for use by phases.ts ──
export type IdGenerator = (prefix?: string) => string;

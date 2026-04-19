/**
 * phases.ts — Deterministic passive-phase computation.
 *
 * Active phase runs tick-by-tick via tick() in world.ts. At the end of the
 * active phase, this module collapses N in-world years into a single step:
 * aging, old-age deaths, consumption, starvation, mating, births.
 */

import type { Entity, House, LogEntry, DeathRecord } from './types';
import { TICKS_PER_YEAR } from './types';

/** Age every entity by `years` Earth-years. Returns new array; does not mutate input. */
export function ageAll(entities: Entity[], years: number): Entity[] {
  return entities.map(e => ({ ...e, age: e.age + years * TICKS_PER_YEAR }));
}

/**
 * Remove entities whose age >= maxAge. Logs each death and appends a DeathRecord.
 * Mutates houses.occupants in place (removes dead ids). Returns the alive subset.
 */
export function applyOldAgeDeaths(
  entities: Entity[],
  houses: House[],
  tickNum: number,
  log: LogEntry[],
  deaths: DeathRecord[],
): Entity[] {
  const alive: Entity[] = [];
  for (const e of entities) {
    if (e.age >= e.maxAge) {
      log.push({
        tick: tickNum, type: 'death',
        entityId: e.id, name: e.name, gender: e.gender, age: e.age,
        cause: 'old_age',
      });
      deaths.push({
        entityId: e.id, name: e.name, gender: e.gender,
        ageYears: Math.floor(e.age / TICKS_PER_YEAR),
        cause: 'old_age',
      });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      alive.push(e);
    }
  }
  return alive;
}

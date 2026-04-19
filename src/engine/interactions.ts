/**
 * interactions.ts — Fighting detection logic.
 *
 * Extracted from world.ts (R6 refactor). Pure functions that detect and initiate
 * entity interactions: cross-tribe combat.
 */

import type { Entity, House, Village, LogEntry } from './types';
import {
  FIGHT_MIN_AGE,
  TICKS_PER_YEAR,
  HOUSE_SIZE,
} from './types';
import { manhattan } from './geometry';
import { startWork } from './action-resolver';

// ── Local helpers ──
// Duplicated from world.ts to avoid circular imports (world.ts → interactions.ts
// and interactions.ts → world.ts). These are trivial 1-liners depending only on
// types.ts constants.

function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isIdle(e: Entity): boolean {
  return e.activity.kind === 'idle';
}

function isAtHome(e: Entity, houses: House[]): boolean {
  if (!e.homeId) return false;
  const house = houses.find(h => h.id === e.homeId);
  if (!house) return false;
  const dx = e.position.x - house.position.x;
  const dy = e.position.y - house.position.y;
  return dx >= 0 && dx < HOUSE_SIZE && dy >= 0 && dy < HOUSE_SIZE;
}

// ── Exported interaction functions ──

/**
 * Fight: higher strength = higher win chance (weighted random).
 */
export function fightWinner(a: Entity, b: Entity): Entity {
  const total = a.traits.strength + b.traits.strength;
  return Math.random() * total < a.traits.strength ? a : b;
}

/**
 * Fighting detection — adult males of different tribes, idle and adjacent, start a fight.
 */
export function detectInteractions(
  entities: Entity[],
  _gridSize: number,
  _villages: Village[],
  houses: House[] = [],
  log?: LogEntry[],
  tickNum?: number,
): Entity[] {
  const fighterIds = new Set<string>();

  const activeMales = entities.filter(e =>
    e.gender === 'male' && isIdle(e)
    && ageInYears(e) >= FIGHT_MIN_AGE && !isAtHome(e, houses)
  );

  for (let i = 0; i < activeMales.length - 1; i++) {
    for (let j = i + 1; j < activeMales.length; j++) {
      const m1 = activeMales[i];
      const m2 = activeMales[j];
      if (manhattan(m1.position, m2.position) > 1) continue;
      if (m1.tribe !== m2.tribe) {
        fighterIds.add(m1.id);
        fighterIds.add(m2.id);
      }
    }
    if (fighterIds.size > 0) break;
  }

  const loggedPairs = new Set<string>();
  return entities.map(e => {
    if (!fighterIds.has(e.id)) return e;
    const otherMale = entities.find(o =>
      o.id !== e.id && o.gender === 'male' && fighterIds.has(o.id)
      && manhattan(e.position, o.position) <= 1
    );
    if (otherMale) {
      if (log && tickNum != null) {
        const pairKey = [e.id, otherMale.id].sort().join(':');
        if (!loggedPairs.has(pairKey)) {
          loggedPairs.add(pairKey);
          log.push({
            tick: tickNum, type: 'fight',
            entityId: e.id, name: e.name, gender: e.gender, age: e.age,
            detail: `vs ${otherMale.name}`,
          });
        }
      }
      return { ...e, activity: startWork('fighting') };
    }
    return e;
  });
}

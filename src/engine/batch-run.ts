import { createWorld, tick } from './world';
import { RUNTIME_CONFIG } from './types';
import type { Entity, WorldState } from './types';

const RUNS = 3;
const MAX_TICKS = 8000;
const GRID = 25;
const ENTITIES = 6;
const VILLAGES = 1;

function activityLabel(e: Entity): string {
  const a = e.activity;
  if (a.kind === 'idle') return 'idle';
  if (a.kind === 'moving') return `→${a.purpose}`;
  return a.action;
}

function activityCounts(world: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of world.entities) {
    const k = activityLabel(e);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function snapshot(world: WorldState): string {
  const v = world.villages[0];
  const counts = activityCounts(world);
  const actList = Object.entries(counts)
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
  const pop = world.entities.length;
  const m = world.entities.filter(e => e.gender === 'male').length;
  const f = pop - m;
  const phase = world.phase === 'active'
    ? `act ${world.phaseTick}/${RUNTIME_CONFIG.activePhaseTicks}`
    : 'SUMMARY';
  const treesAlive = world.trees.filter(t => !t.chopped).length;
  const treesChopped = world.trees.length - treesAlive;
  return `t${world.tick}[${phase}] pop=${pop}(M${m}F${f}) meat=${v?.meatStore ?? 0}+${v?.cookedMeatStore ?? 0}c plant=${v?.plantStore ?? 0}+${v?.driedFruitStore ?? 0}d wood=${v?.woodStore ?? 0} gold=${v?.goldStore ?? 0} animals=${world.animals.length} trees=${treesAlive}live+${treesChopped}stumps [${actList}]`;
}

for (let r = 0; r < RUNS; r++) {
  console.log(`\n===== Run ${r + 1} =====`);
  let world = createWorld({ gridSize: GRID, entityCount: ENTITIES, villageCount: VILLAGES });
  console.log(`Start: ${snapshot(world)}`);

  for (let t = 0; t < MAX_TICKS; t++) {
    const prevPhase = world.phase;
    world = tick(world);

    // Log every 200 ticks during active, plus every phase transition and every summary.
    if (world.tick % 200 === 0 || world.phase !== prevPhase) {
      console.log(`  ${snapshot(world)}`);
    }

    // When a passive summary just fired, dump it and advance past it.
    if (world.phase === 'summary' && world.lastPassiveSummary) {
      const s = world.lastPassiveSummary;
      for (const ts of s.perTribe) {
        const ago = `${ts.stockpileBefore.cookedMeat}c+${ts.stockpileBefore.meat}m+${ts.stockpileBefore.wood}w`;
        const aft = `${ts.stockpileAfter.cookedMeat}c+${ts.stockpileAfter.meat}m+${ts.stockpileAfter.wood}w`;
        const causes: Record<string, number> = {};
        for (const d of ts.deaths) causes[d.cause] = (causes[d.cause] ?? 0) + 1;
        const causeStr = Object.entries(causes).map(([k, n]) => `${k}:${n}`).join(' ');
        console.log(`  [WINTER tribe=${ts.tribe}] births=${ts.births.length} deaths=${ts.deaths.length} (${causeStr}) stock ${ago} → ${aft}`);
      }
      // Advance phase (simulating UI click).
      world = { ...world, phase: 'active', phaseTick: 0 };
    }

    if (world.entities.length === 0) {
      console.log(`  EXTINCT at ${snapshot(world)}`);
      break;
    }
  }

  if (world.entities.length > 0) {
    console.log(`  FINAL: ${snapshot(world)}`);
  }
}

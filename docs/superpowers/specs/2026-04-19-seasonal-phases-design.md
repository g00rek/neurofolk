# Seasonal Phases — Design Spec

**Date:** 2026-04-19
**Status:** Approved (brainstorm)
**Author:** g00rek + Claude

## Problem

The simulation currently runs at a single timescale: 20 ticks/day, 2400 ticks/year. This creates an unsolvable tension:

- **Tick scale (RTS feel):** you see entities walk, hunt, gather. Satisfying but slow — even at max speed, hours pass before a new generation emerges.
- **Generational scale (evolution, genetics, population drift):** meaningful only over many years. Unwatchable at tick scale.

You can't have both in one RTS. Castles (Amiga) and board games like Viticulture solve this with alternating phases — playable working seasons, then a skip that collapses time.

## Solution

Alternating-phase loop, narratively grounded in **planetary orbit mechanics**:

- The neurofolk world is a planet on a highly eccentric orbit (e ≈ 0.7-0.8, cf. Kepler's Second Law).
- **Short "Summer"** — planet near star. Life explodes. This is the **Active Phase**: tick-by-tick RTS where we watch entities work.
- **Long "Winter"** — planet far from star. Dormant, cold. This is the **Passive Phase**: deterministic time-skip that collapses multiple Earth-years into a summary. Mating, aging, births, deaths all resolved off-screen.
- One cycle ≈ 1 active year + 3 passive years = 4 years of in-world time per player cycle.

Under this framing, "3-year winter" is not an ice age — it's **one normal winter of that planet**. The tempo is the planet's tempo.

## Decisions

### Rhythm

| Parameter | Value | Notes |
|---|---|---|
| Active phase length | `activePhaseTicks = 800` | Roughly 1 game-year of warm seasons; tweakable |
| Passive phase length | `passivePhaseYears = 3` | Slider range 1-5 |
| Scaling by map size | No | Fixed time budget; map size affects population/resources, not pace |

Both values live in `RUNTIME_CONFIG` (already persisted to localStorage), sliders exposed in Controls UI.

### Active Phase (unchanged except termination)

- Current tick logic runs as today.
- Tick increments `world.phaseTick`.
- At `phaseTick === activePhaseTicks` → world transitions to passive phase (phaseTick resets, phase = 'passive').
- No aging cadence changes during active phase: nobody crosses generational thresholds (CHILD_AGE, MAX_REPRODUCTIVE_AGE, maxAge) during a single active phase — all generational transitions happen in the passive phase.
- Deaths in active phase: only fights and edge-case starvation (if someone enters active phase very weak). No old-age deaths in active phase.

### Passive Phase — deterministic summary

Runs once per transition. Not tick-based. Accepts `WorldState`, returns mutated `WorldState` + `PassiveSummary`.

**Order of operations** (per skip, not per passive-year):

1. **Aging.** Every entity `age += passivePhaseYears * TICKS_PER_YEAR`.
2. **Old-age mortality.** Any entity with `age >= maxAge` dies (cause: `old_age`). Occupants removed from houses.
3. **Consumption.** Per tribe:
   - Food required = `population * passivePhaseYears * foodPerPersonPerYear`
   - Fuel (wood) required = `population * passivePhaseYears * woodPerPersonPerYear`
   - Stockpile drained. If sufficient: OK. If deficit:
4. **Starvation/freezing deaths.** Sorted ascending by energy at end of active phase. Kill N entities where N is the count the remaining stockpile cannot support. Remove from houses.
5. **Mating.** For each tribe:
   - Eligible women: alive after steps 2 + 4, female, 12 ≤ ageYears ≤ 40, `pregnancyTimer === 0`, `energy >= 60`, has home.
   - Eligible men: alive, male, 12 ≤ ageYears ≤ 40, same tribe.
   - If no eligible men in tribe: no mating that skip.
   - Compute attractiveness per man: `(strength + dexterity + intelligence) / 3`.
   - Each eligible woman pairs with the highest-attractiveness man in her tribe (ties broken by id). Multiple women can share the same man.
   - Pairing guarantees pregnancy (100%). Store `fatherTraits`, `fatherTribe`, `pregnancyTimer = 1` (sentinel — we process birth immediately below).
6. **Births.** For every pregnant woman (including those from this mating round; active-phase pregnancies also finalize here):
   - Roll infant mortality (30%). If dies: log `death` cause=`starvation` detail=`infant mortality`. Baby entity not created.
   - Else: create baby entity at mother's home position, age 0, inherited traits (existing `inheritTraits`), gender 50/50, energy `energyStart`, `homeId = mother.homeId`, color from mother.
   - Roll maternal mortality (5%). If mother dies: log `death` cause=`childbirth`, remove from houses.
   - Mother: clear `pregnancyTimer`, clear `fatherTraits`, clear `fatherTribe`. No `birthCooldown` (removed from model).

**Removed from model:** `birthCooldown` field (YAGNI). Related constant `ECONOMY.reproduction.birthCooldown` removed.

### Consumption Rates (Calibration)

Initial values, to be tuned empirically. Live in `ECONOMY.winter`:

| Resource | Per person per passive year | Notes |
|---|---|---|
| Food (energy) | 200 | ≈ 0.55/day × 365 days. Covers base metabolism. |
| Wood | 2 | Winter fuel. |

Food drawn from stockpile in priority: cookedMeat → driedFruit → meat → plant (cooked first, higher density). Mixed units converted to energy via `ECONOMY.*.energyPerUnit`, deducted from real stockpile proportionally.

Wood drawn from `woodStore` directly.

### Summary Screen

After passive phase, UI pauses on a summary modal:

- **Header:** "Long Winter of [Year N] ended"
- **Per tribe:**
  - Births: N (list first 5 names + "... and K more")
  - Deaths old age: N
  - Deaths childbirth: N
  - Deaths infant: N
  - Deaths starvation/cold: N
  - Stockpile delta: food X → Y, wood X → Y
- **Pairs table:** who got pregnant with whom (optional — stretch goal)
- **Button:** "Begin next Summer"

## Architecture

### Data Model Changes (`types.ts`)

```ts
// WorldState additions
export interface WorldState {
  // ... existing fields
  phase: 'active' | 'passive' | 'summary';  // 'summary' = transient, UI shows modal
  phaseTick: number;                         // 0..activePhaseTicks during 'active'
  lastPassiveSummary?: PassiveSummary;       // populated after each passive phase
}

export interface PassiveSummary {
  endedAtYear: number;       // in-world year the skip ended
  passivePhaseYears: number;
  perTribe: TribeSummary[];
}

export interface TribeSummary {
  tribe: TribeId;
  births: BirthRecord[];
  deaths: DeathRecord[];
  stockpileBefore: Stockpile;  // snapshot
  stockpileAfter: Stockpile;
}

export interface Stockpile {
  meat: number; plant: number;
  cookedMeat: number; driedFruit: number;
  wood: number; gold: number;
}

// Entity changes
// - REMOVE: birthCooldown
// - fatherTraits + fatherTribe + pregnancyTimer remain (still used by passive phase)

// ECONOMY additions
export const ECONOMY = {
  // ... existing
  winter: {
    foodEnergyPerPersonPerYear: 200,
    woodPerPersonPerYear: 2,
  },
};

// RUNTIME_CONFIG additions
export const RUNTIME_CONFIG = {
  // ... existing
  activePhaseTicks: 800,
  passivePhaseYears: 3,
};
```

### New Module: `src/engine/phases.ts`

```ts
export function computePassivePhase(
  world: WorldState,
  passivePhaseYears: number,
): { world: WorldState; summary: PassiveSummary };
```

Pure function (given seeded RNG). Returns new world + summary. Does NOT mutate input.

Internal sub-functions:
- `ageAll(entities, years)` → ages all entities
- `applyOldAgeDeaths(entities, houses, tick, log)` → returns alive entities + logs
- `applyConsumption(villages, population, years)` → drains stockpiles, returns deficit info
- `applyStarvationDeaths(entities, houses, deficit, tick, log)` → lowest-energy first
- `runMatingRound(entities, log, tick)` → sets pregnancyTimer on eligible women, fathers
- `resolveBirths(entities, houses, tick, log, generateId)` → flatten all pregnancies to births

### Modifications

**`world.ts` (`tick` function):**

At top of tick:
```ts
if (world.phase !== 'active') return world;  // passive phase handled separately
// normal tick logic
world.phaseTick += 1;
if (world.phaseTick >= RUNTIME_CONFIG.activePhaseTicks) {
  return transitionToPassive(world);
}
```

`transitionToPassive(world)` calls `computePassivePhase`, then sets `world.phase = 'summary'`. UI reads phase and renders modal.

User clicks "Begin next Summer" → UI dispatches action → worker sets `world.phase = 'active'`, `world.phaseTick = 0`.

**`demography.ts`:**

- `processBirths` logic moved into `phases.ts::resolveBirths` (adapted). Active-phase `processBirths` **stops firing in active phase** (pregnancyTimer decrement also removed from active tick). All pregnancies resolve in passive phase.
- `processDeaths` keeps handling starvation deaths that occur mid-active-phase (energy drops to 0 during long active session). Old-age deaths removed from active phase (moved to passive).

**`interactions.ts`:**

- `pheromoneMating` — REMOVED. All mating goes through passive phase.
- `detectInteractions` (fighting) unchanged.

**`metabolism.ts`:**

- Pregnancy timer decrement — REMOVED from active phase. `pregnancyTimer > 0` during active phase means "pregnant" flag, not a countdown. Used only for "don't conceive again while pregnant" logic (which is now passive-phase only anyway).
- Aging during active phase — keep `e.age += 1` per tick? No — per spec, generational transitions only fire in passive. Age increment in active phase stays (entities do age gradually visually), but nobody crosses `maxAge` during active (guaranteed by `activePhaseTicks < (min(maxAge) - current_age)`... actually this is not guaranteed, so we explicitly skip old-age death check in active phase).

**UI:**

- New `SummaryModal` component, shown when `world.phase === 'summary'`.
- `Controls` gets two new sliders: `activePhaseTicks`, `passivePhaseYears`.
- Stats panel adds phase indicator ("Summer — day 23/40" or "Long Winter ended").

## Test Strategy

### Existing Tests (must still pass)

All 168 tests continue to work. Adjustments:
- `utility-ai.test.ts` — no change (active-phase-only logic)
- `demography.test.ts` — remove tests for `birthCooldown`, `maternalMortality`, `infantMortality` in active-phase context. Move equivalent tests to new `phases.test.ts`.
- `interactions.test.ts` — delete `pheromoneMating` tests; add test that `detectInteractions` still works.

### New Tests (`phases.test.ts`)

- `computePassivePhase` with empty world → no-op, empty summary
- Aging: all entities aged by `passivePhaseYears * TICKS_PER_YEAR`
- Old-age death: entity with age > maxAge dies, logged, removed from house
- Consumption: enough stockpile → drained correctly, no starvation deaths
- Consumption: insufficient stockpile → N lowest-energy entities die, deficit logged
- Mating: all eligible women get `pregnancyTimer > 0`, paired with highest-attractiveness man
- Mating: tribe with no eligible men → no pregnancies
- Births: 30% infant mortality applied (stochastic — seeded RNG, check aggregate)
- Births: 5% maternal mortality applied
- Transition: `world.phase === 'active'` after `activePhaseTicks` ticks → phase becomes `'summary'`, `phaseTick` resets on resume

## Open Questions / Future Work

Explicitly out of scope for this spec. Captured as future tickets:

- **Cross-tribe mating / kidnapping / political marriages** — YAGNI. Would require new mechanic on top of current baseline.
- **Tech tree / village skills reducing mortality** — YAGNI. Hook point: `ECONOMY.reproduction.*Mortality` could become per-tribe modifier later.
- **Per-household stockpile (P2 from brainstorm)** — YAGNI. Would add significant UI + gameplay loop. Baseline stays P1 (tribe-wide).
- **Day/night within active phase** — the OLD day/night mechanic was dropped. For now, no day/night distinction. If reintroduced, it lives inside the active phase and is independent of the seasonal layer.
- **Interactive mating "board"** — currently just a summary table. Could become an interactive phase where player influences pairings.
- **Attractiveness preferences** (some women prefer strength, others intelligence) — YAGNI. One global attractiveness formula for now.

## Migration Notes

This spec **replaces** current reproduction/aging flow. Entities saved under the old model would need migration (initial `phase = 'active'`, `phaseTick = 0`, strip `birthCooldown`). Since saves are not implemented yet, no migration code needed — fresh-world only.

## Acceptance

User approval obtained in brainstorm conversation dated 2026-04-19 (this document replaces the ad-hoc conversation). Proceed directly to writing-plans.

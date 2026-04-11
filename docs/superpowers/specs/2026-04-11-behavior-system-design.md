# Behavior System Redesign

## Problem

The current entity decision system is split between two places that don't know about each other:
1. `utility-ai.ts` — scoring-based decisions (clean but incomplete)
2. `world.ts` tick() — inline hardcoded actions (Steps 2b, 2c, 4b, 4c) that override AI decisions

Gender checks (`if (gender !== 'male') return 0`) are scattered across every scoring function instead of being defined in one place.

Entities never re-evaluate their goals mid-execution (except at energy < 20), so they can't react to changing priorities. Combined with inline overrides, the result is unpredictable behavior.

## Design

### Single decision authority

All behavioral decisions go through `decideAction()` in `utility-ai.ts`. The inline decision logic in tick() Steps 2b/2c/4b/4c is removed. tick() becomes pure execution — it moves entities, resolves actions, manages resources, but never decides *what* an entity should do.

### Role configs

Each gender has a role config that defines which actions it can perform and their weight multipliers:

```typescript
interface RoleConfig {
  actions: Record<string, number>;  // action name → weight multiplier (0 = disabled)
}

const ROLES: Record<Gender, RoleConfig> = {
  female: {
    actions: { gather: 1.0, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
  male: {
    actions: { hunt: 1.0, chop: 0.7, build: 0.85, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
};
```

Scoring functions no longer check gender. They compute raw scores for everyone. `decideAction()` multiplies each score by the role weight, and zeros out anything not in the role's action list.

**Future path:** These weight objects are the exact shape a neural network would output per-civilization. Swapping from hand-tuned weights to NN-produced weights requires changing only how `RoleConfig` is sourced, not the scoring engine itself.

### Periodic re-evaluation with commitment (hysteresis)

Standard pattern from Dwarf Fortress / RimWorld / ONI. Prevents both "ignoring crises" and "ADHD switching".

**Every 20 ticks (= 1 game day),** while an entity is pursuing a goal:

```
new_best_score = highest scoring action from decideAction()
current_score  = score of the action matching current goal type

if (new_best_score - current_score) > HYSTERESIS_THRESHOLD:
    interrupt current goal, start new action
else:
    continue current goal
```

**`HYSTERESIS_THRESHOLD = 0.3`** — a new action must be significantly more urgent to interrupt.

Example: entity is chopping wood (score 0.5). Village food drops, hunt score rises to 0.7. Difference = 0.2, below threshold — keep chopping. Hunt score rises to 0.9. Difference = 0.4, above threshold — drop the axe, go hunt.

**Critical interrupts (checked every tick, bypass hysteresis):**
- `energy < 20` → immediate survival foraging
- `detectInteractions()` triggers fight/training → immediate state change

**When no goal exists (idle):** `decideAction()` runs immediately, no threshold needed.

**New entity field:** `goalSetTick: number` — tracks when current goal was assigned. Re-evaluation happens when `(tick - goalSetTick) % 20 === 0`.

### Scoring functions (unchanged logic, no gender checks)

Each function returns 0-1 based on world state:

| Function | Inputs | Score logic |
|----------|--------|-------------|
| `scoreSurvival` | entity.energy, hungerThreshold | 1.0 if energy < 20, 0.6 if hungry, else 0 |
| `scoreHunt` | village food reserves, animal population | food deficit ratio × 0.9 + panic bonus |
| `scoreGather` | village food/plant reserves | food deficit × 0.6 + panic bonus |
| `scoreChop` | village.woodStore | wood deficit / max × 0.5 |
| `scoreBuild` | homeless females vs free houses, wood | 0.85 if houses needed + wood available |
| `scoreReturnHome` | distance from home | 0.4 if far from home |

`scoreSurvival` is special — it triggers `survivalForageAction()` which picks the best emergency food source. This bypasses role weights (everyone can forage when starving).

### Action resolution in tick()

Currently tick() has these inline decision blocks that will be removed:

- **Step 2b** (lines 918-965): instant hunt/gather/chop on contact → removed
- **Step 2c** (lines 967-989): building check → removed
- **Step 4b** (lines 1106-1149): post-movement instant hunt/gather → removed
- **Step 4c** (lines 1151-1172): post-movement building → removed

**New flow in tick() Step 3 (movement):**

```
for each idle entity:
  if no goal OR re-evaluation tick:
    run decideAction() with hysteresis check
    assign new goal if needed
  
  if has goal with target:
    move toward target (speed steps per tick)
    on arrival:
      resolve action (hunt → kill animal, gather → pick plant, etc.)
      clear goal → next tick picks new action
```

**Action execution stays in tick()** — the actual mechanics of hunting (killing animal, getting meat), gathering (reducing plant portions), chopping (adding wood), building (creating house) all remain in tick(). Only the *decision* moves to AI.

### Goal arrival resolution

When entity reaches goal target, tick() resolves based on goal type:

| Goal type | Resolution |
|-----------|------------|
| `hunt` | Find animal within HUNT_KILL_RANGE. Kill it, eat to threshold, store surplus in village.meatStore. |
| `gather` | Find plant with portions > 0 on tile. Consume 1 portion, eat to threshold, store surplus in village.plantStore. |
| `chop` | Set state to 'chopping', stateTimer = CHOPPING_DURATION. On completion: village.woodStore += WOOD_PER_CHOP. |
| `build` | Check wood available + valid tile. Set state to 'building', stateTimer = BUILDING_DURATION. On completion: create House. |
| `return_home` | Entity is at home. Clear goal. Next tick AI picks rest/play/new task. |

No gender checks in resolution — if the entity has a hunt goal, it hunts. The role system already prevented a female from ever getting a hunt goal.

### Night/child behavior

These stay as special cases in `decideAction()`:
- **Children:** return home or play (same for both genders)
- **Night:** survival forage if hungry, otherwise return home. No night hunting (simplification).

### What stays in tick()

- Energy drain, aging, death checks (Step 0)
- State timer resolution: pregnancy completion, fight resolution, training stat boosts (Step 1)
- Fight/training detection via `detectInteractions()` — two males on same tile may fight or train (Step 2/4)
- Movement with pathfinding (Step 3)
- Pheromone mating (Step 7)
- House claiming for homeless females (Step 7b)
- Winter cold penalty (Step 8)
- Animal movement, reproduction, seasonal plant cycles (Steps 5-6)

### Files changed

| File | Change |
|------|--------|
| `utility-ai.ts` | Remove gender checks from scoring functions. Add `ROLES` config. `decideAction()` filters by role. Add `reEvaluate()` function with hysteresis. Export `scoreForGoalType()` to map current goal → current score. |
| `world.ts` | Remove inline decision blocks (Steps 2b, 2c, 4b, 4c). Unify movement+decision into single Step 3. Goal arrival triggers action resolution. |
| `types.ts` | Add `goalSetTick: number` to Entity interface. |

### What is NOT in scope

- Animals (separate system, untouched)
- New actions for females (future)
- Neural network integration (future — but role config shape is ready for it)
- Multi-civilization per-civ learning (future — role configs could be per-village)
- Skill trees, knowledge systems (future)

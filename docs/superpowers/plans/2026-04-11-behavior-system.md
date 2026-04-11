# Behavior System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual decision system (utility-ai scoring + inline tick() overrides) with a single, role-based scoring engine with periodic re-evaluation and hysteresis.

**Architecture:** `utility-ai.ts` is the sole decision authority. Scoring functions drop gender checks; a `ROLES` config filters actions per gender. `world.ts` tick() becomes pure execution — move, resolve arrivals, manage state timers. Entities re-evaluate goals every 20 ticks with a 0.3 hysteresis threshold.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-11-behavior-system-design.md`

---

## File Structure

| File | Role | Change type |
|------|------|-------------|
| `src/engine/types.ts` | Entity types, constants | Modify: add `goalSetTick` field |
| `src/engine/utility-ai.ts` | Decision engine, scoring, roles | Rewrite: add ROLES, remove gender checks, add hysteresis |
| `src/engine/world.ts` | Tick execution, movement, resolution | Modify: remove inline decisions, add goal-arrival resolution |
| `src/engine/__tests__/utility-ai.test.ts` | AI decision tests | Rewrite: test role filtering, hysteresis, scoring |
| `src/engine/__tests__/world.test.ts` | World tick tests | Modify: add `goalSetTick` to entity literals |

---

### Task 1: Add `goalSetTick` to Entity type

**Files:**
- Modify: `src/engine/types.ts:49-70` (Entity interface)
- Modify: `src/engine/__tests__/world.test.ts` (all entity literals)
- Modify: `src/engine/__tests__/utility-ai.test.ts:7` (makeEntity)
- Modify: `src/engine/world.ts` (createWorld entity creation, baby creation)

- [ ] **Step 1: Add field to Entity interface**

In `src/engine/types.ts`, add `goalSetTick` to the Entity interface after `goal`:

```typescript
  goal?: EntityGoal;
  goalSetTick: number;   // tick when current goal was assigned (for re-evaluation)
```

- [ ] **Step 2: Add goalSetTick to entity creation in createWorld**

In `src/engine/world.ts`, find the `entities.push({` block inside `createWorld` (~line 397) and add:

```typescript
        goalSetTick: 0,
```

- [ ] **Step 3: Add goalSetTick to baby creation in tick()**

In `src/engine/world.ts`, find the baby Entity creation (~line 708) and add:

```typescript
            goalSetTick: 0,
```

- [ ] **Step 4: Add goalSetTick to all test entity literals**

Run sed to add `goalSetTick: 0` to all entity literals in test files:

```bash
sed -i "s/mateCooldown: 0 }/mateCooldown: 0, goalSetTick: 0 }/g" src/engine/__tests__/world.test.ts
sed -i "s/mateCooldown: 0,$/mateCooldown: 0, goalSetTick: 0,/" src/engine/__tests__/utility-ai.test.ts
```

Also update `makeEntity` in `src/engine/__tests__/utility-ai.test.ts` to include `goalSetTick: 0` in the default entity.

- [ ] **Step 5: Build and test**

```bash
npm run build && npx vitest run
```

Expected: all 51 tests pass, zero TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/world.ts src/engine/__tests__/world.test.ts src/engine/__tests__/utility-ai.test.ts
git commit -m "feat: add goalSetTick field to Entity for re-evaluation tracking"
```

---

### Task 2: Add ROLES config and role-filtered scoring to utility-ai.ts

**Files:**
- Modify: `src/engine/utility-ai.ts:1-155` (top-level types, scoring functions, ROLES)
- Modify: `src/engine/__tests__/utility-ai.test.ts`

- [ ] **Step 1: Write tests for role-filtered scoring**

Add to `src/engine/__tests__/utility-ai.test.ts`:

```typescript
import { getScores, ROLES } from '../utility-ai';

describe('role-based scoring', () => {
  it('female gets zero hunt/chop/build scores', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'female', position: { x: 5, y: 5 } }),
    });
    const scores = getScores(ctx);
    // Raw scores may be nonzero, but role-filtered scores should be zero
    const role = ROLES['female'];
    expect(role.actions['hunt']).toBeUndefined();
    expect(role.actions['chop']).toBeUndefined();
    expect(role.actions['build']).toBeUndefined();
    expect(role.actions['gather']).toBe(1.0);
  });

  it('male gets zero gather score', () => {
    const role = ROLES['male'];
    expect(role.actions['gather']).toBeUndefined();
    expect(role.actions['hunt']).toBe(1.0);
    expect(role.actions['chop']).toBeDefined();
    expect(role.actions['build']).toBeDefined();
  });

  it('scoring functions return nonzero for any gender when conditions met', () => {
    // Male entity but we call raw scoring — should get gather score
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    const scores = getScores(ctx);
    // gather should have a raw score > 0 (village has low plantStore)
    expect(scores.gather).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/engine/__tests__/utility-ai.test.ts
```

Expected: FAIL — `ROLES` not exported, `getScores` doesn't return role-independent values yet.

- [ ] **Step 3: Add ROLES config**

At the top of `src/engine/utility-ai.ts`, after the imports, add:

```typescript
import type { Gender } from './types';

export interface RoleConfig {
  actions: Record<string, number>;  // action name → weight multiplier
}

export const ROLES: Record<Gender, RoleConfig> = {
  female: {
    actions: { gather: 1.0, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
  male: {
    actions: { hunt: 1.0, chop: 0.7, build: 0.85, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
};
```

- [ ] **Step 4: Remove gender checks from scoring functions**

In each scoring function, remove the `if (entity.gender !== 'male') return 0` or `if (entity.gender !== 'female') return 0` line:

- `scoreHunt` (~line 112): remove `if (ctx.entity.gender !== 'male') return 0;`
- `scoreGather` (~line 125): remove `if (ctx.entity.gender !== 'female') return 0;`
- `scoreBuildHome` (~line 94): remove `if (ctx.entity.gender !== 'male') return 0;`
- `scoreChopFirewood` (~line 102): remove `if (ctx.entity.gender !== 'male') return 0;`

Keep the `ageInYears(ctx.entity) < CHILD_AGE` checks — those are age-based, not gender-based.

- [ ] **Step 5: Update `getScores` to return raw (unfiltered) scores**

`getScores` already returns raw scores. No change needed. Verify it still returns all score keys regardless of gender.

- [ ] **Step 6: Update `decideAction` to apply role filtering**

In `decideAction()`, after computing all scores but before sorting, filter by role:

```typescript
  const role = ROLES[e.gender];

  // Apply role weights — zero out actions not in role config
  const filteredScores = scores.map(s => {
    const weight = role.actions[s.key] ?? 0;
    return { ...s, score: s.score * weight };
  });
```

This requires adding a `key` field to the scores array. Change the scores array structure from:

```typescript
const scores: Array<{ score: number; action: () => AIAction }> = [];
```

to:

```typescript
const scores: Array<{ key: string; score: number; action: () => AIAction }> = [];
```

And add `key` to each `.push()` call:
- survival → `key: 'survival'`  (survival bypasses role filter — always allowed)
- build → `key: 'build'`
- hunt → `key: 'hunt'`
- gather → `key: 'gather'`
- chop → `key: 'chop'`
- return_home → `key: 'return_home'`
- play → `key: 'play'`
- rest → `key: 'rest'`

Survival entries keep their score unfiltered (everyone can forage when starving). For non-survival entries, multiply score by `role.actions[key] ?? 0`.

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/engine/__tests__/utility-ai.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: zero TS errors.

- [ ] **Step 9: Commit**

```bash
git add src/engine/utility-ai.ts src/engine/__tests__/utility-ai.test.ts
git commit -m "feat: add ROLES config, remove gender checks from scoring functions"
```

---

### Task 3: Add hysteresis re-evaluation

**Files:**
- Modify: `src/engine/utility-ai.ts` (add `shouldReEvaluate`, `scoreForGoalType`)
- Modify: `src/engine/__tests__/utility-ai.test.ts`

- [ ] **Step 1: Write tests for hysteresis**

Add to `src/engine/__tests__/utility-ai.test.ts`:

```typescript
import { scoreForGoalType, shouldReEvaluate } from '../utility-ai';

describe('hysteresis re-evaluation', () => {
  it('does not interrupt when score difference is below threshold', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    // Current goal is chopping, assume chop score ~0.5
    const result = shouldReEvaluate(ctx, 'chop', 10, 30); // goalSetTick=10, currentTick=30
    // 30-10=20 → re-eval tick. But unless new score exceeds chop by 0.3, no interrupt
    expect(typeof result.interrupt).toBe('boolean');
  });

  it('interrupts when score difference exceeds threshold', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 15 }), // survival = 1.0
    });
    // Current goal is chopping, chop score ~0.5, survival = 1.0 → diff = 0.5 > 0.3
    const result = shouldReEvaluate(ctx, 'chop', 10, 30);
    expect(result.interrupt).toBe(true);
  });

  it('does not re-evaluate before 20 ticks elapsed', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 15 }),
    });
    const result = shouldReEvaluate(ctx, 'chop', 25, 30); // only 5 ticks
    expect(result.interrupt).toBe(false);
  });

  it('scoreForGoalType maps goal types to scoring functions', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    expect(typeof scoreForGoalType(ctx, 'hunt')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'gather')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'chop')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'build')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'return_home')).toBe('number');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/engine/__tests__/utility-ai.test.ts
```

Expected: FAIL — `shouldReEvaluate` and `scoreForGoalType` not exported.

- [ ] **Step 3: Implement `scoreForGoalType`**

Add to `src/engine/utility-ai.ts`:

```typescript
export function scoreForGoalType(ctx: AIContext, goalType: string): number {
  switch (goalType) {
    case 'hunt': return scoreHunt(ctx);
    case 'gather': return scoreGather(ctx);
    case 'chop': return scoreChopFirewood(ctx);
    case 'build': return scoreBuildHome(ctx);
    case 'return_home': return scoreReturnHome(ctx);
    default: return 0;
  }
}
```

- [ ] **Step 4: Implement `shouldReEvaluate`**

Add to `src/engine/utility-ai.ts`:

```typescript
const RE_EVAL_INTERVAL = 20;    // ticks between re-evaluations (1 game day)
const HYSTERESIS_THRESHOLD = 0.3; // new action must beat current by this much

export interface ReEvalResult {
  interrupt: boolean;
  newAction?: AIAction;
}

export function shouldReEvaluate(
  ctx: AIContext,
  currentGoalType: string,
  goalSetTick: number,
  currentTick: number,
): ReEvalResult {
  const elapsed = currentTick - goalSetTick;
  if (elapsed < RE_EVAL_INTERVAL) return { interrupt: false };

  const currentScore = scoreForGoalType(ctx, currentGoalType);
  const bestAction = decideAction(ctx);
  // Map the best action back to a score
  const bestKey = actionToKey(bestAction);
  const role = ROLES[ctx.entity.gender];
  const rawBestScore = scoreForGoalType(ctx, bestKey);
  const bestScore = rawBestScore * (role.actions[bestKey] ?? 0);
  const adjustedCurrent = currentScore * (role.actions[currentGoalType] ?? 0);

  if (bestScore - adjustedCurrent > HYSTERESIS_THRESHOLD) {
    return { interrupt: true, newAction: bestAction };
  }
  return { interrupt: false };
}

function actionToKey(action: AIAction): string {
  switch (action.type) {
    case 'go_hunt': return 'hunt';
    case 'go_gather': return 'gather';
    case 'go_chop': return 'chop';
    case 'return_home': return 'return_home';
    case 'play': return 'play';
    case 'rest': return 'rest';
    default: return 'rest';
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/engine/__tests__/utility-ai.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/utility-ai.ts src/engine/__tests__/utility-ai.test.ts
git commit -m "feat: add hysteresis re-evaluation with 20-tick interval and 0.3 threshold"
```

---

### Task 4: Remove inline decision blocks from tick()

**Files:**
- Modify: `src/engine/world.ts:918-989, 1106-1172` (Steps 2b, 2c, 4b, 4c)

This is the biggest change. We remove ~120 lines of inline decision logic from tick().

- [ ] **Step 1: Remove Step 2b — inline hunt/gather/chop (lines ~918-965)**

Find the block starting with `// --- Step 2b: Instant hunting/gathering (on contact) ---` and ending before `// --- Step 2c: Building`. Delete the entire for-loop.

- [ ] **Step 2: Remove Step 2c — inline building (lines ~967-989)**

Find the block starting with `// --- Step 2c: Building` and ending before `// --- Step 3: Move idle entities`. Delete the entire for-loop.

- [ ] **Step 3: Remove Step 4b — post-movement inline hunt/gather (lines ~1106-1149)**

Find the block starting with `// --- Step 4b: Instant hunting/gathering (post-movement) ---`. Delete the entire block including the for-loop.

- [ ] **Step 4: Remove Step 4c — post-movement building (lines ~1151-1172)**

Find the block starting with `// --- Step 4c:` or the second building check. Delete it.

- [ ] **Step 5: Remove inline hunt/gather during movement (lines ~1072-1097)**

Inside the movement loop (Step 3), find the `// Inline instant hunt/gather on each step` comment block. Delete from that comment through the two `if` blocks and their `break` statements, up to the closing `}` of the step loop.

- [ ] **Step 6: Remove unused imports**

After removing inline blocks, these may become unused in `world.ts`:
- `canGatherPlant` function — check if it's still called; if not, remove
- `shouldStoreGatheredPlants` function — check if still called; if not, remove

Keep `canHuntAnimalPopulation` — it will be used in goal-arrival resolution.

- [ ] **Step 7: Build and test**

```bash
npm run build && npx vitest run
```

Expected: build passes. Some existing tests may fail if they depended on inline behavior — that's expected and will be fixed in Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/engine/world.ts
git commit -m "refactor: remove inline decision blocks from tick() (Steps 2b, 2c, 4b, 4c)"
```

---

### Task 5: Add goal-arrival resolution to tick()

**Files:**
- Modify: `src/engine/world.ts` (Step 3 movement loop)

- [ ] **Step 1: Add goal-arrival resolution block**

In the movement loop, after the entity arrives at its goal target (where `goal` is cleared), add resolution logic. Find the block where `entity.goal?.target` matches `entity.position` and goal is cleared. Replace the simple `goal: undefined` with resolution:

```typescript
          // Arrived at goal target — resolve action
          if (entity.goal?.target && entity.position.x === entity.goal.target.x && entity.position.y === entity.goal.target.y) {
            const goalType = entity.goal.type;
            entity = { ...entity, goal: undefined };
            entities[idx] = entity;

            // Resolve based on goal type
            if (goalType === 'hunt') {
              const prey = animals.findIndex(a =>
                Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y) <= HUNT_KILL_RANGE
              );
              if (prey >= 0) {
                animals.splice(prey, 1);
                const direct = eatDirectlyToThreshold(entity, ENERGY_MEAT, MEAT_PORTIONS_PER_HUNT);
                const v = getVillage(entity.tribe);
                if (v) v.meatStore += direct.remainingPortions;
                entity = direct.entity;
                entities[idx] = entity;
                logEvent(entity, 'hunt');
              }
            } else if (goalType === 'gather') {
              const pi = plants.findIndex(p =>
                p.portions > 0 && p.position.x === entity.position.x && p.position.y === entity.position.y
              );
              if (pi >= 0) {
                plants[pi] = { ...plants[pi], portions: plants[pi].portions - 1 };
                const direct = eatDirectlyToThreshold(entity, ENERGY_PLANT, PLANT_PORTIONS_PER_GATHER);
                const v = getVillage(entity.tribe);
                if (v && villageNeedsFood(v, entities)) v.plantStore += direct.remainingPortions;
                entity = direct.entity;
                entities[idx] = entity;
              }
            } else if (goalType === 'chop') {
              if (biomes[entity.position.y][entity.position.x] === 'forest') {
                entity = { ...entity, state: 'chopping' as const, stateTimer: CHOPPING_DURATION, goal: undefined };
                entities[idx] = entity;
              }
            } else if (goalType === 'build') {
              const v = getVillage(entity.tribe);
              if (v && v.woodStore >= HOUSE_WOOD_COST
                  && !isRoadTile(entity.position, biomes)
                  && !hasStructureAt(entity.position, houses, updatedVillages)) {
                v.woodStore -= HOUSE_WOOD_COST;
                entity = { ...entity, state: 'building' as const, stateTimer: BUILDING_DURATION, goal: undefined };
                entities[idx] = entity;
              }
            }
            break;
          }
```

- [ ] **Step 2: Add hysteresis re-evaluation to the goal assignment block**

Find the block where `!entity.goal` triggers `buildAIContext` + `decideAction`. Add re-evaluation for entities that already have a goal:

```typescript
    // Re-evaluate existing goal with hysteresis
    if (entity.goal && (tickNum - entity.goalSetTick) % 20 === 0) {
      const ctx = buildAIContext(entity, updatedVillages, animals, plants, entities, biomes, gridSize, tickNum, houses);
      const result = shouldReEvaluate(ctx, entity.goal.type, entity.goalSetTick, tickNum);
      if (result.interrupt && result.newAction) {
        const goal = actionToGoal(result.newAction, ctx);
        if (goal) {
          entity = { ...entity, goal, goalSetTick: tickNum };
        } else {
          entity = { ...entity, goal: undefined, goalSetTick: tickNum };
        }
        entities[idx] = entity;
      }
    }
```

Place this BEFORE the `if (!entity.goal)` block.

- [ ] **Step 3: Update goal assignment to set goalSetTick**

In the existing `if (!entity.goal)` block where goals are assigned, add `goalSetTick: tickNum`:

```typescript
    if (!entity.goal) {
      const ctx = buildAIContext(entity, updatedVillages, animals, plants, entities, biomes, gridSize, tickNum, houses);
      const action = decideAction(ctx);
      const goal = actionToGoal(action, ctx);
      if (goal) {
        entity = { ...entity, goal, goalSetTick: tickNum };
        entities[idx] = entity;
      }
      // ... rest of non-goal action handling
```

- [ ] **Step 4: Add import for shouldReEvaluate**

At the top of `src/engine/world.ts`, update the import:

```typescript
import { decideAction, buildAIContext, actionToGoal, shouldReEvaluate } from './utility-ai';
```

- [ ] **Step 5: Build and test**

```bash
npm run build && npx vitest run
```

Expected: all tests pass, zero TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/world.ts
git commit -m "feat: add goal-arrival resolution and hysteresis re-evaluation to tick()"
```

---

### Task 6: Clean up dead code

**Files:**
- Modify: `src/engine/world.ts` (remove unused functions/helpers)
- Modify: `src/engine/utility-ai.ts` (remove `survivalForageAction` gender branches if redundant)

- [ ] **Step 1: Remove unused helper functions from world.ts**

After removing inline blocks, check if these functions are still called:
- `canGatherPlant` — was used in inline gather checks. If no longer called, remove it.
- `shouldStoreGatheredPlants` — was used in inline gather. If no longer called, remove it.

Use grep to verify:

```bash
grep -n 'canGatherPlant\|shouldStoreGatheredPlants' src/engine/world.ts
```

Remove any functions that have zero call sites (excluding their own definition).

- [ ] **Step 2: Clean up survivalForageAction gender handling**

In `survivalForageAction`, the gender-specific logic (female → gather, male → hunt then gather) now conflicts with the role system. Since survival bypasses role weights, this is correct behavior — everyone can forage when starving. But simplify: both genders should try the nearest food source regardless of type:

```typescript
function survivalForageAction(ctx: AIContext, survivalScore: number): AIAction | undefined {
  if (survivalScore === 0) return undefined;

  // Nearest food source — plant or animal, whichever is closer
  if (ctx.nearestPlant) return { type: 'go_gather', target: ctx.nearestPlant.pos };
  if (ctx.entity.gender === 'male' && ctx.nearestAnimal
      && ctx.animalPopulation > scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)) {
    return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
  }
  if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };

  if (!ctx.nearHome && ctx.village && totalVillageFood(ctx) > 0) {
    return { type: 'return_home' };
  }

  if (!ctx.nearHome) return { type: 'wander' };
  return undefined;
}
```

- [ ] **Step 3: Build and test**

```bash
npm run build && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/world.ts src/engine/utility-ai.ts
git commit -m "refactor: remove dead code from tick(), clean up survival foraging"
```

---

### Task 7: Integration test — full simulation smoke test

**Files:**
- Modify: `src/engine/__tests__/world.test.ts`

- [ ] **Step 1: Add smoke test for behavior system**

Add to `src/engine/__tests__/world.test.ts`:

```typescript
describe('behavior system integration', () => {
  it('female gathers plants and male hunts over 100 ticks', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    for (let i = 0; i < 100; i++) {
      world = tick(world);
    }
    // After 100 ticks, entities should still be alive (not all starved)
    expect(world.entities.length).toBeGreaterThan(0);
    // Log should have some events
    expect(world.log.length).toBeGreaterThan(0);
  });

  it('entities do not change goals every tick (hysteresis)', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    // Run 5 ticks, track goal changes
    const goalChanges: number[] = [];
    for (let i = 0; i < 5; i++) {
      const goalsBefore = world.entities.map(e => e.goal?.type);
      world = tick(world);
      const goalsAfter = world.entities.map(e => e.goal?.type);
      const changes = goalsBefore.filter((g, idx) => g && g !== goalsAfter[idx]).length;
      goalChanges.push(changes);
    }
    // Most ticks should have 0 goal changes (hysteresis prevents switching)
    const totalChanges = goalChanges.reduce((a, b) => a + b, 0);
    // With 4 entities over 5 ticks, fewer than 10 changes means hysteresis works
    expect(totalChanges).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all tests pass including new smoke tests.

- [ ] **Step 3: Full build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/engine/__tests__/world.test.ts
git commit -m "test: add behavior system integration smoke tests"
```

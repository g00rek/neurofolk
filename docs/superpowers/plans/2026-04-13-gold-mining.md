# Gold Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add finite gold deposits on mountain tiles. Adults can mine gold from adjacent passable tiles, carry it home, and stack it in the village `goldStore`. Depletion is permanent — spent deposits drive exploration and (later) inter-tribe rivalry.

**Architecture:** Mirror the existing tree/chop pipeline. Gold lives as a parallel resource type: `GoldDeposit` on impassable mountain tiles (analogous to `Tree` on forest), mined from an adjacent tile (different from chop — entity can't stand on mountain), with finite portions that don't regrow. Same five-stage loop: score → go_mine (Purpose) → resolveMineArrival → completeMining (Action 'mining') → depositCarrying → `village.goldStore`.

**Tech Stack:** TypeScript, React, Canvas 2D, Vitest. No new libraries.

**Scope note:** This plan covers ONLY the gold mining mechanic. Inter-tribe combat over gold, mercenary hiring, and the Research subsystem are explicitly out of scope — they will be separate plans.

**File structure:**

| Action | File | What it owns |
| --- | --- | --- |
| Modify | `src/engine/types.ts` | Add `GoldDeposit`, extend `Action`, `Purpose`, `LogEventType`, `Village`, `Entity.carrying`, `WorldState`, `ECONOMY.gold` |
| Modify | `src/engine/world.ts` | Spawn deposits in `createWorld`, add `resolveMineArrival` + `completeMining`, wire dispatch in Step 3, extend `depositCarrying` |
| Modify | `src/engine/utility-ai.ts` | Add `scoreMineGold`, `go_mine` AIAction, `nearestGoldDeposit` in AIContext, wire into `decideAction`, `scoreForGoalType`, `actionToKey`, `actionToActivity`, `getScores` |
| Modify | `src/ui/terrain/renderer.ts` | Add `drawGoldLayer` |
| Modify | `src/ui/GridCanvas.tsx` | Invoke `drawGoldLayer`; optionally extend ActionBadge for 'mine' |
| Modify | `src/ui/Stats.tsx` | Display `goldStore` in Village resource panel |
| Modify | `src/ui/EntityPanel.tsx` | Add `mining` working label and `mine` moving label |
| Modify | `src/ui/EventLog.tsx` | Add `mine` event type with color/icon/message |
| Create | `src/engine/__tests__/gold.test.ts` | End-to-end mining + depletion tests |
| Modify | `src/engine/__tests__/world.test.ts` | Extend Entity mocks if needed (no schema change, but goldStore on Village literals) |

---

## Task 1: Types foundation — GoldDeposit, Action, Purpose, Village.goldStore, carrying 'gold'

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/__tests__/world.test.ts` (add `goldStore: 0` to any inline Village literals if tests break)

- [ ] **Step 1: Write a failing test**

Create `src/engine/__tests__/gold.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createWorld } from '../world';

describe('gold foundation', () => {
  it('fresh world has village.goldStore = 0', () => {
    const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
    for (const v of world.villages) {
      expect(v.goldStore).toBe(0);
    }
  });

  it('fresh world has a goldDeposits array (may be empty at this stage)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
    expect(Array.isArray(world.goldDeposits)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/gold.test.ts`
Expected: FAIL — `goldStore` and `goldDeposits` do not exist on the types.

- [ ] **Step 3: Extend types**

In `src/engine/types.ts`:

Add `GoldDeposit` interface near `Tree`:

```typescript
export interface GoldDeposit {
  id: string;
  position: Position;   // on a mountain tile (impassable)
  remaining: number;    // portions left; 0 = depleted
  depletedAt?: number;  // tick when exhausted (for future rendering/cleanup)
}
```

Extend `Purpose`:

```typescript
export type Purpose = 'hunt' | 'gather' | 'chop' | 'build' | 'cook' | 'mine' | 'deposit';
```

Extend `Action`:

```typescript
export type Action = 'hunting' | 'gathering' | 'chopping' | 'building' | 'cooking' | 'mining' | 'fighting';
```

Extend `ACTION_DURATION`:

```typescript
export const ACTION_DURATION: Record<Action, number> = {
  hunting: 3,
  gathering: 2,
  chopping: 3,
  cooking: 8,
  building: 10,
  mining: 4,       // gold mining: slightly slower than chopping
  fighting: 5,
};
```

Extend `ECONOMY` with a gold block (add inside the `ECONOMY = { ... } as const` object, before the closing brace):

```typescript
  // --- GOLD (from mining mountain deposits) ---
  gold: {
    unitsPerMine: 2,         // portions carried home from one mining session
    depositCapacity: 6,      // portions per deposit (= 3 mining sessions)
    spawnBase: 3,            // base deposit count on 30×30 (scaled by map area)
  },
```

Extend `Village`:

```typescript
export interface Village {
  tribe: TribeId;
  color: RGB;
  name: string;
  stockpile?: Position;
  meatStore: number;
  plantStore: number;
  cookedMeatStore: number;
  driedFruitStore: number;
  woodStore: number;
  goldStore: number;          // ← new
}
```

Extend `Entity.carrying`:

```typescript
carrying?: { type: 'meat' | 'wood' | 'fruit' | 'gold'; amount: number };
```

Extend `LogEventType`:

```typescript
export type LogEventType =
  | 'birth' | 'death' | 'pregnant'
  | 'hunt' | 'gather' | 'chop' | 'mine' | 'build_start' | 'build_done'
  | 'fight' | 'house_claimed';
```

Extend `WorldState`:

```typescript
export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  trees: Tree[];
  goldDeposits: GoldDeposit[];  // ← new
  houses: House[];
  biomes: Biome[][];
  villages: Village[];
  grass: number[][];
  tick: number;
  gridSize: number;
  log: LogEntry[];
}
```

- [ ] **Step 4: Initialize new fields in `createWorld`**

In `src/engine/world.ts`, inside `createWorld`:

Find the Village construction (it builds the `villages` array) and add `goldStore: 0` to every created village literal. Example diff-style reference (actual code):

```typescript
villages.push({
  tribe, color, name, stockpile,
  meatStore: 0, plantStore: 0,
  cookedMeatStore: 0, driedFruitStore: 0,
  woodStore: 0,
  goldStore: 0,           // ← add this
});
```

At the bottom of `createWorld`, change the return statement to include an empty `goldDeposits: []`:

```typescript
return {
  entities, animals, trees,
  goldDeposits: [],          // ← add this
  houses: [], biomes, villages, grass,
  tick: 0, gridSize, log: [],
};
```

- [ ] **Step 5: Fix any inline Village/WorldState literals in existing tests**

Run: `npx tsc --noEmit`
Expected: errors pointing at test files that build inline `Village` or `WorldState` without `goldStore` / `goldDeposits`.

For each such location in `src/engine/__tests__/*.ts` and `src/ui/AnimalsPage.tsx`, add `goldStore: 0` (to Village literals) and `goldDeposits: []` (to WorldState literals).

- [ ] **Step 6: Run new test to verify it passes**

Run: `npx vitest run src/engine/__tests__/gold.test.ts`
Expected: PASS both tests.

- [ ] **Step 7: Full typecheck + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all previously-passing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/world.ts src/engine/__tests__/gold.test.ts \
        src/engine/__tests__/world.test.ts src/engine/__tests__/utility-ai.test.ts \
        src/ui/AnimalsPage.tsx
git commit -m "feat(gold): foundation types — GoldDeposit, Village.goldStore, mining action/purpose"
```

---

## Task 2: Worldgen spawns gold deposits on mountain tiles

**Files:**
- Modify: `src/engine/world.ts` (createWorld)
- Modify: `src/engine/__tests__/gold.test.ts`

- [ ] **Step 1: Extend test to verify spawning**

Append to `src/engine/__tests__/gold.test.ts`:

```typescript
describe('gold spawning', () => {
  it('spawns deposits on mountain tiles adjacent to at least one passable tile', () => {
    // Try a few seeds — some maps may have zero mountains
    let foundWithDeposits = false;
    for (let i = 0; i < 10; i++) {
      const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
      if (world.goldDeposits.length === 0) continue;
      foundWithDeposits = true;
      for (const d of world.goldDeposits) {
        expect(world.biomes[d.position.y][d.position.x]).toBe('mountain');
        // must have at least one passable neighbor (so miners can reach it)
        const nbrs = [
          { x: d.position.x + 1, y: d.position.y },
          { x: d.position.x - 1, y: d.position.y },
          { x: d.position.x, y: d.position.y + 1 },
          { x: d.position.x, y: d.position.y - 1 },
        ];
        const anyPassable = nbrs.some(n =>
          n.x >= 0 && n.x < world.gridSize && n.y >= 0 && n.y < world.gridSize
          && ['plains', 'forest', 'road'].includes(world.biomes[n.y][n.x])
        );
        expect(anyPassable).toBe(true);
        expect(d.remaining).toBe(6);  // ECONOMY.gold.depositCapacity
      }
      break;
    }
    // Not a hard assertion — seeds may vary — but at least one of 10 runs should spawn gold
    // if the map has reachable mountains. If this flaky-fails repeatedly, raise spawnBase.
    expect(foundWithDeposits).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "spawns deposits"`
Expected: FAIL — goldDeposits is always empty.

- [ ] **Step 3: Implement spawning in `createWorld`**

In `src/engine/world.ts`, inside `createWorld`, just before the `return` statement, add:

```typescript
// --- Gold deposits ---
// Spawn on mountain tiles that have at least one passable neighbor (miners mine from adjacent).
const goldDeposits: GoldDeposit[] = [];
const mountainCandidates: Position[] = [];
for (let y = 0; y < gridSize; y++) {
  for (let x = 0; x < gridSize; x++) {
    if (biomes[y][x] !== 'mountain') continue;
    const hasPassableNeighbor = [
      { x: x + 1, y }, { x: x - 1, y },
      { x, y: y + 1 }, { x, y: y - 1 },
    ].some(n =>
      n.x >= 0 && n.x < gridSize && n.y >= 0 && n.y < gridSize
      && isPassable(biomes[n.y][n.x])
    );
    if (hasPassableNeighbor) mountainCandidates.push({ x, y });
  }
}
// Shuffle and take N (scaled to map area)
const want = scaled(ECONOMY.gold.spawnBase, gridSize, 1);
for (let i = mountainCandidates.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [mountainCandidates[i], mountainCandidates[j]] = [mountainCandidates[j], mountainCandidates[i]];
}
for (const pos of mountainCandidates.slice(0, want)) {
  goldDeposits.push({
    id: generateId('g'),
    position: pos,
    remaining: ECONOMY.gold.depositCapacity,
  });
}
```

Import `GoldDeposit` and `isPassable` if they are not already imported. Update the return:

```typescript
return {
  entities, animals, trees,
  goldDeposits,          // ← populated
  houses: [], biomes, villages, grass,
  tick: 0, gridSize, log: [],
};
```

- [ ] **Step 4: Ensure tick preserves goldDeposits**

Find the `tick(state: WorldState)` function in `src/engine/world.ts`. At the end where it constructs the new `WorldState` to return, ensure `goldDeposits: state.goldDeposits` (or whatever mutated copy) is carried forward. Grep for the final return literal and add:

```typescript
return { ...state /* other fields */, goldDeposits: state.goldDeposits, /* ... */ };
```

If `tick` builds the state via `{ ...state, entities, animals, trees, ... }` spread, the spread already preserves `goldDeposits`. Verify by grep.

- [ ] **Step 5: Run spawn test**

Run: `npx vitest run src/engine/__tests__/gold.test.ts`
Expected: PASS (may need to bump `spawnBase` in `ECONOMY.gold` if too flaky — but 3 per 30×30 with varied seeds should work).

- [ ] **Step 6: Run full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/world.ts src/engine/__tests__/gold.test.ts
git commit -m "feat(gold): spawn gold deposits on reachable mountain tiles"
```

---

## Task 3: Render gold deposits on canvas (placeholder sprite)

**Files:**
- Modify: `src/ui/terrain/renderer.ts`
- Modify: `src/ui/GridCanvas.tsx`

- [ ] **Step 1: Add `drawGoldLayer` in renderer**

In `src/ui/terrain/renderer.ts`, add (near `drawTreeLayer`):

```typescript
import type { GoldDeposit } from '../../engine/types';

export function drawGoldLayer(
  ctx: CanvasRenderingContext2D,
  deposits: GoldDeposit[],
  cellSize: number,
) {
  for (const d of deposits) {
    if (d.remaining <= 0) continue;  // depleted — hide
    const cx = d.position.x * cellSize + cellSize / 2;
    const cy = d.position.y * cellSize + cellSize / 2;
    const r = Math.max(2, cellSize * 0.28);
    // Flat-shaded gold nugget (placeholder — swap for sprite later).
    ctx.fillStyle = '#e6b422';            // gold yellow
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = Math.max(1, cellSize * 0.04);
    ctx.stroke();
  }
}
```

- [ ] **Step 2: Invoke the new layer in GridCanvas**

In `src/ui/GridCanvas.tsx`, find where `drawTreeLayer` is called inside the render loop and add `drawGoldLayer` right after it:

```typescript
drawTreeLayer(ctx, sprites.overworld, world.trees, cellSize, season);
drawGoldLayer(ctx, world.goldDeposits, cellSize);
```

Import:

```typescript
import { drawBiomeLayer, drawTreeLayer, drawGoldLayer } from './terrain/renderer';
```

- [ ] **Step 3: Visual verification**

Run: `npm run dev`
Open the simulation in the browser. Verify: small gold circles visible on mountain tiles. If the map has no mountains, regenerate with a different seed (if there is a button) or edit the biome generator params.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/terrain/renderer.ts src/ui/GridCanvas.tsx
git commit -m "feat(gold): render gold deposits as yellow nuggets (placeholder)"
```

---

## Task 4: AI scoring — `scoreMineGold` + `go_mine` action

**Files:**
- Modify: `src/engine/utility-ai.ts`
- Modify: `src/engine/__tests__/utility-ai.test.ts`

**Design:** Mining is a "free time" low-priority activity. Score 0 while food is tight (daysOfFood < COMFORT) or while village needs wood (woodStore below target). Score 0.3 above food-comfort, 0.5 above food-surplus. Never beats survival / buildHome / hunt-when-starving.

- [ ] **Step 1: Failing test for scoreMineGold**

Append to `src/engine/__tests__/utility-ai.test.ts`:

```typescript
import { decideAction, getScores } from '../utility-ai';
// (imports already at top — only add what's missing)

describe('scoreMineGold', () => {
  it('is 0 when entity is a child', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', age: 0 }),  // child
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 999,
    });
    expect(getScores(ctx).mine ?? 0).toBe(0);
  });

  it('is 0 when daysOfFood is below comfort (30)', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 10,
    });
    expect(getScores(ctx).mine ?? 0).toBe(0);
  });

  it('is > 0 when food is comfortable and a deposit is in sight', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 100,   // well above FOOD_COMFORT_DAYS (30)
    });
    expect((getScores(ctx).mine ?? 0)).toBeGreaterThan(0);
  });

  it('is 0 when no deposit is in sight', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      daysOfFood: 100,
      // no nearestGoldDeposit
    });
    expect(getScores(ctx).mine ?? 0).toBe(0);
  });
});
```

(The test helper `makeContext` lives at the top of this file — see existing tests for the pattern. Update it to accept `nearestGoldDeposit` as an override.)

- [ ] **Step 2: Extend `makeContext` and `AIContext`**

In `src/engine/__tests__/utility-ai.test.ts`, extend `makeContext`'s overrides param to include `nearestGoldDeposit`. In `src/engine/utility-ai.ts`, add to `AIContext`:

```typescript
export interface AIContext {
  // ... existing fields ...
  nearestGoldDeposit?: { pos: Position; dist: number };  // ← new
}
```

Compute it inside `buildAIContext` (near where `nearestForest` is computed):

```typescript
let nearestGoldDeposit: AIContext['nearestGoldDeposit'];
for (const d of (goldDeposits ?? [])) {
  if (d.remaining <= 0) continue;
  const dist = Math.abs(d.position.x - entity.position.x) + Math.abs(d.position.y - entity.position.y);
  if (dist > 0 && (!nearestGoldDeposit || dist < nearestGoldDeposit.dist)) {
    nearestGoldDeposit = { pos: d.position, dist };
  }
}
```

Pass `goldDeposits` as a new parameter to `buildAIContext`. Update its call sites in `src/engine/world.ts` (there are two — both pass `trees`; add `world.goldDeposits` next to them). Update the function signature.

Add `nearestGoldDeposit` to the returned context object.

- [ ] **Step 3: Implement scoreMineGold**

In `src/engine/utility-ai.ts`, add:

```typescript
// Gold mining is a "free time" activity — runs when the tribe is fed and has shelter
// in progress. Never beats survival/build/food-work. Produces pure wealth (for future
// mercenary hire + inter-tribe rivalry pressure).
function scoreMineGold(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;
  if (!ctx.nearestGoldDeposit) return 0;
  // Only when food is at least comfortable — don't starve the tribe to chase wealth.
  if (ctx.daysOfFood < FOOD_COMFORT_DAYS) return 0;
  // Above comfort but below surplus → mild interest.
  if (ctx.daysOfFood < FOOD_SURPLUS_DAYS) return 0.3;
  // Surplus → stronger pull (village is well-fed, channel labor into wealth).
  return 0.5;
}
```

Add the role weight for `mine` in both ROLES (equal for both genders — mining is not gendered labor):

```typescript
export const ROLES: Record<Gender, RoleConfig> = {
  female: { actions: { gather: 1.0, cook: 1.0, deposit: 1.0, mine: 0.8, rest: 1.0, play: 1.0 } },
  male:   { actions: { hunt: 1.0, chop: 0.9, build: 1.0, mine: 1.0, deposit: 1.0, rest: 1.0, play: 1.0 } },
};
```

(Women get 0.8 — subtle asymmetry reflecting historical division; competition with cook at 1.0 keeps cooks at stockpile.)

Extend AIAction:

```typescript
export type AIAction =
  // ... existing ...
  | { type: 'go_mine'; target: Position }
  // ... existing 'wander' | 'play' ;
```

Wire into `decideAction` (before the "Deposit" block):

```typescript
const mineScore = scoreMineGold(ctx);
if (mineScore > 0 && ctx.nearestGoldDeposit) {
  scores.push({
    key: 'mine', score: mineScore,
    action: () => ({ type: 'go_mine', target: ctx.nearestGoldDeposit!.pos }),
  });
}
```

Wire into `scoreForGoalType`:

```typescript
case 'mine': return scoreMineGold(ctx);
```

Wire into `actionToKey`:

```typescript
case 'go_mine': return 'mine';
```

Wire into `actionToActivity`:

```typescript
case 'go_mine': return mk('mine', action.target);
```

Wire into `getScores`:

```typescript
const raw: Record<string, number> = {
  // ... existing ...
  mine: scoreMineGold(ctx),
};
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/engine/__tests__/utility-ai.test.ts -t scoreMineGold`
Expected: PASS all four sub-tests.

- [ ] **Step 5: Full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/utility-ai.ts src/engine/__tests__/utility-ai.test.ts src/engine/world.ts
git commit -m "feat(gold): AI scoring — scoreMineGold + go_mine action"
```

---

## Task 5: Mining arrival (adjacent-only) and completion

**Files:**
- Modify: `src/engine/world.ts`
- Modify: `src/engine/__tests__/gold.test.ts`

**Design:** Mountains are impassable, so miners stop at manhattan distance 1 from the deposit (like `deposit`/`cook` structure-stop purposes). On arrival, if there's a deposit with `remaining > 0` adjacent, start `mining`. On completion: decrement deposit `remaining` by `unitsPerMine`, set entity.carrying to gold.

- [ ] **Step 1: Failing test for mine arrival + completion**

Append to `src/engine/__tests__/gold.test.ts`:

```typescript
import { tick } from '../world';
import type { WorldState, Entity } from '../types';
import { TICKS_PER_YEAR } from '../types';

function plainsBiomes(size: number): any {
  return Array.from({ length: size }, () => Array(size).fill('plains'));
}
function emptyGrass(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

describe('mining flow', () => {
  it('entity adjacent to gold deposit mines and ends up carrying gold', () => {
    const T = TICKS_PER_YEAR;
    const biomes = plainsBiomes(10);
    biomes[5][5] = 'mountain';
    const world: WorldState = {
      gridSize: 10, tick: 0, animals: [], trees: [], houses: [],
      biomes, villages: [{
        tribe: 0, color: [255, 0, 0], name: 'A', stockpile: { x: 1, y: 1 },
        meatStore: 99, plantStore: 99, cookedMeatStore: 99, driedFruitStore: 99,
        woodStore: 99, goldStore: 0,
      }],
      grass: emptyGrass(10), log: [],
      goldDeposits: [{ id: 'g1', position: { x: 5, y: 5 }, remaining: 6 }],
      entities: [{
        id: 'm1', name: 'Miner', position: { x: 4, y: 5 }, gender: 'male',
        activity: { kind: 'moving', purpose: 'mine', target: { x: 5, y: 5 }, pace: 'walk', setTick: 0 },
        age: 25 * T, maxAge: 100 * T, color: [255, 0, 0],
        energy: 80, traits: { strength: 50, dexterity: 50, intelligence: 50 },
        tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
      }],
    };
    // Tick once: arrival (already adjacent) → startWork('mining')
    let next = tick(world);
    const miner = next.entities[0];
    expect(miner.activity.kind).toBe('working');
    if (miner.activity.kind === 'working') {
      expect(miner.activity.action).toBe('mining');
    }
    // Advance until mining completes
    for (let i = 0; i < 6; i++) next = tick(next);
    const doneMiner = next.entities[0];
    expect(doneMiner.carrying?.type).toBe('gold');
    expect(doneMiner.carrying?.amount).toBe(2);  // ECONOMY.gold.unitsPerMine
    expect(next.goldDeposits[0].remaining).toBe(4);  // 6 - 2
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "mining flow"`
Expected: FAIL — mining not implemented; entity stays moving or goes idle on arrival.

- [ ] **Step 3: Implement `resolveMineArrival`**

In `src/engine/world.ts`, add next to `resolveChopArrival`:

```typescript
// Mining: miner arrives at an adjacent passable tile (mountain is impassable),
// finds a deposit with remaining > 0 on the target mountain tile, starts work.
function resolveMineArrival(
  entity: Entity,
  goldDeposits: GoldDeposit[],
  biomes: Biome[][],
): Entity {
  if (entity.activity.kind !== 'moving') return entity;
  const target = entity.activity.target;
  // Must be adjacent to target tile (not on it — mountain is impassable).
  if (manhattan(entity.position, target) > 1) return { ...entity, activity: IDLE };
  if (biomes[target.y]?.[target.x] !== 'mountain') return { ...entity, activity: IDLE };
  const deposit = goldDeposits.find(d =>
    d.position.x === target.x && d.position.y === target.y && d.remaining > 0
  );
  if (!deposit) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('mining') };
}
```

- [ ] **Step 4: Implement `completeMining`**

Add next to `completeChopping`:

```typescript
function completeMining(
  entity: Entity,
  goldDeposits: GoldDeposit[],
  tickNum: number,
  logEvent: (e: Entity, type: LogEventType, extra?: { detail?: string; cause?: DeathCause }) => void,
): Entity {
  // Find the deposit adjacent to the miner.
  const depositIdx = goldDeposits.findIndex(d =>
    d.remaining > 0 && manhattan(entity.position, d.position) === 1
  );
  if (depositIdx < 0) {
    // Deposit disappeared mid-mine (someone else emptied it). Idle, no gold.
    return { ...entity, activity: IDLE, energy: Math.max(0, entity.energy - 5) };
  }
  const deposit = goldDeposits[depositIdx];
  const take = Math.min(ECONOMY.gold.unitsPerMine, deposit.remaining);
  goldDeposits[depositIdx] = {
    ...deposit,
    remaining: deposit.remaining - take,
    depletedAt: deposit.remaining - take <= 0 ? tickNum : deposit.depletedAt,
  };
  logEvent(entity, 'mine', { detail: `+${take} gold` });
  return {
    ...entity,
    activity: IDLE,
    energy: Math.max(0, entity.energy - 10),
    carrying: { type: 'gold', amount: take },
  };
}
```

- [ ] **Step 5: Wire into Step 1 (work completion) and Step 3 (arrival dispatch)**

In Step 1 of `tick`, find the switch on `e.activity.action` and add:

```typescript
case 'mining':    return completeMining(e, state.goldDeposits, tickNum, logEvent);
```

In Step 3, find the `structureStop` predicate and add 'mine':

```typescript
const structureStop = (p: Purpose) => p === 'deposit' || p === 'cook' || p === 'mine';
```

In Step 3, find the purpose switch after arrival and add:

```typescript
case 'mine':    entity = resolveMineArrival(entity, state.goldDeposits, biomes); break;
```

NOTE: `state.goldDeposits` is mutated in place by `completeMining` (it writes into the array via index). This parallels how trees are handled. If that pattern is not currently used (trees may be replaced via immutable copy), check `completeChopping` and match its style — if trees use in-place mutation, keep the same for gold; if they use immutable replacement, use `goldDeposits.map(...)` and return the new array through `state`.

- [ ] **Step 6: Run the mining flow test**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "mining flow"`
Expected: PASS.

- [ ] **Step 7: Full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/engine/world.ts src/engine/__tests__/gold.test.ts
git commit -m "feat(gold): resolveMineArrival + completeMining — entity mines adjacent deposit"
```

---

## Task 6: Deposit gold to village.goldStore

**Files:**
- Modify: `src/engine/world.ts` (`depositCarrying`)
- Modify: `src/engine/__tests__/gold.test.ts`

- [ ] **Step 1: Failing test**

Append to `src/engine/__tests__/gold.test.ts`:

```typescript
describe('gold deposit', () => {
  it('miner carrying gold deposits into village.goldStore on stockpile arrival', () => {
    const T = TICKS_PER_YEAR;
    const biomes = plainsBiomes(10);
    const world: WorldState = {
      gridSize: 10, tick: 0, animals: [], trees: [], houses: [],
      biomes, villages: [{
        tribe: 0, color: [255, 0, 0], name: 'A', stockpile: { x: 2, y: 2 },
        meatStore: 99, plantStore: 99, cookedMeatStore: 99, driedFruitStore: 99,
        woodStore: 99, goldStore: 0,
      }],
      grass: emptyGrass(10), log: [], goldDeposits: [],
      entities: [{
        id: 'm1', name: 'Miner', position: { x: 2, y: 3 }, gender: 'male',
        activity: { kind: 'moving', purpose: 'deposit', target: { x: 2, y: 2 }, pace: 'walk', setTick: 0 },
        age: 25 * T, maxAge: 100 * T, color: [255, 0, 0],
        energy: 80, traits: { strength: 50, dexterity: 50, intelligence: 50 },
        tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
        carrying: { type: 'gold', amount: 2 },
      }],
    };
    const next = tick(world);
    expect(next.villages[0].goldStore).toBe(2);
    expect(next.entities[0].carrying).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "gold deposit"`
Expected: FAIL — `depositCarrying` doesn't know about 'gold'.

- [ ] **Step 3: Extend `depositCarrying`**

In `src/engine/world.ts`:

```typescript
function depositCarrying(entity: Entity, getVillage: GetVillageFn): Entity {
  const carrying = entity.carrying;
  if (!carrying || carrying.amount <= 0) return entity;
  const v = getVillage(entity.tribe);
  if (!v) return entity;
  if (carrying.type === 'meat') v.meatStore += carrying.amount;
  else if (carrying.type === 'fruit') v.plantStore += carrying.amount;
  else if (carrying.type === 'wood') v.woodStore += carrying.amount;
  else if (carrying.type === 'gold') v.goldStore += carrying.amount;  // ← new
  return { ...entity, carrying: undefined };
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "gold deposit"`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/world.ts src/engine/__tests__/gold.test.ts
git commit -m "feat(gold): deposit gold into village.goldStore"
```

---

## Task 7: End-to-end integration — idle entity mines + deposits in a live tick loop

**Files:**
- Modify: `src/engine/__tests__/gold.test.ts`

This task has no production code — it's a full integration test proving the whole loop works in a realistic world.

- [ ] **Step 1: Write integration test**

Append:

```typescript
describe('gold end-to-end', () => {
  it('over many ticks, idle well-fed entity mines gold and deposits it', () => {
    const T = TICKS_PER_YEAR;
    const biomes = plainsBiomes(12);
    biomes[6][6] = 'mountain';
    const world: WorldState = {
      gridSize: 12, tick: 0, animals: [], trees: [], houses: [],
      biomes, villages: [{
        tribe: 0, color: [255, 0, 0], name: 'A', stockpile: { x: 2, y: 2 },
        meatStore: 999, plantStore: 999, cookedMeatStore: 999, driedFruitStore: 999,
        woodStore: 999, goldStore: 0,
      }],
      grass: emptyGrass(12), log: [],
      goldDeposits: [{ id: 'g1', position: { x: 6, y: 6 }, remaining: 6 }],
      entities: [{
        id: 'm1', name: 'Miner', position: { x: 2, y: 2 }, gender: 'male',
        activity: { kind: 'idle' },
        age: 25 * T, maxAge: 100 * T, color: [255, 0, 0],
        energy: 100, traits: { strength: 50, dexterity: 50, intelligence: 50 },
        tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
      }],
    };
    let state = world;
    for (let i = 0; i < 300; i++) state = tick(state);
    expect(state.villages[0].goldStore).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/engine/__tests__/gold.test.ts -t "end-to-end"`
Expected: PASS. If it fails, debug by logging `state.entities[0].activity` every 10 ticks — the miner should cycle: idle → moving(mine) → working(mining) → idle(carrying gold) → moving(deposit) → idle(empty) → repeat.

- [ ] **Step 3: Full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/engine/__tests__/gold.test.ts
git commit -m "test(gold): end-to-end mine + deposit loop"
```

---

## Task 8: UI surface — Stats panel shows goldStore

**Files:**
- Modify: `src/ui/Stats.tsx`

- [ ] **Step 1: Add gold row**

In `src/ui/Stats.tsx`, find the Village panel rendering (the block that displays `meatStore`, `plantStore`, `woodStore`, etc.) and add a row for `goldStore`. Use the `Coins` icon from `@phosphor-icons/react` (import it):

```typescript
import { /* ...existing..., */ Coins } from '@phosphor-icons/react';
```

In the village resource display JSX, add next to `woodStore`:

```tsx
<span style={resourceRowStyle}><Coins size={11} /> {v.goldStore}</span>
```

(If the existing pattern uses a different styling approach — text rows, a grid, etc. — match that pattern rather than inventing new styles.)

- [ ] **Step 2: Typecheck + visual check**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run dev`
Open the app, let a few minutes tick by (with surplus food), verify gold appears in the village panel when miners deposit.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Stats.tsx
git commit -m "feat(gold): Stats panel shows village goldStore"
```

---

## Task 9: UI — EntityPanel labels + EventLog entry

**Files:**
- Modify: `src/ui/EntityPanel.tsx`
- Modify: `src/ui/EventLog.tsx`

- [ ] **Step 1: Add EntityPanel labels**

In `src/ui/EntityPanel.tsx`, find `WORKING_LABEL` and add:

```typescript
mining:    <span style={stateIconRowStyle}><Pickaxe size={12} />Mining</span>,
```

(If Phosphor exposes a `Pickaxe` icon, use it; otherwise `Coins` or `Mountain` are reasonable fallbacks. Import at the top of the file.)

Find `MOVING_LABEL` and add:

```typescript
mine:    <span style={stateIconRowStyle}><Pickaxe size={12} />Going to mine</span>,
```

- [ ] **Step 2: Add EventLog entry**

In `src/ui/EventLog.tsx`:

Add `mine` to `EVENT_COLOR`:

```typescript
mine: '#e6b422',
```

Add `mine` to `EVENT_ICON`:

```typescript
mine: '⛏️',
```

Add a case in `formatEntry`:

```typescript
case 'mine':
  return `${name} mined gold${entry.detail ? ` ${entry.detail}` : ''}`;
```

Optionally add `mine` to a new or existing category — e.g., extend `food`:

```typescript
food: ['hunt', 'gather', 'chop', 'mine'],
```

(Mining isn't food — but it's a resource-gathering activity, so the 'food' filter feels misnamed. If a rename feels out of scope, leave `mine` uncategorized (it will show only under 'all') — that's fine.)

- [ ] **Step 3: Typecheck + visual check**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run dev`, verify Entity panel shows "Mining" / "Going to mine", and EventLog shows ⛏️ entries.

- [ ] **Step 4: Commit**

```bash
git add src/ui/EntityPanel.tsx src/ui/EventLog.tsx
git commit -m "feat(gold): EntityPanel mining labels + EventLog mine entries"
```

---

## Task 10: Depletion polish — logs, sanity run

**Files:**
- Modify: `src/engine/__tests__/gold.test.ts`

- [ ] **Step 1: Deplete test**

Append:

```typescript
describe('gold depletion', () => {
  it('mining three times drains a 6-unit deposit to zero', () => {
    const T = TICKS_PER_YEAR;
    const biomes = plainsBiomes(10);
    biomes[5][5] = 'mountain';
    const world: WorldState = {
      gridSize: 10, tick: 0, animals: [], trees: [], houses: [],
      biomes, villages: [{
        tribe: 0, color: [255, 0, 0], name: 'A', stockpile: { x: 1, y: 1 },
        meatStore: 999, plantStore: 999, cookedMeatStore: 999, driedFruitStore: 999,
        woodStore: 999, goldStore: 0,
      }],
      grass: emptyGrass(10), log: [],
      goldDeposits: [{ id: 'g1', position: { x: 5, y: 5 }, remaining: 6 }],
      entities: [{
        id: 'm1', name: 'Miner', position: { x: 1, y: 1 }, gender: 'male',
        activity: { kind: 'idle' },
        age: 25 * T, maxAge: 100 * T, color: [255, 0, 0],
        energy: 100, traits: { strength: 50, dexterity: 50, intelligence: 50 },
        tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
      }],
    };
    let state = world;
    for (let i = 0; i < 600; i++) state = tick(state);
    expect(state.goldDeposits[0].remaining).toBe(0);
    expect(state.goldDeposits[0].depletedAt).toBeDefined();
    expect(state.villages[0].goldStore).toBe(6);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/engine/__tests__/gold.test.ts`
Expected: PASS all gold tests.

- [ ] **Step 3: Full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all tests pass.

- [ ] **Step 4: Manual sanity run**

Run: `npm run dev`.

Let the simulation run for ~5 in-game years at max speed. Verify:
- Gold nuggets appear on some mountain tiles at start.
- After a while (when food stabilizes), miners visit them.
- `village.goldStore` increases in the Stats panel.
- Depleted deposits disappear from the canvas.

If mining never fires in practice: inspect score weights in Task 4, adjust `FOOD_COMFORT_DAYS` threshold or `scoreMineGold` base values, rerun.

- [ ] **Step 5: Commit**

```bash
git add src/engine/__tests__/gold.test.ts
git commit -m "test(gold): depletion exhausts deposit after N mining sessions"
```

---

## Post-implementation notes

After all tasks land:

- **What's ready for later plans:** `village.goldStore` exists and accumulates. The Research plan and Mercenary/Inter-tribe-rivalry plans can spend from it.
- **What isn't implemented:** Gold-driven combat (two miners from different tribes bumping → fight over deposit), mercenary hire, gold-for-wood or any trade. These are separate plans.
- **Known follow-ups:** Placeholder yellow-circle sprite — swap for Mini-Medieval sprite when picking from SlashIconsPage.

---

## Self-review checklist (completed)

1. **Spec coverage:** Gold-as-mineable-rock ✓, harvest-and-carry ✓, village storage ✓, accumulation/stacking ✓, mountain location ✓, out-of-scope items explicitly excluded ✓.
2. **Placeholder scan:** Every step has concrete code. One soft spot — Task 3 sprite is deliberately a placeholder (geometric shape, not sprite lookup), to avoid blocking on sprite selection. This is documented.
3. **Type consistency:** `GoldDeposit`, `goldStore`, `goldDeposits`, `ECONOMY.gold.unitsPerMine`, `ECONOMY.gold.depositCapacity`, `ECONOMY.gold.spawnBase`, Purpose `'mine'`, Action `'mining'`, AIAction `'go_mine'`, carrying `'gold'`, LogEventType `'mine'` — all spellings cross-reference consistently.

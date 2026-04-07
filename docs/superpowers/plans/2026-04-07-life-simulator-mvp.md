# Life Simulator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 30×30 grid-based life simulator where male and female entities move randomly, with play/pause controls and population stats.

**Architecture:** Pure TypeScript engine (no React/DOM dependencies) produces `WorldState` each tick. React renders state on HTML Canvas with a sidebar for stats and controls. Engine and UI are fully decoupled.

**Tech Stack:** Vite, React 18, TypeScript, HTML Canvas 2D API, Vitest (testing)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize Vite project with React + TypeScript**

```bash
cd /c/code/life
npm create vite@latest . -- --template react-ts
```

Select: React, TypeScript when prompted. If the directory is not empty, confirm overwrite.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install -D vitest
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts on localhost, shows default React page.

- [ ] **Step 6: Verify tests run**

```bash
npm test
```

Expected: vitest runs (0 tests or default test passes).

- [ ] **Step 7: Initialize git and commit**

```bash
cd /c/code/life
git init
echo "node_modules\ndist\n.superpowers/" > .gitignore
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project with Vitest"
```

---

### Task 2: Engine Types

**Files:**
- Create: `src/engine/types.ts`

- [ ] **Step 1: Create types file**

Create `src/engine/types.ts`:

```typescript
export type Gender = 'male' | 'female';

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Position;
  gender: Gender;
}

export interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add engine type definitions"
```

---

### Task 3: Movement Logic

**Files:**
- Create: `src/engine/movement.ts`
- Create: `src/engine/__tests__/movement.test.ts`

- [ ] **Step 1: Write failing tests for randomStep**

Create `src/engine/__tests__/movement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { randomStep } from '../movement';

describe('randomStep', () => {
  it('returns a position within grid bounds', () => {
    const gridSize = 30;
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 15, y: 15 }, gridSize);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThan(gridSize);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeLessThan(gridSize);
    }
  });

  it('moves exactly one step in a cardinal direction', () => {
    const pos = { x: 15, y: 15 };
    for (let i = 0; i < 100; i++) {
      const result = randomStep(pos, 30);
      const dx = Math.abs(result.x - pos.x);
      const dy = Math.abs(result.y - pos.y);
      // Moves exactly 1 step in one axis, 0 in the other
      expect(dx + dy).toBe(1);
    }
  });

  it('clamps to grid when at top-left corner (0,0)', () => {
    // At corner, some directions are invalid — should clamp
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 0, y: 0 }, 30);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps to grid when at bottom-right corner', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 29, y: 29 }, 30);
      expect(result.x).toBeLessThan(30);
      expect(result.y).toBeLessThan(30);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `randomStep` not found.

- [ ] **Step 3: Implement randomStep**

Create `src/engine/movement.ts`:

```typescript
import type { Position } from './types';

const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 }, // up
  { x: 0, y: 1 },  // down
  { x: -1, y: 0 }, // left
  { x: 1, y: 0 },  // right
];

export function randomStep(position: Position, gridSize: number): Position {
  const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return {
    x: Math.max(0, Math.min(gridSize - 1, position.x + dir.x)),
    y: Math.max(0, Math.min(gridSize - 1, position.y + dir.y)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 4 tests PASS.

Note: The "moves exactly one step" test will occasionally fail for corner positions where clamping results in dx+dy=0. But we only test from (15,15) center so this is fine. The corner tests verify bounds only.

- [ ] **Step 5: Commit**

```bash
git add src/engine/movement.ts src/engine/__tests__/movement.test.ts
git commit -m "feat: implement randomStep movement with tests"
```

---

### Task 4: World Logic

**Files:**
- Create: `src/engine/world.ts`
- Create: `src/engine/__tests__/world.test.ts`

- [ ] **Step 1: Write failing tests for world**

Create `src/engine/__tests__/world.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createWorld, tick } from '../world';

describe('createWorld', () => {
  it('creates world with correct grid size', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.gridSize).toBe(30);
  });

  it('creates the specified number of entities', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.entities).toHaveLength(20);
  });

  it('creates roughly equal male/female split', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const males = world.entities.filter(e => e.gender === 'male');
    const females = world.entities.filter(e => e.gender === 'female');
    expect(males.length).toBe(10);
    expect(females.length).toBe(10);
  });

  it('places all entities within grid bounds', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    for (const entity of world.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });

  it('starts at tick 0', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.tick).toBe(0);
  });

  it('assigns unique IDs to all entities', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const ids = world.entities.map(e => e.id);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('tick', () => {
  it('increments tick counter', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next.tick).toBe(1);
  });

  it('preserves entity count', () => {
    const world = createWorld({ gridSize: 30, entityCount: 10 });
    const next = tick(world);
    expect(next.entities).toHaveLength(10);
  });

  it('returns a new state object (immutable)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next).not.toBe(world);
    expect(next.entities).not.toBe(world.entities);
  });

  it('keeps all entities within bounds after tick', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const next = tick(world);
    for (const entity of next.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `createWorld` and `tick` not found.

- [ ] **Step 3: Implement world module**

Create `src/engine/world.ts`:

```typescript
import type { Entity, WorldState } from './types';
import { randomStep } from './movement';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
}

let nextId = 0;

function generateId(): string {
  return `entity-${nextId++}`;
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount } = options;
  const entities: Entity[] = [];

  for (let i = 0; i < entityCount; i++) {
    entities.push({
      id: generateId(),
      position: {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      },
      gender: i < entityCount / 2 ? 'male' : 'female',
    });
  }

  return { entities, tick: 0, gridSize };
}

export function tick(state: WorldState): WorldState {
  return {
    ...state,
    tick: state.tick + 1,
    entities: state.entities.map(entity => ({
      ...entity,
      position: randomStep(entity.position, state.gridSize),
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS (movement + world).

- [ ] **Step 5: Commit**

```bash
git add src/engine/world.ts src/engine/__tests__/world.test.ts
git commit -m "feat: implement world creation and tick logic with tests"
```

---

### Task 5: Canvas Grid Renderer

**Files:**
- Create: `src/ui/GridCanvas.tsx`

- [ ] **Step 1: Create GridCanvas component**

Create `src/ui/GridCanvas.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import type { WorldState } from '../engine/types';

const MALE_COLOR = '#7aa2f7';
const FEMALE_COLOR = '#f7768e';
const GRID_BG = '#1a1b26';
const GRID_LINE = '#2a2b36';

interface GridCanvasProps {
  world: WorldState;
  size: number; // canvas width/height in pixels
}

export function GridCanvas({ world, size }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = size / world.gridSize;

    // Background
    ctx.fillStyle = GRID_BG;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= world.gridSize; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Entities
    for (const entity of world.entities) {
      const cx = entity.position.x * cellSize + cellSize / 2;
      const cy = entity.position.y * cellSize + cellSize / 2;
      const radius = cellSize * 0.35;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = entity.gender === 'male' ? MALE_COLOR : FEMALE_COLOR;
      ctx.fill();
    }
  }, [world, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: '4px' }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/GridCanvas.tsx
git commit -m "feat: implement Canvas grid renderer"
```

---

### Task 6: Stats Component

**Files:**
- Create: `src/ui/Stats.tsx`

- [ ] **Step 1: Create Stats component**

Create `src/ui/Stats.tsx`:

```tsx
import type { WorldState } from '../engine/types';

interface StatsProps {
  world: WorldState;
}

export function Stats({ world }: StatsProps) {
  const males = world.entities.filter(e => e.gender === 'male').length;
  const females = world.entities.filter(e => e.gender === 'female').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={panelStyle}>
        <div style={labelStyle}>Populacja</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {world.entities.length}
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          <span style={{ color: '#7aa2f7' }}>&#9794; {males}</span>
          {'  '}
          <span style={{ color: '#f7768e' }}>&#9792; {females}</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Tura</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{world.tick}</div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '8px',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/Stats.tsx
git commit -m "feat: add Stats component for population and tick display"
```

---

### Task 7: Controls Component

**Files:**
- Create: `src/ui/Controls.tsx`

- [ ] **Step 1: Create Controls component**

Create `src/ui/Controls.tsx`:

```tsx
interface ControlsProps {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
}

export function Controls({ running, speed, onToggle, onSpeedChange }: ControlsProps) {
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Kontrolki</div>
      <button onClick={onToggle} style={buttonStyle(running)}>
        {running ? '⏸ Pause' : '▶ Play'}
      </button>
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          Szybkość: {speed}ms
        </div>
        <input
          type="range"
          min={50}
          max={1000}
          step={50}
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '8px',
};

function buttonStyle(running: boolean): React.CSSProperties {
  return {
    background: running ? '#333' : '#9ece6a',
    color: running ? '#ccc' : '#1a1b26',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/Controls.tsx
git commit -m "feat: add Controls component with play/pause and speed slider"
```

---

### Task 8: App Component — Wire Everything Together

**Files:**
- Create: `src/ui/App.tsx`
- Modify: `src/main.tsx`
- Modify: `index.html`

- [ ] **Step 1: Create App component**

Create `src/ui/App.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { createWorld, tick } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import type { WorldState } from '../engine/types';

const CANVAS_SIZE = 600;

export function App() {
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld({ gridSize: 30, entityCount: 20 })
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const worldRef = useRef(world);
  worldRef.current = world;

  const step = useCallback(() => {
    setWorld(prev => tick(prev));
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(step, speed);
    return () => clearInterval(interval);
  }, [running, speed, step]);

  return (
    <div style={containerStyle}>
      <h1 style={{ margin: '0 0 16px', fontSize: '20px', color: '#ccc' }}>
        Symulator Życia
      </h1>
      <div style={layoutStyle}>
        <GridCanvas world={world} size={CANVAS_SIZE} />
        <div style={sidebarStyle}>
          <Stats world={world} />
          <Controls
            running={running}
            speed={speed}
            onToggle={() => setRunning(r => !r)}
            onSpeedChange={setSpeed}
          />
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: '#16161e',
  color: '#ccc',
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start',
};

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: '200px',
};
```

- [ ] **Step 2: Update main.tsx**

Replace contents of `src/main.tsx` with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Update index.html body style**

In `index.html`, add to the `<body>` tag:

```html
<body style="margin: 0; background: #16161e;">
```

- [ ] **Step 4: Remove default Vite boilerplate**

Delete the following files that are no longer needed:

```bash
rm -f src/App.tsx src/App.css src/index.css src/assets/react.svg public/vite.svg
```

- [ ] **Step 5: Run dev server and verify visually**

```bash
npm run dev
```

Expected: Browser shows dark page with "Symulator Życia" title, 30×30 grid with blue and pink circles, sidebar with population stats and controls. Clicking Play starts movement, speed slider adjusts interval.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up App with Canvas grid, stats, and controls"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass (movement + world).

- [ ] **Step 2: Run dev server and verify full flow**

```bash
npm run dev
```

Verify:
1. Grid renders 30×30 with grid lines
2. 20 entities visible (blue + pink circles)
3. Click Play — entities move randomly each tick
4. Click Pause — movement stops
5. Speed slider changes tick interval
6. Population counter shows 20 (10♂ + 10♀)
7. Tick counter increments

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: final MVP verification and fixes"
```

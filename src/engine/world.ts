import type { Entity, Position, WorldState } from './types';
import { randomStep } from './movement';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
}

let nextId = 0;

function generateId(): string {
  return `entity-${nextId++}`;
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

/** Returns all 4 orthogonal neighbors clamped to grid bounds (may include duplicates at edges — filtered by Set). */
function neighbors(p: Position, gridSize: number): Position[] {
  const candidates: Position[] = [
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ];
  return candidates.filter(
    c => c.x >= 0 && c.x < gridSize && c.y >= 0 && c.y < gridSize,
  );
}

/** Shuffle array in place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
      state: 'idle',
    });
  }

  return { entities, tick: 0, gridSize };
}

export function tick(state: WorldState): WorldState {
  const { gridSize } = state;

  // --- Step 1: Complete matings ---
  // Entities currently in 'mating' state → become 'idle' and spawn a new baby.
  const matingPairs = new Map<string, Entity[]>();

  for (const entity of state.entities) {
    if (entity.state === 'mating') {
      const key = posKey(entity.position);
      const group = matingPairs.get(key) ?? [];
      group.push(entity);
      matingPairs.set(key, group);
    }
  }

  // Resolve mating: for each tile with mating entities, pick the first male+female pair,
  // mark them idle, and spawn a baby.
  const resolvedIds = new Set<string>();
  const newbornIds = new Set<string>();
  const babies: Entity[] = [];

  for (const [, group] of matingPairs) {
    const male = group.find(e => e.gender === 'male');
    const female = group.find(e => e.gender === 'female');
    if (male && female) {
      resolvedIds.add(male.id);
      resolvedIds.add(female.id);

      // Find a neighboring tile with < 2 occupants for the baby.
      // Use a temporary occupancy snapshot (all current entities).
      const tempOccupancy = new Map<string, number>();
      for (const e of state.entities) {
        const k = posKey(e.position);
        tempOccupancy.set(k, (tempOccupancy.get(k) ?? 0) + 1);
      }

      const birthPos = (() => {
        const ns = neighbors(male.position, gridSize);
        const free = ns.filter(n => (tempOccupancy.get(posKey(n)) ?? 0) < 2);
        if (free.length > 0) {
          return free[Math.floor(Math.random() * free.length)];
        }
        // All neighbors full — spawn on parent tile (edge case)
        return { ...male.position };
      })();

      const babyId = generateId();
      newbornIds.add(babyId);
      babies.push({
        id: babyId,
        position: birthPos,
        gender: Math.random() < 0.5 ? 'male' : 'female',
        state: 'idle',
      });
    }
  }

  // Build the updated entity list after mating resolution (parents → idle).
  // Track "just resolved" IDs so they don't immediately re-enter mating this tick.
  const justResolvedIds = new Set(resolvedIds);

  const afterMatingEntities: Entity[] = state.entities.map(entity => {
    if (resolvedIds.has(entity.id)) {
      return { ...entity, state: 'idle' as const };
    }
    return entity;
  });

  // Add babies
  const withBabies = [...afterMatingEntities, ...babies];

  // --- Step 2: Build occupancy map ---
  const occupancy = new Map<string, number>();
  for (const entity of withBabies) {
    const key = posKey(entity.position);
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  }

  // --- Step 3: Detect new mating pairs ---
  // For each tile with exactly 1 idle male + 1 idle female → set both to 'mating'.
  const tileEntities = new Map<string, Entity[]>();
  for (const entity of withBabies) {
    const key = posKey(entity.position);
    const group = tileEntities.get(key) ?? [];
    group.push(entity);
    tileEntities.set(key, group);
  }

  const newMatingIds = new Set<string>();
  for (const [, group] of tileEntities) {
    // Skip entities that just finished mating — they can't immediately re-mate this tick.
    const idleMales = group.filter(
      e => e.gender === 'male' && e.state === 'idle' && !justResolvedIds.has(e.id),
    );
    const idleFemales = group.filter(
      e => e.gender === 'female' && e.state === 'idle' && !justResolvedIds.has(e.id),
    );
    if (idleMales.length >= 1 && idleFemales.length >= 1) {
      newMatingIds.add(idleMales[0].id);
      newMatingIds.add(idleFemales[0].id);
    }
  }

  const afterMatingDetection: Entity[] = withBabies.map(entity => {
    if (newMatingIds.has(entity.id)) {
      return { ...entity, state: 'mating' as const };
    }
    return entity;
  });

  // --- Step 4: Move idle entities ---
  // Process in random order to avoid positional bias.
  const shuffled = shuffle([...afterMatingDetection.map((_, i) => i)]);
  const result: Entity[] = [...afterMatingDetection];

  // Rebuild occupancy for movement (reflects current positions after steps 1–3).
  const moveOccupancy = new Map<string, number>();
  for (const entity of afterMatingDetection) {
    const key = posKey(entity.position);
    moveOccupancy.set(key, (moveOccupancy.get(key) ?? 0) + 1);
  }

  for (const idx of shuffled) {
    const entity = result[idx];
    // Skip mating entities and newborns (newborns don't move the tick they're born)
    if (entity.state !== 'idle') continue;
    if (newbornIds.has(entity.id)) continue;

    const target = randomStep(entity.position, gridSize);
    const targetKey = posKey(target);
    const currentKey = posKey(entity.position);

    if ((moveOccupancy.get(targetKey) ?? 0) < 2) {
      // Move: update occupancy
      moveOccupancy.set(currentKey, (moveOccupancy.get(currentKey) ?? 1) - 1);
      moveOccupancy.set(targetKey, (moveOccupancy.get(targetKey) ?? 0) + 1);
      result[idx] = { ...entity, position: target };
    }
    // Otherwise: entity stays put (tile is full)
  }

  return {
    ...state,
    tick: state.tick + 1,
    entities: result,
  };
}

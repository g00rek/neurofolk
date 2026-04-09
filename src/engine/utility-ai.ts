import type { Entity, EntityGoal, Position, Animal, Plant, Village, Biome } from './types';
import {
  CHILD_AGE,
  ANIMAL_HUNT_MIN_POPULATION,
  FOOD_RESERVE_MAX,
  FOOD_RESERVE_MIN,
  FOOD_RESERVE_PER_PERSON,
  HUNGER_THRESHOLD,
  PLANT_DETECTION_MULTIPLIER,
  PLANT_RESERVE_MIN,
  TICKS_PER_DAY,
  DAY_TICKS,
} from './types';
import { ageInYears } from './world';

// --- Action types ---
export type AIAction =
  | { type: 'rest' }
  | { type: 'eat' }
  | { type: 'go_chop'; target: Position }
  | { type: 'go_hunt'; target: Position }
  | { type: 'return_home' }
  | { type: 'go_gather'; target: Position }
  | { type: 'leave_village' }   // walk toward edge to exit
  | { type: 'wander' }
  | { type: 'play' };           // random step within village (children)

// --- Context for scoring ---
export interface AIContext {
  entity: Entity;
  village?: Village;
  inVillage: boolean;
  isNight: boolean;
  nearestAnimal?: { pos: Position; dist: number };
  nearestPlant?: { pos: Position; dist: number };
  nearestForest?: { pos: Position; dist: number };
  hasPartnerInVillage: boolean;
  tribePopulation: number;
  animalPopulation: number;
}

const NIGHT_HUNT_MEAT_THRESHOLD = 20;
const NIGHT_HUNT_MIN_ENERGY = 35;
const PANIC_MEAT_THRESHOLD = 20;
const PANIC_PLANT_THRESHOLD = 20;

// --- Scoring functions (0-1, higher = more urgent) ---

function foodReserveTarget(ctx: AIContext): number {
  return Math.min(FOOD_RESERVE_MAX, Math.max(FOOD_RESERVE_MIN, ctx.tribePopulation * FOOD_RESERVE_PER_PERSON));
}

function totalVillageFood(ctx: AIContext): number {
  if (!ctx.village) return 0;
  return ctx.village.meatStore + ctx.village.plantStore;
}

function survivalForageAction(ctx: AIContext, survivalScore: number): AIAction | undefined {
  if (survivalScore === 0) return undefined;

  if (ctx.entity.gender === 'female') {
    if (ctx.nearestPlant) return { type: 'go_gather', target: ctx.nearestPlant.pos };
    if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };
  }

  if (ctx.entity.gender === 'male'
      && ctx.animalPopulation > ANIMAL_HUNT_MIN_POPULATION
      && ctx.nearestAnimal) {
    return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
  }

  if (ctx.entity.gender === 'male') {
    if (ctx.nearestPlant) return { type: 'go_gather', target: ctx.nearestPlant.pos };
    if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };
  }

  if (!ctx.inVillage && ctx.village && totalVillageFood(ctx) > 0) {
    return { type: 'return_home' };
  }

  if (!ctx.inVillage) return { type: 'wander' };
  return undefined;
}

function scoreSurvival(ctx: AIContext): number {
  const hungerThreshold = ctx.entity.hungerThreshold ?? HUNGER_THRESHOLD;
  if (ctx.entity.energy < 20) return 1.0;
  if (ctx.entity.energy < hungerThreshold) return 0.6;
  return 0;
}

function scoreBuildHome(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (ctx.entity.homeId) return 0;
  if (!ctx.entity.partnerId) return 0; // need partner first
  // Need wood in warehouse
  if (!ctx.village || ctx.village.woodStore < 5) return 0; // not enough wood yet → go chop
  return 0.9; // high priority — get back to village to build
}

function scoreChopFirewood(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const WOOD_MAX = 30;
  if (ctx.village.woodStore >= WOOD_MAX) return 0;
  const woodNeed = (WOOD_MAX - ctx.village.woodStore) / WOOD_MAX;
  return woodNeed * 0.5; // lower priority than hunting
}

function scoreHunt(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.animalPopulation <= ANIMAL_HUNT_MIN_POPULATION) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  if (totalFood >= target) return 0;
  const foodNeed = (target - totalFood) / target;
  const panicBoost = ctx.village.meatStore < PANIC_MEAT_THRESHOLD ? 0.25 : 0;
  return Math.min(1, foodNeed * 0.9 + panicBoost);
}

function scoreGather(ctx: AIContext): number {
  if (ctx.entity.gender !== 'female') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  const plantReserveNeed = Math.max(0, (PLANT_RESERVE_MIN - ctx.village.plantStore) / PLANT_RESERVE_MIN);
  const foodNeed = Math.max(0, (target - totalFood) / target, plantReserveNeed * 0.8);
  if (foodNeed === 0) return 0;
  const panicBoost = ctx.village.plantStore < PANIC_PLANT_THRESHOLD ? 0.2 : 0;
  return Math.min(1, foodNeed * 0.6 + panicBoost);
}

function scoreReturnHome(ctx: AIContext): number {
  if (!ctx.village || ctx.inVillage) return 0;
  return 0.4;
}

// --- Main decision function ---

// Exposed for debug
export function getScores(ctx: AIContext): Record<string, number> {
  return {
    survival: scoreSurvival(ctx),
    buildHome: scoreBuildHome(ctx),
    firewood: scoreChopFirewood(ctx),
    hunt: scoreHunt(ctx),
    gather: scoreGather(ctx),
    returnHome: scoreReturnHome(ctx),
  };
}

export function decideAction(ctx: AIContext): AIAction {
  const e = ctx.entity;

  // Children: return if outside village, wander inside village
  if (ageInYears(e) < CHILD_AGE) {
    if (!ctx.inVillage && ctx.village) return { type: 'return_home' };
    return { type: 'play' }; // run around in village
  }

  const survScore = scoreSurvival(ctx);
  const survivalAction = survivalForageAction(ctx, survScore);

  // Night: everyone returns home, in village = rest. Hungry adults can still forage.
  if (ctx.isNight) {
    if (survivalAction) return survivalAction;
    const isAdultMale = e.gender === 'male' && ageInYears(e) >= CHILD_AGE;
    const canNightHunt = !!ctx.village
      && !ctx.inVillage
      && isAdultMale
      && e.energy >= NIGHT_HUNT_MIN_ENERGY
      && ctx.village.meatStore < NIGHT_HUNT_MEAT_THRESHOLD;
    if (canNightHunt) {
      if (ctx.nearestAnimal) return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
      return { type: 'wander' };
    }
    if (!ctx.inVillage && ctx.village) return { type: 'return_home' };
    return { type: 'rest' };
  }

  // Score all actions
  const scores: Array<{ score: number; action: () => AIAction }> = [];

  // Survival — direct food in the field first; pantry/home is fallback.
  if (survivalAction) {
    scores.push({ score: survScore, action: () => survivalAction });
  }

  // Build home
  const buildScore = scoreBuildHome(ctx);
  if (buildScore > 0) {
    if (!ctx.inVillage) {
      scores.push({ score: buildScore, action: () => ({ type: 'return_home' }) });
    } else {
      // In village, will be detected as 'building' by tick logic
      scores.push({ score: buildScore, action: () => ({ type: 'rest' }) });
    }
  }

  // Hunt
  const huntScore = scoreHunt(ctx);
  if (huntScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: huntScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestAnimal) {
      scores.push({ score: huntScore, action: () => ({ type: 'go_hunt', target: ctx.nearestAnimal!.pos }) });
    } else {
      // No prey in sight outside village — search local area instead of only pushing farther out
      scores.push({ score: huntScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Gather
  const gatherScore = scoreGather(ctx);
  if (gatherScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: gatherScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestPlant) {
      scores.push({ score: gatherScore, action: () => ({ type: 'go_gather', target: ctx.nearestPlant!.pos }) });
    } else if (ctx.nearestForest) {
      scores.push({ score: gatherScore * 0.9, action: () => ({ type: 'go_gather', target: ctx.nearestForest!.pos }) });
    } else {
      // No plants or forest in sight outside village — search nearby area instead of drifting away forever.
      scores.push({ score: gatherScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Chop firewood
  const firewoodScore = scoreChopFirewood(ctx);
  if (firewoodScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: firewoodScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestForest) {
      scores.push({ score: firewoodScore, action: () => ({ type: 'go_chop', target: ctx.nearestForest!.pos }) });
    } else {
      scores.push({ score: firewoodScore * 0.8, action: () => ({ type: 'leave_village' }) });
    }
  }

  // Return home (low priority default for outside entities)
  const returnScore = scoreReturnHome(ctx);
  if (returnScore > 0) {
    scores.push({ score: returnScore, action: () => ({ type: 'return_home' }) });
  }

  // Default: stroll around village
  if (ctx.inVillage) {
    scores.push({ score: 0.02, action: () => ({ type: 'play' }) });
  }

  // Absolute fallback
  scores.push({ score: 0.01, action: () => ({ type: 'rest' }) });

  // Pick highest score
  scores.sort((a, b) => b.score - a.score);
  return scores[0].action();
}

// --- Build context from world state ---

export function buildAIContext(
  entity: Entity,
  villages: Village[],
  animals: Animal[],
  plants: Plant[],
  entities: Entity[],
  biomes: Biome[][],
  gridSize: number,
  tick: number = 0,
): AIContext {
  const village = villages.find(v => v.tribe === entity.tribe);
  const inVillage = !!village && (
    Math.abs(entity.position.x - village.center.x) + Math.abs(entity.position.y - village.center.y) <= village.radius
  );

  const sense = Math.floor(3 + entity.traits.perception * 2);

  // Find nearest animal
  let nearestAnimal: AIContext['nearestAnimal'];
  for (const a of animals) {
    const d = Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestAnimal || d < nearestAnimal.dist)) {
      nearestAnimal = { pos: a.position, dist: d };
    }
  }

  // Find nearest mature plant
  let nearestPlant: AIContext['nearestPlant'];
  const plantSense = sense * PLANT_DETECTION_MULTIPLIER;
  for (const p of plants) {
    if (p.portions <= 0) continue;
    const d = Math.abs(p.position.x - entity.position.x) + Math.abs(p.position.y - entity.position.y);
    if (d > 0 && d <= plantSense && (!nearestPlant || d < nearestPlant.dist)) {
      nearestPlant = { pos: p.position, dist: d };
    }
  }

  // Find nearest forest tile. Adults know the surrounding terrain well enough
  // to head toward forest even when no fruiting plant is currently visible.
  let nearestForest: AIContext['nearestForest'];
  for (let ny = 0; ny < gridSize; ny++) {
    for (let nx = 0; nx < gridSize; nx++) {
      if (biomes[ny][nx] === 'forest') {
        const d = Math.abs(nx - entity.position.x) + Math.abs(ny - entity.position.y);
        if (d > 0 && (!nearestForest || d < nearestForest.dist)) {
          nearestForest = { pos: { x: nx, y: ny }, dist: d };
        }
      }
    }
  }

  // Has partner in village
  const hasPartnerInVillage = entity.homeId
    ? entities.some(o => o.id !== entity.id && o.homeId === entity.homeId && o.state === 'idle')
    : false;

  const isNight = (tick % TICKS_PER_DAY) >= DAY_TICKS;
  const tribePopulation = village
    ? entities.filter(e => e.tribe === village.tribe).length
    : 0;
  return {
    entity,
    village,
    inVillage,
    isNight,
    nearestAnimal,
    nearestPlant,
    nearestForest,
    hasPartnerInVillage,
    tribePopulation,
    animalPopulation: animals.length,
  };
}

export function actionToGoal(action: AIAction, ctx: AIContext): EntityGoal | undefined {
  switch (action.type) {
    case 'go_hunt': return { type: 'hunt', target: action.target };
    case 'go_gather': return { type: 'gather', target: action.target };
    case 'go_chop': return { type: 'chop', target: action.target };
    case 'return_home': return { type: 'return_home', target: ctx.village?.center };
    case 'leave_village': {
      // Pick a point outside village to walk toward
      if (!ctx.village) return undefined;
      const vc = ctx.village.center;
      const dx = ctx.entity.position.x - vc.x;
      const dy = ctx.entity.position.y - vc.y;
      // Push outward from village center
      const tx = vc.x + (dx || 1) * 3;
      const ty = vc.y + (dy || 1) * 3;
      return { type: 'hunt', target: { x: tx, y: ty } };
    }
    default: return undefined;
  }
}

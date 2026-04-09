import { describe, it, expect } from 'vitest';
import { buildAIContext, decideAction } from '../utility-ai';
import type { AIContext } from '../utility-ai';
import type { Entity } from '../types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    position: { x: 5, y: 5 },
    gender: 'female',
    state: 'idle',
    stateTimer: 0,
    age: 20 * 2400,
    maxAge: 60 * 2400,
    color: [100, 100, 100],
    energy: 80,
    traits: {
      strength: 5,
      speed: 1,
      perception: 2,
      metabolism: 1.0,
      aggression: 3,
      fertility: 1.0,
      twinChance: 0,
    },
    meat: 0,
    tribe: 0,
    birthCooldown: 0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AIContext> = {}): AIContext {
  const village = {
    tribe: 0,
    center: { x: 5, y: 5 },
    radius: 3,
    color: [220, 60, 60] as [number, number, number],
    name: 'Red Tribe',
    meatStore: 5,
    plantStore: 0,
    woodStore: 5,
  };
  return {
    entity: makeEntity(),
    village,
    inVillage: true,
    isNight: false,
    hasPartnerInVillage: false,
    tribePopulation: 12,
    animalPopulation: 30,
    ...overrides,
  };
}

describe('decideAction gather behavior', () => {
  it('female outside village with no visible plants wanders to search', () => {
    const action = decideAction(makeContext({ inVillage: false, nearestPlant: undefined }));
    expect(action.type).toBe('wander');
  });

  it('female in village leaves village when pantry needs plants', () => {
    const action = decideAction(makeContext({ inVillage: true, nearestPlant: undefined }));
    expect(action.type).toBe('leave_village');
  });

  it('female stays in village when total food and plant reserves are enough', () => {
    const action = decideAction(
      makeContext({
        inVillage: true,
        village: {
          tribe: 0,
          center: { x: 5, y: 5 },
          radius: 3,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 60,
          plantStore: 20,
          woodStore: 30,
        },
      }),
    );
    expect(action.type).toBe('play');
  });

  it('detects fruiting plants beyond normal perception range', () => {
    const entity = makeEntity({
      position: { x: 5, y: 5 },
      traits: {
        strength: 5,
        speed: 1,
        perception: 1,
        metabolism: 1.0,
        aggression: 3,
        fertility: 1.0,
        twinChance: 0,
      },
    });
    const village = {
      tribe: 0,
      center: { x: 5, y: 5 },
      radius: 3,
      color: [220, 60, 60] as [number, number, number],
      name: 'Red Tribe',
      meatStore: 5,
      plantStore: 0,
      woodStore: 5,
    };
    const biomes = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'plains' as const));
    const ctx = buildAIContext(
      entity,
      [village],
      [],
      [{ id: 'p1', position: { x: 13, y: 5 }, portions: 1, maxPortions: 5 }],
      [entity],
      biomes,
      20,
    );

    expect(ctx.nearestPlant?.dist).toBe(8);
  });
});

describe('decideAction hunt behavior', () => {
  it('male without home can still choose go_hunt when prey is visible outside village', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          homeId: undefined,
          partnerId: undefined,
        }),
        inVillage: false,
        nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
        nearestForest: undefined,
      }),
    );
    expect(action.type).toBe('go_hunt');
  });

  it('male outside village with no visible prey wanders to search', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          homeId: undefined,
        }),
        inVillage: false,
        nearestAnimal: undefined,
      }),
    );
    expect(action.type).toBe('wander');
  });

  it('hungry male gathers plants for survival when prey is unavailable', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 10,
        }),
        inVillage: false,
        nearestAnimal: undefined,
        nearestPlant: { pos: { x: 7, y: 5 }, dist: 2 },
      }),
    );
    expect(action.type).toBe('go_gather');
  });

  it('male does not hunt when total food reserve is enough', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({ gender: 'male' }),
        inVillage: false,
        nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
        village: {
          tribe: 0,
          center: { x: 5, y: 5 },
          radius: 3,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 60,
          plantStore: 5,
          woodStore: 30,
        },
      }),
    );
    expect(action.type).toBe('return_home');
  });

  it('male at night hunts when village meat is low and energy is safe', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 80,
        }),
        isNight: true,
        inVillage: false,
        nearestAnimal: { pos: { x: 8, y: 5 }, dist: 3 },
        village: {
          tribe: 0,
          center: { x: 5, y: 5 },
          radius: 3,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 5,
          plantStore: 10,
          woodStore: 5,
        },
      }),
    );
    expect(action.type).toBe('go_hunt');
  });

  it('hungry male at night hunts for survival when prey is visible', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 20,
        }),
        isNight: true,
        inVillage: false,
        nearestAnimal: { pos: { x: 8, y: 5 }, dist: 3 },
        village: {
          tribe: 0,
          center: { x: 5, y: 5 },
          radius: 3,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 5,
          plantStore: 10,
          woodStore: 5,
        },
      }),
    );
    expect(action.type).toBe('go_hunt');
  });
});

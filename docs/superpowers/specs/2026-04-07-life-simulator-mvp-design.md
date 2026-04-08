# SimLife — Life & Evolution Simulator

## Overview

Grid-based sandbox simulator of tribal life, evolution, and survival. Three villages compete for resources on a procedurally generated map with biomes. Entities hunt, gather, build houses, fight, mate, and pass genetic traits to offspring.

## Stack

- **Vite** — bundler / dev server
- **React 18** — UI panels, controls
- **TypeScript** — type safety
- **HTML Canvas 2D** — grid rendering (planned migration to PixiJS)

## Time Scale

| Unit | Ticks | Notes |
|------|-------|-------|
| 1 step/tick | 1 | Entity moves 1-3 tiles (speed trait) |
| 1 day | 10 | Enough for a hunting trip |
| 1 month | 100 | 10 days |
| 1 season | 300 | 3 months |
| 1 year | 1200 | 4 seasons, 12 months |

## Map

- **Grid:** 50×50 tiles
- **Biomes:** Procedurally generated (layered noise)
  - Plains (passable, default)
  - Forest (passable, more plants, speed penalty)
  - Mountain (impassable — except ronins)
  - Water (impassable)
- Villages clear a buffer zone around them (no mountains within 3 tiles)

## Villages & Tribes

- **3 starting tribes:** Red, Green, Blue — each with 1M + 1F
- Village radius: 5 (Manhattan distance)
- **Palisade borders** drawn in tribe color
- Entities can only enter own village territory
- **Pantry system:** communal meatStore + plantStore per village
- **Houses:** males chop wood (forest → plains) and build houses in village
  - Mating requires male to own a house
  - Female moves into male's house

### Ronins

- Children of mixed-tribe parents (tribe = -1)
- Can traverse mountains (others can't)
- 3+ ronins on mountain tile → found new village (mountain cleared)
- Attacked by everyone on neutral ground

## Entities

### Properties

```typescript
interface Entity {
  id, position, gender, state, stateTimer,
  age, maxAge, color, energy,
  traits: Traits,
  meat: number,        // personal (ronins only)
  tribe: TribeId,
  homeId?: string,     // house this entity lives in
  carryingWood: boolean,
  // pregnancy data:
  partnerTraits?, partnerColor?, partnerTribe?
}
```

### States

| State | Duration | Description |
|-------|----------|-------------|
| idle | - | Default, moves per priorities |
| mating | 1 tick | Instant, triggers pregnancy |
| pregnant | 600 ticks (~6 months) | Female carries child |
| fighting | 5 ticks | Non-lethal, both lose energy |
| training | 3 ticks | Same-tribe males spar, +stats |
| hunting | 0 (instant) | Kill animal on contact |
| gathering | 0 (instant) | Pick plant on contact |
| chopping | 5 ticks | Chop forest tile for wood |
| building | 20 ticks | Build house in village |

### Lifecycle

- **Childhood:** 0-5 years (600 ticks) — stay in village, no energy drain
- **Reproductive age:** 15-45 years
- **Max age:** 50-70 years (adjusted by fertility trait)

### Behavior Priorities

**Males:**
1. Carrying wood → return to village, build
2. No house → go to forest, chop
3. In village + pantry low → go hunt (leave village, seek animals)
4. Outside + hunting → seek nearest animal (sense range), instant kill on contact
5. Outside + no target → return home
6. In village + pantry OK → rest (train with other males)

**Females:**
1. In village + pantry low → go gather (leave village, seek plants)
2. Outside → seek nearest mature plant, instant pick on contact
3. Outside + no target → return home
4. In village → rest

**Mating:** Automatic when male with house returns to village and his partner (or unhoused female) is idle + reproductive.

**Children:** Stay in village. If born outside → walk home.

## Genetics

### 7 Heritable Traits

| Trait | Range | Effect | Trade-off |
|-------|-------|--------|-----------|
| Strength | 1-10 | Fight chance, hunt speed | Energy drain |
| Speed | 1-3 | Tiles per tick | Energy drain |
| Perception | 1-5 | Sense range for food | Energy drain |
| Metabolism | 0.5-2.0 | Energy efficiency multiplier | |
| Aggression | 0-10 | Fight vs flee probability | Risk of death |
| Fertility | 0.5-2.0 | Shorter pregnancy | Shorter lifespan |
| Twin chance | 0-0.5 | Multiple births probability | More mouths |

### Inheritance

- Child = average of parents ± random mutation per trait
- **Rare dramatic mutation (3%):** one trait pushed to extreme
- Color derived from tribe (Red/Green/Blue/Gold for ronins)

### Training (non-inherited)

- Same-tribe males on same tile → sparring (3 ticks)
- +0.3 strength (50%), +0.1 speed (30%), +0.2 perception (20%)
- Personal improvement — not passed to children

## Resources

### Animals

- Start: 15, max: 40, reproduce on meeting (cooldown 600 ticks)
- Flee from humans (range 1)
- Move after humans (so hunters can catch them)
- Don't enter villages
- **Kill = 20 meat portions** deposited to village pantry

### Plants

- Start: 30, max: 80, respawn every 50 ticks
- Grow time: 600 ticks (green → red when mature)
- Don't spawn in villages
- Forest biome: +1 bonus plant per respawn interval
- **Pick = 1 plant portion** to village pantry

### Energy

- Max: 100, start: 80
- Drain: -1 every 100 ticks (~10 days), modified by traits
- Hungry (< 40): eat from pantry (meat first, then plants)
- Hungry entities drain 50% less (conserving energy)
- Children don't drain energy
- Meat: +50 energy, Plants: +35 energy

## Population Control

- **Overcrowding stress:** Mating energy cost rises when village pop > 12
- **Fights:** Non-lethal (-20 energy both), lethal only if energy drops to 0
- **Aggression:** Males decide to fight or flee (roll vs aggression/10)
- Only different tribes fight; same tribe trains

## UI

### Layout

- **Canvas** (900×900) — main grid view
- **Below canvas:** Population chart (per tribe) + Pantry bars
- **Sidebar:** Entity panel (on click), Stats, Trait averages, Activities, Controls

### Panels

- **Population:** Per-tribe breakdown (♂ adults, ♀ adults, 👶 children)
- **Time:** Year, Season (🌸🌞🍂❄), Month, Day, tick progress
- **Pantry:** Meat/plant bars per village (0-100%)
- **Activities:** Hunting, gathering, chopping, building, training counts + house count
- **Entity detail:** Click entity → full stats, traits with bars, state label
- **Controls:** Play/Pause, Reset, Speed slider (1-200ms)

### Extinction

- Simulation stops when population = 0
- Log saved to `logs/civ-{timestamp}.txt` via Vite dev server plugin
- Log contains: summary (births, deaths by cause) + full event history

## Files

```
src/
  engine/
    types.ts       — All types, constants, interfaces
    world.ts       — createWorld(), tick(), game logic
    movement.ts    — randomStep() (legacy, used by animal movement)
    biomes.ts      — Procedural biome generation, passability
  ui/
    App.tsx         — Main layout, state management, history tracking
    GridCanvas.tsx  — Canvas rendering (biomes, houses, plants, animals, entities)
    Stats.tsx       — Population, time, resources, activities panels
    Controls.tsx    — Play/Pause/Reset, speed slider
    EntityPanel.tsx — Clicked entity detail view
    PopGraph.tsx    — Multi-series line chart component
    TraitAverages.tsx — Average traits panel
    EventLog.tsx    — (unused, replaced by file logging)
  main.tsx
```

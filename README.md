# Neurofolk

A grid-based life & evolution simulator with Proto-Slavic civilizations. Watch autonomous entities hunt, gather, build homes, have children, and survive — or perish.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5273`

## What It Is

An idle/sandbox simulator where you observe autonomous entities living on a procedurally generated map. A single village starts with 2 men and 2 women. They hunt animals, gather plants, chop wood, build houses, mate, and raise children — all driven by a utility AI scoring system.

No player input — just watch, click entities for details, and adjust speed.

## Features

### World
- Configurable grid size (5–200, default 10×10)
- Procedural biomes: plains, forest, mountain, water
- Day/night cycle (10 ticks day + 10 ticks night)
- Four seasons with plant growth cycles
- Animals roam, reproduce, and flee from hunters
- All resource counts scale proportionally to map size

### Roles (Gender-Locked)

**Males:** hunt animals, chop wood, build houses, fight, train

**Females:** gather plants, give birth, store food in village pantry

**Children:** play near houses until age 3

Roles are defined in a central config (`ROLES`), not scattered if/else checks — ready for future neural network integration.

### Behavior System (Utility AI)
Each entity scores possible actions and picks the highest priority:

- **Periodic re-evaluation** — entities reassess their goals every 20 ticks (1 game day)
- **Hysteresis threshold (0.3)** — prevents ADHD-like switching; a new task must be significantly more urgent to interrupt the current one
- **Critical interrupt** — energy below 20 immediately overrides any goal
- **Night behavior** — everyone returns home; hungry entities forage

### Life Cycle
- Entities are born with Proto-Slavic names (50 male + 50 female)
- Childhood lasts 3 years (no work, no energy drain)
- Reproductive age: 12–40
- Pheromone mating: male in range + fertile female → 15% chance per tick
- Pregnancy ~30 days, 30% infant mortality, 5% maternal mortality
- Lifespan: 45–60 years (higher fertility = shorter life)

### Economy
- Males hunt animals (bow range 3 tiles, instant kill) → 60 meat portions
- Females gather from berry bushes → 10 plant portions
- Village pantry: hunters/gatherers deposit surplus, everyone eats from it
- Males chop forest tiles for wood → 3 wood per chop
- Houses cost 5 wood, built adjacent to existing structures

### Genetics
8 heritable traits with mutation:

| Trait | Range | Effect |
|-------|-------|--------|
| Strength | 1–10 | Fight outcomes |
| Speed | 1–3 | Tiles moved per tick |
| Perception | 1–5 | Detection range for food/resources |
| Metabolism | 0.5–2.0 | Energy drain rate |
| Aggression | 0–10 | Fight vs flee probability |
| Fertility | 0.5–2.0 | Pregnancy speed (trade-off: shorter life) |
| Twin chance | 0–0.5 | Multiple births probability |
| Pheromone range | 1–4 | Mating detection distance |

3% chance of dramatic mutation per birth.

### Map Configuration
The `/map` page lets you configure map generation:
- Grid size, water/forest/mountain percentages
- Full-width preview with live rendering
- Settings persist via localStorage and apply to new games

## UI

- **Canvas** — main grid with sprite-based terrain, houses, entities, animals
- **Event log** — real-time feed of births, deaths, hunts, fights, pregnancies, building
- **Entity panel** — click any entity for name, stats, traits, state
- **Stats** — population, time/season, resource bars
- **Population graph** — population over time
- **Controls** — Play/Pause, Reset, Speed slider

## Tech Stack

- Vite + React 19 + TypeScript
- HTML Canvas 2D with Mini-Medieval 8×8 sprites
- Utility AI with role-based scoring and hysteresis
- Procedural biome generation with cellular automata
- Vitest (63 tests)

## Architecture

```
src/
  engine/
    types.ts        — Types, constants, Entity/World interfaces
    world.ts        — createWorld(), tick(), game loop
    utility-ai.ts   — Scoring functions, ROLES config, hysteresis
    biomes.ts       — Procedural map generation
    names.ts        — 100 Proto-Slavic names (50M + 50F)
    movement.ts     — Pathfinding helpers
  ui/
    App.tsx          — Main layout, state management
    AppRouter.tsx    — Page routing (/, /map, /library, etc.)
    GridCanvas.tsx   — Canvas rendering with sprites
    EventLog.tsx     — Real-time event feed
    EntityPanel.tsx  — Entity detail panel
    MapPage.tsx      — Map configuration page
    Stats.tsx        — Population and resource panels
    terrain/
      renderer.ts       — Terrain sprite rendering
      waterAutotile.ts  — Wang 2-corner water autotiling
```

Engine is pure TypeScript with zero DOM dependencies — can run headless.

## Assets

Sprites (Mini-Medieval by [V3X3D](https://v3x3d.itch.io/)) are not included in the repo. Place them in `public/assets/mini-medieval/Mini-Medieval-8x8/` for local development.

## License

MIT

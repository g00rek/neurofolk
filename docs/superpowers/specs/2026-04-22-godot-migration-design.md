# Neurofolk → Godot Migration Design

**Date:** 2026-04-22
**Status:** Approved design, pending implementation plan
**Scope:** Rewrite Neurofolk (TypeScript/React/Canvas2D) as a Godot 4 project

## 1. Motivation

Three drivers, in priority order:

1. **Performance and scale (A).** Canvas 2D + single-threaded JS is starting to limit map size and entity count. Godot gives an order-of-magnitude headroom through TileMap batching, native 2D culling, and (if needed) C# on hot paths.
2. **Graphics and feel (B).** Shaders, dynamic day/night lighting, weather particles, smooth tweened movement, and layered effects are tedious or impractical to hand-roll in Canvas 2D.
3. **Craft and cleanup (F).** Two files have outgrown a single head — `world.ts` (1231 lines) and `utility-ai.ts` (839 lines). The migration is the excuse to split them into idiomatic, inspectable Godot units.

Explicitly NOT in scope right now: Steam/mobile export, turning the sandbox into a player-driven game.

## 2. Stack

- **Engine:** Godot 4.3+ (latest stable at time of work).
- **Primary language:** GDScript. Chosen over C# because:
  - Full editor integration (hot reload, in-inspector signal wiring, live property editing).
  - Better alignment with goal F (learning idiomatic Godot).
  - The jump from Canvas2D+JS to any Godot build gives far more headroom than the GDScript↔C# delta.
- **Escape hatch:** C# reserved for a single hot-path system if profiling shows GDScript is the bottleneck. Godot 4 supports mixing, so this is not a fork-in-the-road.
- **Testing:** GUT (Godot Unit Test). Ported tests cover engine logic only (genetics, phases, metabolism, interactions, demography). UI tests are dropped along with React.
- **Art:** Mini-Medieval 8×8 stays. Project viewport stretch mode `viewport` with integer scaling keeps pixels crisp.

## 3. Repository layout

- `/home/g00rek/neurofolk` (TypeScript) — **frozen on `main`**, tagged `v1-typescript-final`. Stays usable locally as a dev playground (the devtool pages `/water`, `/shore`, `/animals`, `/library`, `/slash-icons` are not being ported — they live on here).
- `/home/g00rek/neurofolk-godot` — **new repo, new GitHub remote**. Clean cut. Branch `main`.
- Commit style consistent with current Neurofolk conventions (`feat:`, `fix:`, `balance:`, `ui:`).

## 4. Scope decisions

**Ported:** core simulation, main `/` screen, `/map` configurator.

**Not ported:** `/library`, `/animals`, `/water`, `/shore`, `/slash-icons`. These are dev tools that solved specific problems (water autotiling, sprite browsing, animal behavior experiments). They did their job. Godot has native equivalents in its editor (TileSet editor, SpriteFrames, scene inspector), so reimplementing the playgrounds would be weeks wasted.

## 5. Architecture

### 5.1 Scene tree

```
World.tscn (Node2D, root)
├── TerrainLayer (TileMap)          biomes + Wang-terrain water autotile
├── StructuresLayer (TileMap)       houses, pantries
├── EntitiesLayer (Node2D)          dynamic sprites
│   └── Entity.tscn (×N)            one scene per living entity
├── EffectsLayer (CanvasLayer)      day/night shader, weather particles
├── Camera2D
└── UILayer (CanvasLayer)
    ├── Stats (Control)
    ├── EventLog (RichTextLabel)
    ├── EntityPanel (PanelContainer)
    ├── Controls (play/pause/speed)
    └── PopGraph (Control with custom _draw)
```

### 5.2 Autoload singletons

- **`Sim`** — simulation loop. Fixed-timestep accumulator in `_process(delta)`, advances world state by whole ticks. Replaces `world.ts`.
- **`Config`** — loads all configuration `Resource`s at boot (biomes, roles, trait ranges, phase timings).
- **`EventBus`** — global signals (`birth`, `death`, `hunt_succeeded`, `house_built`, `season_changed`, `long_winter_started`, `food_spoiled`). UI nodes listen without coupling to `Sim`.

### 5.3 Data as Resources (.tres), not hardcoded constants

- `BiomeConfig.tres` — per-biome spawn rates, plant regrowth, water rules.
- `RoleConfig.tres` — one per role (Male, Female, Child), listing available `ActionResource`s and their score weights.
- `TraitRange.tres` — ranges and mutation parameters for the eight heritable traits.
- `PhaseConfig.tres` — day/night length, season length, Long Winter trigger and duration, spoilage rates.

Inspector-editable. Balancing no longer requires re-reading 839 lines of TypeScript.

### 5.4 System-by-system mapping

| Current (TS) | Godot equivalent |
|---|---|
| `world.ts` tick loop | `Sim` autoload, fixed-timestep accumulator |
| `utility-ai.ts` scoring + hysteresis | `UtilityAI` class + `ActionResource` array per role |
| `biomes.ts` cellular automata | Same algorithm, output written to TileMap cells |
| `waterAutotile.ts` Wang 2-corner | **Removed.** Godot 4 TileSet Wang terrain sets handle this natively |
| `phases.ts` | `Sim.advance_phase()` emits signals; `EffectsLayer` reacts via shader params |
| `metabolism.ts`, `demography.ts`, `interactions.ts`, `action-resolver.ts` | Ported 1:1 in logic, as GDScript classes (`class_name`) |
| `animals-sim.ts` | `Animal.tscn` scene + the same core logic |
| `track-entity.ts` | Dropped. Replaced by Godot groups, raycasts, `get_overlapping_bodies` |
| `simulationWorker.ts` (Web Worker) | Dropped. If concurrency is needed later, Godot threading. |
| `GridCanvas.tsx` (725 lines of manual draw) | **Gone.** TileMap + Sprite2D do the job |
| React UI (EventLog, Stats, EntityPanel, Controls) | Control nodes subscribed to `EventBus` signals |
| `names.ts` (100 Proto-Slavic names) | Unchanged content, stored as `names.gd` or a `.tres` |
| Vitest (63 tests) | GUT, engine-only (~40 tests, UI/render tests dropped) |

### 5.5 Entity representation

Each living entity is its own scene instance (`Entity.tscn` as `Node2D` + `AnimatedSprite2D` + `Area2D` for proximity detection). This is the idiomatic Godot approach and handles the current entity counts easily.

If profiling during M9 shows rendering overhead at target scale (~500+ entities on a 100×100 map), the escape route is `MultiMeshInstance2D` for sprites with a pooled `Node2D` layer for entities that currently need a panel/click target.

## 6. Milestones

Each milestone ends with a playable build. Refactoring happens inside a milestone, never instead of it.

### M1 — Terrain render
Godot project scaffolded, `biomes.gd` generates cells, TileMap draws terrain with Wang-terrain water autotile. Camera2D with zoom and pan.
**Done when:** a 100×100 map renders correctly and I can pan/zoom around it.

### M2 — Static entities + panel
Four starting entities spawned, names and traits generated. Clicking one opens `EntityPanel` with their stats. Sprites from the existing Mini-Medieval set.
**Done when:** I can click an entity and see its data.

### M3 — Movement, hunger, eating (**first playable**)
AStar2D pathfinding, metabolism tick, food search, eating. Basic utility AI skeleton (hunger only).
**Done when:** entities wander, eat when hungry, starve when no food.

### M4 — Full utility AI + roles
Male/female/child roles, hunting, gathering, woodcutting, combat. `ActionResource`s with score weights + hysteresis (0.3 threshold, 20-tick reevaluation, energy<20 critical interrupt).
**Done when:** parity with current TypeScript utility AI behavior.

### M5 — Life cycle
Pregnancy, birth, infant mortality (10% — matches current balance), childhood to adulthood transition, old-age death. Genetic inheritance + 3% dramatic mutation.
**Done when:** population grows and evolves across generations.

### M6 — Economy + building + second tribe
Village pantry, house construction, wood harvesting. Second civilization spawn (the feature just added in `b5113e7`/`86b89b6`).
**Done when:** two tribes coexist and build independently.

### M7 — Phases, Long Winter, spoilage (**feature parity**)
Day/night cycle (10+10 ticks), four seasons with plant cycles, Long Winter event, food spoilage (matching commit `048f769`).
**Done when:** Godot version is feature-complete against the frozen TypeScript version.

### M8 — Graphics layer (the "plus")
Day/night shader (color grading + window lights on houses at night), snow particles in winter, fog layer, sky parallax, tweened entity movement between tiles (replacing teleport-per-tick).
**Done when:** it visibly looks better than the TypeScript version. Goal B realized.

### M9 — Balancing, QoL, save/load
End-to-end balance testing. Profiling pass; if any system is a GDScript bottleneck, port that one system to C#. Save/load via `FileAccess` or `ConfigFile`. Speed controls and fast-forward.
**Done when:** stable 60fps on 100×100 with full population, game state persists across sessions.

### Release gates

- **MVP:** end of M3 (something lives and eats).
- **Feature parity:** end of M7.
- **Migration complete:** end of M9.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| GDScript too slow on the sim hot path | Profile first. C# escape hatch on a single system, not a language-wide switch. Neurofolk is not CPU-bound in a way that GDScript is expected to choke on. |
| Utility AI ported but behaves subtly differently | End of M4 includes a characteristic test: same seed on TS vs Godot, compare population/resource stats after N ticks. Divergence beyond noise is a blocker. |
| Wang TileSet configuration rabbit hole | Budget a few hours in M1 for it. It is a one-time editor setup, not an ongoing cost. |
| "Let me rewrite this more cleanly" creep | Each milestone ships a working build before touching the next. Refactoring is allowed within a milestone, never as a replacement for one. |
| Losing test coverage on engine logic | GUT ports of `demography.test`, `interactions.test`, `metabolism.test`, `phases.test`, `utility-ai.test`, `action-resolver.test`, `world.test` land inside the milestone that ports each subsystem (not deferred to M9). |

## 8. Open decisions deferred to implementation plan

These are intentionally not frozen in the design — they belong in the per-milestone plan:

- Exact tile size in pixels after upscaling (8×8 native, but 4× vs 8× zoom is a feel decision made in M1 with the art visible).
- Whether `Entity` is a `Node2D` with `Area2D` or a pure `Node2D` with groups — decide in M2 when panel+click interaction is real.
- Save file format — decide in M9.

## 9. Out of scope for this spec

- Multiplayer.
- Steam/itch.io packaging.
- Mobile-specific UI.
- Porting the devtool pages (`/water`, `/shore`, `/animals`, `/library`, `/slash-icons`).
- Art refresh (staying on Mini-Medieval 8×8).

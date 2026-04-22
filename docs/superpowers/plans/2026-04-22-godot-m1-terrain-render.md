# M1: Terrain Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a fresh Godot 4 project (`neurofolk-godot`) and render a 100×100 procedurally-generated Neurofolk terrain map on a TileMap with pan/zoom camera. After this milestone a human sees the familiar plains/water/forest/mountain world from Neurofolk v1, in Godot, with better water autotiling and smooth camera.

**Architecture:**
- Port `src/engine/biomes.ts` to `src/engine/biomes.gd` function-by-function, each with GUT tests. Replace `Math.random()` with a seeded `RandomNumberGenerator` so tests are deterministic.
- Terrain is drawn on a single `TileMapLayer` using a hand-built `TileSet` resource that carves Mini-Medieval `Overworld.png` into tiles. Water uses Godot 4's native Wang-style terrain set (replacing the TS `waterAutotile.ts`).
- Top-level scene `World.tscn` has `TerrainLayer` (TileMapLayer) + `Camera2D`. A `World.gd` script ties biome generation to terrain rendering. A `CameraController.gd` handles pan (RMB drag) and zoom (scroll).

**Tech Stack:** Godot 4.3+, GDScript 2.0, GUT v9+ (Godot Unit Test, installed as git submodule), Mini-Medieval 8×8 sprite sheet.

**Note:** Throughout, "run the editor" means opening the project in the Godot GUI. "Run tests" means using the GUT command-line runner. The existing TS repo at `/home/g00rek/neurofolk` is untouched — all new work lands in `/home/g00rek/neurofolk-godot`.

---

## File structure

```
neurofolk-godot/
├── project.godot                               # manifest
├── icon.svg                                    # default Godot icon (replace later)
├── .gitignore
├── .gitmodules                                 # GUT submodule
├── README.md
├── addons/
│   └── gut/                                    # git submodule
├── assets/
│   └── sprites/
│       └── mini-medieval/
│           └── Overworld.png                   # symlink to v1 repo
├── src/
│   └── engine/
│       ├── biomes.gd                           # port of biomes.ts
│       └── biome_types.gd                      # Biome enum + BiomeGenParams resource
├── scenes/
│   └── world/
│       ├── world.tscn
│       ├── world.gd
│       └── camera_controller.gd
├── resources/
│   └── tilesets/
│       └── terrain.tres                        # hand-built TileSet
└── tests/
    ├── gut_config.json                         # GUT configuration
    ├── test_biomes_noise.gd
    ├── test_biomes_ca.gd
    ├── test_biomes_cleanup.gd
    └── test_biomes_generate.gd
```

**Responsibilities per file:**
- `biome_types.gd` — Biome enum and `BiomeGenParams` Resource class. One file, only types/data.
- `biomes.gd` — pure generation logic. No Godot scene knowledge. Testable standalone.
- `world.gd` — wires `biomes.gd` output into the TileMapLayer. Scene-aware glue only.
- `camera_controller.gd` — input → camera position/zoom. No biome knowledge.
- `terrain.tres` — data only (tile atlas regions, Wang terrain set config).

---

## Task 1: Create new repo and Godot project skeleton

**Files:**
- Create: `/home/g00rek/neurofolk-godot/project.godot`
- Create: `/home/g00rek/neurofolk-godot/.gitignore`
- Create: `/home/g00rek/neurofolk-godot/README.md`
- Create: `/home/g00rek/neurofolk-godot/icon.svg`

- [ ] **Step 1: Create project directory and init git**

```bash
mkdir -p /home/g00rek/neurofolk-godot
cd /home/g00rek/neurofolk-godot
git init -b main
```

Expected: `Initialized empty Git repository in /home/g00rek/neurofolk-godot/.git/`

- [ ] **Step 2: Write `project.godot`**

Create `/home/g00rek/neurofolk-godot/project.godot`:

```ini
; Engine configuration file.

config_version=5

[application]

config/name="Neurofolk"
config/description="Grid-based life & evolution simulator. Godot port of neurofolk v1."
run/main_scene="res://scenes/world/world.tscn"
config/features=PackedStringArray("4.3", "GL Compatibility")
config/icon="res://icon.svg"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="viewport"
window/stretch/aspect="expand"

[rendering]

textures/canvas_textures/default_texture_filter=0
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
```

Notes:
- `default_texture_filter=0` = Nearest (crisp pixels for 8×8 sprites).
- `stretch/mode=viewport` = integer scaling, no blurry pixels.
- `run/main_scene` is a forward reference; Task 8 creates this scene.

- [ ] **Step 3: Write `.gitignore`**

Create `/home/g00rek/neurofolk-godot/.gitignore`:

```
# Godot 4+ specific ignores
.godot/
.import/
export.cfg
export_presets.cfg

# Imported translations (automatically generated from CSV files)
*.translation

# Mono-specific ignores
.mono/
data_*/
mono_crash.*.json

# System/tool-specific ignores
.DS_Store
*.swp

# Local overrides
*.local
```

- [ ] **Step 4: Write `README.md`**

Create `/home/g00rek/neurofolk-godot/README.md`:

```markdown
# Neurofolk (Godot port)

Grid-based life & evolution simulator with Proto-Slavic civilizations.
Godot 4 port of the original TypeScript version at https://github.com/g00rek/neurofolk.

See `docs/superpowers/specs/2026-04-22-godot-migration-design.md` in the v1 repo
for the migration plan and architecture.

## Running

Open in Godot 4.3+. Main scene: `scenes/world/world.tscn`.

## Tests

```
godot --headless -s addons/gut/gut_cmdln.gd -gdir=res://tests -gexit
```

## Assets

Mini-Medieval 8×8 sprites by V3X3D are not bundled. Symlink or copy them to
`assets/sprites/mini-medieval/`.
```

- [ ] **Step 5: Create default icon**

The simplest path: copy the default icon Godot ships with, from another empty Godot project you create in the editor, OR write a trivial placeholder.

Create `/home/g00rek/neurofolk-godot/icon.svg`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#3a5f3a"/>
  <text x="64" y="78" font-family="monospace" font-size="48" fill="#e8d8a0" text-anchor="middle">nf</text>
</svg>
```

- [ ] **Step 6: Open in Godot editor to verify**

Run (GUI):
```bash
godot --path /home/g00rek/neurofolk-godot --editor
```

Expected: Godot opens. Editor might complain "main scene not found" — ignore, we create it in Task 8. Close the editor once it imports without crashing. This import creates `.godot/` cache dir (already gitignored).

- [ ] **Step 7: Initial commit**

```bash
cd /home/g00rek/neurofolk-godot
git add project.godot .gitignore README.md icon.svg
git commit -m "chore: Godot project skeleton

$(cat <<'EOF'
Initial project.godot targeting Godot 4.3+ with Compatibility renderer
and nearest-neighbor texture filtering for crisp 8x8 sprites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Create GitHub repo and push** (optional, can defer)

If you want remote backup now:
```bash
gh repo create g00rek/neurofolk-godot --private --source=. --push
```

Otherwise skip — local-only is fine through M1.

---

## Task 2: Install GUT (Godot Unit Test)

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/.gitmodules` (created by git)
- Modify: `/home/g00rek/neurofolk-godot/project.godot` (enable plugin)
- Create: `/home/g00rek/neurofolk-godot/tests/gut_config.json`
- Create: `/home/g00rek/neurofolk-godot/tests/test_sanity.gd`

- [ ] **Step 1: Add GUT as git submodule**

```bash
cd /home/g00rek/neurofolk-godot
git submodule add https://github.com/bitwes/Gut.git addons/gut
cd addons/gut
git checkout v9.3.1
cd ../..
git add .gitmodules addons/gut
```

Expected: submodule cloned, `addons/gut/gut_cmdln.gd` exists.

- [ ] **Step 2: Enable GUT plugin in `project.godot`**

Append to `/home/g00rek/neurofolk-godot/project.godot`:

```ini

[editor_plugins]

enabled=PackedStringArray("res://addons/gut/plugin.cfg")
```

- [ ] **Step 3: Create tests directory and config**

```bash
mkdir -p /home/g00rek/neurofolk-godot/tests
```

Create `/home/g00rek/neurofolk-godot/tests/gut_config.json`:

```json
{
  "dirs": ["res://tests"],
  "include_subdirs": true,
  "prefix": "test_",
  "suffix": ".gd",
  "log_level": 1
}
```

- [ ] **Step 4: Write sanity test**

Create `/home/g00rek/neurofolk-godot/tests/test_sanity.gd`:

```gdscript
extends GutTest

func test_gut_is_alive():
    assert_eq(1 + 1, 2, "arithmetic still works")

func test_true_is_true():
    assert_true(true)
```

- [ ] **Step 5: Run tests from CLI**

```bash
cd /home/g00rek/neurofolk-godot
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected output contains:
```
2 passed, 0 failed
```

If Godot cannot find the project on first run, open it once in the editor first (Step 6 of Task 1).

- [ ] **Step 6: Commit**

```bash
git add project.godot tests/gut_config.json tests/test_sanity.gd
git commit -m "chore: install GUT v9.3.1 and sanity test

$(cat <<'EOF'
GUT as git submodule at addons/gut pinned to v9.3.1. Headless runner
verified with one arithmetic assertion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Biome types and noise wrapper

**Files:**
- Create: `/home/g00rek/neurofolk-godot/src/engine/biome_types.gd`
- Create: `/home/g00rek/neurofolk-godot/src/engine/biomes.gd` (stub)
- Create: `/home/g00rek/neurofolk-godot/tests/test_biomes_noise.gd`

The original TS uses a hand-rolled value-noise fbm. Godot has `FastNoiseLite` built in — we use it but wrap in a function with the same shape (`fbm(x, y, seed, base_scale) → float in [0,1]`) so the rest of the port reads identically to the TS. `fragToScale` ports 1:1.

- [ ] **Step 1: Define biome enum and params resource**

Create `/home/g00rek/neurofolk-godot/src/engine/biome_types.gd`:

```gdscript
class_name BiomeTypes
extends Object

enum Biome { PLAINS, WATER, FOREST, MOUNTAIN, ROAD }

static func is_passable(b: int) -> bool:
    return b == Biome.PLAINS or b == Biome.FOREST or b == Biome.ROAD


class BiomeGenParams extends Resource:
    @export var water_pct: float = 20.0
    @export var mountain_pct: float = 5.0
    @export var forest_pct: float = 30.0
    @export var water_frag: float = 30.0
    @export var forest_frag: float = 30.0
    @export var rock_frag: float = 50.0
    @export var ca_iterations: int = 6
    @export var min_pocket_size: int = 9
    @export var border_margin: int = 2
```

Defaults match TS `DEFAULT_BIOME_PARAMS` exactly.

- [ ] **Step 2: Write failing noise test**

Create `/home/g00rek/neurofolk-godot/tests/test_biomes_noise.gd`:

```gdscript
extends GutTest

const Biomes = preload("res://src/engine/biomes.gd")

func test_frag_to_scale_at_0_returns_grid_size():
    assert_eq(Biomes.frag_to_scale(0, 100), 100.0)

func test_frag_to_scale_at_100_returns_2():
    assert_eq(Biomes.frag_to_scale(100, 100), 2.0)

func test_frag_to_scale_at_50_is_midway():
    var result = Biomes.frag_to_scale(50, 100)
    assert_between(result, 50.0, 52.0, "should be roughly midpoint")

func test_fbm_is_deterministic_for_same_seed():
    var a = Biomes.fbm(10, 20, 42, 10.0)
    var b = Biomes.fbm(10, 20, 42, 10.0)
    assert_eq(a, b, "same input → same output")

func test_fbm_differs_across_seeds():
    var a = Biomes.fbm(10, 20, 42, 10.0)
    var b = Biomes.fbm(10, 20, 999, 10.0)
    assert_ne(a, b, "different seed → different value")

func test_fbm_in_unit_range():
    for i in range(50):
        var v = Biomes.fbm(i, i * 3, 7, 10.0)
        assert_between(v, 0.0, 1.0, "fbm output should stay in [0,1]")
```

- [ ] **Step 3: Create stub `biomes.gd` to make the test fail with a clear error**

Create `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript
class_name Biomes
extends Object

static func frag_to_scale(_frag: float, _grid_size: int) -> float:
    return 0.0

static func fbm(_x: int, _y: int, _seed: int, _base_scale: float) -> float:
    return 0.0
```

- [ ] **Step 4: Run tests to confirm they fail as expected**

```bash
cd /home/g00rek/neurofolk-godot
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: 6 failures in `test_biomes_noise.gd`, 2 passes in sanity.

- [ ] **Step 5: Implement `frag_to_scale` and `fbm`**

Replace `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript
class_name Biomes
extends Object

# Fragmentation 0-100 → noise base-scale.
# 0 = one big blob (scale = grid size), 100 = many tiny (scale = 2).
static func frag_to_scale(frag: float, grid_size: int) -> float:
    return float(grid_size) * (1.0 - frag / 100.0) + 2.0 * (frag / 100.0)

# Godot FastNoiseLite wrapper shaped to match the TS fbm signature.
# Returns a value in [0, 1] that's deterministic for given (x, y, seed, base_scale).
static func fbm(x: int, y: int, seed: int, base_scale: float) -> float:
    var noise := FastNoiseLite.new()
    noise.noise_type = FastNoiseLite.TYPE_VALUE
    noise.seed = seed
    noise.frequency = 1.0 / base_scale
    noise.fractal_type = FastNoiseLite.FRACTAL_FBM
    noise.fractal_octaves = 3
    noise.fractal_lacunarity = 2.0
    noise.fractal_gain = 0.5
    var raw := noise.get_noise_2d(float(x), float(y))
    # FastNoiseLite returns in [-1, 1]; normalize to [0, 1].
    return (raw + 1.0) * 0.5
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: 6 + 2 = 8 passed, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add src/engine/biome_types.gd src/engine/biomes.gd tests/test_biomes_noise.gd
git commit -m "feat(engine): biome types and FastNoiseLite fbm wrapper

$(cat <<'EOF'
Biome enum and BiomeGenParams Resource ported from biomes.ts.
fbm() wraps FastNoiseLite in the same shape as the TS hand-rolled
noise so the rest of the port reads identically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Cellular automata smoothing

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`
- Create: `/home/g00rek/neurofolk-godot/tests/test_biomes_ca.gd`

Port `cellularAutomataSmooth` from TS. Uses cardinal-only CA with "thick or wide-edge" survival rule — preserves bodies ≥ 3 tiles wide.

- [ ] **Step 1: Write failing CA tests**

Create `/home/g00rek/neurofolk-godot/tests/test_biomes_ca.gd`:

```gdscript
extends GutTest

const Biomes = preload("res://src/engine/biomes.gd")
const B = preload("res://src/engine/biome_types.gd")
const PLAINS = B.Biome.PLAINS
const WATER = B.Biome.WATER

# Build grid from ASCII for readable test cases. '~' = water, '.' = plains.
func _grid_from_ascii(lines: Array) -> Array:
    var grid = []
    for line in lines:
        var row = []
        for ch in line:
            row.append(WATER if ch == "~" else PLAINS)
        grid.append(row)
    return grid

func _count(grid: Array, biome: int) -> int:
    var n := 0
    for row in grid:
        for c in row:
            if c == biome:
                n += 1
    return n

func test_ca_preserves_thick_water_body():
    # 3x3 block of water should survive — it's a thick body.
    var g = _grid_from_ascii([
        ".....",
        ".~~~.",
        ".~~~.",
        ".~~~.",
        ".....",
    ])
    var out = Biomes.cellular_automata_smooth(g, 2)
    assert_eq(_count(out, WATER), 9, "3x3 water block should stay")

func test_ca_removes_isolated_water_tile():
    # Single water pixel surrounded by plains should be removed.
    var g = _grid_from_ascii([
        ".....",
        ".....",
        "..~..",
        ".....",
        ".....",
    ])
    var out = Biomes.cellular_automata_smooth(g, 3)
    assert_eq(_count(out, WATER), 0, "lone water tile should vanish")

func test_ca_removes_1_tile_wide_strip():
    # Single-row water strip — not thick, should vanish.
    var g = _grid_from_ascii([
        ".....",
        ".....",
        "~~~~~",
        ".....",
        ".....",
    ])
    var out = Biomes.cellular_automata_smooth(g, 5)
    assert_eq(_count(out, WATER), 0, "1-tile-wide horizontal strip should vanish")

func test_ca_does_not_crash_on_empty_grid():
    var out = Biomes.cellular_automata_smooth([], 3)
    assert_eq(out, [])

func test_ca_preserves_grid_dimensions():
    var g = _grid_from_ascii([
        ".....",
        "..~..",
        "..~..",
        ".....",
    ])
    var out = Biomes.cellular_automata_smooth(g, 1)
    assert_eq(out.size(), 4, "same height")
    assert_eq(out[0].size(), 5, "same width")
```

- [ ] **Step 2: Add CA stub to `biomes.gd` and verify test fails**

Append to `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript

static func _clone_grid(grid: Array) -> Array:
    var out = []
    for row in grid:
        out.append(row.duplicate())
    return out

static func cellular_automata_smooth(grid: Array, _iterations: int) -> Array:
    return _clone_grid(grid)
```

Run tests:
```bash
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: at least `test_ca_removes_isolated_water_tile` and `test_ca_removes_1_tile_wide_strip` fail (stub does not smooth).

- [ ] **Step 3: Implement CA smoothing**

Replace the `cellular_automata_smooth` stub in `biomes.gd` with:

```gdscript
# Cardinal-only CA with "thick or wide-edge" survival rule.
# - Water survives if ≥3 cardinal water neighbors (thick),
#   OR has an H-pair + at least one N/S (wide edge),
#   OR has a V-pair + at least one E/W (wide edge).
# - Plains becomes water if ≥3 cardinal water neighbors.
# Otherwise → plains.
static func cellular_automata_smooth(grid: Array, iterations: int) -> Array:
    if grid.is_empty():
        return []
    var current = _clone_grid(grid)
    var h := current.size()
    for i in range(iterations):
        var next = _clone_grid(current)
        for y in range(h):
            var row = current[y]
            var w: int = row.size()
            for x in range(w):
                var cell = current[y][x]
                if cell != BiomeTypes.Biome.WATER and cell != BiomeTypes.Biome.PLAINS:
                    continue
                var cn := 0
                var has_n = y > 0 and current[y - 1][x] == BiomeTypes.Biome.WATER
                var has_s = y < h - 1 and current[y + 1][x] == BiomeTypes.Biome.WATER
                var has_w = x > 0 and current[y][x - 1] == BiomeTypes.Biome.WATER
                var has_e = x < w - 1 and current[y][x + 1] == BiomeTypes.Biome.WATER
                if has_n: cn += 1
                if has_s: cn += 1
                if has_w: cn += 1
                if has_e: cn += 1

                if cell == BiomeTypes.Biome.WATER:
                    var h_pair = has_e and has_w
                    var v_pair = has_n and has_s
                    var thick = cn >= 3
                    var wide_edge = (h_pair and (has_n or has_s)) or (v_pair and (has_e or has_w))
                    next[y][x] = BiomeTypes.Biome.WATER if (thick or wide_edge) else BiomeTypes.Biome.PLAINS
                else:
                    next[y][x] = BiomeTypes.Biome.WATER if cn >= 3 else BiomeTypes.Biome.PLAINS
        current = next
    return current
```

Add the import (already present from Task 3 as `class_name Biomes`). `BiomeTypes.Biome.WATER` etc. is referenced directly — ensure `biome_types.gd` is still using `class_name BiomeTypes`.

- [ ] **Step 4: Run tests and confirm passes**

```bash
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: all tests pass (sanity + noise + CA).

- [ ] **Step 5: Commit**

```bash
git add src/engine/biomes.gd tests/test_biomes_ca.gd
git commit -m "feat(engine): cellular automata smoothing for water

$(cat <<'EOF'
Port of cellularAutomataSmooth from biomes.ts. Cardinal-only CA
with thick-or-wide-edge survival rule, preserves water bodies
≥3 tiles wide, removes 1-tile-wide strips and islands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Flood-fill cleanup helpers

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`
- Create: `/home/g00rek/neurofolk-godot/tests/test_biomes_cleanup.gd`

Port three helpers: `removeTinyBiomeClusters`, `removeTinyWaterPockets`, `clearWaterOnBorder`.

- [ ] **Step 1: Write failing cleanup tests**

Create `/home/g00rek/neurofolk-godot/tests/test_biomes_cleanup.gd`:

```gdscript
extends GutTest

const Biomes = preload("res://src/engine/biomes.gd")
const B = preload("res://src/engine/biome_types.gd")
const PLAINS = B.Biome.PLAINS
const WATER = B.Biome.WATER
const FOREST = B.Biome.FOREST

func _grid_from_ascii(lines: Array) -> Array:
    var grid = []
    for line in lines:
        var row = []
        for ch in line:
            match ch:
                "~": row.append(WATER)
                "F": row.append(FOREST)
                _: row.append(PLAINS)
        grid.append(row)
    return grid

func _count(grid: Array, biome: int) -> int:
    var n := 0
    for row in grid:
        for c in row:
            if c == biome: n += 1
    return n

# remove_tiny_water_pockets
func test_removes_water_cluster_smaller_than_min():
    var g = _grid_from_ascii([
        "........",
        "..~~....",
        "..~~....",
        "........",
    ])
    # 4-tile cluster, min_size=9 → should be removed
    var out = Biomes.remove_tiny_water_pockets(g, 9)
    assert_eq(_count(out, WATER), 0)

func test_keeps_water_cluster_at_min_size():
    var g = _grid_from_ascii([
        ".........",
        "..~~~....",
        "..~~~....",
        "..~~~....",
        ".........",
    ])
    # 9 tiles, min=9 → kept
    var out = Biomes.remove_tiny_water_pockets(g, 9)
    assert_eq(_count(out, WATER), 9)

# remove_tiny_biome_clusters (generic)
func test_removes_small_forest_cluster():
    var g = _grid_from_ascii([
        ".........",
        "...FF....",
        ".........",
    ])
    var out = Biomes.remove_tiny_biome_clusters(g, FOREST, 6, PLAINS)
    assert_eq(_count(out, FOREST), 0)

# clear_water_on_border
func test_clears_water_within_margin_of_border():
    var g = _grid_from_ascii([
        "~~~~~",
        "~...~",
        "~...~",
        "~...~",
        "~~~~~",
    ])
    var out = Biomes.clear_water_on_border(g, 1)
    assert_eq(_count(out, WATER), 0, "all water was within 1 tile of edge")

func test_preserves_interior_water_when_clearing_border():
    var g = _grid_from_ascii([
        "~~~~~~~",
        "~.....~",
        "~.~~~.~",
        "~.~~~.~",
        "~.~~~.~",
        "~.....~",
        "~~~~~~~",
    ])
    var out = Biomes.clear_water_on_border(g, 1)
    # border cleared, 3x3 interior block remains
    assert_eq(_count(out, WATER), 9)
```

- [ ] **Step 2: Stub the three functions and confirm tests fail**

Append to `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript

static func remove_tiny_biome_clusters(grid: Array, _biome: int, _min_size: int, _replacement: int = BiomeTypes.Biome.PLAINS) -> Array:
    return _clone_grid(grid)

static func remove_tiny_water_pockets(grid: Array, _min_size: int) -> Array:
    return _clone_grid(grid)

static func clear_water_on_border(grid: Array, _margin: int) -> Array:
    return _clone_grid(grid)
```

Run tests, confirm the 5 new tests fail.

- [ ] **Step 3: Implement `clear_water_on_border`**

Replace the `clear_water_on_border` stub:

```gdscript
static func clear_water_on_border(grid: Array, margin: int) -> Array:
    var next = _clone_grid(grid)
    var h := next.size()
    if h == 0: return next
    var w: int = next[0].size()
    for y in range(h):
        for x in range(w):
            var on_border = x < margin or y < margin or x >= w - margin or y >= h - margin
            if on_border and next[y][x] == BiomeTypes.Biome.WATER:
                next[y][x] = BiomeTypes.Biome.PLAINS
    return next
```

- [ ] **Step 4: Implement `remove_tiny_biome_clusters` (generic flood-fill)**

Replace the `remove_tiny_biome_clusters` stub:

```gdscript
static func remove_tiny_biome_clusters(grid: Array, biome: int, min_size: int, replacement: int = BiomeTypes.Biome.PLAINS) -> Array:
    var next = _clone_grid(grid)
    var h := grid.size()
    if h == 0: return next
    var w: int = grid[0].size()
    var seen = []
    for _i in range(h):
        var row = []
        row.resize(w)
        row.fill(false)
        seen.append(row)
    var dirs = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

    for y in range(h):
        for x in range(w):
            if seen[y][x] or grid[y][x] != biome:
                continue
            var stack: Array[Vector2i] = [Vector2i(x, y)]
            var comp: Array[Vector2i] = []
            seen[y][x] = true
            while not stack.is_empty():
                var cur: Vector2i = stack.pop_back()
                comp.append(cur)
                for d in dirs:
                    var nx = cur.x + d.x
                    var ny = cur.y + d.y
                    if nx < 0 or nx >= w or ny < 0 or ny >= h:
                        continue
                    if seen[ny][nx] or grid[ny][nx] != biome:
                        continue
                    seen[ny][nx] = true
                    stack.append(Vector2i(nx, ny))
            if comp.size() < min_size:
                for p in comp:
                    next[p.y][p.x] = replacement
    return next
```

- [ ] **Step 5: Implement `remove_tiny_water_pockets` as a thin wrapper**

Replace the `remove_tiny_water_pockets` stub:

```gdscript
static func remove_tiny_water_pockets(grid: Array, min_size: int) -> Array:
    return remove_tiny_biome_clusters(grid, BiomeTypes.Biome.WATER, min_size, BiomeTypes.Biome.PLAINS)
```

- [ ] **Step 6: Run tests and confirm passes**

```bash
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: all cleanup tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/biomes.gd tests/test_biomes_cleanup.gd
git commit -m "feat(engine): flood-fill cleanup helpers for biome grid

$(cat <<'EOF'
Ports removeTinyBiomeClusters, removeTinyWaterPockets, clearWaterOnBorder
from biomes.ts. Water pockets specialize the generic cluster remover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Main biome generator

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`
- Create: `/home/g00rek/neurofolk-godot/tests/test_biomes_generate.gd`

Port `generateBiomeGrid` and `generateBiomeGridOnce`. Signature change: accept an optional `seed` so tests are deterministic (the TS version calls `Math.random()` unconditionally — we cannot do that in unit tests).

- [ ] **Step 1: Write generator tests**

Create `/home/g00rek/neurofolk-godot/tests/test_biomes_generate.gd`:

```gdscript
extends GutTest

const Biomes = preload("res://src/engine/biomes.gd")
const B = preload("res://src/engine/biome_types.gd")

func _count(grid: Array, biome: int) -> int:
    var n := 0
    for row in grid:
        for c in row:
            if c == biome: n += 1
    return n

func _make_params(overrides: Dictionary = {}) -> B.BiomeGenParams:
    var p = B.BiomeGenParams.new()
    for k in overrides:
        p.set(k, overrides[k])
    return p

func test_grid_has_requested_dimensions():
    var grid = Biomes.generate_biome_grid(30, _make_params(), 42)
    assert_eq(grid.size(), 30)
    assert_eq(grid[0].size(), 30)

func test_every_cell_is_valid_biome():
    var grid = Biomes.generate_biome_grid(30, _make_params(), 42)
    for row in grid:
        for cell in row:
            assert_true(
                cell == B.Biome.PLAINS or cell == B.Biome.WATER
                or cell == B.Biome.FOREST or cell == B.Biome.MOUNTAIN,
                "unexpected biome value: %s" % cell
            )

func test_same_seed_same_grid():
    var a = Biomes.generate_biome_grid(30, _make_params(), 123)
    var b = Biomes.generate_biome_grid(30, _make_params(), 123)
    assert_eq(a, b, "deterministic for same seed")

func test_different_seed_different_grid():
    var a = Biomes.generate_biome_grid(30, _make_params(), 1)
    var b = Biomes.generate_biome_grid(30, _make_params(), 2)
    assert_ne(a, b, "seed changes output")

func test_water_percentage_within_tolerance():
    var grid = Biomes.generate_biome_grid(50, _make_params({"water_pct": 20.0}), 42)
    var total = 50 * 50
    var water = _count(grid, B.Biome.WATER)
    var pct = float(water) / float(total) * 100.0
    # Loose: CA and cleanup eat water, retry compensates, 5-25% is acceptable
    assert_between(pct, 5.0, 30.0, "water ~20%% got %.1f%%" % pct)

func test_zero_water_pct_produces_no_water():
    var grid = Biomes.generate_biome_grid(30, _make_params({"water_pct": 0.0}), 42)
    assert_eq(_count(grid, B.Biome.WATER), 0)

func test_border_margin_enforced():
    var p = _make_params({"water_pct": 30.0, "border_margin": 2})
    var grid = Biomes.generate_biome_grid(30, p, 42)
    # No water in the 2-tile border
    for y in range(30):
        for x in range(30):
            if x < 2 or y < 2 or x >= 28 or y >= 28:
                assert_ne(grid[y][x], B.Biome.WATER,
                    "border water at (%d,%d)" % [x, y])
```

- [ ] **Step 2: Stub generator and confirm tests fail**

Append to `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript

static func generate_biome_grid(grid_size: int, _params: BiomeTypes.BiomeGenParams = null, _seed: int = 0) -> Array:
    var grid = []
    for _y in range(grid_size):
        var row = []
        row.resize(grid_size)
        row.fill(BiomeTypes.Biome.PLAINS)
        grid.append(row)
    return grid
```

Run tests. `test_grid_has_requested_dimensions`, `test_every_cell_is_valid_biome`, `test_zero_water_pct_produces_no_water` should pass (empty plains grid). The others should fail.

- [ ] **Step 3: Implement `_generate_once`**

Append to `/home/g00rek/neurofolk-godot/src/engine/biomes.gd`:

```gdscript

static func _generate_once(grid_size: int, p: BiomeTypes.BiomeGenParams, seed: int) -> Array:
    var total := grid_size * grid_size
    var h := grid_size
    var w := grid_size

    var water_scale = frag_to_scale(p.water_frag, grid_size)
    var forest_scale = frag_to_scale(p.forest_frag, grid_size)
    var rock_scale = frag_to_scale(p.rock_frag, grid_size)

    # Pre-compute noise fields.
    var elevation = []
    var moisture = []
    var rockiness = []
    for y in range(h):
        var e_row = []; var m_row = []; var r_row = []
        for x in range(w):
            e_row.append(fbm(x, y, seed, water_scale))
            m_row.append(fbm(x, y, seed + 500, forest_scale))
            r_row.append(fbm(x, y, seed + 777, rock_scale))
        elevation.append(e_row)
        moisture.append(m_row)
        rockiness.append(r_row)

    # Init plains grid.
    var grid = []
    for _y in range(h):
        var row = []
        row.resize(w)
        row.fill(BiomeTypes.Biome.PLAINS)
        grid.append(row)

    # Water by elevation percentile.
    var all_cells = []
    for y in range(h):
        for x in range(w):
            all_cells.append({"x": x, "y": y, "e": elevation[y][x]})
    all_cells.sort_custom(func(a, b): return a["e"] < b["e"])
    var water_count := int(floor(float(total) * p.water_pct / 100.0))
    for i in range(water_count):
        var c = all_cells[i]
        grid[c["y"]][c["x"]] = BiomeTypes.Biome.WATER

    # Smooth + cleanup water.
    var processed = cellular_automata_smooth(grid, p.ca_iterations)
    processed = clear_water_on_border(processed, p.border_margin)
    processed = remove_tiny_water_pockets(processed, p.min_pocket_size)

    # Remove 1-tile-wide water channels (up to 20 iterations).
    for _iter in range(20):
        var changed = false
        var next = _clone_grid(processed)
        for y in range(h):
            for x in range(w):
                if processed[y][x] != BiomeTypes.Biome.WATER: continue
                var n_ = y > 0 and processed[y - 1][x] == BiomeTypes.Biome.WATER
                var s_ = y < h - 1 and processed[y + 1][x] == BiomeTypes.Biome.WATER
                var e_ = x < w - 1 and processed[y][x + 1] == BiomeTypes.Biome.WATER
                var w_ = x > 0 and processed[y][x - 1] == BiomeTypes.Biome.WATER
                if (not n_ and not s_ and (e_ or w_)) or (not e_ and not w_ and (n_ or s_)):
                    next[y][x] = BiomeTypes.Biome.PLAINS
                    changed = true
        processed = next
        if not changed: break
    processed = remove_tiny_water_pockets(processed, p.min_pocket_size)

    # Near-water mask (1-tile buffer).
    var near_water = []
    for _y in range(h):
        var row = []; row.resize(w); row.fill(false)
        near_water.append(row)
    for y in range(h):
        for x in range(w):
            if processed[y][x] != BiomeTypes.Biome.WATER: continue
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    var nx = x + dx; var ny = y + dy
                    if nx >= 0 and nx < w and ny >= 0 and ny < h:
                        near_water[ny][nx] = true

    var raw_sum = p.water_pct + p.forest_pct + p.mountain_pct
    var scale = (100.0 / raw_sum) if raw_sum > 100.0 else 1.0
    var forest_target := int(floor(float(total) * p.forest_pct * scale / 100.0))
    var rock_target := int(floor(float(total) * p.mountain_pct * scale / 100.0))

    # Forest on safe plains, sorted by moisture descending.
    var safe_land = []
    for y in range(h):
        for x in range(w):
            if processed[y][x] == BiomeTypes.Biome.PLAINS and not near_water[y][x]:
                safe_land.append({"x": x, "y": y, "m": moisture[y][x]})
    safe_land.sort_custom(func(a, b): return a["m"] > b["m"])
    var forest_count := min(forest_target, safe_land.size())
    for i in range(forest_count):
        var c = safe_land[i]
        processed[c["y"]][c["x"]] = BiomeTypes.Biome.FOREST
    processed = remove_tiny_biome_clusters(processed, BiomeTypes.Biome.FOREST, 6, BiomeTypes.Biome.PLAINS)

    # Near-forest mask.
    var near_forest = []
    for _y in range(h):
        var row = []; row.resize(w); row.fill(false)
        near_forest.append(row)
    for y in range(h):
        for x in range(w):
            if processed[y][x] != BiomeTypes.Biome.FOREST: continue
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    var nx = x + dx; var ny = y + dy
                    if nx >= 0 and nx < w and ny >= 0 and ny < h:
                        near_forest[ny][nx] = true

    # Rocks on remaining safe plains, clustered by noise coherence.
    var avail = []
    for y in range(h):
        for x in range(w):
            if processed[y][x] != BiomeTypes.Biome.PLAINS: continue
            if near_water[y][x] or near_forest[y][x]: continue
            avail.append({"x": x, "y": y, "r": rockiness[y][x]})
    avail.sort_custom(func(a, b): return a["r"] > b["r"])
    var rock_count := min(rock_target, avail.size())
    for i in range(rock_count):
        var c = avail[i]
        processed[c["y"]][c["x"]] = BiomeTypes.Biome.MOUNTAIN

    return processed
```

- [ ] **Step 4: Replace `generate_biome_grid` stub with retry logic**

Replace the stub `generate_biome_grid` in `biomes.gd`:

```gdscript
static func generate_biome_grid(grid_size: int, params: BiomeTypes.BiomeGenParams = null, seed: int = 0) -> Array:
    var p: BiomeTypes.BiomeGenParams = params if params != null else BiomeTypes.BiomeGenParams.new()
    # If seed is 0, derive from the system RNG (matches TS Math.random behavior).
    var used_seed := seed
    if used_seed == 0:
        used_seed = randi() % 2147483647
        if used_seed == 0: used_seed = 1

    # Retry up to 5 times if water/mountain percentages land too low.
    for attempt in range(5):
        var boosted = BiomeTypes.BiomeGenParams.new()
        boosted.water_pct = p.water_pct + attempt * 5
        boosted.mountain_pct = p.mountain_pct
        boosted.forest_pct = p.forest_pct
        boosted.water_frag = p.water_frag
        boosted.forest_frag = p.forest_frag
        boosted.rock_frag = p.rock_frag
        boosted.ca_iterations = p.ca_iterations
        boosted.min_pocket_size = p.min_pocket_size
        boosted.border_margin = p.border_margin

        # Vary seed per attempt so we don't hit the same bad layout.
        var result = _generate_once(grid_size, boosted, used_seed + attempt * 131)
        var total := grid_size * grid_size
        var wc := 0; var mc := 0
        for y in range(grid_size):
            for x in range(grid_size):
                if result[y][x] == BiomeTypes.Biome.WATER: wc += 1
                elif result[y][x] == BiomeTypes.Biome.MOUNTAIN: mc += 1
        var water_ok = p.water_pct == 0.0 or wc >= float(total) * p.water_pct / 100.0 * 0.2
        var rock_ok = p.mountain_pct == 0.0 or mc >= 1
        if water_ok and rock_ok: return result

    # Final fallback.
    var fallback = BiomeTypes.BiomeGenParams.new()
    fallback.water_pct = p.water_pct + 25
    fallback.mountain_pct = p.mountain_pct
    fallback.forest_pct = p.forest_pct
    fallback.water_frag = p.water_frag
    fallback.forest_frag = p.forest_frag
    fallback.rock_frag = p.rock_frag
    fallback.ca_iterations = p.ca_iterations
    fallback.min_pocket_size = p.min_pocket_size
    fallback.border_margin = p.border_margin
    return _generate_once(grid_size, fallback, used_seed + 999)
```

- [ ] **Step 5: Run tests and confirm passes**

```bash
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: all generator tests pass. Previous tests (noise, CA, cleanup, sanity) still pass.

If `test_water_percentage_within_tolerance` is flaky, widen the range — this is stochastic and the tolerance may need adjustment for the specific FastNoiseLite output distribution vs. the TS hand-rolled noise.

- [ ] **Step 6: Commit**

```bash
git add src/engine/biomes.gd tests/test_biomes_generate.gd
git commit -m "feat(engine): main biome grid generator with retry

$(cat <<'EOF'
Port of generateBiomeGrid and generateBiomeGridOnce from biomes.ts.
Added seed parameter for deterministic tests (TS relied on
Math.random()). Same layer order: water → cleanup → forest → rocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TileSet resource with Mini-Medieval tiles and Wang water terrain

**Files:**
- Create: `/home/g00rek/neurofolk-godot/assets/sprites/mini-medieval/Overworld.png` (symlink)
- Create: `/home/g00rek/neurofolk-godot/resources/tilesets/terrain.tres`

This task is **editor work**, not code. GUT cannot test a TileSet resource — verification is visual in the editor at the end.

- [ ] **Step 1: Symlink Overworld.png**

```bash
mkdir -p /home/g00rek/neurofolk-godot/assets/sprites/mini-medieval
ln -sf /home/g00rek/neurofolk/public/assets/mini-medieval/Mini-Medieval-8x8/Overworld.png \
       /home/g00rek/neurofolk-godot/assets/sprites/mini-medieval/Overworld.png
ls -la /home/g00rek/neurofolk-godot/assets/sprites/mini-medieval/
```

Expected: the symlink resolves and Godot will import it on next editor open.

- [ ] **Step 2: Open Godot editor, let Overworld.png import**

```bash
godot --path /home/g00rek/neurofolk-godot --editor
```

In the Import dock, select `Overworld.png` and set:
- Filter: **Off** (crisp pixels)
- Mipmaps: **Off**

Click Reimport.

- [ ] **Step 3: Create TileSet resource**

In the FileSystem dock, right-click `resources/tilesets/` → New Resource → TileSet. Save as `terrain.tres`.

Double-click it to open the TileSet editor at the bottom.

- [ ] **Step 4: Add atlas source**

In the TileSet editor:
- TileSet > General:
  - Tile Size: **8 × 8**
- Click "+" under Sources → Atlas.
- Set its Texture to `res://assets/sprites/mini-medieval/Overworld.png`.
- Hit "Setup > Automatically Create Tiles in Non-Transparent Texture Regions". This populates the atlas from Overworld.

- [ ] **Step 5: Create Terrain Set for water (Wang 2-corner)**

TileSet > Terrain Sets:
- Click "+" to add a Terrain Set. Mode: **Match Corners** (classic Wang 2-corner).
- Inside, click "+" to add a Terrain. Name: **Water**, color: blue.

TileSet > Tiles > Atlas source:
- Select each water-edge tile in the Overworld atlas and paint its corners using the Water terrain in the Terrain toolbar at the top. Use the v1 repo `src/ui/terrain/waterAutotile.ts` as reference for which atlas indices are which corner combinations — the Overworld sheet has a 3×3 water autotile block; mark corners accordingly.

Shortcut: paint corners as:
- Inner water (solid): all 4 corners = Water
- Concave corners: 3 corners = Water
- Edges: 2 corners on the water side = Water
- Convex corners: 1 corner = Water
- Isolated / empty: 0 corners = Water (do not paint)

- [ ] **Step 6: Define plain terrain tiles (no autotile needed)**

In the atlas, confirm plains, forest, and mountain tiles are registered (auto-created in Step 4). Note down their atlas coordinates — we reference them by coord in `world.gd`:
- Plains: e.g. `(0, 0)` (look at Overworld.png, pick the grass tile)
- Forest: e.g. `(4, 0)`
- Mountain: e.g. `(2, 3)`

Record the coords in a `.md` scratch file or a comment — they go into `world.gd` in Task 8.

- [ ] **Step 7: Save and commit**

```bash
cd /home/g00rek/neurofolk-godot
git add resources/tilesets/terrain.tres assets/sprites/mini-medieval/
git commit -m "assets: TileSet with Mini-Medieval overworld and water Wang terrain

$(cat <<'EOF'
Hand-built TileSet (8x8) with atlas source pointed at Overworld.png
and one Water terrain set in match-corners mode. Replaces the TS
hand-rolled waterAutotile.ts.

Overworld.png is symlinked from the v1 repo; not bundled (V3X3D license).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: symlinks in git are tracked as symlinks, not as file content. The recipient needs the v1 repo or a copy of Mini-Medieval to resolve them.

---

## Task 8: World scene with TerrainLayer + TerrainRenderer

**Files:**
- Create: `/home/g00rek/neurofolk-godot/scenes/world/world.tscn`
- Create: `/home/g00rek/neurofolk-godot/scenes/world/world.gd`

`world.gd` takes a biome grid from `Biomes.generate_biome_grid` and writes it cell-by-cell to a `TileMapLayer`.

- [ ] **Step 1: Create empty scene**

In the Godot editor:
- Scene > New Scene
- Select Node2D as the root
- Rename the root to `World`
- Save as `scenes/world/world.tscn`

- [ ] **Step 2: Add TileMapLayer as child**

- Right-click the World node → Add Child Node → TileMapLayer
- Rename it `TerrainLayer`
- In the Inspector, assign `resources/tilesets/terrain.tres` to its `Tile Set` property

- [ ] **Step 3: Attach `world.gd` script to the root**

Right-click `World` node → Attach Script. Path: `scenes/world/world.gd`. Inherits from Node2D.

Replace the generated template with:

```gdscript
extends Node2D

# Atlas coordinates from Task 7 — adjust to the actual atlas you built.
const ATLAS_SOURCE_ID := 0
const PLAINS_COORD := Vector2i(0, 0)
const FOREST_COORD := Vector2i(4, 0)
const MOUNTAIN_COORD := Vector2i(2, 3)
const WATER_TERRAIN_SET := 0
const WATER_TERRAIN := 0

const GRID_SIZE := 100
const SEED := 42

@onready var terrain_layer: TileMapLayer = $TerrainLayer

func _ready() -> void:
    var params := BiomeTypes.BiomeGenParams.new()
    var grid := Biomes.generate_biome_grid(GRID_SIZE, params, SEED)
    _render(grid)

func _render(grid: Array) -> void:
    terrain_layer.clear()

    var water_cells: Array[Vector2i] = []

    for y in range(grid.size()):
        var row: Array = grid[y]
        for x in range(row.size()):
            var biome: int = row[x]
            var pos := Vector2i(x, y)
            match biome:
                BiomeTypes.Biome.PLAINS:
                    terrain_layer.set_cell(pos, ATLAS_SOURCE_ID, PLAINS_COORD)
                BiomeTypes.Biome.FOREST:
                    terrain_layer.set_cell(pos, ATLAS_SOURCE_ID, FOREST_COORD)
                BiomeTypes.Biome.MOUNTAIN:
                    terrain_layer.set_cell(pos, ATLAS_SOURCE_ID, MOUNTAIN_COORD)
                BiomeTypes.Biome.WATER:
                    water_cells.append(pos)
                    # Fill with plains underneath; Wang terrain paints on top.
                    terrain_layer.set_cell(pos, ATLAS_SOURCE_ID, PLAINS_COORD)

    # Let Godot auto-pick the right Wang tile for each water cell based on neighbors.
    if not water_cells.is_empty():
        terrain_layer.set_cells_terrain_connect(
            water_cells, WATER_TERRAIN_SET, WATER_TERRAIN, false
        )
```

Notes:
- Atlas coords (`PLAINS_COORD`, etc.) are placeholders you filled in from Task 7 Step 6. Adjust.
- `set_cells_terrain_connect` is the Godot 4 API that picks the correct Wang-tile variant automatically from the neighboring set.

- [ ] **Step 4: Set World as the main scene**

Project > Project Settings > General > Application > Run > Main Scene = `res://scenes/world/world.tscn`. Save.

- [ ] **Step 5: Run the scene (F5)**

Press F5 in the editor. Expected: a 100×100 tile map renders in the top-left of the window. You cannot move the camera yet (Task 9). If atlas coords are wrong you'll see red "missing tile" squares — fix the `const`s in `world.gd` by checking which atlas coordinate holds which terrain in Overworld.png.

- [ ] **Step 6: Commit**

```bash
cd /home/g00rek/neurofolk-godot
git add scenes/world/world.tscn scenes/world/world.gd project.godot
git commit -m "feat(world): World scene renders biome grid to TileMapLayer

$(cat <<'EOF'
World.tscn hosts a TerrainLayer TileMapLayer bound to terrain.tres.
world.gd generates a 100x100 biome grid with seed 42 and writes
each cell; water cells use set_cells_terrain_connect for Wang tiling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Camera2D with pan/zoom controller

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/scenes/world/world.tscn` (add Camera2D)
- Create: `/home/g00rek/neurofolk-godot/scenes/world/camera_controller.gd`

RMB drag → pan. Scroll wheel → zoom (towards cursor). Start centered on map.

- [ ] **Step 1: Add Camera2D to the scene**

In the editor, with `world.tscn` open:
- Right-click the `World` node → Add Child Node → Camera2D
- Rename the Camera2D node to `Camera`
- In the Inspector set `Zoom = (4, 4)` so 8×8 tiles render at 32 px (readable).

- [ ] **Step 2: Attach `camera_controller.gd`**

Right-click `Camera` → Attach Script → `scenes/world/camera_controller.gd`. Inherits from Camera2D.

Content:

```gdscript
extends Camera2D

@export var pan_speed := 1.0
@export var zoom_step := 1.1
@export var min_zoom := 0.5
@export var max_zoom := 16.0

var _dragging := false
var _drag_start_mouse := Vector2.ZERO
var _drag_start_camera := Vector2.ZERO

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_RIGHT:
            _dragging = event.pressed
            if _dragging:
                _drag_start_mouse = event.position
                _drag_start_camera = global_position
        elif event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
            _zoom_at(event.position, zoom_step)
        elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
            _zoom_at(event.position, 1.0 / zoom_step)
    elif event is InputEventMouseMotion and _dragging:
        var delta_screen = event.position - _drag_start_mouse
        var delta_world = delta_screen / zoom
        global_position = _drag_start_camera - delta_world * pan_speed

func _zoom_at(screen_pos: Vector2, factor: float) -> void:
    var world_before = get_global_mouse_position()
    var new_zoom = (zoom * factor).clamp(
        Vector2(min_zoom, min_zoom),
        Vector2(max_zoom, max_zoom)
    )
    zoom = new_zoom
    var world_after = get_global_mouse_position()
    global_position += (world_before - world_after)
```

- [ ] **Step 3: Center the camera on the map at startup**

Extend `world.gd` — append inside `_ready()` after `_render(grid)`:

```gdscript
    # Center camera on the middle of the generated map.
    var tile_px: Vector2i = terrain_layer.tile_set.tile_size
    $Camera.global_position = Vector2(
        GRID_SIZE * tile_px.x / 2.0,
        GRID_SIZE * tile_px.y / 2.0
    )
```

- [ ] **Step 4: Run (F5)**

Expected:
- Map renders centered on screen.
- Right-click drag pans.
- Scroll wheel zooms toward cursor.

- [ ] **Step 5: Commit**

```bash
cd /home/g00rek/neurofolk-godot
git add scenes/world/world.tscn scenes/world/world.gd scenes/world/camera_controller.gd
git commit -m "feat(world): Camera2D with RMB-drag pan and zoom-to-cursor

$(cat <<'EOF'
Camera centers on the map on startup. Right-mouse drag pans,
scroll wheel zooms around the cursor position with a 0.5-16x range.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Manual verification and M1 done-tag

**Files:**
- Modify: `/home/g00rek/neurofolk-godot/README.md`

- [ ] **Step 1: Run full test suite**

```bash
cd /home/g00rek/neurofolk-godot
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

Expected: all tests pass (sanity + noise + CA + cleanup + generator). Write down the count — should be around 25.

- [ ] **Step 2: Run the game and manually verify**

```bash
godot --path . --editor
```

Press F5 and check:
- [ ] 100×100 map renders in a few hundred ms
- [ ] Water bodies have correct edges/corners (no jagged lines, no 1-tile islands)
- [ ] Water is never within 2 tiles of the map border
- [ ] Forests form ≥6-tile clusters
- [ ] Mountains are sparse
- [ ] Pan with RMB drag works in all directions
- [ ] Scroll zooms smoothly toward cursor, stays in [0.5, 16] range

- [ ] **Step 3: Test determinism by changing the seed**

Edit `world.gd` `SEED` to `1`, reload scene, verify the map looks completely different from seed `42`. Set it back to `42`.

- [ ] **Step 4: Update README with how to run**

Replace the `## Running` section in `/home/g00rek/neurofolk-godot/README.md`:

```markdown
## Running

```
godot --path . --editor   # open editor
# Then F5 to run the world scene.
```

## Tests

```
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://tests/gut_config.json -gexit
```

## Controls

- RMB drag: pan camera
- Scroll wheel: zoom toward cursor

## Status

Milestone M1 complete: terrain generation + rendering + camera.
See `docs/superpowers/specs/2026-04-22-godot-migration-design.md`
in the v1 repo for the full roadmap.
```

- [ ] **Step 5: Commit and tag M1**

```bash
cd /home/g00rek/neurofolk-godot
git add README.md
git commit -m "docs: M1 complete — terrain render done

$(cat <<'EOF'
100x100 biome grid renders on TileMapLayer with Wang water tiling,
pan/zoom camera works. All engine tests green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git tag -a m1-terrain-render -m "M1 done: biome generator + TileMap render + camera"
```

If you pushed to GitHub in Task 1:
```bash
git push origin main --tags
```

---

## Self-review checklist (for the plan author, not the executor)

**Spec coverage:**
- M1 "Godot project scaffolded" → Tasks 1, 2
- M1 "biomes.gd generates cells" → Tasks 3, 4, 5, 6
- M1 "TileMap draws terrain with Wang-terrain water autotile" → Tasks 7, 8
- M1 "Camera2D with zoom and pan" → Task 9
- M1 "Done when: 100×100 renders correctly and I can pan/zoom" → Task 10 verification

**Placeholder scan:** No "TBD", "implement later", or "similar to Task N" without code. Atlas coordinates in Task 8 are marked as needing adjustment in Task 7 Step 6 — not a placeholder in the plan, but a legitimate editor-dependent value.

**Type consistency:**
- `Biomes.generate_biome_grid(grid_size, params, seed)` — same signature across all usages (Task 6, Task 8).
- `BiomeTypes.Biome.WATER` etc. — referenced consistently.
- `cellular_automata_smooth`, `remove_tiny_water_pockets`, `remove_tiny_biome_clusters`, `clear_water_on_border` — consistent across Task 4/5/6.
- `TileMapLayer.set_cell` and `set_cells_terrain_connect` — Godot 4.3+ API, confirmed.

**Known judgment calls the executor may need to make:**
- Atlas coordinates for plains/forest/mountain (Task 7 Step 6, Task 8 Step 3). Depends on Overworld.png layout.
- Wang corner painting (Task 7 Step 5). Needs visual judgment from the atlas.
- Water-pct tolerance bounds in `test_water_percentage_within_tolerance` (Task 6 Step 1). May need loosening if FastNoiseLite distribution differs from TS hand-rolled noise.

# Symulator Życia — MVP Design

## Cel

Sandbox symulator życia i ewolucji. Użytkownik odpala symulację i obserwuje ludziki poruszające się po siatce 2D. Projekt będzie rozbudowywany inkrementalnie (rozmnażanie, zasoby, statystyki, interakcje).

## Stack

- **Vite** — bundler / dev server
- **React 18** — UI (panele, kontrolki)
- **TypeScript** — type safety
- **HTML Canvas** — rendering siatki i ludzików

## Zakres MVP

- Siatka 30×30 renderowana na Canvas
- ~20 ludzików (10♂ + 10♀) z losowym rozmieszczeniem początkowym
- Losowy ruch — co turę każdy ludzik idzie w losowym kierunku (góra/dół/lewo/prawo)
- Wizualne rozróżnienie płci: niebieskie kółka (♂), różowe kółka (♀)
- Przycisk Play/Pause
- Slider szybkości symulacji
- Licznik populacji (total + podział na płeć)
- Licznik tury

## Architektura

### Separacja Engine / UI

Engine to czysta logika TypeScript — zero zależności od Reacta czy DOM. UI (React) wywołuje `world.tick()` i renderuje stan na Canvas.

Korzyści:
- Engine można testować bez DOM
- Możliwość przeniesienia do Web Workera w przyszłości
- Rozbudowa logiki niezależnie od UI

### Struktura plików

```
src/
  engine/
    types.ts       — Entity, Position, Gender, WorldState
    world.ts       — createWorld(), tick(), addEntity()
    movement.ts    — randomStep()
  ui/
    App.tsx         — główny layout
    GridCanvas.tsx  — Canvas rendering siatki + ludzików
    Controls.tsx    — play/pause, speed slider
    Stats.tsx       — licznik populacji, tura
  main.tsx          — entry point
```

### Typy danych

```typescript
type Gender = 'male' | 'female';

interface Position {
  x: number; // 0-29
  y: number; // 0-29
}

interface Entity {
  id: string;
  position: Position;
  gender: Gender;
}

interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
```

### Game loop

1. `World.tick()` iteruje po entityach i wywołuje `randomStep()` dla każdej
2. `randomStep()` losuje kierunek (góra/dół/lewo/prawo) i zwraca nową pozycję (z clampem do granic siatki)
3. React otrzymuje nowy `WorldState` i renderuje go na Canvas
4. `setInterval` / `requestAnimationFrame` kontroluje tempo (regulowane sliderem)

### Rendering (Canvas)

- Tło: ciemna siatka z liniami oddzielającymi pola
- Ludziki: wypełnione kółka w kolorze zależnym od płci
  - ♂ = `#7aa2f7` (niebieski)
  - ♀ = `#f7768e` (różowy)
- Rozmiar pola: Canvas width / gridSize (dynamiczny)

### Layout UI

```
┌─────────────────────────┬──────────┐
│                         │ Populacja│
│                         │  20      │
│       Canvas 30×30      │  ♂10 ♀10│
│                         ├──────────┤
│                         │ Tura: 42 │
│                         ├──────────┤
│                         │ ▶ Play   │
│                         │ Speed ━━ │
└─────────────────────────┴──────────┘
```

## Poza zakresem MVP

Następne iteracje (nie teraz):
- Rozmnażanie
- Starzenie się / śmierć
- Zasoby (jedzenie, woda)
- Genetyka / cechy
- Statystyki / wykresy
- Interakcje między ludzikami
- Większe siatki / zoom

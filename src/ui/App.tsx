import { useState, useEffect, useCallback, useRef } from 'react';
import { createWorld } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import { EntityPanel } from './EntityPanel';
import { PopGraph } from './PopGraph';
import { EventLog } from './EventLog';
import type { WorldState } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';

const WORLD_GRID_SIZE = 20;
const INITIAL_ENTITY_COUNT = 4;
const VILLAGE_COUNT = 1;
const INITIAL_SPEED = 300;

interface HistoryPoint {
  pop: number[];       // population per tribe [0,1,2]
}

type WorkerResponse =
  | { type: 'snapshot'; world: WorldState; samples: HistoryPoint[]; running: boolean };

export function App() {
  const initialWorldRef = useRef<WorldState | null>(null);
  const workerRef = useRef<Worker | null>(null);
  if (!initialWorldRef.current) {
    initialWorldRef.current = createWorld({
      gridSize: WORLD_GRID_SIZE,
      entityCount: INITIAL_ENTITY_COUNT,
      villageCount: VILLAGE_COUNT,
    });
  }

  const [world, setWorld] = useState<WorldState>(() => initialWorldRef.current as WorldState);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const extinct = world.entities.length === 0 && world.tick > 0;

  useEffect(() => {
    const worker = new Worker(new URL('../engine/simulationWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== 'snapshot') return;
      setWorld(event.data.world);
      if (!event.data.running) setRunning(false);
      if (event.data.samples.length > 0) {
        setHistory(h => {
          const updated = [...h, ...event.data.samples];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
      }
    };
    worker.postMessage({ type: 'setWorld', world: initialWorldRef.current, speed: INITIAL_SPEED });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    workerRef.current?.postMessage({ type: running && !extinct ? 'start' : 'stop' });
  }, [running, extinct]);

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'setSpeed', speed });
  }, [speed]);

  const selectedEntity = selectedId
    ? world.entities.find(e => e.id === selectedId) ?? null
    : null;

  // Stop and save log on extinction
  useEffect(() => {
    if (!extinct) return;
    setRunning(false);
    const log = world.log;
    const deaths = log.filter(e => e.type === 'death');
    const births = log.filter(e => e.type === 'birth');
    const byOldAge = deaths.filter(e => e.cause === 'old_age').length;
    const byStarvation = deaths.filter(e => e.cause === 'starvation').length;
    const byCold = deaths.filter(e => e.cause === 'cold').length;
    const byFight = deaths.filter(e => e.cause === 'fight').length;
    const byChildbirth = deaths.filter(e => e.cause === 'childbirth').length;

    const text = [
      `=== EVOLISO — CIVILIZATION LOG ===`,
      `Extinct at tick ${world.tick} (year ${Math.floor(world.tick / TICKS_PER_YEAR)})`,
      ``,
      `--- SUMMARY ---`,
      `Births: ${births.length}`,
      `Deaths: ${deaths.length}`,
      `  Old age: ${byOldAge}`,
      `  Starvation: ${byStarvation}`,
      `  Cold: ${byCold}`,
      `  Fight: ${byFight}`,
      `  Childbirth: ${byChildbirth}`,
      ``,
      `--- WORLD STATE AT EXTINCTION ---`,
      `Animals remaining: ${world.animals.length}`,
      `Plants remaining: ${world.plants.length}`,
      ``,
      `--- FULL LOG ---`,
      ...log.map(e => {
        const y = Math.floor(e.tick / TICKS_PER_YEAR);
        const g = e.gender === 'male' ? 'M' : 'F';
        if (e.type === 'birth') return `t${e.tick} y${y} BIRTH ${g} ${e.entityId}`;
        const a = Math.floor(e.age / TICKS_PER_YEAR);
        return `t${e.tick} y${y} DEATH ${g} ${e.entityId} age=${a} cause=${e.cause}`;
      }),
    ].join('\n');

    fetch('/api/save-log', { method: 'POST', body: text }).catch(() => {});
  }, [extinct, world]);

  // Clear selection if entity died
  useEffect(() => {
    if (selectedId && !world.entities.find(e => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [world, selectedId]);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    const entity = world.entities.find(
      e => {
        const home = e.homeId ? world.houses.find(house => house.id === e.homeId) : undefined;
        const atHome = home && e.position.x === home.position.x && e.position.y === home.position.y;
        return !atHome && e.position.x === x && e.position.y === y;
      }
    );
    setSelectedId(entity ? entity.id : null);
  }, [world]);

  const handleReset = useCallback(() => {
    const nextWorld = createWorld({
      gridSize: WORLD_GRID_SIZE,
      entityCount: INITIAL_ENTITY_COUNT,
      villageCount: VILLAGE_COUNT,
    });
    setWorld(nextWorld);
    setRunning(false);
    setSelectedId(null);
    setHistory([]);
    workerRef.current?.postMessage({ type: 'reset', world: nextWorld, speed });
  }, [speed]);

  const v = world.villages[0];
  const meatPct = v ? Math.min(100, Math.round((v.meatStore / 50) * 100)) : 0;
  const plantPct = v ? Math.min(100, Math.round((v.plantStore / 50) * 100)) : 0;
  const woodPct = v ? Math.min(100, Math.round((v.woodStore / 30) * 100)) : 0;

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '18px', color: '#ccc' }}>Evoliso</h1>
        <Controls
          running={running}
          speed={speed}
          onToggle={() => setRunning(r => !r)}
          onSpeedChange={setSpeed}
          onReset={handleReset}
        />
      </div>
      {extinct && (
        <div style={{ background: '#f7768e22', border: '1px solid #f7768e', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', fontSize: '14px' }}>
          Extinct in year {Math.floor(world.tick / TICKS_PER_YEAR)}
        </div>
      )}
      <GridCanvas
        world={world}
        size={600}
        selectedId={selectedId}
        onClick={handleCanvasClick}
      />
      {v && (
        <div style={resourceBarStyle}>
          <ResourceBar emoji={'\uD83C\uDF56'} color="#8d6e63" pct={meatPct} val={v.meatStore} />
          <ResourceBar emoji={'\uD83C\uDF3F'} color="#4caf50" pct={plantPct} val={v.plantStore} />
          <ResourceBar emoji={'\uD83E\uDEB5'} color="#a08050" pct={woodPct} val={v.woodStore} />
        </div>
      )}
      <div style={graphPanelStyle}>
        <PopGraph series={[
          { data: history.map(h => h.pop[0]), color: '#dc3c3c', label: 'Pop' },
        ]} width={300} height={60} />
      </div>
      {selectedEntity && (
        <EntityPanel
          entity={selectedEntity}
          world={world}
          onClose={() => setSelectedId(null)}
        />
      )}
      <Stats world={world} />
      <EventLog log={world.log} />
    </div>
  );
}

function ResourceBar({ emoji, color, pct, val }: { emoji: string; color: string; pct: number; val: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
      <span style={{ fontSize: '11px', color }}>{emoji}</span>
      <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '10px', color: '#666', minWidth: '16px' }}>{val}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: '#16161e',
  color: '#ccc',
  minHeight: '100vh',
  padding: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: '600px',
  margin: '0 auto',
};

const resourceBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
  padding: '8px',
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
};

const graphPanelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '8px',
  marginTop: '8px',
};

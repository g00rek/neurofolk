import { useState, useEffect, useCallback } from 'react';
import { createWorld, tick } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import { EntityPanel } from './EntityPanel';
import type { WorldState } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';

const CANVAS_SIZE = 900;

export function App() {
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld({ gridSize: 30, entityCount: 60 })
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const extinct = world.entities.length === 0 && world.tick > 0;

  const step = useCallback(() => {
    setWorld(prev => {
      if (prev.entities.length === 0) return prev;
      return tick(prev);
    });
  }, []);

  useEffect(() => {
    if (!running || extinct) return;
    const interval = setInterval(step, speed);
    return () => clearInterval(interval);
  }, [running, speed, step, extinct]);

  const selectedEntity = selectedId
    ? world.entities.find(e => e.id === selectedId) ?? null
    : null;

  // Auto-download log on extinction
  useEffect(() => {
    if (!extinct) return;
    const log = world.log;
    const deaths = log.filter(e => e.type === 'death');
    const births = log.filter(e => e.type === 'birth');
    const byOldAge = deaths.filter(e => e.cause === 'old_age').length;
    const byStarvation = deaths.filter(e => e.cause === 'starvation').length;
    const byFight = deaths.filter(e => e.cause === 'fight').length;

    const summary = [
      `=== SYMULATOR ŻYCIA — LOG CYWILIZACJI ===`,
      `Wymarcie w turze ${world.tick} (rok ${Math.floor(world.tick / TICKS_PER_YEAR)})`,
      ``,
      `--- PODSUMOWANIE ---`,
      `Urodzonych: ${births.length}`,
      `Zmarłych: ${deaths.length}`,
      `  - Starość: ${byOldAge}`,
      `  - Głód: ${byStarvation}`,
      `  - Walka: ${byFight}`,
      ``,
      `--- OSTATNIE 100 ZDARZEŃ ---`,
      ...log.slice(-100).map(e => {
        const year = Math.floor(e.tick / TICKS_PER_YEAR);
        const gender = e.gender === 'male' ? '♂' : '♀';
        if (e.type === 'birth') {
          return `t${e.tick} (r${year}) URODZIŁ SIĘ ${gender} ${e.entityId}`;
        }
        const ageY = Math.floor(e.age / TICKS_PER_YEAR);
        const cause = e.cause === 'old_age' ? 'starość' : e.cause === 'starvation' ? 'głód' : 'walka';
        return `t${e.tick} (r${year}) ZMARŁ ${gender} ${e.entityId} (${ageY}l) — ${cause}`;
      }),
      ``,
      `--- PEŁNY LOG (${log.length} wpisów) ---`,
      ...log.map(e => {
        const gender = e.gender === 'male' ? 'M' : 'F';
        if (e.type === 'birth') return `${e.tick},birth,${e.entityId},${gender}`;
        return `${e.tick},death,${e.entityId},${gender},${Math.floor(e.age / TICKS_PER_YEAR)},${e.cause}`;
      }),
    ].join('\n');

    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civ-log-${world.tick}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [extinct]);

  // Clear selection if entity died
  useEffect(() => {
    if (selectedId && !world.entities.find(e => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [world, selectedId]);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    // Find entity at grid position
    const entity = world.entities.find(
      e => e.position.x === x && e.position.y === y
    );
    setSelectedId(entity ? entity.id : null);
  }, [world]);

  return (
    <div style={containerStyle}>
      <h1 style={{ margin: '0 0 16px', fontSize: '20px', color: '#ccc' }}>
        Symulator Życia
      </h1>
      {extinct && (
        <div style={{ background: '#f7768e22', border: '1px solid #f7768e', borderRadius: '4px', padding: '12px 20px', marginBottom: '16px', fontSize: '16px' }}>
          Cywilizacja wymarła w roku {Math.floor(world.tick / 10)} (tura {world.tick})
        </div>
      )}
      <div style={layoutStyle}>
        <GridCanvas
          world={world}
          size={CANVAS_SIZE}
          selectedId={selectedId}
          onClick={handleCanvasClick}
        />
        <div style={sidebarStyle}>
          {selectedEntity && (
            <EntityPanel
              entity={selectedEntity}
              onClose={() => setSelectedId(null)}
            />
          )}
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

import type { Entity } from '../engine/types';

interface TraitAveragesProps {
  entities: Entity[];
}

function avg(entities: Entity[], fn: (e: Entity) => number): string {
  if (entities.length === 0) return '-';
  return (entities.reduce((s, e) => s + fn(e), 0) / entities.length).toFixed(1);
}

export function TraitAverages({ entities }: TraitAveragesProps) {
  const rows: Array<{ label: string; value: string; color: string }> = [
    { label: 'Strength', value: avg(entities, e => e.traits.strength), color: '#f7768e' },
    { label: 'Speed', value: avg(entities, e => e.traits.speed), color: '#7aa2f7' },
    { label: 'Perception', value: avg(entities, e => e.traits.perception), color: '#9ece6a' },
    { label: 'Metabolism', value: avg(entities, e => e.traits.metabolism), color: '#e0af68' },
    { label: 'Aggression', value: avg(entities, e => e.traits.aggression), color: '#f7768e' },
    { label: 'Fertility', value: avg(entities, e => e.traits.fertility), color: '#bb9af7' },
    { label: 'Twin gene', value: avg(entities, e => e.traits.twinChance * 100) + '%', color: '#73daca' },
  ];

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Avg Traits</div>
      {rows.map(r => (
        <div key={r.label} style={rowStyle}>
          <span style={{ color: '#666', fontSize: '10px', minWidth: '62px' }}>{r.label}</span>
          <span style={{ color: r.color, fontSize: '11px', fontWeight: 'bold' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '2px',
};

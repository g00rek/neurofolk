interface ControlsProps {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

const MIN_SPEED_MS = 0.1;
const MAX_SPEED_MS = 300;

export function Controls({ running, speed, onToggle, onSpeedChange, onReset }: ControlsProps) {
  const sliderValue = MAX_SPEED_MS + MIN_SPEED_MS - speed;

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <button onClick={onToggle} style={buttonStyle(running)}>
        {running ? '⏸' : '▶'}
      </button>
      <button onClick={onReset} style={resetStyle}>↻</button>
      <input
        type="range"
        min={MIN_SPEED_MS}
        max={MAX_SPEED_MS}
        step={MIN_SPEED_MS}
        value={sliderValue}
        onChange={e => onSpeedChange(+(MAX_SPEED_MS + MIN_SPEED_MS - Number(e.target.value)).toFixed(1))}
        style={{ width: '80px' }}
      />
    </div>
  );
}

const resetStyle: React.CSSProperties = {
  background: '#f7768e33',
  color: '#f7768e',
  border: '1px solid #f7768e55',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '14px',
  cursor: 'pointer',
};

function buttonStyle(running: boolean): React.CSSProperties {
  return {
    background: running ? '#333' : '#9ece6a',
    color: running ? '#ccc' : '#1a1b26',
    border: 'none',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  };
}

import { useEffect, useState } from 'react';
import type { PassiveSummary, Village } from '../engine/types';

interface Props {
  summary: PassiveSummary;
  villages: Village[];
  onContinue: () => void;
}

const AUTO_CLOSE_SECONDS = 5;

export function SummaryModal({ summary, villages, onContinue }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onContinue();
      return;
    }
    const id = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, onContinue]);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0 }}>The Long Winter has passed</h2>
        <p style={{ color: '#aaa', marginTop: 4 }}>
          Earth-years elapsed: {summary.passivePhaseYears}
        </p>
        {summary.perTribe.map(t => {
          const v = villages.find(vv => vv.tribe === t.tribe);
          const name = v?.name ?? `Tribe ${t.tribe}`;
          const color = v?.color;
          return (
            <div key={t.tribe} style={tribeBlockStyle}>
              <h3 style={{
                color: color ? `rgb(${color[0]},${color[1]},${color[2]})` : undefined,
                margin: 0,
              }}>{name}</h3>
              <div style={statsRowStyle}>
                <span>Born: <b>{t.births.length}</b></span>
                <span>Died: <b>{t.deaths.length}</b></span>
              </div>
              {t.deaths.length > 0 && (
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
                  {causeCount(t.deaths, 'old_age')} old age,{' '}
                  {causeCount(t.deaths, 'starvation')} starvation,{' '}
                  {causeCount(t.deaths, 'childbirth')} childbirth,{' '}
                  {causeCount(t.deaths, 'infant')} stillborn
                </div>
              )}
              <div style={stockpileRowStyle}>
                <span>Food (cooked): {t.stockpileBefore.cookedMeat} → {t.stockpileAfter.cookedMeat}</span>
                <span>Wood: {t.stockpileBefore.wood} → {t.stockpileAfter.wood}</span>
              </div>
            </div>
          );
        })}
        <button onClick={onContinue} style={buttonStyle}>
          Begin next Summer ({secondsLeft}s)
        </button>
      </div>
    </div>
  );
}

function causeCount(deaths: { cause: string }[], cause: string): number {
  return deaths.filter(d => d.cause === cause).length;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#1a1b26', border: '1px solid #444', borderRadius: 8,
  padding: 24, minWidth: 360, maxWidth: 560, color: '#eee',
};
const tribeBlockStyle: React.CSSProperties = {
  marginTop: 16, padding: 12, background: '#22232e', borderRadius: 6,
};
const statsRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginTop: 4, fontSize: 14,
};
const stockpileRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#aaa',
};
const buttonStyle: React.CSSProperties = {
  marginTop: 20, padding: '8px 16px', background: '#9ece6a',
  color: '#1a1b26', border: 'none', borderRadius: 4,
  fontWeight: 'bold', cursor: 'pointer', fontSize: 14,
};

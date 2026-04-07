import { useRef, useEffect } from 'react';

interface PopGraphProps {
  history: number[];  // population count per sample
  width: number;
  height: number;
}

export function PopGraph({ history, width, height }: PopGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, width, height);

    const max = Math.max(...history, 1);
    const step = width / (history.length - 1);

    // Grid lines
    ctx.strokeStyle = '#2a2b36';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Population line
    ctx.beginPath();
    ctx.strokeStyle = '#7aa2f7';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < history.length; i++) {
      const x = i * step;
      const y = height - (history[i] / max) * (height - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Max label
    ctx.fillStyle = '#555';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(max), width - 2, 10);
  }, [history, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ borderRadius: '4px', border: '1px solid #333' }}
    />
  );
}

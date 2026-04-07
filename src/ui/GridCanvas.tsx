import { useRef, useEffect } from 'react';
import type { WorldState, Position } from '../engine/types';

const MALE_COLOR = '#7aa2f7';
const FEMALE_COLOR = '#f7768e';
const MATING_MALE_COLOR = '#bb9af7';
const MATING_FEMALE_COLOR = '#ff9e64';
const GRID_BG = '#1a1b26';
const GRID_LINE = '#2a2b36';

interface GridCanvasProps {
  world: WorldState;
  size: number;
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

export function GridCanvas({ world, size }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = size / world.gridSize;

    // Background
    ctx.fillStyle = GRID_BG;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= world.gridSize; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Group entities by tile
    const tileMap = new Map<string, typeof world.entities>();
    for (const entity of world.entities) {
      const key = posKey(entity.position);
      const group = tileMap.get(key) ?? [];
      group.push(entity);
      tileMap.set(key, group);
    }

    // Render entities
    for (const [, group] of tileMap) {
      const count = group.length;
      const hasMating = group.some(e => e.state === 'mating');

      for (let i = 0; i < count; i++) {
        const entity = group[i];
        const baseCx = entity.position.x * cellSize + cellSize / 2;
        const baseCy = entity.position.y * cellSize + cellSize / 2;
        const radius = cellSize * 0.3;

        // Offset entities if multiple on same tile
        let cx = baseCx;
        let cy = baseCy;
        if (count === 2) {
          const offset = cellSize * 0.18;
          cx = baseCx + (i === 0 ? -offset : offset);
        } else if (count > 2) {
          const angle = (i / count) * Math.PI * 2;
          const dist = cellSize * 0.2;
          cx = baseCx + Math.cos(angle) * dist;
          cy = baseCy + Math.sin(angle) * dist;
        }

        // Pick color: mating entities get brighter/distinct hue
        let color: string;
        if (entity.state === 'mating') {
          color = entity.gender === 'male' ? MATING_MALE_COLOR : MATING_FEMALE_COLOR;
        } else {
          color = entity.gender === 'male' ? MALE_COLOR : FEMALE_COLOR;
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Glow ring for mating entities
        if (entity.state === 'mating') {
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Draw a heart above the tile when there's a mating pair
      if (hasMating && count >= 2) {
        const baseCx = group[0].position.x * cellSize + cellSize / 2;
        const baseCy = group[0].position.y * cellSize + cellSize / 2;
        const fontSize = Math.max(8, Math.floor(cellSize * 0.45));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#f7768e';
        ctx.fillText('❤', baseCx, baseCy - cellSize * 0.3);
      }
    }
  }, [world, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: '4px' }}
    />
  );
}

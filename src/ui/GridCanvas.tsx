import { useRef, useEffect } from 'react';
import type { WorldState } from '../engine/types';

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

    // Grid lines — single path for all lines, skip if cells too small
    if (cellSize >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= world.gridSize; i++) {
        const pos = i * cellSize;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
      }
      ctx.stroke();
    }

    // Group entities by tile (numeric key for speed)
    const tileMap = new Map<number, typeof world.entities>();
    for (const entity of world.entities) {
      const key = entity.position.y * world.gridSize + entity.position.x;
      const group = tileMap.get(key);
      if (group) {
        group.push(entity);
      } else {
        tileMap.set(key, [entity]);
      }
    }

    // Batch by color: collect circles, draw all of same color at once
    const colorBatches = new Map<string, Array<{ cx: number; cy: number; radius: number }>>();

    const matingHearts: Array<{ cx: number; cy: number }> = [];

    for (const [, group] of tileMap) {
      const count = group.length;
      const hasMating = group.some(e => e.state === 'mating');

      for (let i = 0; i < count; i++) {
        const entity = group[i];
        const baseCx = entity.position.x * cellSize + cellSize / 2;
        const baseCy = entity.position.y * cellSize + cellSize / 2;
        const radius = cellSize * 0.3;

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

        let color: string;
        if (entity.state === 'mating') {
          color = entity.gender === 'male' ? MATING_MALE_COLOR : MATING_FEMALE_COLOR;
        } else {
          color = entity.gender === 'male' ? MALE_COLOR : FEMALE_COLOR;
        }

        const batch = colorBatches.get(color);
        if (batch) {
          batch.push({ cx, cy, radius });
        } else {
          colorBatches.set(color, [{ cx, cy, radius }]);
        }
      }

      if (hasMating && count >= 2) {
        matingHearts.push({
          cx: group[0].position.x * cellSize + cellSize / 2,
          cy: group[0].position.y * cellSize + cellSize / 2,
        });
      }
    }

    // Draw all circles grouped by color (fewer fillStyle changes)
    for (const [color, circles] of colorBatches) {
      ctx.fillStyle = color;
      for (const { cx, cy, radius } of circles) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw hearts for mating pairs (skip if too many — performance)
    if (matingHearts.length < 200) {
      const fontSize = Math.max(8, Math.floor(cellSize * 0.45));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#f7768e';
      for (const { cx, cy } of matingHearts) {
        ctx.fillText('❤', cx, cy - cellSize * 0.3);
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

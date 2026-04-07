import type { Position } from './types';

const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 }, // up
  { x: 0, y: 1 },  // down
  { x: -1, y: 0 }, // left
  { x: 1, y: 0 },  // right
];

export function randomStep(position: Position, gridSize: number): Position {
  const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return {
    x: Math.max(0, Math.min(gridSize - 1, position.x + dir.x)),
    y: Math.max(0, Math.min(gridSize - 1, position.y + dir.y)),
  };
}

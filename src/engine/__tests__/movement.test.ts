import { describe, it, expect } from 'vitest';
import { randomStep } from '../movement';

describe('randomStep', () => {
  it('returns a position within grid bounds', () => {
    const gridSize = 30;
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 15, y: 15 }, gridSize);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThan(gridSize);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeLessThan(gridSize);
    }
  });

  it('moves exactly one step in a cardinal direction', () => {
    const pos = { x: 15, y: 15 };
    for (let i = 0; i < 100; i++) {
      const result = randomStep(pos, 30);
      const dx = Math.abs(result.x - pos.x);
      const dy = Math.abs(result.y - pos.y);
      expect(dx + dy).toBe(1);
    }
  });

  it('clamps to grid when at top-left corner (0,0)', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 0, y: 0 }, 30);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps to grid when at bottom-right corner', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomStep({ x: 29, y: 29 }, 30);
      expect(result.x).toBeLessThan(30);
      expect(result.y).toBeLessThan(30);
    }
  });
});

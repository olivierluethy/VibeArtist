import { describe, it, expect } from 'vitest';
import { deriveColorCellsFromBuffer, GRID_W } from './colorCells';

// A small valid PNG (black shapes on white) — enough to produce varied cells.
const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';

describe('deriveColorCellsFromBuffer', () => {
  it('returns a full grid of colored cells covering the display size', async () => {
    const buf = Buffer.from(SAMPLE_PNG_B64, 'base64');
    const cells = await deriveColorCellsFromBuffer(buf, 360, 480);

    const gridH = Math.round((GRID_W * 480) / 360);
    expect(cells.length).toBe(GRID_W * gridH);

    for (const c of cells) {
      expect(c.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.w).toBeCloseTo(360 / GRID_W);
      expect(c.h).toBeCloseTo(480 / gridH);
    }
  });

  it('orders the largest color group first', async () => {
    const buf = Buffer.from(SAMPLE_PNG_B64, 'base64');
    const cells = await deriveColorCellsFromBuffer(buf, 360, 480);
    // First cell belongs to the most common color bucket → at least as common as the last.
    const count = (fill: string) => cells.filter((c) => c.fill === fill).length;
    expect(count(cells[0].fill)).toBeGreaterThanOrEqual(count(cells[cells.length - 1].fill));
  });
});

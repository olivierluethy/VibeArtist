import { describe, it, expect } from 'vitest';
import { deriveBrushStrokesFromBuffer } from './brushStrokes';

// A small valid PNG (black shapes on white) — enough to produce varied strokes.
const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';

describe('deriveBrushStrokesFromBuffer', () => {
  it('produces brush strokes with color, width and a 2-point sweep path', async () => {
    const buf = Buffer.from(SAMPLE_PNG_B64, 'base64');
    const strokes = await deriveBrushStrokesFromBuffer(buf, 360, 480);

    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.width).toBeGreaterThan(0);
      expect(s.points).toHaveLength(2);
      expect(s.points[1].x).toBeGreaterThanOrEqual(s.points[0].x);
      expect(s.points[0].y).toBe(s.points[1].y); // a horizontal sweep
    }
  });

  it('paints the largest color group first (its brush is at least as wide)', async () => {
    const buf = Buffer.from(SAMPLE_PNG_B64, 'base64');
    const strokes = await deriveBrushStrokesFromBuffer(buf, 360, 480);
    expect(strokes[0].width).toBeGreaterThanOrEqual(strokes[strokes.length - 1].width);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveLineArt } from './derive';
import { traceToStrokePaths } from './lineart';

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';
const DATA_URL = 'data:image/png;base64,' + SAMPLE_PNG_B64;

describe('deriveLineArt', () => {
  it('returns a PNG data URL', async () => {
    const result = await deriveLineArt(DATA_URL);
    expect(result).toMatch(/^data:image\/png/);
  });

  it('produces traceable output (traceToStrokePaths yields >= 1 path)', async () => {
    const lineArt = await deriveLineArt(DATA_URL);
    const paths = await traceToStrokePaths(lineArt);
    expect(paths.length).toBeGreaterThan(0);
  });
});


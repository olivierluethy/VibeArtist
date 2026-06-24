import { describe, it, expect } from 'vitest';
import { OIL_FIXTURE } from './oilFixture';

describe('OIL_FIXTURE', () => {
  it('has strokes spanning coarse→fine layers, ordered by layer ascending', () => {
    expect(OIL_FIXTURE.oilStrokes.length).toBeGreaterThan(100);
    const layers = OIL_FIXTURE.oilStrokes.map((s) => s.layer);
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThanOrEqual(layers[i - 1]);
    expect(new Set(layers)).toContain(0); // block-in present
    expect(Math.max(...layers)).toBeGreaterThanOrEqual(4); // eyes/mouth present
  });

  it('uses the v2 timing shape with photoGlaze defaulting to 0', () => {
    expect(OIL_FIXTURE.timing.photoGlaze).toBe(0);
    expect(OIL_FIXTURE.timing.blockInMs).toBeGreaterThan(0);
    expect(OIL_FIXTURE.timing.refineMs).toBeGreaterThan(0);
  });
});

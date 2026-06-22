import { describe, it, expect } from 'vitest';
import { WORLD_CUP_FIXTURE, svgDataUri } from './fixtures';

describe('WORLD_CUP_FIXTURE', () => {
  it('is a valid drawing plan with strokes and layers', () => {
    expect(WORLD_CUP_FIXTURE.strokePaths.length).toBeGreaterThan(2);
    expect(WORLD_CUP_FIXTURE.colorImage).toMatch(/^data:image\/svg\+xml/);
    expect(WORLD_CUP_FIXTURE.shadingLayer).toMatch(/^data:image\/svg\+xml/);
    expect(WORLD_CUP_FIXTURE.timing.accelerate).toBe(true);
    expect(WORLD_CUP_FIXTURE.timing.outlineMs).toBeGreaterThan(WORLD_CUP_FIXTURE.timing.colorMs);
  });

  it('encodes svg as a data uri', () => {
    expect(svgDataUri('<svg/>')).toBe('data:image/svg+xml,' + encodeURIComponent('<svg/>'));
  });
});

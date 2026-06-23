import { describe, it, expect } from 'vitest';
import { generateDrawingPlan, outlineMsForStrokes, MS_PER_STROKE } from './generationService';
import { buildPrompt, type PortraitEngine } from './portraitEngine';
import { extractPathData } from './lineart';

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';
const SAMPLE_DATA_URL = 'data:image/png;base64,' + SAMPLE_PNG_B64;

const fakeEngine: PortraitEngine = {
  async generate() {
    return { colorImage: SAMPLE_DATA_URL, width: 80, height: 80 };
  },
};

describe('generationService', () => {
  it('builds a drawing plan from engine output', async () => {
    const plan = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.colorImage).toBe(SAMPLE_DATA_URL);
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.strokePaths.length).toBeGreaterThan(0);
    expect(plan.shadingLayer).toMatch(/^data:image\/png/);
    expect(plan.timing.accelerate).toBe(true);
  });

  it('buildPrompt includes team and player', () => {
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Brazil');
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Neymar');
  });

  it('extractPathData pulls d attributes from svg', () => {
    expect(extractPathData('<svg><path d="M0 0 L1 1"/></svg>')).toEqual(['M0 0 L1 1']);
  });

  it('scales outline duration with stroke count, clamped to sane bounds', () => {
    expect(outlineMsForStrokes(84)).toBe(84 * MS_PER_STROKE); // mid-range scales linearly
    expect(outlineMsForStrokes(1)).toBe(8000); // floor — a sparse sketch isn't over in a blink
    expect(outlineMsForStrokes(1000)).toBe(45000); // ceiling — a busy sketch doesn't run forever
  });
});

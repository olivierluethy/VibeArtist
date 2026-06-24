import { describe, it, expect } from 'vitest';
import { generateOilDrawingPlan } from './oilGenerationService';
import { generateDrawingPlan } from './generationService'; // v1 must remain intact
import type { PortraitEngine } from './portraitEngine';

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';
const SAMPLE_DATA_URL = 'data:image/png;base64,' + SAMPLE_PNG_B64;
const fakeEngine: PortraitEngine = { async generate() { return { colorImage: SAMPLE_DATA_URL, width: 80, height: 80 }; } };

describe('generateOilDrawingPlan', () => {
  it('assembles a valid v2 OilDrawingPlan from engine output', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.colorImage).toBe(SAMPLE_DATA_URL);
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.strokePaths.length).toBeGreaterThan(0);
    expect(plan.oilStrokes.length).toBeGreaterThan(0);
  });

  it('orders oilStrokes by layer ascending', async () => {
    const { oilStrokes } = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    for (let i = 1; i < oilStrokes.length; i++) expect(oilStrokes[i].layer).toBeGreaterThanOrEqual(oilStrokes[i - 1].layer);
  });

  it('uses v2 timing with photoGlaze 0 and carries NO shading field', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.timing.photoGlaze).toBe(0);
    expect(plan.timing.blockInMs).toBeGreaterThan(0);
    expect(plan.timing.refineMs).toBeGreaterThan(0);
    expect('shadingLayer' in plan).toBe(false);
  });

  it('leaves the v1 generateDrawingPlan importable/working (untouched)', async () => {
    const v1 = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(v1.brushStrokes.length).toBeGreaterThan(0); // v1 still produces its own shape
  });
});

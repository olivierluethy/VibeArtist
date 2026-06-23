import { describe, it, expect } from 'vitest';
import { computeRenderState, easeIn } from './performanceScheduler';
import type { DrawingPlan } from './types';

const plan: DrawingPlan = {
  width: 400,
  height: 500,
  strokePaths: [{ d: 'M0 0 L10 0' }, { d: 'M0 10 L10 10' }],
  colorCells: [
    { x: 0, y: 0, w: 200, h: 500, fill: '#f00' },
    { x: 200, y: 0, w: 200, h: 500, fill: '#0f0' },
  ],
  shadingLayer: 'shade.png',
  colorImage: 'color.png',
  timing: { outlineMs: 1000, shadeMs: 1000, colorMs: 1000, accelerate: true },
};

describe('computeRenderState', () => {
  it('starts in outline with nothing drawn', () => {
    const s = computeRenderState(plan, 0);
    expect(s.phase).toBe('outline');
    expect(s.strokeFractions).toEqual([0, 0]);
    expect(s.activeStroke).toBe(0);
    expect(s.shadeOpacity).toBe(0);
    expect(s.colorOpacity).toBe(0);
    expect(s.colorProgress).toBe(0);
  });

  it('draws strokes sequentially during outline', () => {
    // slice = 1000/2 = 500ms per stroke
    const s = computeRenderState(plan, 250);
    expect(s.strokeFractions[0]).toBeCloseTo(0.5);
    expect(s.strokeFractions[1]).toBe(0);
    expect(s.activeStroke).toBe(0);
  });

  it('moves to the second stroke past the first slice', () => {
    const s = computeRenderState(plan, 750);
    expect(s.strokeFractions[0]).toBe(1);
    expect(s.strokeFractions[1]).toBeCloseTo(0.5);
    expect(s.activeStroke).toBe(1);
  });

  it('enters shade with all strokes complete', () => {
    const s = computeRenderState(plan, 1500);
    expect(s.phase).toBe('shade');
    expect(s.strokeFractions).toEqual([1, 1]);
    expect(s.activeStroke).toBeNull();
    expect(s.shadeOpacity).toBeCloseTo(0.5);
    expect(s.colorOpacity).toBe(0);
  });

  it('paints color cells sequentially during the paint sub-phase', () => {
    // colorMs=1000 → blendMs=200, paintMs=800. At color-elapsed 500: slice=400.
    const s = computeRenderState(plan, 2500);
    expect(s.phase).toBe('color');
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorProgress).toBeCloseTo(0.5);
    expect(s.colorCellFractions[0]).toBe(1);
    expect(s.colorCellFractions[1]).toBeCloseTo(0.25);
    expect(s.activeColorCell).toBe(1);
    expect(s.blendOpacity).toBe(0); // blend hasn't started
  });

  it('blends to the real photo after all cells are painted', () => {
    // color-elapsed 900 > paintMs 800 → all cells filled, blend ramping.
    const s = computeRenderState(plan, 2900);
    expect(s.phase).toBe('color');
    expect(s.colorCellFractions).toEqual([1, 1]);
    expect(s.activeColorCell).toBeNull();
    expect(s.blendOpacity).toBeCloseTo(0.5); // (900-800)/200
  });

  it('finishes done with everything at full', () => {
    const s = computeRenderState(plan, 5000);
    expect(s.phase).toBe('done');
    expect(s.strokeFractions).toEqual([1, 1]);
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorOpacity).toBe(1);
    expect(s.colorProgress).toBe(1);
    expect(s.colorCellFractions).toEqual([1, 1]);
    expect(s.blendOpacity).toBe(1);
    expect(s.activeStroke).toBeNull();
  });

  it('easeIn squares its input', () => {
    expect(easeIn(0.5)).toBeCloseTo(0.25);
  });
});

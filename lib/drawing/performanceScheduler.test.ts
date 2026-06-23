import { describe, it, expect } from 'vitest';
import { computeRenderState, easeIn } from './performanceScheduler';
import type { DrawingPlan } from './types';

const plan: DrawingPlan = {
  width: 400,
  height: 500,
  strokePaths: [{ d: 'M0 0 L10 0' }, { d: 'M0 10 L10 10' }],
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

  it('eases in the color phase when accelerate is true', () => {
    const s = computeRenderState(plan, 2500); // halfway through color
    expect(s.phase).toBe('color');
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorOpacity).toBeCloseTo(0.25); // easeIn(0.5) = 0.25
    // colorProgress is LINEAR (drives the watchable scribble reveal), not eased.
    expect(s.colorProgress).toBeCloseTo(0.5);
  });

  it('finishes done with everything at full', () => {
    const s = computeRenderState(plan, 5000);
    expect(s.phase).toBe('done');
    expect(s.strokeFractions).toEqual([1, 1]);
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorOpacity).toBe(1);
    expect(s.colorProgress).toBe(1);
    expect(s.activeStroke).toBeNull();
  });

  it('easeIn squares its input', () => {
    expect(easeIn(0.5)).toBeCloseTo(0.25);
  });
});

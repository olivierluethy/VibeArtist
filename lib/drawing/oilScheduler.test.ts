import { describe, it, expect } from 'vitest';
import { computeOilState, LAYER4_RESERVE_MS } from './oilScheduler';
import type { OilDrawingPlan, OilStroke } from './oilTypes';

const mk = (layer: number): OilStroke => ({ x: 0, y: 0, angle: 0, length: 4, width: 6, color: '#888888', layer });

// counts: layer0=2, layer1=2, layer2=0, layer3=0, layer4=2, layer5=2
const oilStrokes: OilStroke[] = [
  mk(0), mk(0), mk(1), mk(1), mk(4), mk(4), mk(5), mk(5),
];
const plan: OilDrawingPlan = {
  width: 400, height: 500,
  strokePaths: [{ d: 'M0 0 L10 0' }, { d: 'M0 10 L10 10' }],
  oilStrokes,
  colorImage: 'color.png',
  timing: { outlineMs: 1000, blockInMs: 1000, refineMs: 6000, accentMs: 1000, photoGlaze: 0 },
};

describe('computeOilState', () => {
  it('starts in sketch holding a pencil, nothing painted', () => {
    const s = computeOilState(plan, 0);
    expect(s.phase).toBe('sketch');
    expect(s.oilDrawn).toBe(0);
    expect(s.tool).toBe('pencil');
    expect(s.sketchFractions).toEqual([0, 0]);
    expect(s.activeSketch).toBe(0);
  });

  it('draws sketch strokes sequentially', () => {
    const s = computeOilState(plan, 750); // slice = 500ms
    expect(s.sketchFractions[0]).toBe(1);
    expect(s.sketchFractions[1]).toBeCloseTo(0.5);
    expect(s.activeSketch).toBe(1);
  });

  it('block-in reveals layer-0 strokes with the big brush', () => {
    const s = computeOilState(plan, 1500); // halfway through blockIn (1000..2000), c0=2
    expect(s.phase).toBe('blockIn');
    expect(s.oilDrawn).toBe(1);
    expect(s.tool).toBe('brushBig');
  });

  it('reserves a FIXED Layer-4 tail: at the end of the bulk window, layer-4 has not started', () => {
    // refine spans 2000..8000 (6000ms). bulk = layers 1..3 (count 2), reserve = LAYER4_RESERVE_MS.
    const tBulkEnd = 2000 + (6000 - LAYER4_RESERVE_MS) - 1;
    const s = computeOilState(plan, tBulkEnd);
    expect(s.phase).toBe('refine');
    expect(s.oilDrawn).toBe(2 /*c0*/ + 2 /*c1*/); // bulk done, layer-4 not yet
  });

  it('paints the eyes/mouth (layer 4) during the reserved tail', () => {
    const tInTail = 2000 + (6000 - LAYER4_RESERVE_MS) + LAYER4_RESERVE_MS / 2;
    const s = computeOilState(plan, tInTail);
    expect(s.oilDrawn).toBe(2 + 2 + 1); // one of two layer-4 strokes
    expect(s.tool).toBe('brushFine');
  });

  it('the Layer-4 tail length is independent of bulk stroke count (stadium case)', () => {
    const heavy: OilDrawingPlan = { ...plan, oilStrokes: [mk(0), ...Array.from({ length: 200 }, () => mk(1)), mk(4), mk(4)] };
    const tInTail = 2000 + (6000 - LAYER4_RESERVE_MS) + LAYER4_RESERVE_MS / 2;
    const s = computeOilState(heavy, tInTail);
    // half of the two layer-4 strokes painted, regardless of the 200 bulk strokes
    expect(s.oilDrawn).toBe(1 /*c0*/ + 200 /*bulk*/ + 1 /*half of layer4*/);
  });

  it('accent reveals layer 5 with the pen', () => {
    const s = computeOilState(plan, 8500); // accent spans 8000..9000
    expect(s.phase).toBe('accent');
    expect(s.tool).toBe('pen');
  });

  it('oilDrawn is monotonic non-decreasing', () => {
    let prev = -1;
    for (let t = 0; t <= 9000; t += 100) {
      const d = computeOilState(plan, t).oilDrawn;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('finishes done: everything painted, hand lifted (tool null)', () => {
    const s = computeOilState(plan, 99999);
    expect(s.phase).toBe('done');
    expect(s.oilDrawn).toBe(oilStrokes.length);
    expect(s.activeOil).toBeNull();
    expect(s.tool).toBeNull();
  });

  it('paces a SHAPED curve (decelerates into the eyes/mouth climax), not monotonic acceleration', () => {
    // Heavy "stadium" plan: 200 bulk (layer 1) strokes vs 2 eyes/mouth (layer 4) strokes.
    const heavy: OilDrawingPlan = {
      ...plan,
      oilStrokes: [mk(0), ...Array.from({ length: 200 }, () => mk(1)), mk(4), mk(4)],
    };
    const T = heavy.timing;
    const refineStart = T.outlineMs + T.blockInMs;
    const reserve = Math.min(T.refineMs * 0.4, LAYER4_RESERVE_MS);
    const bulkMid = refineStart + (T.refineMs - reserve) / 2;             // middle of bulk refine
    const climaxMid = refineStart + (T.refineMs - reserve) + reserve / 2; // middle of the layer-4 tail
    const dt = 50;
    const bulkRate = computeOilState(heavy, bulkMid + dt).oilDrawn - computeOilState(heavy, bulkMid).oilDrawn;
    const climaxRate = computeOilState(heavy, climaxMid + dt).oilDrawn - computeOilState(heavy, climaxMid).oilDrawn;
    // Far fewer strokes revealed per unit time during the face climax => deliberate slowdown.
    expect(climaxRate).toBeLessThan(bulkRate);
  });
});

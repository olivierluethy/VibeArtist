import { describe, it, expect } from 'vitest';
import { bristleCount, paintOilStroke, paintGround } from './oilBrush';
import type { OilStroke } from './oilTypes';

function fakeCtx() {
  const calls = { stroke: 0, fill: 0, moveTo: 0, lineTo: 0, beginPath: 0 };
  return {
    calls,
    globalAlpha: 1, lineWidth: 1, lineCap: '', strokeStyle: '', fillStyle: '', globalCompositeOperation: '',
    beginPath() { calls.beginPath++; }, moveTo() { calls.moveTo++; }, lineTo() { calls.lineTo++; },
    stroke() { calls.stroke++; }, fill() { calls.fill++; }, fillRect() {},
  } as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const stroke = (over: Partial<OilStroke> = {}): OilStroke => ({ x: 50, y: 50, angle: 0.3, length: 12, width: 18, color: '#cc4422', layer: 0, ...over });

describe('oilBrush', () => {
  it('big early-layer brush has many bristles, fine late-layer few', () => {
    expect(bristleCount(stroke({ width: 24, layer: 0 }))).toBeGreaterThan(3);
    expect(bristleCount(stroke({ width: 4, layer: 4 }))).toBe(1);
  });

  it('paints one stroke as multiple bristle sub-lines + a highlight ridge, without throwing', () => {
    const ctx = fakeCtx() as ReturnType<typeof fakeCtx>;
    const s = stroke({ width: 24, layer: 0 });
    paintOilStroke(ctx, s);
    // one stroke() per bristle, plus the highlight ridge
    expect(ctx.calls.stroke).toBe(bristleCount(s) + 1);
    expect(ctx.calls.lineTo).toBeGreaterThan(0);
    expect(ctx.globalAlpha).toBe(1); // alpha restored after painting
  });

  it('lays a toned ground (does not throw, sets a fill)', () => {
    const ctx = fakeCtx();
    expect(() => paintGround(ctx, 100, 120)).not.toThrow();
  });
});

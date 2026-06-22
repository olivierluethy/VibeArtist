import type { DrawingPlan, RenderState } from './types';

export function easeIn(p: number): number {
  return p * p;
}

export function computeRenderState(plan: DrawingPlan, elapsedMs: number): RenderState {
  const { strokePaths, timing } = plan;
  const n = strokePaths.length;
  const { outlineMs, shadeMs, colorMs, accelerate } = timing;
  const total = outlineMs + shadeMs + colorMs;
  const t = Math.max(0, elapsedMs);

  if (t >= total) {
    return {
      phase: 'done',
      strokeFractions: new Array(n).fill(1),
      activeStroke: null,
      shadeOpacity: 1,
      colorOpacity: 1,
    };
  }

  if (t < outlineMs) {
    const slice = n > 0 ? outlineMs / n : outlineMs;
    const strokeFractions = strokePaths.map((_, i) => {
      const start = i * slice;
      return Math.min(1, Math.max(0, (t - start) / slice));
    });
    const activeStroke = n > 0 ? Math.min(n - 1, Math.floor(t / slice)) : null;
    return { phase: 'outline', strokeFractions, activeStroke, shadeOpacity: 0, colorOpacity: 0 };
  }

  if (t < outlineMs + shadeMs) {
    const p = shadeMs > 0 ? (t - outlineMs) / shadeMs : 1;
    return {
      phase: 'shade',
      strokeFractions: new Array(n).fill(1),
      activeStroke: null,
      shadeOpacity: Math.min(1, p),
      colorOpacity: 0,
    };
  }

  const p = colorMs > 0 ? (t - outlineMs - shadeMs) / colorMs : 1;
  const colorOpacity = Math.min(1, accelerate ? easeIn(p) : p);
  return {
    phase: 'color',
    strokeFractions: new Array(n).fill(1),
    activeStroke: null,
    shadeOpacity: 1,
    colorOpacity,
  };
}

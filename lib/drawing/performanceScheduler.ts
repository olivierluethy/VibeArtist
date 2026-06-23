import type { DrawingPlan, RenderState } from './types';

export function easeIn(p: number): number {
  return p * p;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Sequential fill: each of `n` items fills over its own slice of `duration`. */
function sequentialFill(
  n: number,
  elapsed: number,
  duration: number,
): { fractions: number[]; active: number | null } {
  if (n <= 0) return { fractions: [], active: null };
  const slice = duration / n;
  const fractions = Array.from({ length: n }, (_, i) => clamp01((elapsed - i * slice) / slice));
  const active = Math.min(n - 1, Math.max(0, Math.floor(elapsed / slice)));
  return { fractions, active };
}

export function computeRenderState(plan: DrawingPlan, elapsedMs: number): RenderState {
  const { strokePaths, colorCells, timing } = plan;
  const n = strokePaths.length;
  const nCells = colorCells.length;
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
      colorProgress: 1,
      colorCellFractions: new Array(nCells).fill(1),
      activeColorCell: null,
      blendOpacity: 1,
    };
  }

  if (t < outlineMs) {
    const { fractions: strokeFractions, active: activeStroke } = sequentialFill(n, t, outlineMs);
    return {
      phase: 'outline',
      strokeFractions,
      activeStroke,
      shadeOpacity: 0,
      colorOpacity: 0,
      colorProgress: 0,
      colorCellFractions: new Array(nCells).fill(0),
      activeColorCell: null,
      blendOpacity: 0,
    };
  }

  if (t < outlineMs + shadeMs) {
    const p = shadeMs > 0 ? (t - outlineMs) / shadeMs : 1;
    return {
      phase: 'shade',
      strokeFractions: new Array(n).fill(1),
      activeStroke: null,
      shadeOpacity: clamp01(p),
      colorOpacity: 0,
      colorProgress: 0,
      colorCellFractions: new Array(nCells).fill(0),
      activeColorCell: null,
      blendOpacity: 0,
    };
  }

  // Color phase: paint the cells in sequence, then cross-blend the real photo.
  const colorElapsed = t - outlineMs - shadeMs;
  const colorProgress = clamp01(colorMs > 0 ? colorElapsed / colorMs : 1);
  const blendMs = Math.min(2500, colorMs * 0.2);
  const paintMs = Math.max(1, colorMs - blendMs);

  let colorCellFractions: number[];
  let activeColorCell: number | null;
  let blendOpacity: number;
  if (colorElapsed <= paintMs) {
    const r = sequentialFill(nCells, colorElapsed, paintMs);
    colorCellFractions = r.fractions;
    activeColorCell = r.active;
    blendOpacity = 0;
  } else {
    colorCellFractions = new Array(nCells).fill(1);
    activeColorCell = null;
    blendOpacity = clamp01((colorElapsed - paintMs) / Math.max(1, blendMs));
  }

  const colorOpacity = clamp01(accelerate ? easeIn(colorProgress) : colorProgress);
  return {
    phase: 'color',
    strokeFractions: new Array(n).fill(1),
    activeStroke: null,
    shadeOpacity: 1,
    colorOpacity,
    colorProgress,
    colorCellFractions,
    activeColorCell,
    blendOpacity,
  };
}

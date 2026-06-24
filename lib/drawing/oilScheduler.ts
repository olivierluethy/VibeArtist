import type { OilDrawingPlan, OilRenderState, Tool } from './oilTypes';

/** Fixed slow tail reserved at the end of the refine phase for the eyes/mouth (layer 4). */
export const LAYER4_RESERVE_MS = 3000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fill = (n: number, v: number) => new Array(Math.max(0, n)).fill(v);

/** Each of `n` items fills over its own equal slice of `duration`. */
function sequentialFill(n: number, elapsed: number, duration: number): { fractions: number[]; active: number | null } {
  if (n <= 0) return { fractions: [], active: null };
  const slice = duration / n;
  const fractions = Array.from({ length: n }, (_, i) => clamp01((elapsed - i * slice) / slice));
  const active = Math.min(n - 1, Math.max(0, Math.floor(elapsed / slice)));
  return { fractions, active };
}

function toolForLayer(layer: number): Tool {
  if (layer <= 0) return 'brushBig';
  if (layer === 1) return 'brushMid';
  if (layer <= 4) return 'brushFine';
  return 'pen';
}

export function computeOilState(plan: OilDrawingPlan, elapsedMs: number): OilRenderState {
  const { strokePaths, oilStrokes, timing } = plan;
  const { outlineMs, blockInMs, refineMs, accentMs } = timing;
  const n = strokePaths.length;
  const T = oilStrokes.length;
  const total = outlineMs + blockInMs + refineMs + accentMs;
  const t = Math.max(0, elapsedMs);

  const counts = [0, 1, 2, 3, 4, 5].map((L) => oilStrokes.filter((s) => s.layer === L).length);

  const settle = (phase: OilRenderState['phase'], sketchFractions: number[], drawnRaw: number): OilRenderState => {
    const oilDrawn = Math.min(T, Math.max(0, Math.floor(drawnRaw)));
    const activeOil = oilDrawn > 0 && oilDrawn <= T ? oilDrawn - 1 : null;
    const tool = activeOil != null && oilStrokes[activeOil] ? toolForLayer(oilStrokes[activeOil].layer) : null;
    return { phase, sketchFractions, activeSketch: null, oilDrawn, activeOil, tool };
  };

  if (t >= total) {
    return { phase: 'done', sketchFractions: fill(n, 1), activeSketch: null, oilDrawn: T, activeOil: null, tool: null };
  }

  // Phase 1 — sketch
  if (t < outlineMs) {
    const { fractions, active } = sequentialFill(n, t, outlineMs);
    return { phase: 'sketch', sketchFractions: fractions, activeSketch: active, oilDrawn: 0, activeOil: null, tool: 'pencil' };
  }
  const sketchDone = fill(n, 1);

  // Phase 2 — block-in (layer 0)
  if (t < outlineMs + blockInMs) {
    const p = blockInMs > 0 ? (t - outlineMs) / blockInMs : 1;
    return settle('blockIn', sketchDone, clamp01(p) * counts[0]);
  }

  // Phase 3 — refine (layers 1..3 as bulk, then fixed reserved tail for layer 4)
  const refineStart = outlineMs + blockInMs;
  if (t < refineStart + refineMs) {
    const tr = t - refineStart;
    const bulk = counts[1] + counts[2] + counts[3];
    const c4 = counts[4];
    const reserve = c4 > 0 ? Math.min(refineMs * 0.4, LAYER4_RESERVE_MS) : 0;
    const bulkMs = Math.max(1, refineMs - reserve);
    let inRefine: number;
    if (tr <= bulkMs) {
      inRefine = clamp01(tr / bulkMs) * bulk;
    } else {
      const p4 = reserve > 0 ? clamp01((tr - bulkMs) / reserve) : 1;
      inRefine = bulk + p4 * c4;
    }
    return settle('refine', sketchDone, counts[0] + inRefine);
  }

  // Phase 4 — accent (layer 5)
  const accentStart = refineStart + refineMs;
  const before = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  const p5 = accentMs > 0 ? clamp01((t - accentStart) / accentMs) : 1;
  return settle('accent', sketchDone, before + p5 * counts[5]);
}

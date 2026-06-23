import type { StrokePath } from './types';

/** One oil brush stroke, derived server-side, performed by the browser. */
export interface OilStroke {
  x: number;        // centre, display coords
  y: number;
  angle: number;    // radians — along the form (perpendicular to image gradient)
  length: number;   // px
  width: number;    // brush diameter px
  color: string;    // '#rrggbb'
  layer: number;    // 0 block-in … 5 accent. Drives order + timing + bristle count.
}

export interface OilTiming {
  outlineMs: number;   // Phase 1 sketch (reused SVG line draw)
  blockInMs: number;   // Phase 2: layer 0
  refineMs: number;    // Phase 3: layers 1..4 (with reserved Layer-4 tail)
  accentMs: number;    // Phase 4: layer 5
  photoGlaze: number;  // 0..1, DEFAULT 0 — emergency only
}

export interface OilDrawingPlan {
  width: number;
  height: number;
  strokePaths: StrokePath[];  // Phase-1 line sketch (reused)
  oilStrokes: OilStroke[];    // MUST be ordered by `layer` ascending
  colorImage: string;         // glaze source only; never painted unless photoGlaze > 0
  timing: OilTiming;
}

export type OilPhase = 'sketch' | 'blockIn' | 'refine' | 'accent' | 'done';
export type Tool = 'pencil' | 'brushBig' | 'brushMid' | 'brushFine' | 'pen';

export interface OilRenderState {
  phase: OilPhase;
  sketchFractions: number[];   // index-aligned with strokePaths, 0..1
  activeSketch: number | null; // sketch stroke under the hand
  oilDrawn: number;            // paint strokes [0, oilDrawn) onto the bitmap (monotonic)
  activeOil: number | null;    // oil stroke under the hand
  tool: Tool | null;           // tool the hand currently holds
}

export interface StrokePath {
  /** SVG path data for one continuous pencil stroke. */
  d: string;
}

export interface ColorCell {
  /** Patch rectangle in plan (display) coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The patch's colour, drawn during the color phase. */
  fill: string;
}

export interface DrawingPlanTiming {
  outlineMs: number;
  shadeMs: number;
  colorMs: number;
  /** When true, the color phase eases in (slow start, fast finish). */
  accelerate: boolean;
}

export interface DrawingPlan {
  width: number;
  height: number;
  /** Ordered strokes; drawn one after another during the outline phase. */
  strokePaths: StrokePath[];
  /** Ordered colour patches; painted one after another during the color phase. */
  colorCells: ColorCell[];
  /** Image (URL or data URI) shown during the shading phase. */
  shadingLayer: string;
  /** Final full-color portrait (URL or data URI). */
  colorImage: string;
  timing: DrawingPlanTiming;
}

export type DrawingPhase = 'outline' | 'shade' | 'color' | 'done';

export interface RenderState {
  phase: DrawingPhase;
  /** Per-stroke drawn fraction, 0..1, index-aligned with plan.strokePaths. */
  strokeFractions: number[];
  /** Index of the stroke currently being drawn (for the hand), else null. */
  activeStroke: number | null;
  shadeOpacity: number;
  colorOpacity: number;
  /** Linear 0..1 across the color phase (paint + blend together). */
  colorProgress: number;
  /** Per-cell paint fraction, 0..1, index-aligned with plan.colorCells. */
  colorCellFractions: number[];
  /** Index of the colour cell currently being painted (for the hand), else null. */
  activeColorCell: number | null;
  /** 0..1 final cross-blend of the real photo over the painted patches. */
  blendOpacity: number;
}

export interface StrokePath {
  /** SVG path data for one continuous pencil stroke. */
  d: string;
}

export interface BrushStroke {
  /** Path the brush travels (plan/display coords); currently a 2-point horizontal sweep. */
  points: { x: number; y: number }[];
  /** The stroke's colour. */
  color: string;
  /** Brush diameter — scales with how much area the colour covers. */
  width: number;
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
  /** Ordered brush strokes; painted one after another during the color phase. */
  brushStrokes: BrushStroke[];
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
  /** Per-stroke paint fraction, 0..1, index-aligned with plan.brushStrokes. */
  brushFractions: number[];
  /** Index of the brush stroke currently being painted (for the hand), else null. */
  activeBrush: number | null;
  /** 0..1 final cross-blend of the real photo over the painted patches. */
  blendOpacity: number;
}

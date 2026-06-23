import type { DrawingPlan } from '@/lib/drawing/types';
import { traceToStrokePaths } from './lineart';
import { deriveLineArtFromBuffer, deriveShadingFromBuffer } from './derive';
import { deriveBrushStrokesFromBuffer } from './brushStrokes';
import { loadImageBuffer } from './imageSource';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

// colorMs is long enough to *watch* the portrait get colored in (progressive
// scribble reveal), not a quick auto-fill. It's a tuning dial like MS_PER_STROKE.
export const DEFAULT_TIMING = { outlineMs: 18000, shadeMs: 4000, colorMs: 14000, accelerate: true };

// Outline pacing: scale the outline phase with the stroke count so each stroke
// draws at a consistent, unhurried speed no matter how many a portrait traces to.
// (A fixed outlineMs made speed swing with stroke count — 84 strokes felt rushed.)
export const MS_PER_STROKE = 450;
const MIN_OUTLINE_MS = 8000;
const MAX_OUTLINE_MS = 45000;

export function outlineMsForStrokes(n: number): number {
  return Math.min(MAX_OUTLINE_MS, Math.max(MIN_OUTLINE_MS, n * MS_PER_STROKE));
}

export async function generateDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<DrawingPlan> {
  const out = await engine.generate(input);
  const buf = await loadImageBuffer(out.colorImage);
  const lineArt = await deriveLineArtFromBuffer(buf);
  const strokePaths = await traceToStrokePaths(lineArt);
  const shadingLayer = await deriveShadingFromBuffer(buf);
  const brushStrokes = await deriveBrushStrokesFromBuffer(buf, out.width, out.height);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    brushStrokes,
    shadingLayer,
    colorImage: out.colorImage,
    timing: { ...DEFAULT_TIMING, outlineMs: outlineMsForStrokes(strokePaths.length) },
  };
}

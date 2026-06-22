import type { DrawingPlan } from '@/lib/drawing/types';
import { traceToStrokePaths } from './lineart';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

export const DEFAULT_TIMING = { outlineMs: 18000, shadeMs: 5000, colorMs: 6000, accelerate: true };

export async function generateDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<DrawingPlan> {
  const out = await engine.generate(input);
  const strokePaths = await traceToStrokePaths(out.lineArtImage);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    shadingLayer: out.lineArtImage,
    colorImage: out.colorImage,
    timing: DEFAULT_TIMING,
  };
}

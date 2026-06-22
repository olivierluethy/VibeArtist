import type { DrawingPlan } from '@/lib/drawing/types';
import { traceToStrokePaths } from './lineart';
import { deriveLineArt, deriveShading } from './derive';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

export const DEFAULT_TIMING = { outlineMs: 18000, shadeMs: 5000, colorMs: 6000, accelerate: true };

export async function generateDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<DrawingPlan> {
  const out = await engine.generate(input);
  const lineArt = await deriveLineArt(out.colorImage);
  const strokePaths = await traceToStrokePaths(lineArt);
  const shadingLayer = await deriveShading(out.colorImage);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    shadingLayer,
    colorImage: out.colorImage,
    timing: DEFAULT_TIMING,
  };
}

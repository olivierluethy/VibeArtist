import type { DrawingPlan } from '@/lib/drawing/types';
import { traceToStrokePaths } from './lineart';
import { deriveLineArtFromBuffer, deriveShadingFromBuffer } from './derive';
import { loadImageBuffer } from './imageSource';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

export const DEFAULT_TIMING = { outlineMs: 18000, shadeMs: 5000, colorMs: 6000, accelerate: true };

export async function generateDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<DrawingPlan> {
  const out = await engine.generate(input);
  const buf = await loadImageBuffer(out.colorImage);
  const lineArt = await deriveLineArtFromBuffer(buf);
  const strokePaths = await traceToStrokePaths(lineArt);
  const shadingLayer = await deriveShadingFromBuffer(buf);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    shadingLayer,
    colorImage: out.colorImage,
    timing: DEFAULT_TIMING,
  };
}

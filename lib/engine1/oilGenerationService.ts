import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import { traceToStrokePaths } from './lineart';
import { deriveLineArtFromBuffer } from './derive';
import { deriveOilStrokesFromBuffer } from './oilStrokes';
import { loadImageBuffer } from './imageSource';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

// v2 timing (spec §4): ~22s shaped curve. Tuned further in M4.
export const OIL_TIMING = { outlineMs: 3000, blockInMs: 5000, refineMs: 11000, accentMs: 3000, photoGlaze: 0 };

export async function generateOilDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<OilDrawingPlan> {
  const out = await engine.generate(input);
  const buf = await loadImageBuffer(out.colorImage);
  const lineArt = await deriveLineArtFromBuffer(buf);
  const strokePaths = await traceToStrokePaths(lineArt);
  // M2: no face detector yet → faceBox null (pure detail-driven). M3 wires the real detector here.
  const oilStrokes = await deriveOilStrokesFromBuffer(buf, out.width, out.height, null);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    oilStrokes,
    colorImage: out.colorImage,
    timing: { ...OIL_TIMING },
  };
}

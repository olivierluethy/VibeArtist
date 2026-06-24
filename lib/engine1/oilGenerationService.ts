import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import { traceToStrokePaths } from './lineart';
import { deriveLineArtFromBuffer } from './derive';
import { deriveOilStrokesFromBuffer } from './oilStrokes';
import { loadImageBuffer } from './imageSource';
import type { PortraitEngine, PortraitInput } from './portraitEngine';
import { detectFaceBox } from './faceBox';

// v2 timing (spec §4): ~22s shaped curve. Tuned further in M4.
export const OIL_TIMING = { outlineMs: 3000, blockInMs: 5000, refineMs: 11000, accentMs: 3000, photoGlaze: 0 };

export interface OilGenDeps { detectFaceBox?: typeof detectFaceBox }

export async function generateOilDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
  deps: OilGenDeps = {},
): Promise<OilDrawingPlan> {
  const detect = deps.detectFaceBox ?? detectFaceBox;
  const out = await engine.generate(input);
  const buf = await loadImageBuffer(out.colorImage);
  const lineArt = await deriveLineArtFromBuffer(buf);
  const strokePaths = await traceToStrokePaths(lineArt);
  const faceBox = await detect(buf, out.width, out.height);   // null offline (default runner unwired) → detail-driven
  const oilStrokes = await deriveOilStrokesFromBuffer(buf, out.width, out.height, faceBox);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    oilStrokes,
    colorImage: out.colorImage,
    timing: { ...OIL_TIMING },
  };
}

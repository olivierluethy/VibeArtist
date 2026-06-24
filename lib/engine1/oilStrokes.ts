import Jimp from 'jimp';
import type { OilStroke } from '@/lib/drawing/oilTypes';
import { buildOrientationField } from './orientationField';

export interface Rect { x: number; y: number; w: number; h: number }
export interface FaceBox { box: Rect; eyesMouth?: Rect }

// Per-layer params, matched to the validated M1 fixture look (tuned further in M4).
const LAYER_WIDTH = [30, 18, 10, 6, 4, 5];
const LAYER_LENGTH = [30, 20, 12, 8, 5, 7];
const LAYER_STEP = [34, 22, 14, 9, 5, 7]; // grid spacing in display px

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hex2 = (n: number) => clamp8(n).toString(16).padStart(2, '0');
// Deterministic pseudo-random in [0,1) from an integer seed (same as the fixture).
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

export async function deriveOilStrokesFromBuffer(
  buf: Buffer,
  dispW: number,
  dispH: number,
  _faceBox: FaceBox | null = null, // accepted now; used from Task 9 (box boost) / Task 10 (eyes-mouth)
): Promise<OilStroke[]> {
  const field = await buildOrientationField(buf);

  // Small colour-sampling grid (bilinear average per cell).
  const img = await Jimp.read(buf);
  const cW = Math.max(8, Math.min(64, img.bitmap.width));
  const cH = Math.max(8, Math.round((cW * img.bitmap.height) / img.bitmap.width));
  const small = img.clone().resize(cW, cH);
  const sampleColor = (dispX: number, dispY: number, seed: number): string => {
    const cx = Math.max(0, Math.min(cW - 1, Math.floor((dispX / dispW) * cW)));
    const cy = Math.max(0, Math.min(cH - 1, Math.floor((dispY / dispH) * cH)));
    const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(cx, cy));
    const j = (rnd(seed) - 0.5) * 16; // ±8 seeded colour jitter
    return `#${hex2(r + j)}${hex2(g + j)}${hex2(b + j)}`;
  };

  const out: OilStroke[] = [];
  // Emit one layer over a jittered grid, keeping a stroke only where `gate` passes.
  const emitLayer = (layer: number, gate: (x: number, y: number) => boolean) => {
    const step = LAYER_STEP[layer];
    let seed = layer * 100000;
    for (let y = step / 2; y < dispH; y += step) {
      for (let x = step / 2; x < dispW; x += step) {
        if (!gate(x, y)) continue;
        const jx = (rnd(seed++) - 0.5) * step * 0.6;
        const jy = (rnd(seed++) - 0.5) * step * 0.6;
        const px = Math.max(0, Math.min(dispW, x + jx));
        const py = Math.max(0, Math.min(dispH, y + jy));
        out.push({
          x: px, y: py,
          angle: field.angleAt(px, py, dispW, dispH),
          length: LAYER_LENGTH[layer],
          width: LAYER_WIDTH[layer],
          color: sampleColor(px, py, seed),
          layer,
        });
      }
    }
  };

  const inRect = (x: number, y: number, rect?: Rect) =>
    !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  // Magnitude gate that relaxes inside the face box (more, smaller strokes there).
  const magGate = (base: number, boost: number) => (x: number, y: number) => {
    const m = field.magnitudeAt(x, y, dispW, dispH);
    const thresh = inRect(x, y, _faceBox?.box) ? base - boost : base;
    return m > thresh;
  };

  emitLayer(0, () => true);                                          // block-in: covers everything
  emitLayer(1, (x, y) => field.magnitudeAt(x, y, dispW, dispH) > 0.15); // forms: low magnitude gate
  emitLayer(2, magGate(0.30, 0.20)); // detail: mid gate, boosted inside the box
  emitLayer(3, magGate(0.50, 0.25)); // fine: high gate, boosted inside the box
  return out;
}

import type { FaceBox, Rect } from './oilStrokes';

/** A raw face detection in NORMALISED [0,1] coords (the model's output space). */
export interface RawDetection {
  box: { x: number; y: number; w: number; h: number };
  keypoints: { x: number; y: number }[]; // order: 0 left-eye, 1 right-eye, 2 nose, 3 mouth, 4/5 cheeks
}

const EM_PAD = 0.25; // pad the eyes/mouth span by 25% of its extent

/** Scale a normalised detection to DISPLAY coords; span the eyes/mouth sub-region from keypoints 0–3. */
export function toFaceBox(raw: RawDetection, dispW: number, dispH: number): FaceBox {
  const box: Rect = { x: raw.box.x * dispW, y: raw.box.y * dispH, w: raw.box.w * dispW, h: raw.box.h * dispH };
  const kp = raw.keypoints;
  if (kp.length < 4) return { box };
  const pts = [kp[0], kp[1], kp[2], kp[3]].map((p) => ({ x: p.x * dispW, y: p.y * dispH }));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * EM_PAD, padY = (maxY - minY) * EM_PAD;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const x = Math.max(box.x, minX), y = Math.max(box.y, minY);
  const eyesMouth: Rect = { x, y, w: Math.min(box.x + box.w, maxX) - x, h: Math.min(box.y + box.h, maxY) - y };
  return { box, eyesMouth };
}

export type FaceModelRunner = (buf: Buffer) => Promise<RawDetection | null>;

/** Real BlazeFace inference is wired in the network-gated task (M3.4). Until then this throws,
 *  so detectFaceBox falls back to null and derivation stays pure detail-driven. NO onnxruntime import here. */
const defaultRunner: FaceModelRunner = async () => {
  throw new Error('faceBox: BlazeFace runner not wired (M3.4 — needs onnxruntime-node@1.24.3 + a clean-license model)');
};

/** Server-side face detection. NON-BLOCKING: any failure (missing model, throw, no face) → null. */
export async function detectFaceBox(
  buf: Buffer, dispW: number, dispH: number, runner: FaceModelRunner = defaultRunner,
): Promise<FaceBox | null> {
  try {
    const raw = await runner(buf);
    return raw ? toFaceBox(raw, dispW, dispH) : null;
  } catch {
    return null;
  }
}

import path from 'node:path';
import Jimp from 'jimp';
import type { FaceModelRunner, RawDetection } from './faceBox';

/**
 * M3.4 — real BlazeFace short-range face detector (server-side, Node runtime).
 *
 * Model: `lib/engine1/models/blazeface.onnx` (MediaPipe BlazeFace short-range, tf2onnx-converted,
 * Apache-2.0 — see models/README.md). Contract verified against the committed graph:
 *   input          : "input"          float32 [1,128,128,3]  (NHWC, RGB, normalized px/127.5 - 1)
 *   regressors     : "regressors"     float32 [1,896,16]     (box + 6 keypoints, raw)
 *   classificators : "classificators" float32 [1,896,1]      (raw pre-sigmoid scores)
 *
 * Decode follows MediaPipe's `face_detection_short_range_common.pbtxt`
 * (TensorsToDetections + SsdAnchors), reproduced below so it stays self-contained:
 *   anchors      : num_layers 4, strides [8,16,16,16], anchor_offset 0.5, fixed_anchor_size
 *                  → 16×16×2 (stride 8) + 8×8×6 (stride 16) = 896 anchors, w=h=1.
 *   box encoding : reverse_output_order=true → raw = [x_center, y_center, w, h, (kp_x,kp_y)×6];
 *                  x/y/w/h scales all 128. keypoints 0 R-eye,1 L-eye,2 nose,3 mouth,4 R-ear,5 L-ear.
 *   score        : sigmoid(clip(raw, -100, 100)); keep ≥ MIN_SCORE.
 *
 * This module is imported ONLY lazily (via faceBox.ts's default runner) so onnxruntime-node never
 * enters faceBox.ts's static graph — the offline/test paths stay pure and the fallback stays clean.
 */

const INPUT_SIZE = 128;
const NUM_ANCHORS = 896;
const NUM_COORDS = 16;
const MIN_SCORE = 0.5; // MediaPipe short-range min_score_thresh
const IOU_THRESH = 0.3;

/** Generate the 896 anchor centers in the model's row order (fixed_anchor_size ⇒ w=h=1, unused). */
function buildAnchors(): { x: number; y: number }[] {
  const anchors: { x: number; y: number }[] = [];
  // MediaPipe aggregates consecutive same-stride layers: stride 8 → 2 anchors/cell; strides 16(×3) → 6.
  const layers: { stride: number; perCell: number }[] = [
    { stride: 8, perCell: 2 },
    { stride: 16, perCell: 6 },
  ];
  for (const { stride, perCell } of layers) {
    const fm = Math.ceil(INPUT_SIZE / stride); // 16, then 8
    for (let y = 0; y < fm; y++) {
      for (let x = 0; x < fm; x++) {
        const xc = (x + 0.5) / fm;
        const yc = (y + 0.5) / fm;
        for (let a = 0; a < perCell; a++) anchors.push({ x: xc, y: yc });
      }
    }
  }
  return anchors; // length 512 + 384 = 896
}

const ANCHORS = buildAnchors();

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const clipScore = (v: number) => (v < -100 ? -100 : v > 100 ? 100 : v);

interface Det {
  score: number;
  xmin: number;
  ymin: number;
  w: number;
  h: number;
  keypoints: { x: number; y: number }[];
}

/** Decode the raw model tensors into normalized detections above threshold. */
function decode(regressors: Float32Array, scores: Float32Array): Det[] {
  const dets: Det[] = [];
  for (let i = 0; i < NUM_ANCHORS; i++) {
    const score = sigmoid(clipScore(scores[i]));
    if (score < MIN_SCORE) continue;
    const o = i * NUM_COORDS;
    const anchor = ANCHORS[i];
    // reverse_output_order: [x_center, y_center, w, h, kp...]; scales = 128; fixed anchor w=h=1.
    const xc = regressors[o] / INPUT_SIZE + anchor.x;
    const yc = regressors[o + 1] / INPUT_SIZE + anchor.y;
    const w = regressors[o + 2] / INPUT_SIZE;
    const h = regressors[o + 3] / INPUT_SIZE;
    const keypoints: { x: number; y: number }[] = [];
    for (let k = 0; k < 6; k++) {
      keypoints.push({
        x: regressors[o + 4 + k * 2] / INPUT_SIZE + anchor.x,
        y: regressors[o + 4 + k * 2 + 1] / INPUT_SIZE + anchor.y,
      });
    }
    dets.push({ score, xmin: xc - w / 2, ymin: yc - h / 2, w, h, keypoints });
  }
  return dets;
}

function iou(a: Det, b: Det): number {
  const x1 = Math.max(a.xmin, b.xmin);
  const y1 = Math.max(a.ymin, b.ymin);
  const x2 = Math.min(a.xmin + a.w, b.xmin + b.w);
  const y2 = Math.min(a.ymin + a.h, b.ymin + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Highest-scoring face after light NMS (we only need the single portrait subject). */
function bestFace(dets: Det[]): Det | null {
  if (dets.length === 0) return null;
  const sorted = [...dets].sort((p, q) => q.score - p.score);
  const top = sorted[0];
  // Guard: if a spurious peak overlaps nothing else it can still win, but for a portrait the subject
  // is by far the strongest cluster; NMS here is a formality that keeps top stable if we ever return >1.
  for (let i = 1; i < sorted.length; i++) {
    if (iou(top, sorted[i]) > IOU_THRESH) continue; // suppressed neighbour, ignore
  }
  return top;
}

// Cache the ONNX session across calls — building it is the expensive part.
let sessionPromise: Promise<import('onnxruntime-node').InferenceSession> | null = null;

async function getSession() {
  if (!sessionPromise) {
    // Next.js server runs from the project root, so cwd resolves the committed model.
    const modelPath = path.join(process.cwd(), 'lib', 'engine1', 'models', 'blazeface.onnx');
    sessionPromise = import('onnxruntime-node').then((ort) =>
      ort.InferenceSession.create(modelPath),
    );
  }
  return sessionPromise;
}

/** Resize to 128×128 and build the NHWC float tensor data, normalized to [-1,1]. */
async function preprocess(buf: Buffer): Promise<Float32Array> {
  const img = (await Jimp.read(buf)).resize(INPUT_SIZE, INPUT_SIZE);
  const { data } = img.bitmap; // RGBA, row-major
  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let p = 0, s = 0, d = 0; p < INPUT_SIZE * INPUT_SIZE; p++, s += 4, d += 3) {
    out[d] = data[s] / 127.5 - 1; // R
    out[d + 1] = data[s + 1] / 127.5 - 1; // G
    out[d + 2] = data[s + 2] / 127.5 - 1; // B
  }
  return out;
}

/**
 * The real runner. Decodes the buffer FIRST (so invalid/junk buffers reject before onnxruntime is
 * even imported — keeps the offline default-runner path light), then runs inference + decode.
 * Any failure propagates and is turned into `null` by detectFaceBox's try/catch (non-blocking).
 */
export const blazeFaceRunner: FaceModelRunner = async (buf: Buffer): Promise<RawDetection | null> => {
  const input = await preprocess(buf); // throws on non-image buffers → caught upstream → null
  const ort = await import('onnxruntime-node');
  const session = await getSession();
  const tensor = new ort.Tensor('float32', input, [1, INPUT_SIZE, INPUT_SIZE, 3]);
  const results = await session.run({ [session.inputNames[0]]: tensor });

  // Identify outputs by their trailing dimension (16 = regressors, 1 = scores) to be name-robust.
  const outs = session.outputNames.map((n) => results[n]);
  const reg = outs.find((t) => t.dims[t.dims.length - 1] === NUM_COORDS);
  const cls = outs.find((t) => t.dims[t.dims.length - 1] === 1);
  if (!reg || !cls) return null;

  const face = bestFace(decode(reg.data as Float32Array, cls.data as Float32Array));
  if (!face) return null;
  return {
    box: { x: face.xmin, y: face.ymin, w: face.w, h: face.h },
    keypoints: face.keypoints,
  };
};

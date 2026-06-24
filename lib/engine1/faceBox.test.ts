import { describe, it, expect } from 'vitest';
import { toFaceBox, detectFaceBox, type RawDetection } from './faceBox';

const raw: RawDetection = {
  box: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 },
  keypoints: [ { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.65 } ], // L eye, R eye, nose, mouth
};

describe('toFaceBox', () => {
  it('scales the normalized face box to display coords', () => {
    const fb = toFaceBox(raw, 400, 500);
    expect(fb.box.x).toBeCloseTo(100); expect(fb.box.y).toBeCloseTo(100);
    expect(fb.box.w).toBeCloseTo(200); expect(fb.box.h).toBeCloseTo(300);
  });
  it('spans the EXACT eyes/mouth Rect from keypoints, clamped inside the face box (⊆ box invariant)', () => {
    const fb = toFaceBox(raw, 400, 500);
    const em = fb.eyesMouth!;
    // display pts: L-eye(160,200) R-eye(240,200) nose(200,250) mouth(200,325) → span x160..240 y200..325;
    // +25% pad → x140..260 y168.75..356.25; clamped into box(100..300 × 100..400):
    expect(em.x).toBeCloseTo(140);  expect(em.y).toBeCloseTo(168.75);
    expect(em.w).toBeCloseTo(120);  expect(em.h).toBeCloseTo(187.5);
    // INVARIANT: eyesMouth ⊆ box (else the dedicated layer-4 pass would paint OUTSIDE the face)
    expect(em.x).toBeGreaterThanOrEqual(fb.box.x);
    expect(em.y).toBeGreaterThanOrEqual(fb.box.y);
    expect(em.x + em.w).toBeLessThanOrEqual(fb.box.x + fb.box.w + 1e-6);
    expect(em.y + em.h).toBeLessThanOrEqual(fb.box.y + fb.box.h + 1e-6);
  });
  it('omits eyesMouth when fewer than 4 keypoints', () => {
    expect(toFaceBox({ box: raw.box, keypoints: [{ x: 0.5, y: 0.5 }] }, 400, 500).eyesMouth).toBeUndefined();
  });
});

describe('detectFaceBox (seam + non-blocking fallback)', () => {
  const buf = Buffer.from('x');
  it('runner throws → null (never blocks generation)', async () => {
    expect(await detectFaceBox(buf, 400, 500, async () => { throw new Error('boom'); })).toBeNull();
  });
  it('runner finds no face → null', async () => {
    expect(await detectFaceBox(buf, 400, 500, async () => null)).toBeNull();
  });
  it('runner detects a face → scaled FaceBox with eyesMouth', async () => {
    const fb = await detectFaceBox(buf, 400, 500, async () => raw);
    expect(fb).not.toBeNull(); expect(fb!.box.w).toBeCloseTo(200); expect(fb!.eyesMouth).toBeDefined();
  });
  it('the DEFAULT (unwired) runner makes detection fall back to null — offline-safe', async () => {
    expect(await detectFaceBox(buf, 400, 500)).toBeNull(); // defaultRunner throws → caught → null
  });
});

import { describe, it, expect } from 'vitest';
import Jimp from 'jimp';
import { generateOilDrawingPlan } from './oilGenerationService';
import { generateDrawingPlan } from './generationService'; // v1 must remain intact
import type { PortraitEngine } from './portraitEngine';

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';
const SAMPLE_DATA_URL = 'data:image/png;base64,' + SAMPLE_PNG_B64;
const fakeEngine: PortraitEngine = { async generate() { return { colorImage: SAMPLE_DATA_URL, width: 80, height: 80 }; } };

describe('generateOilDrawingPlan', () => {
  it('assembles a valid v2 OilDrawingPlan from engine output', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.colorImage).toBe(SAMPLE_DATA_URL);
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.strokePaths.length).toBeGreaterThan(0);
    expect(plan.oilStrokes.length).toBeGreaterThan(0);
  });

  it('orders oilStrokes by layer ascending', async () => {
    const { oilStrokes } = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    for (let i = 1; i < oilStrokes.length; i++) expect(oilStrokes[i].layer).toBeGreaterThanOrEqual(oilStrokes[i - 1].layer);
  });

  it('uses v2 timing with photoGlaze 0 and carries NO shading field', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.timing.photoGlaze).toBe(0);
    expect(plan.timing.blockInMs).toBeGreaterThan(0);
    expect(plan.timing.refineMs).toBeGreaterThan(0);
    expect('shadingLayer' in plan).toBe(false);
  });

  it('leaves the v1 generateDrawingPlan importable/working (untouched)', async () => {
    const v1 = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(v1.brushStrokes.length).toBeGreaterThan(0); // v1 still produces its own shape
  });
});

describe('generateOilDrawingPlan — face targeting wiring', () => {
  it('emits a layer-4 eyes/mouth pass when the detector returns a faceBox with eyesMouth', async () => {
    const detectFaceBox = async () => ({ box: { x: 0, y: 0, w: 80, h: 80 }, eyesMouth: { x: 0, y: 0, w: 80, h: 80 } });
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine, { detectFaceBox });
    expect(plan.oilStrokes.some((s) => s.layer === 4)).toBe(true);
  });
  it('falls back to a valid detail-driven plan (no layer 4) when the detector returns null', async () => {
    const detectFaceBox = async () => null;
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine, { detectFaceBox });
    expect(plan.oilStrokes.length).toBeGreaterThan(0);
    expect(plan.oilStrokes.some((s) => s.layer === 4)).toBe(false);
  });

  // Section-3 PARTIAL degrade: a face is found but eyes/mouth aren't reliably spannable (toFaceBox
  // returned { box } with no eyesMouth). Must NOT error and must NOT skip the box-boost — only the
  // dedicated layer-4 pass is skipped. (Requires `import Jimp from 'jimp'` at the top of this test file.)
  it('faceBox with box but NO eyesMouth → no layer 4, box-boost STILL applies, plan valid', async () => {
    const img = await Jimp.create(128, 160); // gradient ⇒ band-crossing cells so the boost is observable (as in M2 T9)
    for (let y = 0; y < 160; y++) for (let x = 0; x < 128; x++) {
      const v = Math.round((x / 127) ** 2 * 255); img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
    const url = 'data:image/png;base64,' + (await img.getBufferAsync(Jimp.MIME_PNG)).toString('base64');
    const gradEngine: PortraitEngine = { async generate() { return { colorImage: url, width: 400, height: 500 }; } };
    const l23 = (p: { oilStrokes: { layer: number }[] }) => p.oilStrokes.filter((s) => s.layer === 2 || s.layer === 3).length;
    const planNull = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, gradEngine, { detectFaceBox: async () => null });
    const planBox = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, gradEngine, { detectFaceBox: async () => ({ box: { x: 0, y: 0, w: 400, h: 500 } }) }); // box, NO eyesMouth
    expect(planBox.oilStrokes.some((s) => s.layer === 4)).toBe(false); // eyesMouth absent → no dedicated pass
    expect(planBox.oilStrokes.length).toBeGreaterThan(0);              // plan still valid
    expect(l23(planBox)).toBeGreaterThan(l23(planNull));               // box-boost STILL applies
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import Jimp from 'jimp';
import { deriveOilStrokesFromBuffer } from './oilStrokes';

async function busyPng(w: number, h: number): Promise<Buffer> {
  const img = await Jimp.create(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = ((x ^ y) & 16) ? 220 : 40; // high-contrast checker → lots of detail
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
  return img.getBufferAsync(Jimp.MIME_PNG);
}

describe('deriveOilStrokesFromBuffer (layers 0–1)', () => {
  let buf: Buffer;
  beforeAll(async () => { buf = await busyPng(128, 160); });

  it('produces valid in-bounds strokes', async () => {
    const s = await deriveOilStrokesFromBuffer(buf, 400, 500);
    expect(s.length).toBeGreaterThan(0);
    for (const k of s) {
      expect(k.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(k.width).toBeGreaterThan(0);
      expect(k.length).toBeGreaterThan(0);
      expect(Number.isFinite(k.angle)).toBe(true);
      expect(k.x).toBeGreaterThanOrEqual(0); expect(k.x).toBeLessThanOrEqual(400);
      expect(k.y).toBeGreaterThanOrEqual(0); expect(k.y).toBeLessThanOrEqual(500);
    }
  });

  it('is strictly layer-ascending AND contiguous (no gaps/interleaving — the scheduler indexes by per-layer count)', async () => {
    const layers = (await deriveOilStrokesFromBuffer(buf, 400, 500)).map((k) => k.layer);
    expect(new Set(layers)).toEqual(new Set([0, 1]));
    // Monotonic non-decreasing ⇒ each layer is one contiguous block; assert that explicitly.
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThanOrEqual(layers[i - 1]);
    const firstOne = layers.indexOf(1);
    expect(layers.slice(0, firstOne).every((L) => L === 0)).toBe(true); // every stroke before the first layer-1 is layer-0
    expect(layers.slice(firstOne).every((L) => L === 1)).toBe(true);    // and no layer-0 ever reappears after
  });

  it('takes each stroke angle from the orientation field tangent (consistent with T7)', async () => {
    // HORIZONTAL luminance gradient → field tangent runs VERTICAL (≈ π/2 mod π).
    // Strokes must run ALONG the form. A constant/hardcoded angle (e.g. 0) would FAIL this test —
    // only an angle genuinely read from the field passes, tying T8 to T7's verified tangent.
    const img = await Jimp.create(128, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 128; x++) {
      const v = Math.round((x / 127) * 255);
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
    const grad = await img.getBufferAsync(Jimp.MIME_PNG);
    const strokes = await deriveOilStrokesFromBuffer(grad, 400, 500);
    const distToVertical = (a: number) => {
      const d = Math.abs((((a - Math.PI / 2) % Math.PI) + Math.PI) % Math.PI);
      return Math.min(d, Math.PI - d);
    };
    const dists = strokes.map((s) => distToVertical(s.angle)).sort((x, y) => x - y);
    expect(dists[Math.floor(dists.length / 2)]).toBeLessThan(0.3); // median angle ≈ vertical
  });

  it('layer 0 blocks in across the whole canvas (top and bottom both covered)', async () => {
    // Layer 0 has the gate `() => true`, so it covers the full jittered grid regardless of content.
    // (Do NOT assert layer0 >= layer1: layer 1 has a finer grid (step 22 < 34) and on a busy image
    //  legitimately produces MORE strokes — that is correct, not a bug.)
    const s0 = (await deriveOilStrokesFromBuffer(buf, 400, 500)).filter((k) => k.layer === 0);
    expect(s0.length).toBeGreaterThan(0);
    expect(s0.some((k) => k.y < 100)).toBe(true);   // strokes near the top
    expect(s0.some((k) => k.y > 400)).toBe(true);   // strokes near the bottom
  });

  it('is deterministic', async () => {
    const a = await deriveOilStrokesFromBuffer(buf, 400, 500);
    const b = await deriveOilStrokesFromBuffer(buf, 400, 500);
    expect(a).toEqual(b);
  });
});

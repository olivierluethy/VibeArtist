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

// Quadratic luminance ramp → a CONTINUUM of detail magnitudes (slope grows with x),
// so some cells land between the boosted and base gate thresholds.
async function gradPng(w: number, h: number): Promise<Buffer> {
  const img = await Jimp.create(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.round((x / (w - 1)) ** 2 * 255);
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
    // Layers 0–3 are all emitted (T9 added layers 2–3 after layers 0–1).
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3]));
    // Monotonic non-decreasing ⇒ each layer is one contiguous block; assert that explicitly.
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThanOrEqual(layers[i - 1]);
    const firstOne = layers.indexOf(1);
    expect(layers.slice(0, firstOne).every((L) => L === 0)).toBe(true); // every stroke before the first layer-1 is layer-0
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

describe('deriveOilStrokesFromBuffer (layers 2–3 + box boost)', () => {
  it('a busy image yields more layer 2–3 strokes than a flat image', async () => {
    const busy = await busyPng(128, 160);
    const flatImg = await Jimp.create(128, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 128; x++) flatImg.setPixelColor(Jimp.rgbaToInt(128,128,128,255), x, y);
    const flat = await flatImg.getBufferAsync(Jimp.MIME_PNG);
    const det = (s: { layer: number }[]) => s.filter((k) => k.layer === 2 || k.layer === 3).length;
    expect(det(await deriveOilStrokesFromBuffer(busy, 400, 500)))
      .toBeGreaterThan(det(await deriveOilStrokesFromBuffer(flat, 400, 500)));
  });

  it('box boost is a DENSITY effect: strictly more layer 2–3 strokes centred INSIDE the box', async () => {
    // gradPng gives a continuum of magnitudes (no saturation), so lowering the gate inside the box
    // is a strict superset there. Pin the positive effect: more detail strokes land inside the box.
    // (Localization — that the boost is confined to the box, not global — is verified by CODE-READ in
    //  review: the gate is `inRect(x,y,box) ? base - boost : base`. An emergent "nothing added outside"
    //  equality is fragile because the per-pass seed advance diverges the outside jitter between runs.)
    const grad = await gradPng(128, 160);
    const box = { x: 0, y: 0, w: 200, h: 500 }; // left half, display coords
    const detIn = (s: { layer: number; x: number }[]) =>
      s.filter((k) => (k.layer === 2 || k.layer === 3) && k.x <= 200).length;
    const base = await deriveOilStrokesFromBuffer(grad, 400, 500, null);
    const boosted = await deriveOilStrokesFromBuffer(grad, 400, 500, { box });
    expect(detIn(boosted)).toBeGreaterThan(detIn(base));
  });

  it('stays strictly layer-ascending AND contiguous over {0,1,2,3}', async () => {
    const layers = (await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, { box: { x: 0, y: 0, w: 400, h: 500 } })).map((k) => k.layer);
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3]));
    expect(layers).toEqual([...layers].sort((a, b) => a - b)); // monotonic non-decreasing ⇒ contiguous blocks, no interleaving
    expect(Math.max(...layers)).toBe(3);
  });

  it('faceBox=null → pure-magnitude fallback: valid non-empty plan, layers 0–3 only', async () => {
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, null);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((k) => k.layer >= 0 && k.layer <= 3)).toBe(true);
  });

  it('does NOT emit any eyes/mouth (layer 4+) pass yet — deferred to T10 — even when eyesMouth is provided', async () => {
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, {
      box: { x: 120, y: 110, w: 160, h: 190 },
      eyesMouth: { x: 150, y: 180, w: 100, h: 120 },
    });
    expect(s.some((k) => k.layer >= 4)).toBe(false); // T9 ignores eyesMouth; no layer-4 special-casing
    expect(Math.max(...s.map((k) => k.layer))).toBe(3);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import Jimp from 'jimp';
import { buildOrientationField } from './orientationField';

/** Build a PNG buffer from a per-pixel luminance function (0..255). */
async function lumPng(w: number, h: number, lum: (x: number, y: number) => number): Promise<Buffer> {
  const img = await Jimp.create(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, Math.round(lum(x, y))));
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
  }
  return img.getBufferAsync(Jimp.MIME_PNG);
}

/** Distance between two angles modulo π (orientation is undirected). */
const angleDistModPi = (a: number, b: number) => {
  const d = Math.abs(((a - b) % Math.PI + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};

describe('buildOrientationField', () => {
  let vertical: Buffer;   // luminance changes along Y → gradient is vertical
  let horizontal: Buffer; // luminance changes along X → gradient is horizontal
  let flat: Buffer;

  beforeAll(async () => {
    vertical = await lumPng(64, 64, (_x, y) => (y / 63) * 255);
    horizontal = await lumPng(64, 64, (x, _y) => (x / 63) * 255);
    flat = await lumPng(64, 64, () => 128);
  });

  it('vertical gradient → tangent runs horizontal (≈ 0 mod π)', async () => {
    const f = await buildOrientationField(vertical);
    expect(angleDistModPi(f.angleAt(32, 32, 64, 64), 0)).toBeLessThan(0.3);
  });

  it('horizontal gradient → tangent runs vertical (≈ π/2 mod π)', async () => {
    const f = await buildOrientationField(horizontal);
    expect(angleDistModPi(f.angleAt(32, 32, 64, 64), Math.PI / 2)).toBeLessThan(0.3);
  });

  it('flat image → ~zero magnitude and a stable default angle (no NaN/spin)', async () => {
    const f = await buildOrientationField(flat);
    expect(f.magnitudeAt(32, 32, 64, 64)).toBeLessThan(0.05);
    expect(Number.isFinite(f.angleAt(32, 32, 64, 64))).toBe(true);
    expect(f.angleAt(10, 10, 64, 64)).toBe(f.angleAt(50, 50, 64, 64)); // constant default
  });

  it('an edge region has higher magnitude than a flat region', async () => {
    // left half black, right half white → strong vertical edge down the middle
    const edge = await lumPng(64, 64, (x) => (x < 32 ? 0 : 255));
    const f = await buildOrientationField(edge);
    expect(f.magnitudeAt(32, 32, 64, 64)).toBeGreaterThan(f.magnitudeAt(8, 32, 64, 64));
  });

  it('is deterministic (same buffer → identical angles)', async () => {
    const a = await buildOrientationField(vertical);
    const b = await buildOrientationField(vertical);
    expect(a.angleAt(20, 40, 64, 64)).toBe(b.angleAt(20, 40, 64, 64));
  });
});

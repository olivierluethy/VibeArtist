import { describe, it, expect } from 'vitest';
import { hasFace } from './face';

function solid(r: number, g: number, b: number, n = 100): ImageData {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: n, height: n, colorSpace: 'srgb' } as ImageData;
}

describe('hasFace', () => {
  it('accepts an image dominated by skin tones', () => {
    expect(hasFace(solid(225, 175, 140))).toBe(true);
  });
  it('rejects an image with no skin tones', () => {
    expect(hasFace(solid(10, 10, 200))).toBe(false);
  });
});

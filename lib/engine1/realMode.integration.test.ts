import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateDrawingPlan } from './generationService';
import { RealPortraitEngine } from './realPortraitEngine';

// A small valid PNG (black shapes on white) so potrace traces real paths.
const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORTRAIT_API_URL;
  delete process.env.PORTRAIT_API_KEY;
});

describe('real-mode pipeline (provider returns one portrait, line-art + shading derived locally)', () => {
  it('fetches the portrait URL, derives line-art and shading locally, returns a plan with real stroke paths', async () => {
    process.env.PORTRAIT_API_URL = 'https://provider.example/generate';
    process.env.PORTRAIT_API_KEY = 'test-key';
    const pngBytes = Buffer.from(SAMPLE_PNG_B64, 'base64');

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === 'https://provider.example/generate') {
        // The image provider responds with a single portrait URL (one-image contract).
        return new Response(
          JSON.stringify({
            colorImage: 'https://cdn.example/portrait.png',
            width: 80,
            height: 80,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u === 'https://cdn.example/portrait.png') {
        // Fetched multiple times: once for line-art derivation, once for shading derivation.
        return new Response(pngBytes, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generateDrawingPlan(
      { selfie: 'data:image/png;base64,AAAA', team: 'Brazil', player: 'Neymar' },
      new RealPortraitEngine(),
    );

    // The provider was POSTed and the portrait URL was fetched (for derive).
    const fetchedUrls = fetchMock.mock.calls.map(([u]: [unknown]) => String(u));
    expect(fetchedUrls).toContain('https://provider.example/generate');
    expect(fetchedUrls).toContain('https://cdn.example/portrait.png');

    // Line-art derived locally and traced into real strokes.
    expect(plan.strokePaths.length).toBeGreaterThan(0);

    // Plan carries the provider's color image and the standard pacing.
    expect(plan.colorImage).toBe('https://cdn.example/portrait.png');
    expect(plan.shadingLayer).toMatch(/^data:image\/png/);
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.timing.accelerate).toBe(true);
  });
});

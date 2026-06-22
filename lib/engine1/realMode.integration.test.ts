import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateDrawingPlan } from './generationService';
import { RealPortraitEngine } from './realPortraitEngine';

// A small valid PNG (black shapes on white) so potrace traces real paths.
const LINEART_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORTRAIT_API_URL;
  delete process.env.PORTRAIT_API_KEY;
});

describe('real-mode pipeline (provider returns line-art as a URL)', () => {
  it('fetches the URL line-art, traces it, and returns a plan with real stroke paths', async () => {
    process.env.PORTRAIT_API_URL = 'https://provider.example/generate';
    process.env.PORTRAIT_API_KEY = 'test-key';
    const pngBytes = Buffer.from(LINEART_PNG_B64, 'base64');

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === 'https://provider.example/generate') {
        // The image provider responds with REMOTE URLs (the realistic case).
        return new Response(
          JSON.stringify({
            colorImage: 'https://cdn.example/portrait.png',
            lineArtImage: 'https://cdn.example/lineart.png',
            width: 80,
            height: 80,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u === 'https://cdn.example/lineart.png') {
        return new Response(pngBytes, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generateDrawingPlan(
      { selfie: 'data:image/png;base64,AAAA', team: 'Brazil', player: 'Neymar' },
      new RealPortraitEngine(),
    );

    // Both hops happened: the provider was called, then the line-art URL was fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The URL-delivered line-art was actually decoded and traced into real strokes.
    expect(plan.strokePaths.length).toBeGreaterThan(0);
    // The plan carries the provider's images and the standard pacing.
    expect(plan.colorImage).toBe('https://cdn.example/portrait.png');
    expect(plan.shadingLayer).toBe('https://cdn.example/lineart.png');
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.timing.accelerate).toBe(true);
  });
});

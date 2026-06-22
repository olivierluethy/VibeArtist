import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealPortraitEngine } from './realPortraitEngine';

afterEach(() => vi.unstubAllGlobals());

describe('RealPortraitEngine', () => {
  it('posts the prompt and maps the response', async () => {
    process.env.PORTRAIT_API_URL = 'https://api.example.com/generate';
    process.env.PORTRAIT_API_KEY = 'secret';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ colorImage: 'c.png', lineArtImage: 'l.png', width: 400, height: 500 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await new RealPortraitEngine().generate({ selfie: 'data:...', team: 'Brazil' });

    expect(out.colorImage).toBe('c.png');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toContain('Brazil');
  });

  it('throws a clear error when not configured', async () => {
    delete process.env.PORTRAIT_API_URL;
    await expect(new RealPortraitEngine().generate({ selfie: 'x', team: 'Brazil' })).rejects.toThrow(
      /not configured/i,
    );
  });
});

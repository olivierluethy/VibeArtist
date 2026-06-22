import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealPortraitEngine } from './realPortraitEngine';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORTRAIT_API_POLL;
  delete process.env.PORTRAIT_API_POLL_INTERVAL_MS;
});

describe('RealPortraitEngine', () => {
  it('posts the prompt and maps the response', async () => {
    process.env.PORTRAIT_API_URL = 'https://api.example.com/generate';
    process.env.PORTRAIT_API_KEY = 'secret';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ colorImage: 'c.png', width: 400, height: 500 }),
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

  it('throws on a non-2xx response', async () => {
    process.env.PORTRAIT_API_URL = 'https://api.example.com/generate';
    delete process.env.PORTRAIT_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 422 })));
    await expect(
      new RealPortraitEngine().generate({ selfie: 'data:...', team: 'Brazil' }),
    ).rejects.toThrow(/Portrait API error/i);
  });

  it('polls for the result when PORTRAIT_API_POLL=1', async () => {
    process.env.PORTRAIT_API_URL = 'https://api.example.com/generate';
    process.env.PORTRAIT_API_KEY = 'secret';
    process.env.PORTRAIT_API_POLL = '1';
    process.env.PORTRAIT_API_POLL_INTERVAL_MS = '1';

    let call = 0;
    const fetchMock = vi.fn(async (url: string) => {
      call++;
      if (call === 1) {
        // First call: POST — returns a job to poll
        return new Response(
          JSON.stringify({ status: 'starting', pollUrl: 'https://api.example.com/poll/1' }),
          { status: 200 },
        );
      }
      // Second call: GET poll — returns finished job
      return new Response(
        JSON.stringify({ status: 'succeeded', output: { colorImage: 'c.png', width: 400, height: 500 } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await new RealPortraitEngine().generate({ selfie: 'data:...', team: 'Brazil' });

    expect(out.colorImage).toBe('c.png');
    expect(out.width).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

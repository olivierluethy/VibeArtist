import { buildPrompt, type PortraitEngine, type PortraitInput, type PortraitOutput } from './portraitEngine';
import { pollUntilDone } from './poll';

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Provider adapter — pre-wired for fal.ai FLUX PuLID (identity-preserving portrait).
 *
 * Go-live config (server-side only):
 *   PORTRAIT_API_URL = https://fal.run/fal-ai/flux-pulid   (sync; blocks and returns the result)
 *   PORTRAIT_API_KEY = <your fal key>
 *
 * The sync `fal.run` endpoint returns the finished image directly, so no polling is needed.
 * The opt-in poll path (PORTRAIT_API_POLL=1) remains for the async `queue.fal.run` endpoint
 * or any other job-style provider.
 */
export class RealPortraitEngine implements PortraitEngine {
  async generate(input: PortraitInput): Promise<PortraitOutput> {
    const url = process.env.PORTRAIT_API_URL;
    const key = process.env.PORTRAIT_API_KEY;
    if (!url) throw new Error('RealPortraitEngine not configured: set PORTRAIT_API_URL');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // fal.ai authenticates with "Key <token>", not "Bearer".
        ...(key ? { authorization: `Key ${key}` } : {}),
      },
      // fal.ai FLUX PuLID contract: a single reference face image + prompt.
      // `reference_image_url` accepts a base64 data URI (our captured selfie) or a public URL.
      body: JSON.stringify({
        reference_image_url: input.selfie,
        prompt: buildPrompt(input),
        image_size: 'portrait_4_3',
      }),
    });

    if (!res.ok) throw new Error(`Portrait API error: ${res.status}`);
    let json = (await res.json()) as any;

    // Provider seam: async APIs return a job to poll. Enable with PORTRAIT_API_POLL=1.
    // (Default fal.run path is synchronous and skips this.)
    if (process.env.PORTRAIT_API_POLL === '1') {
      json = await pollUntilDone(
        json,
        {
          isDone: (j) => j.status === 'COMPLETED' || j.status === 'succeeded',
          isFailed: (j) => j.status === 'FAILED' || j.status === 'failed' || j.status === 'canceled',
          getPollUrl: (j) => j.status_url ?? j.response_url ?? j.pollUrl ?? j.urls?.get,
          headers: key ? { authorization: `Key ${key}` } : undefined,
          intervalMs: envInt('PORTRAIT_API_POLL_INTERVAL_MS', 1500),
          timeoutMs: envInt('PORTRAIT_API_POLL_TIMEOUT_MS', 60000),
        },
      );
    }

    // fal.ai returns { images: [{ url, width, height }], ... }.
    const image = json?.images?.[0];
    if (!image?.url) throw new Error('Portrait API: no image in response');
    return { colorImage: image.url, width: image.width, height: image.height };
  }
}

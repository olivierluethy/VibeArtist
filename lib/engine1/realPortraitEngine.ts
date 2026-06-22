import { buildPrompt, type PortraitEngine, type PortraitInput, type PortraitOutput } from './portraitEngine';
import { pollUntilDone } from './poll';

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export class RealPortraitEngine implements PortraitEngine {
  async generate(input: PortraitInput): Promise<PortraitOutput> {
    const url = process.env.PORTRAIT_API_URL;
    const key = process.env.PORTRAIT_API_KEY;
    if (!url) throw new Error('RealPortraitEngine not configured: set PORTRAIT_API_URL');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      // Provider-specific contract — adjust these field names to your image API.
      body: JSON.stringify({ image: input.selfie, prompt: buildPrompt(input) }),
    });

    if (!res.ok) throw new Error(`Portrait API error: ${res.status}`);
    let json = (await res.json()) as any;

    // Provider seam: async APIs return a job to poll. Enable with PORTRAIT_API_POLL=1.
    if (process.env.PORTRAIT_API_POLL === '1') {
      json = await pollUntilDone(
        json,
        {
          isDone: (j) => j.status === 'succeeded',
          isFailed: (j) => j.status === 'failed' || j.status === 'canceled',
          getPollUrl: (j) => j.pollUrl ?? j.urls?.get,
          headers: key ? { authorization: `Bearer ${key}` } : undefined,
          intervalMs: envInt('PORTRAIT_API_POLL_INTERVAL_MS', 1500),
          timeoutMs: envInt('PORTRAIT_API_POLL_TIMEOUT_MS', 60000),
        },
      );
    }

    // Provider seam: the result may be the response itself (sync) or nested under `output` (job).
    const result = json.output ?? json;
    return { colorImage: result.colorImage, width: result.width, height: result.height };
  }
}

import { buildPrompt, type PortraitEngine, type PortraitInput, type PortraitOutput } from './portraitEngine';

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
    const json = (await res.json()) as PortraitOutput;
    return {
      colorImage: json.colorImage,
      width: json.width,
      height: json.height,
    };
  }
}

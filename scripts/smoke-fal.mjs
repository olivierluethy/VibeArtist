// Throwaway smoke test: confirm the fal.ai FLUX PuLID contract (auth + request + response).
// Usage: node scripts/smoke-fal.mjs [referenceImageUrl]
// Reads PORTRAIT_API_URL / PORTRAIT_API_KEY from .env.local. Safe to delete after.
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnvLocal();
const url = env.PORTRAIT_API_URL;
const key = env.PORTRAIT_API_KEY;
const referenceImageUrl = process.argv[2] ?? 'https://thispersondoesnotexist.com/';

const prompt =
  'Hand-drawn portrait of this person as a passionate Brazil football fan, wearing the Brazil kit, ' +
  'face paint and flag colors, warm illustration, World Cup energy.';

console.log(`POST ${url}  (key: ${key ? key.slice(0, 8) + '…' : 'MISSING'})`);

const t0 = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Key ${key}` },
  body: JSON.stringify({ reference_image_url: referenceImageUrl, prompt, image_size: 'portrait_4_3' }),
});

const ms = Date.now() - t0;
console.log(`HTTP ${res.status} in ${ms} ms`);
const json = await res.json().catch(() => null);
if (!res.ok) {
  console.log('ERROR body:', JSON.stringify(json, null, 2));
  process.exit(1);
}
const img = json?.images?.[0];
console.log('images[0]:', img ? { url: img.url, width: img.width, height: img.height } : json);

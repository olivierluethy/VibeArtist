import { trace } from 'potrace';
import Jimp from 'jimp';
import type { StrokePath } from '@/lib/drawing/types';

async function loadImageBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma === -1) {
      throw new Error(`loadImageBuffer: not a data URL: ${src.slice(0, 40)}`);
    }
    return Buffer.from(src.slice(comma + 1), 'base64');
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`loadImageBuffer: failed to fetch line-art (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export function extractPathData(svg: string): string[] {
  const matches = svg.matchAll(/<path[^>]*\sd="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

export async function traceToStrokePaths(src: string): Promise<StrokePath[]> {
  const buf = await loadImageBuffer(src);
  return new Promise((resolve, reject) => {
    // Pre-validate: jimp's error may be emitted as an event (not routed to
    // potrace's callback) when the image is unreadable. Pre-checking here
    // lets us return [] gracefully for degenerate images (e.g. 1×1 test PNG).
    Jimp.read(buf, (jimpErr) => {
      if (jimpErr) {
        console.error('[lineart] traceToStrokePaths: Jimp could not decode image, returning []', jimpErr);
        return resolve([]);
      }
      trace(buf, { turdSize: 40, threshold: 160 }, (err, svg) => {
        if (err) return reject(err);
        resolve(extractPathData(svg).map((d) => ({ d })));
      });
    });
  });
}

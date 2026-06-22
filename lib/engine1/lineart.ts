import { trace } from 'potrace';
import Jimp from 'jimp';
import type { StrokePath } from '@/lib/drawing/types';

/** Decode a data URL into a Buffer for potrace. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) {
    throw new Error(`dataUrlToBuffer: not a data URL: ${dataUrl.slice(0, 40)}`);
  }
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

export function extractPathData(svg: string): string[] {
  const matches = svg.matchAll(/<path[^>]*\sd="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

export function traceToStrokePaths(pngDataUrl: string): Promise<StrokePath[]> {
  const buf = dataUrlToBuffer(pngDataUrl);
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

import { trace } from 'potrace';
import Jimp from 'jimp';
import type { StrokePath } from '@/lib/drawing/types';
import { loadImageBuffer } from './imageSource';

export function extractPathData(svg: string): string[] {
  const matches = svg.matchAll(/<path[^>]*\sd="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

/**
 * potrace bundles the whole trace into one compound `d` (many `M…` subpaths).
 * Split it into individual subpaths so each draws as its own pencil stroke —
 * turning a single blob-draw into a region-by-region sketch.
 */
export function splitSubpaths(d: string): string[] {
  return d
    .split(/(?=M)/) // potrace starts every subpath with an absolute moveto (capital M)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Cap strokes so the easel performance stays smooth (one <path> animates per frame). */
const MAX_STROKES = 160;

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
        const strokes = extractPathData(svg).flatMap(splitSubpaths);
        if (strokes.length > MAX_STROKES) {
          console.warn(`[lineart] ${strokes.length} strokes traced; capping to ${MAX_STROKES}`);
        }
        resolve(strokes.slice(0, MAX_STROKES).map((d) => ({ d })));
      });
    });
  });
}

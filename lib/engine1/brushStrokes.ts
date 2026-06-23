import Jimp from 'jimp';
import type { BrushStroke } from '@/lib/drawing/types';

/** Columns in the sampling grid. Higher = finer detail (more, smaller strokes). */
export const GRID_W = 18;

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Coarse colour bucket (4 levels/channel) used to group like-coloured areas. */
function bucket(r: number, g: number, b: number): number {
  return ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
}

/**
 * Turn the portrait into ordered brush strokes that look hand-painted:
 * - same-colour horizontal runs become sweeping strokes,
 * - brush width scales with how much area that colour covers (big area → fat
 *   brush, small detail → fine brush),
 * - strokes are ordered by colour group (largest first) so the painter clearly
 *   does "all the red, then the green, then the pink".
 */
export async function deriveBrushStrokesFromBuffer(
  buf: Buffer,
  dispW: number,
  dispH: number,
): Promise<BrushStroke[]> {
  const img = await Jimp.read(buf);
  const gridW = GRID_W;
  const gridH = Math.max(1, Math.round((GRID_W * dispH) / dispW));
  const small = img.clone().resize(gridW, gridH); // bilinear → per-cell average colour
  const cellW = dispW / gridW;
  const cellH = dispH / gridH;

  type Px = { r: number; g: number; b: number; bucket: number };
  const grid: Px[][] = [];
  for (let row = 0; row < gridH; row++) {
    const line: Px[] = [];
    for (let col = 0; col < gridW; col++) {
      const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(col, row));
      line.push({ r, g, b, bucket: bucket(r, g, b) });
    }
    grid.push(line);
  }

  // Area per colour bucket → drives ordering and brush width.
  const area = new Map<number, number>();
  for (const line of grid) for (const px of line) area.set(px.bucket, (area.get(px.bucket) ?? 0) + 1);
  const maxArea = Math.max(...area.values());

  // Merge consecutive same-bucket cells in each row into a single sweeping run.
  type Run = { y: number; x0: number; x1: number; r: number; g: number; b: number; bucket: number };
  const runs: Run[] = [];
  for (let row = 0; row < gridH; row++) {
    let col = 0;
    while (col < gridW) {
      const b0 = grid[row][col].bucket;
      let end = col;
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let cnt = 0;
      while (end < gridW && grid[row][end].bucket === b0) {
        rs += grid[row][end].r;
        gs += grid[row][end].g;
        bs += grid[row][end].b;
        cnt++;
        end++;
      }
      runs.push({
        y: row * cellH + cellH / 2,
        x0: col * cellW,
        x1: end * cellW,
        r: Math.round(rs / cnt),
        g: Math.round(gs / cnt),
        b: Math.round(bs / cnt),
        bucket: b0,
      });
      col = end;
    }
  }

  // Largest colour group first; then top-to-bottom, left-to-right within a group.
  runs.sort(
    (a, b) =>
      area.get(b.bucket)! - area.get(a.bucket)! ||
      a.bucket - b.bucket ||
      a.y - b.y ||
      a.x0 - b.x0,
  );

  const minW = cellH * 0.9;
  const extraW = cellH * 1.8;
  return runs.map((run) => ({
    points: [
      { x: run.x0, y: run.y },
      { x: run.x1, y: run.y },
    ],
    color: `#${hex(run.r)}${hex(run.g)}${hex(run.b)}`,
    // Fatter brush for colours that cover more of the canvas.
    width: minW + extraW * (area.get(run.bucket)! / maxArea),
  }));
}

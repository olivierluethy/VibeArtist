import Jimp from 'jimp';

/** One colored patch of the portrait, drawn in its own color during the color phase. */
export interface ColorCell {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string; // #rrggbb
}

/** Number of columns in the color grid. Bigger = finer (less blocky) but more patches. */
export const GRID_W = 18;

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Coarse colour bucket (4 levels/channel) used to group like-coloured cells together. */
function bucket(r: number, g: number, b: number): number {
  return ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
}

/**
 * Reduce the portrait to a grid of average-colour cells, ordered so that
 * like-coloured patches are drawn together (largest colour group first).
 * The color phase then "paints" these in sequence, in their real colours.
 */
export async function deriveColorCellsFromBuffer(
  buf: Buffer,
  dispW: number,
  dispH: number,
): Promise<ColorCell[]> {
  const img = await Jimp.read(buf);
  const gridW = GRID_W;
  const gridH = Math.max(1, Math.round((GRID_W * dispH) / dispW));
  const small = img.clone().resize(gridW, gridH); // bilinear → per-cell average colour
  const cellW = dispW / gridW;
  const cellH = dispH / gridH;

  const cells: (ColorCell & { _bucket: number })[] = [];
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(col, row));
      cells.push({
        x: col * cellW,
        y: row * cellH,
        w: cellW,
        h: cellH,
        fill: `#${hex(r)}${hex(g)}${hex(b)}`,
        _bucket: bucket(r, g, b),
      });
    }
  }

  // Order: largest colour groups first, then row-major within a group, so the
  // pen colours one area at a time ("now the red, now the green …").
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c._bucket, (counts.get(c._bucket) ?? 0) + 1);
  cells.sort((a, b) => {
    const ca = counts.get(a._bucket)!;
    const cb = counts.get(b._bucket)!;
    if (ca !== cb) return cb - ca; // bigger colour group first
    if (a._bucket !== b._bucket) return a._bucket - b._bucket;
    if (a.y !== b.y) return a.y - b.y; // then top-to-bottom
    return a.x - b.x; // then left-to-right
  });

  return cells.map(({ _bucket, ...cell }) => cell);
}

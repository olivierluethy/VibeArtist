import Jimp from 'jimp';

export interface OrientationField {
  cols: number;
  rows: number;
  maxMagnitude: number;
  /** Tangent angle (radians, along the form) at a display point. */
  angleAt(dispX: number, dispY: number, dispW: number, dispH: number): number;
  /** Normalised gradient magnitude (0..1) at a display point. */
  magnitudeAt(dispX: number, dispY: number, dispW: number, dispH: number): number;
}

const DEFAULT_ANGLE = 0; // flat regions: a gentle constant so block-in strokes don't spin
const FLAT_EPS = 0.02;   // normalised magnitude below this counts as "flat"

export async function buildOrientationField(buf: Buffer, cols = 200): Promise<OrientationField> {
  const img = await Jimp.read(buf);
  const aspect = img.bitmap.height / img.bitmap.width;
  const gridW = Math.max(8, Math.min(cols, img.bitmap.width));
  const gridH = Math.max(8, Math.round(gridW * aspect));
  const small = img.clone().resize(gridW, gridH).greyscale();

  const lum = (cx: number, cy: number): number => {
    const x = Math.max(0, Math.min(gridW - 1, cx));
    const y = Math.max(0, Math.min(gridH - 1, cy));
    return Jimp.intToRGBA(small.getPixelColor(x, y)).r / 255;
  };

  // Sobel gradient per cell.
  const gx = new Float64Array(gridW * gridH);
  const gy = new Float64Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const tl = lum(x - 1, y - 1), t = lum(x, y - 1), tr = lum(x + 1, y - 1);
      const l = lum(x - 1, y), r = lum(x + 1, y);
      const bl = lum(x - 1, y + 1), b = lum(x, y + 1), br = lum(x + 1, y + 1);
      gx[y * gridW + x] = (tr + 2 * r + br) - (tl + 2 * l + bl);
      gy[y * gridW + x] = (bl + 2 * b + br) - (tl + 2 * t + tr);
    }
  }

  // Structure-tensor smoothing (3×3) → coherent orientation + magnitude.
  const angle = new Float64Array(gridW * gridH);
  const mag = new Float64Array(gridW * gridH);
  let maxMag = 0;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let jxx = 0, jyy = 0, jxy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(gridW - 1, x + dx));
          const ny = Math.max(0, Math.min(gridH - 1, y + dy));
          const vx = gx[ny * gridW + nx], vy = gy[ny * gridW + nx];
          jxx += vx * vx; jyy += vy * vy; jxy += vx * vy;
        }
      }
      const gradAngle = 0.5 * Math.atan2(2 * jxy, jxx - jyy); // dominant gradient direction
      angle[y * gridW + x] = gradAngle + Math.PI / 2;          // tangent ⊥ gradient = along the form
      const m = Math.sqrt(jxx + jyy);
      mag[y * gridW + x] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  for (let i = 0; i < mag.length; i++) mag[i] = maxMag > 0 ? mag[i] / maxMag : 0;

  const cellOf = (dispX: number, dispY: number, dispW: number, dispH: number): number => {
    const cx = Math.max(0, Math.min(gridW - 1, Math.floor((dispX / dispW) * gridW)));
    const cy = Math.max(0, Math.min(gridH - 1, Math.floor((dispY / dispH) * gridH)));
    return cy * gridW + cx;
  };

  return {
    cols: gridW,
    rows: gridH,
    maxMagnitude: maxMag,
    angleAt(dispX, dispY, dispW, dispH) {
      const i = cellOf(dispX, dispY, dispW, dispH);
      return mag[i] < FLAT_EPS ? DEFAULT_ANGLE : angle[i];
    },
    magnitudeAt(dispX, dispY, dispW, dispH) {
      return mag[cellOf(dispX, dispY, dispW, dispH)];
    },
  };
}

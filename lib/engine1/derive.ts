import Jimp from 'jimp';
import { loadImageBuffer } from './imageSource';

const EDGE_KERNEL = [
  [-1, -1, -1],
  [-1, 8, -1],
  [-1, -1, -1],
];

async function loadJimp(src: string): Promise<Jimp> {
  const buf = await loadImageBuffer(src);
  return Jimp.read(buf);
}

/** Edge-detected line-art (dark lines on light) as a PNG data URL — traceable + shown as the sketch. */
export async function deriveLineArt(colorSrc: string): Promise<string> {
  const img = await loadJimp(colorSrc);
  img.grayscale().convolute(EDGE_KERNEL).invert();
  return img.getBase64Async(Jimp.MIME_PNG);
}

/** Grayscale portrait as a PNG data URL — used during the shade phase. */
export async function deriveShading(colorSrc: string): Promise<string> {
  const img = await loadJimp(colorSrc);
  img.grayscale();
  return img.getBase64Async(Jimp.MIME_PNG);
}

import Jimp from 'jimp';
import { loadImageBuffer } from './imageSource';

const EDGE_KERNEL = [
  [-1, -1, -1],
  [-1, 8, -1],
  [-1, -1, -1],
];

/** Edge-detected line-art (dark lines on light) as a PNG data URL — traceable + shown as the sketch. */
export async function deriveLineArtFromBuffer(buf: Buffer): Promise<string> {
  const img = await Jimp.read(buf);
  img.grayscale().convolute(EDGE_KERNEL).invert();
  return img.getBase64Async(Jimp.MIME_PNG);
}

export async function deriveLineArt(colorSrc: string): Promise<string> {
  return deriveLineArtFromBuffer(await loadImageBuffer(colorSrc));
}

/** Load an image (data: URI or http(s) URL) into a Buffer. */
export async function loadImageBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma === -1) throw new Error(`loadImageBuffer: not a data URL: ${src.slice(0, 40)}`);
    return Buffer.from(src.slice(comma + 1), 'base64');
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`loadImageBuffer: failed to fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

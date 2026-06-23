import { describe, it, expect, vi, afterEach } from 'vitest';
import { traceToStrokePaths, splitSubpaths } from './lineart';

afterEach(() => vi.unstubAllGlobals());

describe('splitSubpaths', () => {
  it('splits a compound potrace path into one stroke per subpath', () => {
    expect(splitSubpaths('M1 2 c3 4 z M5 6 l7 8 z')).toEqual(['M1 2 c3 4 z', 'M5 6 l7 8 z']);
  });

  it('returns a single stroke for a single subpath', () => {
    expect(splitSubpaths('M0 0 L1 1')).toEqual(['M0 0 L1 1']);
  });

  it('ignores empty input', () => {
    expect(splitSubpaths('')).toEqual([]);
  });
});

describe('traceToStrokePaths', () => {
  it('fetches a remote URL line-art and returns an array (decode-fail degrades to [])', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await traceToStrokePaths('https://example.com/lineart.png');
    expect(Array.isArray(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not fetch for a data URI', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const result = await traceToStrokePaths(png);
    expect(Array.isArray(result)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

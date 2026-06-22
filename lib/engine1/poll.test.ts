import { describe, it, expect, vi } from 'vitest';
import { pollUntilDone } from './poll';

const noopSleep = async () => {};

describe('pollUntilDone', () => {
  it('returns immediately when already done (no fetch)', async () => {
    const fetchMock = vi.fn();
    const result = await pollUntilDone(
      { status: 'succeeded', v: 1 },
      { isDone: (j) => j.status === 'succeeded', getPollUrl: () => 'http://poll' },
      { fetch: fetchMock as any, sleep: noopSleep },
    );
    expect(result.v).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls until the job is done', async () => {
    const responses = [{ status: 'processing' }, { status: 'succeeded', v: 42 }];
    let i = 0;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responses[i++]), { status: 200 }));
    const result = await pollUntilDone(
      { status: 'starting' },
      { isDone: (j) => j.status === 'succeeded', getPollUrl: () => 'http://poll' },
      { fetch: fetchMock as any, sleep: noopSleep },
    );
    expect(result.v).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the job fails', async () => {
    await expect(
      pollUntilDone(
        { status: 'failed' },
        { isDone: (j) => j.status === 'succeeded', isFailed: (j) => j.status === 'failed', getPollUrl: () => 'http://poll' },
        { sleep: noopSleep },
      ),
    ).rejects.toThrow(/failed/i);
  });

  it('throws on timeout', async () => {
    let t = 0;
    const now = () => (t += 100_000);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'processing' }), { status: 200 }));
    await expect(
      pollUntilDone(
        { status: 'processing' },
        { isDone: (j) => j.status === 'succeeded', getPollUrl: () => 'http://poll', timeoutMs: 1000 },
        { fetch: fetchMock as any, sleep: noopSleep, now },
      ),
    ).rejects.toThrow(/timed out/i);
  });
});

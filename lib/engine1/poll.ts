export interface PollConfig {
  /** True when the job is finished successfully. */
  isDone: (json: any) => boolean;
  /** True when the job failed/was cancelled. Only consulted while isDone is false. */
  isFailed?: (json: any) => boolean;
  /** URL to GET for the next status check, given the latest job json. */
  getPollUrl: (json: any) => string;
  intervalMs?: number; // default 1500
  timeoutMs?: number;  // default 60000
  headers?: Record<string, string>;
}

export interface PollDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Poll a provider job (starting from an already-submitted `initial` json) until it is done. */
export async function pollUntilDone(
  initial: any,
  cfg: PollConfig,
  deps: PollDeps = {},
): Promise<any> {
  const fetchFn = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const interval = cfg.intervalMs ?? 1500;
  const timeout = cfg.timeoutMs ?? 60000;
  const start = now();
  let current = initial;
  while (!cfg.isDone(current)) {
    if (cfg.isFailed?.(current)) throw new Error('Portrait job failed');
    if (now() - start > timeout) throw new Error('Portrait job timed out');
    await sleep(interval);
    const pollUrl = cfg.getPollUrl(current);
    if (!pollUrl) throw new Error('Portrait poll: no poll URL in job response');
    const res = await fetchFn(pollUrl, cfg.headers ? { headers: cfg.headers } : undefined);
    if (!res.ok) throw new Error(`Portrait poll error: ${res.status}`);
    current = await res.json();
  }
  return current;
}

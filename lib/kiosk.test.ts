import { describe, it, expect } from 'vitest';
import { isKiosk, IDLE_RESET_MS } from './kiosk';

describe('kiosk', () => {
  it('detects the kiosk query flag', () => {
    expect(isKiosk('?kiosk=1')).toBe(true);
    expect(isKiosk('?foo=bar')).toBe(false);
    expect(isKiosk('')).toBe(false);
  });
  it('exposes an idle reset window', () => {
    expect(IDLE_RESET_MS).toBeGreaterThan(0);
  });
});

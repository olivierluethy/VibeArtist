export const IDLE_RESET_MS = 60_000;

export function isKiosk(search: string): boolean {
  return new URLSearchParams(search).get('kiosk') === '1';
}

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import OilPerformance from './OilPerformance';
import { OIL_FIXTURE } from '@/lib/drawing/oilFixture';

beforeAll(() => {
  // @ts-expect-error test stub
  SVGElement.prototype.getTotalLength = () => 100;
  // @ts-expect-error test stub
  SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
  HTMLCanvasElement.prototype.getContext = () => null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

describe('OilPerformance', () => {
  it('renders one sketch path per strokePath, a painting canvas, and a hand layer', () => {
    const { container } = render(<OilPerformance plan={OIL_FIXTURE} onDone={() => {}} />);
    expect(container.querySelectorAll('path').length).toBe(OIL_FIXTURE.strokePaths.length);
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelectorAll('img').length).toBe(1); // hand only — NO colorImage <img>
  });
});

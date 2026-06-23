import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import DrawingPerformance from './DrawingPerformance';
import { WORLD_CUP_FIXTURE } from '@/lib/drawing/fixtures';

beforeAll(() => {
  // jsdom lacks SVG geometry APIs used by the component.
  // jsdom 29 does not implement SVGPathElement — path elements use SVGElement.
  // @ts-expect-error test stub
  SVGElement.prototype.getTotalLength = () => 100;
  // @ts-expect-error test stub
  SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(0), 0) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

describe('DrawingPerformance', () => {
  it('renders one path per stroke, the shading + hand layers, and the color canvas', () => {
    const { container } = render(
      <DrawingPerformance plan={WORLD_CUP_FIXTURE} onDone={() => {}} />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(WORLD_CUP_FIXTURE.strokePaths.length);
    // shading + hand imgs (the color portrait is now painted on the canvas, not an <img>).
    expect(container.querySelectorAll('img').length).toBe(2);
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});

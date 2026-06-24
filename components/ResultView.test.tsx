import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultView from './ResultView';
import { OIL_FIXTURE } from '@/lib/drawing/oilFixture';

// Give the fixture a clearly distinct colorImage sentinel so we can prove ResultView never uses it.
const PLAN_WITH_SENTINEL = {
  ...OIL_FIXTURE,
  colorImage: 'data:image/png;base64,SENTINEL_NOT_THE_SNAPSHOT',
};

const SNAPSHOT = 'blob:fake';

describe('ResultView', () => {
  let anchor: HTMLAnchorElement;

  beforeEach(() => {
    // Intercept document.createElement('a') so we can inspect href + download without a real click.
    anchor = document.createElement('a');
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchor;
      return realCreate(tag);
    });
    vi.spyOn(anchor, 'click').mockImplementation(() => {});
  });

  it('heartbeat: Download uses snapshot href+filename; displayed <img> shows snapshot, NOT plan.colorImage', () => {
    render(
      <ResultView
        plan={PLAN_WITH_SENTINEL}
        snapshot={SNAPSHOT}
        config={{ team: 'Switzerland' }}
        onRestart={() => {}}
      />,
    );

    // 1. The portrait <img> displays the snapshot, never the AI colorImage.
    const imgs = screen.getAllByRole('img');
    // The portrait image (alt="Your portrait") must use snapshot.
    const portraitImg = imgs.find((el) => el.getAttribute('alt') === 'Your portrait');
    expect(portraitImg).toBeTruthy();
    expect(portraitImg!.getAttribute('src')).toBe(SNAPSHOT);
    expect(portraitImg!.getAttribute('src')).not.toBe(PLAN_WITH_SENTINEL.colorImage);

    // 2. Clicking Download sets the anchor to snapshot, not plan.colorImage.
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(anchor.href).toBe(SNAPSHOT);
    expect(anchor.download).toBe('drawmyai-portrait.png');
    expect(anchor.href).not.toBe(PLAN_WITH_SENTINEL.colorImage);
  });
});

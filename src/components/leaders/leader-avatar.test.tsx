/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Stands in for the provider, which needs a query client and a Clerk session.
// What matters here is only that the avatar asks for the chosen art and draws it.
const ctx = vi.hoisted(() => ({ art: {} as Record<string, string> }));
vi.mock('./leader-art-provider', () => ({
  useLeaderArt: () => ({ art: ctx.art, choose: () => {} }),
}));

import { LeaderAvatar } from './leader-avatar';

beforeEach(() => { ctx.art = {}; });
afterEach(cleanup);

const imgSrc = (el: HTMLElement) => el.querySelector('img')?.getAttribute('src');

describe('LeaderAvatar', () => {
  it('draws the base printing when the player has chosen none', () => {
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    expect(imgSrc(container)).toBe('/leaders/OP06-022.webp');
  });

  it('draws the chosen printing', () => {
    ctx.art = { 'OP06-022': 'OP06-022_p2' };
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    expect(imgSrc(container)).toBe('/leaders/OP06-022_p2.webp');
  });

  it('is unaffected by a choice made for a different leader', () => {
    ctx.art = { 'OP01-003': 'OP01-003_p1' };
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    expect(imgSrc(container)).toBe('/leaders/OP06-022.webp');
  });

  it('falls back to the initial for a custom leader with no card', () => {
    const { container } = render(<LeaderAvatar name="Homebrew" colors={['red']} setCode={null} />);
    expect(imgSrc(container)).toBeUndefined();
    expect(container.textContent).toBe('H');
  });
});

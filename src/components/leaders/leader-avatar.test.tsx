/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Stands in for the provider, which needs a query client and a Clerk session.
// What matters here is only that the avatar asks for the chosen art and draws it.
const ctx = vi.hoisted(() => ({ art: {} as Record<string, string> }));
vi.mock('./leader-art-provider', () => ({
  useLeaderArt: () => ({ art: ctx.art, choose: () => {} }),
}));

import { getLeaderImage } from '@/lib/leader-visual';
import { LeaderAvatar } from './leader-avatar';

beforeEach(() => { ctx.art = {}; });
afterEach(cleanup);

const imgSrc = (el: HTMLElement) => el.querySelector('img')?.getAttribute('src');

describe('LeaderAvatar', () => {
  it('draws the base printing when the player has chosen none', () => {
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    // Which folder serves it is not this component's business: a printing with a
    // clean scan comes from clean/, one without from the generated bundle.
    expect(imgSrc(container)).toBe(getLeaderImage('OP06-022'));
  });

  it('draws the chosen printing', () => {
    ctx.art = { 'OP06-022': 'OP06-022_p2' };
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    expect(imgSrc(container)).toBe(getLeaderImage('OP06-022', 'OP06-022_p2'));
  });

  it('is unaffected by a choice made for a different leader', () => {
    ctx.art = { 'OP01-003': 'OP01-003_p1' };
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} setCode="OP06-022" />);
    // Which folder serves it is not this component's business: a printing with a
    // clean scan comes from clean/, one without from the generated bundle.
    expect(imgSrc(container)).toBe(getLeaderImage('OP06-022'));
  });

  it('falls back to the initial for a custom leader with no card', () => {
    const { container } = render(<LeaderAvatar name="Homebrew" colors={['red']} setCode={null} />);
    expect(imgSrc(container)).toBeUndefined();
    expect(container.textContent).toBe('H');
  });
});

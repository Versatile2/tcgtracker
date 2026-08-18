/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// The provider needs a query client and a Clerk session; what these tests care
// about is only what the picker asks it for and what it hands back.
const ctx = vi.hoisted(() => ({
  art: {} as Record<string, string>,
  choose: vi.fn<(setCode: string, art: string) => void>(),
}));
vi.mock('./leader-art-provider', () => ({
  useLeaderArt: () => ({ art: ctx.art, choose: ctx.choose }),
}));

import { LeaderPicker } from './leader-picker';

// OP06-022 has four printings, ST01-001 exactly one.
const YAMATO = { id: 'y', name: 'Yamato', colors: ['green'], setCode: 'OP06-022' };
const LUFFY = { id: 'l', name: 'Monkey D. Luffy', colors: ['red'], setCode: 'ST01-001' };
const HOMEBREW = { id: 'h', name: 'Homebrew', colors: ['red'], setCode: null };

const OPTIONS = [YAMATO, LUFFY, HOMEBREW];

function renderPicker(value: string) {
  return render(<LeaderPicker options={OPTIONS} value={value} onChange={() => {}} />);
}

const trigger = () => screen.queryByRole('button', { name: /Artwork for/ });
const thumbnails = () => screen.queryAllByRole('button', { name: /^Artwork \d+ of \d+$/ });

beforeEach(() => { ctx.art = {}; ctx.choose.mockClear(); });
afterEach(cleanup);

describe('the printing picker on the settled leader', () => {
  it('offers nothing for a card printed only once', () => {
    renderPicker(LUFFY.id);
    expect(trigger()).toBeNull();
    expect(thumbnails()).toHaveLength(0);
  });

  it('offers nothing for a custom leader, which has no card art', () => {
    renderPicker(HOMEBREW.id);
    expect(trigger()).toBeNull();
  });

  it('names how many printings there are, and stays closed until asked', () => {
    renderPicker(YAMATO.id);
    expect(trigger()!.getAttribute('aria-label')).toBe('Artwork for Yamato, 4 available');
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
    // Closed by default: the row costs height in a form that renders two of
    // these pickers, and most rounds never touch it.
    expect(thumbnails()).toHaveLength(0);
  });

  it('opens a thumbnail per printing', () => {
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
    expect(thumbnails()).toHaveLength(4);
  });

  it('marks the base printing as current when none is chosen', () => {
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    expect(thumbnails().map((b) => b.getAttribute('aria-pressed')))
      .toEqual(['true', 'false', 'false', 'false']);
  });

  it('marks the chosen printing as current', () => {
    ctx.art = { 'OP06-022': 'OP06-022_p2' };
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    expect(thumbnails().map((b) => b.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'true', 'false']);
  });

  it('shows each printing its own art, so nothing is chosen blind', () => {
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    expect(thumbnails().map((b) => b.querySelector('img')?.getAttribute('src'))).toEqual([
      '/leaders/OP06-022.webp',
      '/leaders/OP06-022_p1.webp',
      '/leaders/OP06-022_p2.webp',
      '/leaders/OP06-022_p3.webp',
    ]);
  });

  it('records the printing that was tapped, and closes', () => {
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    fireEvent.click(thumbnails()[2]);
    expect(ctx.choose).toHaveBeenCalledWith('OP06-022', 'OP06-022_p2');
    expect(thumbnails()).toHaveLength(0);
  });

  it('closes again when tapped a second time', () => {
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    fireEvent.click(trigger()!);
    expect(thumbnails()).toHaveLength(0);
  });

  it('falls back to the base printing when the stored art is another card’s', () => {
    ctx.art = { 'OP06-022': 'OP01-001_p1' };
    renderPicker(YAMATO.id);
    fireEvent.click(trigger()!);
    expect(thumbnails()[0].getAttribute('aria-pressed')).toBe('true');
  });
});

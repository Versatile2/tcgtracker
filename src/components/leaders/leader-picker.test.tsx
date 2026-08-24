/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { getLeaderImage } from '@/lib/leader-visual';

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
import { recentLeaders, pushRecentLeader } from '@/lib/recent-leaders';

// OP06-022 has four printings, ST01-001 exactly one.
const YAMATO = { id: 'y', name: 'Yamato', colors: ['green'], setCode: 'OP06-022' };
const LUFFY = { id: 'l', name: 'Monkey D. Luffy', colors: ['red'], setCode: 'ST01-001' };
const HOMEBREW = { id: 'h', name: 'Homebrew', colors: ['red'], setCode: null };
const ZORO = { id: 'z', name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001' };

const OPTIONS = [YAMATO, LUFFY, HOMEBREW, ZORO];

function renderPicker(value: string | null, props: Record<string, unknown> = {}) {
  return render(<LeaderPicker options={OPTIONS} value={value} onChange={() => {}} {...props} />);
}

/** The strip's cards, in the order they are laid out. */
const cards = () => screen.queryAllByRole('option').map((b) => b.getAttribute('aria-label'));

const trigger = () => screen.queryByRole('button', { name: /Artwork for/ });
const thumbnails = () => screen.queryAllByRole('button', { name: /^Artwork \d+ of \d+$/ });

beforeEach(() => { ctx.art = {}; ctx.choose.mockClear(); window.localStorage.clear(); });
afterEach(cleanup);

describe('the strip', () => {
  it('lists every leader by set code, customs last', () => {
    renderPicker(null);
    expect(cards()).toEqual([
      'Roronoa Zoro, OP01-001',
      'Yamato, OP06-022',
      'Monkey D. Luffy, ST01-001',
      'Homebrew',
    ]);
  });

  it('leads with what was last picked', () => {
    pushRecentLeader('my-deck', 'l');
    pushRecentLeader('my-deck', 'y');
    renderPicker(null, { recentKey: 'my-deck' });
    // Most recent first, then the rest of the run by set code without repeats.
    expect(cards()).toEqual([
      'Yamato, OP06-022',
      'Monkey D. Luffy, ST01-001',
      'Roronoa Zoro, OP01-001',
      'Homebrew',
    ]);
  });

  it('falls back to play history when there is nothing recent yet', () => {
    renderPicker(null, { recentKey: 'my-deck', suggested: ['h'] });
    expect(cards()[0]).toBe('Homebrew');
  });

  it('remembers a pick, scoped to its own role', () => {
    const onChange = vi.fn();
    renderPicker(null, { recentKey: 'opponent', onChange });
    fireEvent.click(screen.getByRole('option', { name: 'Yamato, OP06-022' }));
    expect(onChange).toHaveBeenCalledWith('y');
    expect(recentLeaders('opponent')).toEqual(['y']);
    expect(recentLeaders('my-deck')).toEqual([]);
  });

  it('drops the recents head while searching, so hits are not pushed off-screen', () => {
    pushRecentLeader('my-deck', 'y');
    renderPicker(null, { recentKey: 'my-deck' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zoro' } });
    expect(cards()).toEqual(['Roronoa Zoro, OP01-001']);
  });

  it('searches on set code and starter-deck code, not just the name', () => {
    renderPicker(null);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'st28' } });
    // ST-28 reprints Yamato under his original OP06-022 code.
    expect(cards()).toEqual(['Yamato, OP06-022']);
  });

  it('says so when nothing matches', () => {
    renderPicker(null);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
    expect(cards()).toEqual([]);
    expect(screen.getByText(/No leaders match/)).toBeTruthy();
  });

  it('marks the chosen leader', () => {
    // collapsible=false keeps the strip on screen alongside a selection; with
    // the default the picker collapses onto the chosen leader instead.
    renderPicker(YAMATO.id, { collapsible: false });
    const picked = screen.getAllByRole('option').filter((b) => b.getAttribute('aria-selected') === 'true');
    expect(picked.map((b) => b.getAttribute('aria-label'))).toEqual(['Yamato, OP06-022']);
  });
});

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
      // Resolved rather than written out: each printing is served from clean/
      // or the generated bundle depending on whether a clean scan exists, and
      // this test is about every printing being shown, not about where from.
      getLeaderImage('OP06-022', 'OP06-022'),
      getLeaderImage('OP06-022', 'OP06-022_p1'),
      getLeaderImage('OP06-022', 'OP06-022_p2'),
      getLeaderImage('OP06-022', 'OP06-022_p3'),
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

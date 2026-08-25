/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Donut } from './donut';
import type { Breakdown } from '@/lib/stats/segment-stats';

afterEach(cleanup);

const row = (key: string, games: number, colors: string[] = []): Breakdown => ({
  key, label: key, colors, wins: games, losses: 0, draws: 0, games, winRate: 1, share: 0,
});

const arcs = (c: HTMLElement) => [...c.querySelectorAll('circle')];
const R = 52;
const CIRCUMFERENCE = 2 * Math.PI * R;

describe('Donut', () => {
  it('draws one arc per row', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 3), row('b', 1)]} />);
    expect(arcs(container)).toHaveLength(2);
  });

  it('sizes each arc by its share of the games', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 3), row('b', 1)]} />);
    const [a] = arcs(container);
    const dash = Number(a.getAttribute('stroke-dasharray')!.split(' ')[0]);
    // Three quarters of the ring, less the 2px gap that keeps slices apart.
    expect(dash).toBeCloseTo(0.75 * CIRCUMFERENCE - 2, 6);
  });

  it('starts each arc where the previous one ended', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 3), row('b', 1)]} />);
    const offsets = arcs(container).map((c) => Number(c.getAttribute('stroke-dashoffset')));
    expect(offsets[0]).toBeCloseTo(0, 6);
    expect(offsets[1]).toBeCloseTo(-0.75 * CIRCUMFERENCE, 6);
  });

  it('draws a single row as very nearly the whole ring', () => {
    const { container } = render(<Donut label="t" rows={[row('only', 5)]} />);
    const dash = Number(arcs(container)[0].getAttribute('stroke-dasharray')!.split(' ')[0]);
    expect(dash).toBeCloseTo(CIRCUMFERENCE - 2, 6);
  });

  it('renders an empty ring rather than dividing by zero', () => {
    // Reached whenever a segment has been opened before anything was logged in it.
    const { container } = render(<Donut label="t" rows={[]} center={{ value: '0', caption: 'games' }} />);
    expect(arcs(container)).toHaveLength(1);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(/nothing logged/i);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('survives a row with no games without emitting NaN', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 2), row('empty', 0)]} />);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('draws a multi-colour row as one sub-arc per colour, in the deck order', () => {
    /*
     * The defect this closes. Multi-colour slices were painted with a
     * linearGradient, which is defined over the whole 120x120 bounding box — so
     * the colour a slice showed depended on where it sat on the ring, not on the
     * deck. "All six" rendered as a plain grey arc.
     */
    const { container } = render(<Donut label="t" rows={[row('duo', 2, ['purple', 'red'])]} />);
    expect(container.querySelectorAll('linearGradient')).toHaveLength(0);
    expect(arcs(container).map((c) => c.getAttribute('stroke')))
      .toEqual(['var(--chart-purple)', 'var(--chart-red)']);
  });

  it('splits a six-colour deck into six equal sub-arcs', () => {
    const six = ['red', 'green', 'blue', 'purple', 'black', 'yellow'];
    const { container } = render(<Donut label="t" rows={[row('all', 6, six)]} />);
    const drawn = arcs(container);
    expect(drawn).toHaveLength(6);
    expect(drawn.map((c) => c.getAttribute('stroke'))).toEqual(six.map((c) => `var(--chart-${c})`));
    // Equal widths, and only the final sub-arc pays the 2px row gap — a gap
    // inside a slice would read as two separate decks.
    const dashes = drawn.map((c) => Number(c.getAttribute('stroke-dasharray')!.split(' ')[0]));
    for (const d of dashes.slice(0, 5)) expect(d).toBeCloseTo(CIRCUMFERENCE / 6, 6);
    expect(dashes[5]).toBeCloseTo(CIRCUMFERENCE / 6 - 2, 6);
  });

  it('gives a colourless row a step of the accent ramp', () => {
    const { container } = render(<Donut label="t" rows={[row('meta', 1), row('other', 1)]} />);
    const strokes = arcs(container).map((c) => c.getAttribute('stroke'));
    expect(strokes[0]).toContain('color-mix');
    expect(strokes[0]).not.toBe(strokes[1]);
  });

  it('is decoration — the legend beside it carries the data', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 1)]} />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

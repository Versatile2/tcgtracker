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

  it('gives a multi-colour row a gradient and a single-colour row a flat fill', () => {
    const { container } = render(<Donut label="t" rows={[row('duo', 1, ['red', 'purple']), row('mono', 1, ['blue'])]} />);
    const strokes = arcs(container).map((c) => c.getAttribute('stroke'));
    expect(strokes[0]).toMatch(/^url\(#/);
    expect(strokes[1]).toBe('var(--chart-blue)');
    expect(container.querySelectorAll('linearGradient')).toHaveLength(1);
  });

  it('splits a six-colour gradient into six equal bands', () => {
    const six = ['red', 'green', 'blue', 'purple', 'black', 'yellow'];
    const { container } = render(<Donut label="t" rows={[row('all', 1, six)]} />);
    // Scoped to the gradient node rather than written as `linearGradient stop`:
    // jsdom's descendant combinator does not cross into the SVG namespace and
    // reports zero for a subtree that really holds twelve.
    const gradient = container.querySelector('linearGradient')!;
    // Two stops per colour make the edges hard; a blend of six is brown.
    expect(gradient.querySelectorAll('stop')).toHaveLength(12);
    expect([...gradient.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color')))
      .toEqual(six.flatMap((c) => [`var(--chart-${c})`, `var(--chart-${c})`]));
  });

  it('is decoration — the legend beside it carries the data', () => {
    const { container } = render(<Donut label="t" rows={[row('a', 1)]} />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

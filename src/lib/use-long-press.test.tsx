/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useLongPress, LONG_PRESS_MS } from './use-long-press';

/** A card-shaped subject: a link, because that is what the real ones are. */
function Card({ onLongPress, onNavigate }: { onLongPress: () => void; onNavigate?: () => void }) {
  const handlers = useLongPress(onLongPress);
  return <a href="/somewhere" data-testid="card" onClick={onNavigate} {...handlers}>Card</a>;
}

const press = (el: HTMLElement, x = 0, y = 0) =>
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerType: 'touch', button: 0 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('useLongPress', () => {
  it('fires once the hold is long enough', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    press(getByTestId('card'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire before then', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    press(getByTestId('card'));
    vi.advanceTimersByTime(LONG_PRESS_MS - 50);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('is cancelled by a release', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    const card = getByTestId('card');
    press(card);
    fireEvent.pointerUp(card);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('is cancelled by a scroll, which must always win', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    const card = getByTestId('card');
    press(card, 100, 100);
    fireEvent.pointerMove(card, { clientX: 100, clientY: 140 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('tolerates the small wobble of a finger holding still', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    const card = getByTestId('card');
    press(card, 100, 100);
    fireEvent.pointerMove(card, { clientX: 103, clientY: 104 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('swallows the click that follows, so the card does not navigate', () => {
    const onLongPress = vi.fn();
    const onNavigate = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} onNavigate={onNavigate} />);
    const card = getByTestId('card');
    press(card);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.pointerUp(card);
    fireEvent.click(card);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('lets an ordinary tap through', () => {
    const onNavigate = vi.fn();
    const { getByTestId } = render(<Card onLongPress={() => {}} onNavigate={onNavigate} />);
    const card = getByTestId('card');
    press(card);
    fireEvent.pointerUp(card);
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('only swallows one click, not every click after', () => {
    const onNavigate = vi.fn();
    const { getByTestId } = render(<Card onLongPress={() => {}} onNavigate={onNavigate} />);
    const card = getByTestId('card');
    press(card);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.click(card);
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('swallows the release burst that would land on whatever just opened', () => {
    // Touch fires mousedown/mouseup/click *after* touchend, by which point the
    // menu is on screen under the finger. Left alone, that burst dismisses it —
    // the menu would appear while held and vanish the moment you let go.
    const onLongPress = vi.fn();
    const elsewhere = vi.fn();
    document.addEventListener('click', elsewhere);
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    press(getByTestId('card'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.pointerUp(getByTestId('card'));
    fireEvent.mouseDown(document.body);
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    expect(elsewhere).not.toHaveBeenCalled();
    document.removeEventListener('click', elsewhere);
  });

  it('stops guarding once that burst has passed', () => {
    const elsewhere = vi.fn();
    document.addEventListener('click', elsewhere);
    const { getByTestId } = render(<Card onLongPress={() => {}} />);
    press(getByTestId('card'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.click(document.body);   // swallowed
    fireEvent.click(document.body);   // a real, later tap
    expect(elsewhere).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', elsewhere);
  });

  it('does not leave a guard behind when the card unmounts mid-press', () => {
    const elsewhere = vi.fn();
    document.addEventListener('click', elsewhere);
    const { getByTestId, unmount } = render(<Card onLongPress={() => {}} />);
    press(getByTestId('card'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    unmount();
    fireEvent.click(document.body);
    expect(elsewhere).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', elsewhere);
  });

  it('opens on right-click too, the only non-pointer way in', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    fireEvent.contextMenu(getByTestId('card'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('ignores a right mouse button press', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Card onLongPress={onLongPress} />);
    fireEvent.pointerDown(getByTestId('card'), { pointerType: 'mouse', button: 2 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire after the card is gone', () => {
    const onLongPress = vi.fn();
    const { getByTestId, unmount } = render(<Card onLongPress={onLongPress} />);
    press(getByTestId('card'));
    unmount();
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

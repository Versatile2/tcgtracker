/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LeaderAvatar } from './leader-avatar';
import { LeaderArtContext } from './leader-art-provider';

function withArt(imageIdFor: (id?: string | null) => string | null, ui: React.ReactNode) {
  return render(
    <LeaderArtContext.Provider value={{ art: {}, imageIdFor, choose: () => {} }}>
      {ui}
    </LeaderArtContext.Provider>,
  );
}

describe('LeaderAvatar', () => {
  it('renders the resolved image from the API route', () => {
    const { container } = withArt(() => 'img-1', <LeaderAvatar name="Yamato" colors={['green']} leaderId="lead-1" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/api/leader-images/img-1');
  });

  it('falls back to the coloured initial when the leader has no image', () => {
    const { container } = withArt(() => null, <LeaderAvatar name="Homebrew" colors={['red']} leaderId="lead-2" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('H');
  });

  it('draws the initial outside the provider rather than throwing', () => {
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} leaderId="lead-1" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Y');
  });
});

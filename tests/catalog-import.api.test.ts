import { describe, it, expect } from 'vitest';
import { groupPrintings, cleanLeaderName, leadersWithoutArt, type ApiCard } from '../src/lib/catalog-import';

/** A leader row shaped like optcgapi's, with only the fields the script reads. */
function card(setId: string, imageId: string | null, name = 'Someone'): ApiCard {
  return {
    card_set_id: setId,
    card_name: name,
    card_color: 'Green',
    card_type: 'Leader',
    card_image: imageId ? `https://optcgapi.com/media/static/Card_Images/${imageId}.jpg` : null,
    card_image_id: imageId,
  };
}

describe('groupPrintings', () => {
  it('collects every printing of a card under its set code', () => {
    const out = groupPrintings([
      card('OP06-022', 'OP06-022'),
      card('OP06-022', 'OP06-022_p1', 'Yamato (Alternate Art)'),
      card('OP06-022', 'OP06-022_p2', 'Yamato (SPR)'),
    ]);
    expect([...out.keys()]).toEqual(['OP06-022']);
    expect(out.get('OP06-022')!.map((c) => c.card_image_id))
      .toEqual(['OP06-022', 'OP06-022_p1', 'OP06-022_p2']);
  });

  it('puts the base printing first however the rows arrive', () => {
    // The app draws LEADER_ART[code][0] for a player who has chosen nothing, so
    // the base printing leading is the whole contract of this function.
    const out = groupPrintings([
      card('OP06-022', 'OP06-022_p2'),
      card('OP06-022', 'OP06-022_p1'),
      card('OP06-022', 'OP06-022'),
    ]);
    expect(out.get('OP06-022')!.map((c) => c.card_image_id))
      .toEqual(['OP06-022', 'OP06-022_p1', 'OP06-022_p2']);
  });

  it('drops rows carrying no art', () => {
    const out = groupPrintings([
      card('OP12-020', 'OP12-020'),
      card('OP12-020', null, 'Roronoa Zoro (OP12-020)'),
    ]);
    expect(out.get('OP12-020')!.map((c) => c.card_image_id)).toEqual(['OP12-020']);
  });

  it('leaves out a set code whose every row lacks art', () => {
    expect(groupPrintings([card('ST21-001', null)]).size).toBe(0);
  });

  it('keeps one row per image id', () => {
    const out = groupPrintings([
      card('OP01-001', 'OP01-001', 'Roronoa Zoro (001)'),
      card('OP01-001', 'OP01-001', 'Roronoa Zoro (001)'),
    ]);
    expect(out.get('OP01-001')).toHaveLength(1);
  });

  it('ignores everything that is not a leader', () => {
    const character = { ...card('OP01-016', 'OP01-016'), card_type: 'Character' };
    expect(groupPrintings([character]).size).toBe(0);
  });

  it('handles a card printed only once', () => {
    const out = groupPrintings([card('ST01-001', 'ST01-001')]);
    expect(out.get('ST01-001')!.map((c) => c.card_image_id)).toEqual(['ST01-001']);
  });

  it('orders set codes so the generated file is stable between runs', () => {
    const out = groupPrintings([
      card('OP10-001', 'OP10-001'),
      card('EB01-001', 'EB01-001'),
      card('OP02-001', 'OP02-001'),
    ]);
    expect([...out.keys()]).toEqual(['EB01-001', 'OP02-001', 'OP10-001']);
  });
});

describe('cleanLeaderName', () => {
  it('strips the disambiguator and unpacks packed initials', () => {
    expect(cleanLeaderName('Monkey.D.Luffy (003)')).toBe('Monkey D. Luffy');
    expect(cleanLeaderName('Trafalgar Law - OP14-001')).toBe('Trafalgar Law');
    expect(cleanLeaderName('Edward.Newgate')).toBe('Edward Newgate');
  });

  it('strips a variant suffix, so alternates carry the same name as the base', () => {
    expect(cleanLeaderName('Yamato (Alternate Art)')).toBe('Yamato');
    expect(cleanLeaderName('Roronoa Zoro (001) (Parallel)')).toBe('Roronoa Zoro');
    expect(cleanLeaderName('Monkey.D.Luffy (SPR)')).toBe('Monkey D. Luffy');
  });
});

/*
 * Promo leaders arrive from a third endpoint. Nearly all of them are extra
 * printings of a card that already exists, and fold in under its set code — but
 * a few live only there, and one of those has no art at all.
 */
describe('promo leaders', () => {
  const promo = (setId: string, imageId: string | null, name: string, color = 'Green') => ({
    ...card(setId, imageId, name), card_color: color,
  });

  it('folds a promo printing into the card it is a printing of', () => {
    const out = groupPrintings([
      card('ST13-003', 'ST13-003', 'Monkey.D.Luffy (Premium Card Collection)'),
      promo('ST13-003', 'ST13-003_pr1', 'Monkey.D.Luffy (BVB x One Piece Campaign)'),
      promo('ST13-003', 'ST13-003_pr2', 'Monkey.D.Luffy (2nd Anniversary Tournament)'),
    ]);
    // One card in the picker, three arts to choose between — not three leaders.
    expect([...out.keys()]).toEqual(['ST13-003']);
    expect(out.get('ST13-003')!.map((c) => c.card_image_id))
      .toEqual(['ST13-003', 'ST13-003_pr1', 'ST13-003_pr2']);
  });

  it('keeps a promo-only leader that no set contains', () => {
    const out = groupPrintings([card('OP01-001', 'OP01-001'), promo('P-086', 'P-086', 'Trafalgar Law')]);
    expect([...out.keys()]).toContain('P-086');
  });

  it('carries a six-colour leader through as six colours', () => {
    // The all-colour Release Event leaders are the only cards shaped like this,
    // and a parser that assumed one or two colours would silently truncate them.
    const six = promo('P-900', 'P-900', 'Monkey.D.Luffy', 'Blue Green Purple Red Black Yellow');
    expect(six.card_color.split(/\s+/)).toHaveLength(6);
  });
});

describe('promo names', () => {
  it('strips a promo code that trails the name', () => {
    expect(cleanLeaderName('Nami - P-117')).toBe('Nami');
  });

  it('strips one sitting mid-name, ahead of the packaging', () => {
    expect(cleanLeaderName('Uta - P-011 (Premium Card Collection -Uta-)'))
      .toBe('Uta (Premium Card Collection -Uta-)');
  });

  it('keeps the packaging, which is the only thing telling the Luffys apart', () => {
    // Three six-colour Monkey D. Luffys exist; without this they read alike.
    expect(cleanLeaderName('Monkey.D.Luffy (Release Event Leader)'))
      .toBe('Monkey D. Luffy (Release Event Leader)');
  });

  it('does not eat a hyphen that is part of a name', () => {
    expect(cleanLeaderName('Sakazuki (Pirates Party Vol. 7)')).toContain('Sakazuki');
  });
});

describe('leadersWithoutArt', () => {
  const rows = [
    card('OP01-001', 'OP01-001'),
    // A promo packaging with no art, of a card whose base printing has some.
    { ...card('OP01-001', null, 'Roronoa Zoro (Alternate Art)') },
    // A leader with no art anywhere: drop it and the card leaves the app.
    { ...card('P-700', 'P-700', 'Monkey.D.Luffy (Release Event Leader)'), card_image: null },
  ];

  it('rescues a leader that has no art in any printing', () => {
    const kept = leadersWithoutArt(rows, groupPrintings(rows));
    expect(kept.map((c) => c.card_set_id)).toEqual(['P-700']);
  });

  it('leaves alone a card whose art arrives on another printing', () => {
    // OP01-001 has an art-less row too, but its base printing carries the
    // picture — rescuing it as well would seed the same leader twice.
    const kept = leadersWithoutArt(rows, groupPrintings(rows));
    expect(kept.map((c) => c.card_set_id)).not.toContain('OP01-001');
  });

  it('gets no entry in LEADER_ART, which is what makes the colour field show', () => {
    expect(groupPrintings(rows).has('P-700')).toBe(false);
  });

  it('does not depend on the order the rows arrive in', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(leadersWithoutArt(shuffled, groupPrintings(shuffled)).map((c) => c.card_set_id))
      .toEqual(['P-700']);
  });
});

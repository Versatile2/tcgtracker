import { describe, it, expect } from 'vitest';
import { groupPrintings, cleanLeaderName, type ApiCard } from '../scripts/build-leader-data';

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

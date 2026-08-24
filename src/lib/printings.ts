import { LEADER_ART } from './leader-images';
import { EXTRA_ART } from './clean-art';

/**
 * Every printing of a leader, from both sources that know about printings.
 *
 * `LEADER_ART` is generated from optcgapi and `EXTRA_ART` from the hand-collected
 * scans. The two disagree: optcgapi lists two printings of OP01-001 where six
 * were collected, and the collection is the authority on what exists — it is a
 * shelf of real cards, while the API is one vendor's index of them.
 *
 * Bundled printings lead, so `printingsOf(code)[0]` is still the base art every
 * reader falls back to, and a collected extra can never displace it.
 *
 * This exists as its own module because both the client and the server ask the
 * question and must agree: the picker offers these, and `setLeaderArt` rejects
 * anything not among them. Two lists that merged in only one of those places
 * would let a player choose a printing the server then refused to save.
 */
export function mergePrintings(bundled: readonly string[], extra: readonly string[]): readonly string[] {
  return extra.length ? [...bundled, ...extra] : bundled;
}

export function printingsOf(setCode: string | null | undefined): readonly string[] {
  if (!setCode) return [];
  return mergePrintings(LEADER_ART[setCode] ?? [], EXTRA_ART[setCode] ?? []);
}

/** Whether this card has any art at all, bundled or collected. */
export const hasPrintings = (setCode: string | null | undefined): boolean => printingsOf(setCode).length > 0;

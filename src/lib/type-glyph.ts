import {
  Store, Trophy, Globe, Crown, PartyPopper, TrendingUp, Shuffle, Gamepad2,
  Users, MapPin, Target, FlaskConical, GraduationCap, Swords, type LucideIcon,
} from 'lucide-react';
import type { TournamentType } from './dto';

/**
 * One icon per type, so a list of events and a list of sessions read the same
 * way. A sibling of the label map, and the same contract: a `Record` keyed on
 * the enum, so a new type cannot ship without one.
 *
 * `ranked_sim` and `freeplay_sim` share an icon deliberately — they are one
 * label with two stored values, and drawing them differently would say there
 * are two kinds of event when there is only one.
 *
 * `local` is the shop you compete in; `freeplay_locals` is the place you hang
 * around afterwards. Different icons, because on a card they sit side by side.
 */
export const TYPE_ICONS: Record<TournamentType, LucideIcon> = {
  local: Store,
  treasure_cup: Trophy,
  regionals: Globe,
  extra_grand_battle: Crown,
  pirates_party: PartyPopper,
  ranked_sim: TrendingUp,
  freeplay: Shuffle,
  freeplay_sim: TrendingUp,
  freeplay_sim_casual: Gamepad2,
  freeplay_friend: Users,
  freeplay_locals: MapPin,
  freeplay_gauntlet: Target,
  testing: FlaskConical,
  freeplay_teaching: GraduationCap,
  match: Swords,
};

export function typeIcon(type: TournamentType): LucideIcon {
  return TYPE_ICONS[type];
}

import { Badge } from '@/components/ui/badge';
import { tournamentTypeLabel } from '@/lib/labels';
import { TYPE_ICONS } from '@/lib/type-glyph';
import type { TournamentType } from '@/lib/dto';

/**
 * The type of an event or a session, named and drawn. One component rather than
 * the same badge hand-written on the card, the detail header and the share
 * card, because those had already started to drift.
 *
 * The `data-icon` attribute is the Badge's own convention: it tightens the
 * padding on the side the icon sits.
 */
export function TypeBadge({ type, className }: { type: TournamentType; className?: string }) {
  // Indexing the Record directly rather than calling typeIcon(): the React
  // Compiler lint rule cannot prove a function call returns a stable
  // component across renders and flags it as created-during-render, even
  // though this lookup is deterministic.
  const Icon = TYPE_ICONS[type];
  return (
    <Badge variant="secondary" className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {tournamentTypeLabel(type)}
    </Badge>
  );
}

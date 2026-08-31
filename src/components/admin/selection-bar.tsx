'use client';
import { Button } from '@/components/ui/button';

/**
 * The bulk action bar, shown only once something is selected.
 *
 * The summary names what is about to happen including the part the owner might
 * not want — publishing a leader with no artwork is allowed, because it renders
 * as a coloured initial, which is degraded but valid. A guard here would be
 * wrong more often than useful, so this says it rather than preventing it.
 */
export function SelectionBar({
  count,
  withoutArt,
  pending,
  onPublish,
  onHide,
  onDraft,
  onClear,
}: {
  count: number;
  withoutArt: number;
  pending: boolean;
  onPublish: () => void;
  onHide: () => void;
  onDraft: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  // Sits above the primary nav rather than under it. That nav is
  // `fixed bottom-0 z-40` and was intercepting every click on these buttons —
  // the bar rendered, and Publish simply did nothing.

  const summary = withoutArt > 0
    ? `${count} selected, ${withoutArt} without artwork`
    : `${count} selected`;

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-50 border-t border-border bg-background/95 p-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{summary}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClear} disabled={pending}>Clear</Button>
          <Button variant="outline" onClick={onDraft} disabled={pending}>Back to draft</Button>
          <Button variant="outline" onClick={onHide} disabled={pending}>Hide</Button>
          <Button onClick={onPublish} disabled={pending}>Publish</Button>
        </div>
      </div>
    </div>
  );
}

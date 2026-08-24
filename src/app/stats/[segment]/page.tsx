import { notFound } from 'next/navigation';
import { SegmentPage } from '@/components/stats/segment-page';
import { segmentFromTab } from '@/components/tournaments/segment';

/**
 * `/stats/tournaments`, `/stats/sessions`, `/stats/matches`.
 *
 * The route keeps `matches` while the page reads "Free Play", the same split the
 * list already makes: a URL is not user-facing copy, and renaming it would break
 * saved links for nothing the label does not already give.
 */
export default async function StatsSegmentPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  // segmentFromTab falls back to tournaments for anything unrecognised, which is
  // right for a query string and wrong for a path: /stats/nonsense should 404
  // rather than quietly show a different page's numbers.
  if (!['tournaments', 'sessions', 'matches'].includes(segment)) notFound();
  return <SegmentPage segment={segmentFromTab(segment)} />;
}

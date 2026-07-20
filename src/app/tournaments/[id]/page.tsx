import { TournamentDetail } from '@/components/tournaments/tournament-detail';

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDetail id={id} />;
}

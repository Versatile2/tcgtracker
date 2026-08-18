import { TournamentEdit } from '@/components/tournaments/tournament-edit';

export default async function TournamentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentEdit id={id} />;
}

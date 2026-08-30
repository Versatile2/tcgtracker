'use client';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Display convenience, not security. Hiding this link protects nothing — the
 * proxy and requireAdmin are what enforce access. It is here so the owner does
 * not have to remember a URL.
 */
export function AdminCard() {
  const { user } = useUser();
  if ((user?.publicMetadata as { role?: string } | undefined)?.role !== 'admin') return null;

  return (
    <Card className="mt-4 space-y-3 p-4">
      <h2 className="text-lg font-semibold">Administration</h2>
      <p className="text-sm text-muted-foreground">Curate the leader and meta catalog.</p>
      <Button render={<Link href="/admin/leaders" />}>Open admin</Button>
    </Card>
  );
}

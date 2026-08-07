'use client';
import { Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { useOnlineStatus } from '@/lib/use-online-status';
import { cn } from '@/lib/utils';

/**
 * A plain anchor rather than a fetch + blob: it is the one download trigger
 * that behaves on both iOS Safari (share sheet) and Android Chrome.
 */
export function ExportCard() {
  const online = useOnlineStatus();

  return (
    <Card className="mt-4 space-y-4 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Data</h2>
        <p className="text-sm text-muted-foreground">
          Download every tournament and round you&apos;ve logged as a spreadsheet — one row per round.
        </p>
      </div>
      {online ? (
        <a
          href="/api/export/csv"
          download
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full text-base')}
        >
          <Download className="size-4" />
          Export CSV
        </a>
      ) : (
        <>
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: 'outline' }), 'pointer-events-none h-12 w-full text-base opacity-50')}
          >
            <Download className="size-4" />
            Export CSV
          </span>
          <p className="text-sm text-muted-foreground">Exporting needs a connection.</p>
        </>
      )}
    </Card>
  );
}

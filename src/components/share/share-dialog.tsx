'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { captureNode, downloadBlob, shareOrDownload } from '@/lib/share-image';

export function ShareDialog({
  open,
  onOpenChange,
  title,
  filename,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  filename: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function run(share: boolean) {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await captureNode(ref.current);
      if (share) await shareOrDownload(blob, filename);
      else downloadBlob(blob, filename);
    } catch {
      toast.error('Could not create image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg bg-muted/30 p-3">
          <div ref={ref} className="mx-auto w-fit">{children}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => run(false)}>Download</Button>
          <Button className="flex-1" disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Share'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

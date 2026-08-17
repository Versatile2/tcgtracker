'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { captureNode, downloadBlob, shareOrDownload } from '@/lib/share-image';

/** Share cards are a fixed 380px wide, which is wider than the dialog. */
const PREVIEW_MAX_VH = 0.6;

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
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const [busy, setBusy] = useState(false);

  // The preview is scaled down to fit rather than scrolled. The transform lives
  // on a wrapper ABOVE `ref`, never on `ref` itself, so the captured node keeps
  // its true 380px layout and the exported PNG is identical whatever the
  // preview happens to be scaled to.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = boxRef.current;
      const node = ref.current;
      if (!box || !node) return;
      // offsetWidth/Height are layout values, unaffected by an ancestor's transform.
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      if (!w || !h) return;
      const scale = Math.min(1, box.clientWidth / w, (window.innerHeight * PREVIEW_MAX_VH) / h);
      const height = h * scale;
      // Bail out when nothing meaningful changed: the box is observed, and
      // setting the height below would otherwise re-trigger this callback.
      setFit((prev) =>
        Math.abs(prev.scale - scale) < 0.001 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { scale, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (boxRef.current) observer.observe(boxRef.current);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open]);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div ref={boxRef} className="overflow-hidden rounded-lg bg-muted/30 p-3">
          <div className="flex justify-center" style={{ height: fit.height || undefined }}>
            <div className="origin-top" style={{ transform: `scale(${fit.scale})` }}>
              <div ref={ref} className="w-fit">{children}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => run(false)}>Download</Button>
          <Button className="flex-1" disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Share'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

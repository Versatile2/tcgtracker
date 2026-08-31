'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/query-keys';
import { clampOffset, displaySize, sourceRect, type Offset, type View } from '@/lib/image-crop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Matches stage 1's bundled art: 240px wide at the card's 5:7 footprint. An
 * upload of another size would sit visibly differently in the same grid.
 */
const FRAME = { w: 240, h: 336 };

async function exportCrop(img: HTMLImageElement, view: View): Promise<Blob> {
  const natural = { w: img.naturalWidth, h: img.naturalHeight };
  const { sx, sy, sw, sh } = sourceRect(natural, FRAME, view);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.w;
  canvas.height = FRAME.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, FRAME.w, FRAME.h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  // Not a silent PNG fallback: the server rejects non-WebP bytes, so falling
  // back would turn a browser limitation into a confusing 400.
  if (!blob) throw new Error('This browser could not encode WebP.');
  return blob;
}

export function ImageCropper({ leaderId, onUploaded }: { leaderId: string; onUploaded?: () => void }) {
  const qc = useQueryClient();
  const imgRef = useRef<HTMLImageElement>(null);
  const dragFrom = useRef<{ x: number; y: number; base: Offset } | null>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [label, setLabel] = useState('Custom');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(file: File) {
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    setSrc(URL.createObjectURL(file));
  }

  const display = natural ? displaySize(natural, FRAME, zoom) : FRAME;

  function onPointerDown(e: React.PointerEvent) {
    if (!natural) return;
    dragFrom.current = { x: e.clientX, y: e.clientY, base: offset };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const from = dragFrom.current;
    if (!from || !natural) return;
    const next = { x: from.base.x + (e.clientX - from.x), y: from.base.y + (e.clientY - from.y) };
    setOffset(clampOffset(next, display, FRAME));
  }

  function onPointerUp() { dragFrom.current = null; }

  function changeZoom(z: number) {
    setZoom(z);
    if (natural) setOffset((o) => clampOffset(o, displaySize(natural, FRAME, z), FRAME));
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await exportCrop(img, { zoom, offset });
      const form = new FormData();
      form.set('file', blob, 'art.webp');
      form.set('label', label.trim() || 'Custom');
      const res = await fetch(`/api/admin/leaders/${leaderId}/images`, { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed');
      await qc.invalidateQueries({ queryKey: keys.adminLeaders });
      await qc.invalidateQueries({ queryKey: keys.leaders });
      setSrc(null);
      setNatural(null);
      onUploaded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="image/*"
        aria-label="Choose an image"
        className="block w-full text-sm"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
      />

      {src && (
        <>
          <div
            className="relative mx-auto touch-none overflow-hidden rounded-md ring-1 ring-border"
            style={{ width: FRAME.w, height: FRAME.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* The preview is a CSS transform and the export is a drawImage;
                they agree because both derive from this zoom and offset. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
              }}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: natural ? displaySize(natural, FRAME, 1).w : undefined,
                height: natural ? displaySize(natural, FRAME, 1).h : undefined,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            />
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Label</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Alternate Art" />
          </label>

          <div className="flex gap-2">
            <Button onClick={confirm} disabled={busy || !natural}>
              {busy ? 'Uploading…' : 'Add this crop'}
            </Button>
            <Button variant="ghost" onClick={() => { setSrc(null); setNatural(null); }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

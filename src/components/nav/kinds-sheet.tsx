'use client';
import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { KindsComparison } from './kinds-comparison';
import { cn } from '@/lib/utils';

/** The comparison as a sheet of its own, for callers that are not already in one. */
export function KindsSheet({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold">What’s the difference?</SheetTitle>
          <SheetDescription>Three ways to log a game, and where each one shows up.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pt-2 pb-6">
          <KindsComparison />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A button that opens the comparison, owning its own open state.
 *
 * Every caller so far — two empty states and a Settings row — wants exactly
 * this and nothing else, so the state lives here rather than being threaded
 * through three unrelated components.
 */
export function KindsHelpButton({ children, className }: {
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Info className="size-4 shrink-0" aria-hidden />
        {children ?? 'What’s the difference?'}
      </button>
      <KindsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

/**
 * iOS-style top navigation bar: translucent, sits below the notch, with a
 * tinted back chevron on the left (like Apple Music's pushed screens). Pass an
 * optional `title` to show a small centered title, and `onBack`/`backLabel` to
 * customize the back action.
 */
export function NavBar({
  title,
  backLabel = 'Back',
  onBack,
}: {
  title?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="mx-auto grid h-11 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-1">
        <button
          type="button"
          onClick={onBack ?? (() => router.back())}
          className="-ml-1 flex items-center gap-0.5 justify-self-start rounded-md px-1 py-1 text-primary transition-opacity active:opacity-60"
        >
          <ChevronLeft className="size-6" aria-hidden />
          <span className="text-[0.9375rem]">{backLabel}</span>
        </button>
        {title ? (
          <h1 className="truncate text-center text-[0.9375rem] font-semibold">{title}</h1>
        ) : (
          <span />
        )}
        <span />
      </div>
    </header>
  );
}

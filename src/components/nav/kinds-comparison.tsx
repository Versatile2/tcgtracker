import { Check, X } from 'lucide-react';
import { LOG_KINDS, STAT_SURFACES, KIND_CHOICE_NOTE } from '@/lib/log-kinds';

/**
 * The long answer to "what is the difference between these three?".
 *
 * Presentational and unconditional: it renders the same three cards wherever it
 * is shown — inside the log sheet, from an empty segment, from Settings — so
 * there is one explanation to keep true rather than three that agree today.
 */
export function KindsComparison() {
  return (
    <div className="space-y-3">
      {LOG_KINDS.map(({ key, label, icon: Icon, shape, blurb, counted }) => (
        <section key={key} className="rounded-xl border border-border/70 p-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-ink">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <h3 className="text-sm font-semibold">{label.replace(/^New /, '')}</h3>
              <p className="text-xs text-muted-foreground">{shape}</p>
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{blurb}</p>

          {/* Pills rather than a table: four columns of ✓/✗ across three rows
              does not survive a 360px phone, and this is read one kind at a
              time anyway. */}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {STAT_SURFACES.map(({ key: surface, label: surfaceLabel }) => {
              const yes = counted[surface];
              return (
                <li
                  key={surface}
                  className={
                    yes
                      ? 'inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary-ink'
                      : 'inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground'
                  }
                >
                  {yes
                    ? <Check className="size-3.5" aria-hidden />
                    : <X className="size-3.5" aria-hidden />}
                  {surfaceLabel}
                  <span className="sr-only">{yes ? ' counts' : ' does not count'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{KIND_CHOICE_NOTE}</p>
    </div>
  );
}

'use client';
import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type Option = { id: string; name: string; code?: string | null };

export function ReferenceCombobox({
  id, options, value, onChange, placeholder, disabled, getIcon, getLabel,
}: {
  id?: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  getIcon?: (id: string) => ReactNode;
  /**
   * Visible text for an option. Search still matches on `option.name`, so a
   * meta can display as "OP01" and still be found by typing "Romance Dawn".
   * Defaults to the name.
   */
  getLabel?: (option: Option) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.id === value);
  const label = (o: Option) => (getLabel ? getLabel(o) : o.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button id={id} type="button" variant="outline" disabled={disabled}
            className="w-full justify-between h-12 text-base">
            <span className="flex min-w-0 items-center gap-2">
              {getIcon && value ? getIcon(value) : null}
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected ? label(selected) : placeholder}
              </span>
            </span>
          </Button>
        }
      />
      <PopoverContent className="p-0 w-[--anchor-width]">
        <Command>
          <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                // `value` drives cmdk's filtering, so it stays the full name —
                // that is what keeps "Romance" matching an item that reads "OP01".
                <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {getIcon ? <span className="mr-2 shrink-0">{getIcon(o.id)}</span> : null}
                  <span className="truncate">{label(o)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

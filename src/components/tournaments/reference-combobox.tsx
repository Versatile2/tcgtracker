'use client';
import { useState, type ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type Option = { id: string; name: string };

export function ReferenceCombobox({
  id, options, value, onChange, onAddCustom, placeholder, disabled, getIcon,
}: {
  id?: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  onAddCustom: (name: string) => Promise<Option>;
  placeholder: string;
  disabled?: boolean;
  getIcon?: (id: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.id === value);

  async function handleAdd() {
    const created = await onAddCustom(search.trim());
    onChange(created.id);
    setSearch('');
    setOpen(false);
  }

  const showAdd = search.trim().length > 0 &&
    !options.some((o) => o.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button id={id} type="button" variant="outline" disabled={disabled}
            className="w-full justify-between h-12 text-base">
            <span className="flex min-w-0 items-center gap-2">
              {getIcon && value ? getIcon(value) : null}
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected ? selected.name : placeholder}
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
                <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {getIcon ? <span className="mr-2 shrink-0">{getIcon(o.id)}</span> : null}
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
              {showAdd && (
                <CommandItem value={`__add__${search}`} onSelect={handleAdd}>
                  <Plus className="mr-2 h-4 w-4" /> Add “{search.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

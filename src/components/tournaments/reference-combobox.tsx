'use client';
import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type Option = { id: string; name: string };

export function ReferenceCombobox({
  options, value, onChange, onAddCustom, placeholder, disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  onAddCustom: (name: string) => Promise<Option>;
  placeholder: string;
  disabled?: boolean;
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
          <Button type="button" variant="outline" disabled={disabled}
            className="w-full justify-between h-12 text-base">
            {selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}
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
                  <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {o.name}
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

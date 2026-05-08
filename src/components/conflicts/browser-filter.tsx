'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BrowserId } from '@/lib/types';

const ALL_BROWSERS: { id: BrowserId; name: string }[] = [
  { id: 'chrome', name: 'Chrome' },
  { id: 'safari', name: 'Safari' },
  { id: 'firefox', name: 'Firefox' },
  { id: 'arc', name: 'Arc' },
  { id: 'brave', name: 'Brave' },
  { id: 'edge', name: 'Edge' },
  { id: 'zen', name: 'Zen' },
  { id: 'dia', name: 'Dia' },
];

export function BrowserFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BrowserId[] | undefined;
  onChange: (next: BrowserId[] | undefined) => void;
}) {
  const selected = new Set(value ?? []);
  const summary =
    selected.size === 0
      ? 'Alle'
      : selected.size === 1
        ? ALL_BROWSERS.find((b) => b.id === [...selected][0])?.name ?? '1 ausgewählt'
        : `${selected.size} ausgewählt`;

  const toggle = (id: BrowserId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === 0 ? undefined : ([...next] as BrowserId[]));
  };

  const clear = () => onChange(undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-40 justify-between font-normal">
          <span className="truncate text-left">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_BROWSERS.map((b) => (
          <DropdownMenuCheckboxItem
            key={b.id}
            checked={selected.has(b.id)}
            onCheckedChange={() => toggle(b.id)}
            // Prevent the menu from closing on every toggle so the user can
            // pick multiple browsers in one open.
            onSelect={(e) => e.preventDefault()}
          >
            {b.name}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={clear}
              className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Auswahl zurücksetzen
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

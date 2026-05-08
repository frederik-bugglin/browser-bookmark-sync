'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ConflictFilter, ConflictStatus } from '@/lib/types';

const STATUS_OPTIONS: { value: ConflictStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'restored', label: 'Wiederhergestellt' },
  { value: 'dismissed', label: 'Erledigt' },
  { value: 'all', label: 'Alle' },
];

export function FilterBar({
  filter,
  onChange,
  onReset,
  resultCount,
}: {
  filter: ConflictFilter;
  onChange: (patch: Partial<ConflictFilter>) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const hasActiveFilter =
    filter.search ||
    filter.createdFrom ||
    filter.createdTo ||
    (filter.winnerBrowserIds && filter.winnerBrowserIds.length > 0) ||
    (filter.loserBrowserIds && filter.loserBrowserIds.length > 0) ||
    (filter.status && filter.status !== 'open');

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <Label htmlFor="conflict-search" className="text-xs font-medium text-muted-foreground">
            Suche
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="conflict-search"
              type="search"
              placeholder="Titel oder URL"
              value={filter.search ?? ''}
              onChange={(e) => onChange({ search: e.target.value })}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conflict-status" className="text-xs font-medium text-muted-foreground">
            Status
          </Label>
          <Select
            value={filter.status ?? 'open'}
            onValueChange={(v) =>
              onChange({ status: v as ConflictStatus | 'all' })
            }
          >
            <SelectTrigger id="conflict-status" className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conflict-from" className="text-xs font-medium text-muted-foreground">
            Von
          </Label>
          <Input
            id="conflict-from"
            type="date"
            value={filter.createdFrom?.slice(0, 10) ?? ''}
            onChange={(e) =>
              onChange({
                createdFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined,
              })
            }
            className="h-9 w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conflict-to" className="text-xs font-medium text-muted-foreground">
            Bis
          </Label>
          <Input
            id="conflict-to"
            type="date"
            value={filter.createdTo?.slice(0, 10) ?? ''}
            onChange={(e) =>
              onChange({
                createdTo: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined,
              })
            }
            className="h-9 w-40"
          />
        </div>
        {hasActiveFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 gap-1.5 self-end text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Filter zurücksetzen
          </Button>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">
        {resultCount === 0
          ? 'Keine Treffer'
          : resultCount === 1
            ? '1 Eintrag'
            : `${resultCount} Einträge`}
      </div>
    </div>
  );
}

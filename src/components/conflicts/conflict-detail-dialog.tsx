'use client';

import { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { junction } from '@/lib/electron-bridge';
import type { BrowserId, ConflictEntry } from '@/lib/types';
import { DiffRenderer } from './diff-renderer';

const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  arc: 'Arc',
  brave: 'Brave',
  edge: 'Edge',
  zen: 'Zen',
  dia: 'Dia',
};

export function ConflictDetailDialog({
  conflict,
  open,
  onClose,
}: {
  conflict: ConflictEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  if (!conflict) return null;

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await junction().conflicts.restore(conflict.id);
      if (res.ok) {
        toast.success('Wiederherstellung läuft. Sync wurde angestossen.');
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error((err as Error).message ?? 'Wiederherstellung fehlgeschlagen.');
    } finally {
      setRestoring(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await junction().conflicts.dismiss(conflict.id);
      toast.success('Als erledigt markiert.');
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Konnte nicht als erledigt markieren.');
    } finally {
      setDismissing(false);
    }
  };

  const isOpen = conflict.status === 'open';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Konflikt-Detail</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <span>{formatDate(conflict.createdAt)}</span>
            <span>•</span>
            <span>
              {BROWSER_NAMES[conflict.winnerBrowserId]} vs.{' '}
              {BROWSER_NAMES[conflict.loserBrowserId]}
            </span>
            <span>•</span>
            <span className="font-mono">Run {conflict.syncRunId.slice(0, 8)}</span>
            {conflict.restoreOriginId ? (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-xs">
                  Folgekonflikt aus Restore
                </Badge>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <Side
            label={`Winner — ${BROWSER_NAMES[conflict.winnerBrowserId]}`}
            entry={conflict.winnerVersion}
            counterpart={conflict.loserVersion}
            tone="winner"
          />
          <Side
            label={`Loser — ${BROWSER_NAMES[conflict.loserBrowserId]}`}
            entry={conflict.loserVersion}
            counterpart={conflict.winnerVersion}
            tone="loser"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Schliessen
          </Button>
          <Button
            variant="outline"
            disabled={!isOpen || dismissing || restoring}
            onClick={handleDismiss}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Als erledigt markieren
          </Button>
          <Button
            disabled={!isOpen || restoring || dismissing}
            onClick={handleRestore}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {restoring ? 'Wiederherstellen…' : 'Wiederherstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LiteBookmark = ConflictEntry['winnerVersion'];

function Side({
  label,
  entry,
  counterpart,
  tone,
}: {
  label: string;
  entry: LiteBookmark;
  counterpart: LiteBookmark;
  tone: 'winner' | 'loser';
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${
        tone === 'winner' ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20'
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Field label="Titel">
        <DiffRenderer winner={entry.title} loser={counterpart.title} mode="words" />
      </Field>
      <Field label="URL">
        <DiffRenderer winner={entry.url} loser={counterpart.url} mode="chars" />
      </Field>
      <Field label="Pfad">
        <DiffRenderer
          winner={entry.folderPath}
          loser={counterpart.folderPath}
          mode="segments"
        />
      </Field>
      <Field label="Geändert">
        <span>{entry.dateModified ? formatDate(entry.dateModified) : '—'}</span>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm break-words">{children}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

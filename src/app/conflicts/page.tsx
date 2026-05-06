import { History } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';

export default function ConflictsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Konflikt-Log</h1>
          <p className="text-sm text-muted-foreground">
            Hier erscheint jede überschriebene Bookmark-Version. Inhalt kommt mit PROJ-9.
          </p>
        </header>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Noch keine Konflikte</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Sobald der Sync läuft (PROJ-6) und dasselbe Bookmark in zwei Browsern unterschiedlich
              verändert wird, landet die verlierende Version hier.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

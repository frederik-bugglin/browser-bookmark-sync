import { AppShell } from '@/components/app-shell';
import { BrowserListCompact } from '@/components/browser-list-compact';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
          <p className="text-sm text-muted-foreground">
            Status der erkannten Browser. Bookmark-Adapter folgen mit PROJ-3 bis PROJ-5.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Browser</CardTitle>
          </CardHeader>
          <CardContent>
            <BrowserListCompact />
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Was als Nächstes folgt</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="flex flex-col gap-1.5">
              <li>1. Anmeldung mit E-Mail (PROJ-2)</li>
              <li>2. Bookmark-Adapter pro Browser-Familie (PROJ-3 bis PROJ-5)</li>
              <li>3. Sync-Engine mit Last-Write-Wins (PROJ-6)</li>
              <li>4. Sync-Trigger manuell und automatisch (PROJ-7)</li>
              <li>5. Settings-UI für Browser-Auswahl (PROJ-8)</li>
              <li>6. Konflikt-Log mit Restore (PROJ-9)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

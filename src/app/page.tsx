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
            Status der für den Sync aktivierten Browser.
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
      </div>
    </AppShell>
  );
}

# Supabase-Setup für Junction

> Einmaliger Setup-Prozess. Dauert circa 5 Minuten. Wird einmal pro Person/Projekt gemacht.

## 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) anmelden (GitHub-Login geht am schnellsten).
2. Oben rechts auf **New project** klicken.
3. Felder ausfüllen:
   - **Name:** `junction`
   - **Database Password:** generieren lassen, kopieren in Passwort-Manager (brauchen wir nur für SQL-Console)
   - **Region:** `Europe (Frankfurt)` — niedrigste Latenz für CH/DE, DSGVO-konform
   - **Pricing Plan:** `Free`
4. **Create new project** klicken. Setup dauert circa zwei Minuten.

## 2. URL und Anon-Key kopieren

Nach dem Setup:

1. Links in der Sidebar → **Project Settings** (Zahnrad-Icon).
2. **API** → folgende zwei Werte kopieren:
   - **Project URL** (sieht aus wie `https://abc123xyz.supabase.co`)



   - **anon public** key (langer JWT, beginnt mit `eyJ...`)

Diese landen gleich in `.env.local` (siehe Schritt 4).


## 3. SQL-Migration ausführen

1. Links in der Sidebar → **SQL Editor**.
2. Oben **New query** klicken.
3. Den Inhalt von `supabase/migrations/0001_initial_schema.sql` aus dem Projekt komplett einfügen.
4. **Run** klicken (oder Cmd+Enter).
5. Erwartetes Ergebnis: `Success. No rows returned`. Falls ein Fehler kommt, screenshotten und schicken.

Verifikation:
- Sidebar → **Table Editor** → die vier Tabellen sollten sichtbar sein:
  `bookmarks`, `folders`, `devices`, `conflict_log`, `schema_version`.
- Pro Tabelle sollte ein **kleines Schloss-Icon** neben dem Namen stehen → RLS ist aktiv.

## 4. Magic Link konfigurieren (Redirect-URL)

Damit der Link aus der E-Mail Junction öffnet (statt einer Webseite):

1. Sidebar → **Authentication** → **URL Configuration**.
2. **Site URL** setzen auf:
   ```
   junction://auth/callback
   ```
3. Unter **Redirect URLs** → **Add URL** → erneut eintragen:
   ```
   junction://auth/callback
   ```
4. **Save** klicken.

> Hintergrund: Supabase erlaubt nur explizit registrierte Redirect-URLs. Custom-Protokolle wie `junction://` sind erlaubt und werden vom macOS-Default-Handler verarbeitet.

## 5. (Optional) Magic-Link-Mail anpassen

Sidebar → **Authentication** → **Email Templates** → **Magic Link**.

Standard-Template auf Englisch reicht für den Anfang. Wer will, übersetzt den Body auf Deutsch und passt das Branding an. Variable `{{ .ConfirmationURL }}` muss erhalten bleiben — das ist der Login-Link.

## 6. Werte in `.env.local` eintragen

Im Projektordner:

```bash
cp .env.example .env.local
```

Dann `.env.local` öffnen und die zwei Werte aus Schritt 2 einsetzen:

```
SUPABASE_URL=https://abc123xyz.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

`.env.local` ist in `.gitignore` und wird nie comitted.

## 7. Verifizieren

```bash
npm run electron:dev
```

Beim ersten Start zeigt das Onboarding-Fenster die E-Mail-Eingabe. Wenn die Konfiguration fehlt, zeigt die App einen klaren Fehler statt zu crashen.

## Troubleshooting

**„Invalid login credentials" beim Magic-Link-Klick:**
Site-URL nicht korrekt gesetzt (Schritt 4). Junction muss exakt `junction://auth/callback` als Redirect-URL kennen.

**Mail kommt nicht an:**
Spam-Ordner checken. Supabase verschickt von einer geteilten Domain. Falls das ein Dauerproblem wird, in **Authentication → SMTP Settings** einen eigenen Provider (Resend, Postmark) eintragen — nicht Teil dieses MVPs.

**„relation does not exist" beim ersten Sync:**
Migration nicht gelaufen oder andere DB. URL in `.env.local` nochmal mit der unter **Project Settings → API** abgleichen.

**Schema-Version-Mismatch beim App-Start:**
Du hast die Migration manuell verändert oder ein altes Schema importiert. Im SQL Editor:
```sql
SELECT version FROM schema_version;
```
Erwartet: `1`. Falls leer, Migration neu laufen lassen.

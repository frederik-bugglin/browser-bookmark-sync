'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Cloud, Lock, Layers, Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand-mark';
import { junction } from '@/lib/electron-bridge';
import type { AuthStatus } from '@/lib/types';

type Step = 'welcome' | 'login' | 'sent';
type Submission = { state: 'idle' } | { state: 'sending' } | { state: 'error'; message: string };

export function WelcomeScreen() {
  const [step, setStep] = useState<Step>('welcome');
  const [email, setEmail] = useState('');
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void junction().appState.get().then((s) => {
      if (!cancelled && s.firstLaunchDone) setStep('login');
    });
    void junction().auth.getStatus().then((status) => {
      if (!cancelled && status.state === 'authenticated') {
        void junction().window.showMain();
      }
    });
    const unsubscribe = junction().auth.subscribe((status: AuthStatus) => {
      if (status.state === 'authenticated') {
        void junction().window.showMain();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const goToLogin = async () => {
    await junction().appState.set({ firstLaunchDone: true });
    setStep('login');
  };

  const handleSubmitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmission({ state: 'sending' });
    const result = await junction().auth.requestMagicLink(email);
    if (result.ok) {
      setStep('sent');
      setSubmission({ state: 'idle' });
    } else {
      setSubmission({ state: 'error', message: result.message });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 py-16">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={56} />
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {step === 'sent' ? 'Mail unterwegs' : 'Willkommen bei Junction'}
        </h1>
        {step === 'welcome' ? (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Junction synchronisiert deine Bookmarks zwischen Chrome, Safari, Firefox, Arc, Brave, Edge,
            Zen und Dia auf deinem Mac. iOS und andere Geräte ziehen über den nativen Browser-Sync nach.
          </p>
        ) : null}
      </div>

      {step === 'welcome' ? (
        <>
          <ul className="mt-12 grid w-full max-w-lg gap-3 text-sm">
            <Feature icon={Layers} title="Ein Stand für alle Browser" body="Bookmarks und Ordner werden automatisch zusammengeführt." />
            <Feature icon={Cloud} title="Cloud-Backup mit Supabase" body="Dein Account hält den gemeinsamen Stand. Multi-Mac später möglich." />
            <Feature icon={Lock} title="Last-Write-Wins mit Konflikt-Log" body="Jede überschriebene Version bleibt im Log nachvollziehbar." />
          </ul>
          <Button onClick={goToLogin} className="mt-12 gap-2">
            Loslegen
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ) : null}

      {step === 'login' ? (
        <form onSubmit={handleSubmitEmail} className="mt-10 flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              E-Mail-Adresse
            </Label>
            <Input
              id="email"
              type="email"
              autoFocus
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@beispiel.com"
              disabled={submission.state === 'sending'}
            />
            <p className="text-xs text-muted-foreground">
              Wir schicken dir einen Login-Link. Kein Passwort nötig.
            </p>
          </div>

          {submission.state === 'error' ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submission.message}</span>
            </div>
          ) : null}

          <Button type="submit" disabled={submission.state === 'sending' || !email.includes('@')} className="gap-2">
            {submission.state === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Login-Link schicken
              </>
            )}
          </Button>
        </form>
      ) : null}

      {step === 'sent' ? (
        <div className="mt-10 flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="text-sm text-muted-foreground">
            Wir haben dir einen Login-Link an <span className="font-medium text-foreground">{email}</span> geschickt.
            Klick den Link in der Mail, um Junction freizuschalten.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setStep('login')}>
            Andere E-Mail verwenden
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Layers;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <Icon className="mt-0.5 h-5 w-5 text-primary" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

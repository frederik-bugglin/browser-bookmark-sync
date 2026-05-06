import { app, safeStorage } from 'electron';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config';

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'authenticated'; email: string; userId: string };

const REDIRECT_URL = 'junction://auth/callback';
const SESSION_FILENAME = 'auth-session.bin';

type PersistedSession = {
  access_token: string;
  refresh_token: string;
};

function memoryStorageAdapter() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

export class AuthService extends EventEmitter {
  private readonly client: SupabaseClient;
  private readonly sessionPath: string;
  private status: AuthStatus = { state: 'loading' };

  constructor(config: Config) {
    super();
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'implicit',
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
        storage: memoryStorageAdapter(),
      },
    });
    this.sessionPath = path.join(app.getPath('userData'), SESSION_FILENAME);
  }

  async init(): Promise<void> {
    this.client.auth.onAuthStateChange((event, session) => {
      if (session) {
        this.persistSession(session);
        this.applyStatusFromSession(session);
      } else if (event === 'SIGNED_OUT') {
        this.clearPersistedSession();
        this.setStatus({ state: 'unauthenticated' });
      }
    });

    const persisted = this.loadPersistedSession();
    if (persisted) {
      const { data, error } = await this.client.auth.setSession(persisted);
      if (!error && data.session) {
        this.applyStatusFromSession(data.session);
        return;
      }
      this.clearPersistedSession();
    }
    this.setStatus({ state: 'unauthenticated' });
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  async requestMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      return { ok: false, message: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
    }
    const { error } = await this.client.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: REDIRECT_URL, shouldCreateUser: true },
    });
    if (error) {
      return { ok: false, message: this.translateError(error.message) };
    }
    return { ok: true };
  }

  async handleCallback(callbackUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      return { ok: false, message: 'Ungültiger Login-Link.' };
    }
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const params = new URLSearchParams(hash || parsed.search.replace(/^\?/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const errorDesc = params.get('error_description') || params.get('error');

    if (errorDesc) {
      return { ok: false, message: this.translateError(errorDesc) };
    }
    if (!access_token || !refresh_token) {
      return { ok: false, message: 'Login-Link enthält keine gültigen Tokens.' };
    }

    const { error } = await this.client.auth.setSession({ access_token, refresh_token });
    if (error) {
      return { ok: false, message: this.translateError(error.message) };
    }
    return { ok: true };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    this.clearPersistedSession();
    this.setStatus({ state: 'unauthenticated' });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  private applyStatusFromSession(session: Session): void {
    const email = session.user?.email ?? '';
    const userId = session.user?.id ?? '';
    if (!email || !userId) {
      this.setStatus({ state: 'unauthenticated' });
      return;
    }
    this.setStatus({ state: 'authenticated', email, userId });
  }

  private setStatus(status: AuthStatus): void {
    this.status = status;
    this.emit('change', status);
  }

  private persistSession(session: Session): void {
    const payload: PersistedSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
    const json = JSON.stringify(payload);
    const tmp = `${this.sessionPath}.tmp`;
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(json);
        writeFileSync(tmp, encrypted);
      } else {
        writeFileSync(tmp, json, { encoding: 'utf8' });
      }
      renameSync(tmp, this.sessionPath);
    } catch {
      // If we can't write, the user simply has to log in again next launch.
    }
  }

  private loadPersistedSession(): PersistedSession | null {
    if (!existsSync(this.sessionPath)) return null;
    try {
      const buf = readFileSync(this.sessionPath);
      const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
      const parsed = JSON.parse(text) as PersistedSession;
      if (typeof parsed?.access_token !== 'string' || typeof parsed?.refresh_token !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private clearPersistedSession(): void {
    if (existsSync(this.sessionPath)) {
      try {
        unlinkSync(this.sessionPath);
      } catch {
        // ignore
      }
    }
  }

  private translateError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('too many')) {
      return 'Zu viele Login-Versuche. Bitte ein paar Minuten warten.';
    }
    if (lower.includes('invalid') && lower.includes('email')) {
      return 'E-Mail-Adresse ist ungültig.';
    }
    if (lower.includes('expired')) {
      return 'Login-Link ist abgelaufen. Bitte einen neuen anfordern.';
    }
    return message;
  }
}

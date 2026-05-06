import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';

export class JsonStore<T extends object> extends EventEmitter {
  private readonly filePath: string;
  private data: T;

  constructor(
    fileName: string,
    private readonly schema: ZodType<T>,
    private readonly fallback: T,
  ) {
    super();
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, fileName);
    this.data = this.load();
  }

  private load(): T {
    if (!existsSync(this.filePath)) return this.fallback;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8'));
      const parsed = this.schema.safeParse(raw);
      return parsed.success ? parsed.data : this.fallback;
    } catch {
      return this.fallback;
    }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  get(): T {
    return this.data;
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch };
    this.persist();
    this.emit('change', this.data);
    return this.data;
  }
}

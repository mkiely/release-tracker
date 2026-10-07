// One-line console logs for loading, saving and backup, so "where did my data go?"
// can be answered from the console. Info level — they describe normal operation —
// and silent under Vitest, where they'd only bury real failures.

const enabled = import.meta.env?.MODE !== 'test';

export type LogScope = 'storage' | 'backup';

export function logInfo(scope: LogScope, message: string, ...detail: unknown[]): void {
  if (enabled) console.info(`[${scope}] ${message}`, ...detail);
}

export function logWarn(scope: LogScope, message: string, ...detail: unknown[]): void {
  if (enabled) console.warn(`[${scope}] ${message}`, ...detail);
}

/** "126 KB" — sizes are only ever for a human skimming the console. */
export function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

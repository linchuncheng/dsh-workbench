import { quoteShellArgFor } from '@dsh-workbench/shared/host';
import { sessionArgv, type SessionDialect } from './opencli-session.js';

export const OPENCLI_WINDOW_ENV: Readonly<Record<string, string>> = { OPENCLI_WINDOW: 'background' };

export const OPENCLI_SITE_SESSION_ENV: Readonly<Record<string, string>> = {
  OPENCLI_SITE_SESSION: 'persistent',
};

export interface BackgroundLineOptions {
  readonly platform?: NodeJS.Platform;
  readonly dialect?: SessionDialect;
}

export function backgroundLine(
  command: string,
  argv: readonly string[],
  options: BackgroundLineOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  return [
    quoteShellArgFor(command, platform),
    ...sessionArgv(argv, options.dialect ?? 'flag').map((arg) => quoteShellArgFor(arg, platform)),
  ].join(' ');
}

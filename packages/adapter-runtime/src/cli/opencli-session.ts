export type SessionDialect = 'flag' | 'positional';

export function sessionArgv(argv: readonly string[], dialect: SessionDialect = 'flag'): readonly string[] {
  if (argv[0] !== 'browser') return argv;
  const session = argv[1];
  if (session === undefined || session === '' || session.startsWith('-')) return argv;
  if (dialect === 'positional') return argv;
  return ['browser', '--session', session, ...argv.slice(2)];
}

export function sessionDialectOf(version: string | undefined): SessionDialect {
  if (version === undefined) return 'flag';
  const major = Number.parseInt(version.trim().split('.')[0] ?? '', 10);
  return Number.isFinite(major) && major < 2 ? 'positional' : 'flag';
}

export function tabArgv(argv: readonly string[], dialect: SessionDialect = 'flag'): readonly string[] {
  if (dialect !== 'positional') return argv;
  const at = argv.indexOf('--tab');
  if (at < 0) return argv;
  return [...argv.slice(0, at), ...argv.slice(at + 2)];
}

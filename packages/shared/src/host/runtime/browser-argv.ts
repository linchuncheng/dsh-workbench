const SESSION_FLAG = '--session';

export function sessionArgv(argv: readonly string[]): readonly string[] {
  if (argv[0] !== 'browser') return argv;
  const session = argv[1];
  if (session === undefined || session === '' || session.startsWith('-')) return argv;
  return ['browser', SESSION_FLAG, session, ...argv.slice(2)];
}

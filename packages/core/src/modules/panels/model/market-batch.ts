interface InstallCommand {
  readonly before: string;
  readonly spec: string;
  readonly preAllow: string;
  readonly allow: string;
  readonly postAllow: string;
}

const DIR = /^(.*?--dir\s+'[^']*'\s+)('[^']*')(.*)$/u;

const ALLOW = /(^|\s)(--allow-build=(?:'[^']*'|\S+))([\s\S]*)$/u;

function parseInstallCommand(line: string): InstallCommand | undefined {
  const dir = DIR.exec(line);
  if (dir === null) return undefined;
  const before = dir[1] ?? '';
  const spec = dir[2] ?? '';
  const after = dir[3] ?? '';
  const allow = ALLOW.exec(after);
  if (allow === null) return undefined;
  const preAllow = after.slice(0, allow.index + (allow[1] ?? '').length);
  const postAllow = allow[3] ?? '';
  if (postAllow.includes('--allow-build=')) return undefined;
  return { before, spec, preAllow, allow: allow[2] ?? '', postAllow };
}

export function mergeInstallCommands(lines: readonly string[]): string | undefined {
  if (lines.length < 2) return undefined;
  const parsed: InstallCommand[] = [];
  for (const line of lines) {
    const entry = parseInstallCommand(line);
    if (entry === undefined) return undefined;
    parsed.push(entry);
  }
  const first = parsed[0];
  if (first === undefined) return undefined;
  if (
    !parsed.every(
      (entry) =>
        entry.before === first.before &&
        entry.preAllow === first.preAllow &&
        entry.postAllow === first.postAllow,
    )
  ) {
    return undefined;
  }
  const specs = parsed.map((entry) => entry.spec).join(' ');
  const allows = parsed.map((entry) => entry.allow).join(' ');
  return `${first.before}${specs}${first.preAllow}${allows}${first.postAllow}`;
}

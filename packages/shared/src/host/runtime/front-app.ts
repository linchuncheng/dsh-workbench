import type { HostOs } from '../../contract/protocol/platform.js';

export function frontAppCommand(platform: HostOs): string | undefined {
  if (platform === 'darwin') {
    return `osascript -e ${quoteFor('tell application "System Events" to get name of first application process whose frontmost is true', platform)}`;
  }
  if (platform === 'linux') {
    return 'xdotool getactivewindow getwindowpid 2>/dev/null && ps -p "$(xdotool getactivewindow getwindowpid)" -o comm=';
  }
  return undefined;
}

export function frontAppOf(stdout: string, platform: HostOs): string | undefined {
  const lines = String(stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const last = lines[lines.length - 1];
  if (last === undefined) return undefined;
  const name = platform === 'linux' ? (last.split(/\s+/)[0] ?? '') : last;
  return name === '' ? undefined : name;
}

export function bringBackCommand(app: string, platform: HostOs): string | undefined {
  const name = app.trim();
  if (name === '') return undefined;
  if (platform === 'darwin') return `open -a ${quoteFor(name, platform)}`;
  if (platform === 'linux') return `wmctrl -a ${quoteFor(name, platform)}`;
  return undefined;
}

function quoteFor(value: string, platform: HostOs): string {
  if (platform === 'win32') return `"${value.replaceAll('"', '\\"')}"`;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

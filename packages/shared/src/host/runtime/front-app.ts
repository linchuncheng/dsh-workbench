import type { HostOs } from '../../contract/protocol/platform.js';

export function frontAppCommand(platform: HostOs): string | undefined {
  if (platform === 'darwin') return 'lsappinfo info -only bundleID $(lsappinfo front)';
  if (platform === 'linux') return 'xdotool getactivewindow';
  if (platform === 'win32') return WINDOWS_FRONT_APP;
  return undefined;
}

const WINDOWS_FRONT_APP = [
  "Add-Type -Namespace W -Name N -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p);'",
  '$h=[W.N]::GetForegroundWindow()',
  '$p=0',
  '[void][W.N]::GetWindowThreadProcessId($h,[ref]$p)',
  '$p',
].join('; ');

const BUNDLE_ID = /bundleID="([^"]+)"/;

export function frontAppOf(stdout: string, platform: HostOs): string | undefined {
  const text = String(stdout ?? '');
  if (platform === 'darwin') return BUNDLE_ID.exec(text)?.[1]?.trim() || undefined;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const last = lines[lines.length - 1];
  if (last === undefined) return undefined;
  const name = platform === 'win32' ? last : (last.split(/\s+/)[0] ?? '');
  return name === '' ? undefined : name;
}

export function bringBackCommand(app: string, platform: HostOs): string | undefined {
  const name = app.trim();
  if (name === '') return undefined;
  if (platform === 'darwin') return `open -b ${quoteFor(name, platform)}`;
  if (platform === 'linux') return `xdotool windowactivate ${quoteFor(name, platform)}`;
  if (platform === 'win32') return windowsBringBack(name);
  return undefined;
}

function windowsBringBack(app: string): string {
  const pid = app.trim();
  if (!/^\d+$/.test(pid)) return `if ((New-Object -ComObject WScript.Shell).AppActivate('${app.replaceAll("'", "''")}')) { exit 0 } else { exit 1 }`;
  return `if ((New-Object -ComObject WScript.Shell).AppActivate(${pid})) { exit 0 } else { exit 1 }`;
}

function quoteFor(value: string, platform: HostOs): string {
  if (platform === 'win32') return `'${value.replaceAll("'", "''")}'`;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

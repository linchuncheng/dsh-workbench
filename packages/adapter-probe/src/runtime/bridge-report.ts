import { tailLines } from '@dsh-workbench/shared/host';

export type PreflightBridgeIssue = 'daemon' | 'extension' | 'profile' | 'stale' | 'unknown';

export const BRIDGE_ISSUE_ORDER: readonly PreflightBridgeIssue[] = ['profile', 'stale', 'daemon', 'extension', 'unknown'];

function jsonReportOf(text: string):
  | { readonly ok: boolean; readonly issues: readonly PreflightBridgeIssue[]; readonly detail: string }
  | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, issues: ['unknown'], detail: tailLines(text, 3) };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, issues: ['unknown'], detail: tailLines(text, 3) };
  }
  const data = (parsed as Record<string, unknown>)['data'];
  if (typeof data !== 'object' || data === null) {
    return { ok: false, issues: ['unknown'], detail: tailLines(text, 3) };
  }
  const fields = data as Record<string, unknown>;
  const found = new Set<PreflightBridgeIssue>();
  if (fields['daemonRunning'] !== true) found.add('daemon');
  if (fields['daemonStale'] === true) found.add('stale');
  if (fields['extensionConnected'] !== true || fields['extensionOutdated'] === true) {
    found.add('extension');
  }
  const profiles = Array.isArray(fields['profiles']) ? fields['profiles'] : [];
  if (profiles.length > 1) found.add('profile');
  if (found.size === 0) {
    const extension = typeof fields['extensionVersion'] === 'string' ? fields['extensionVersion'] : '';
    const version = typeof fields['cliVersion'] === 'string' ? fields['cliVersion'] : '';
    return {
      ok: true,
      issues: [],
      detail: [version, extension === '' ? '' : `扩展 ${extension}`].filter((one) => one !== '').join(' · '),
    };
  }
  const listed = Array.isArray(fields['issues'])
    ? fields['issues'].filter((one): one is string => typeof one === 'string')
    : [];
  return {
    ok: false,
    issues: BRIDGE_ISSUE_ORDER.filter((issue) => found.has(issue)),
    detail: listed.join('\n').trim(),
  };
}

export function readBridgeReport(stdout: string): {
  readonly ok: boolean;
  readonly issues: readonly PreflightBridgeIssue[];
  readonly detail: string;
} {
  const text = String(stdout ?? '');
  const fromJson = jsonReportOf(text);
  if (fromJson !== undefined) return fromJson;
  const ok = /^\[OK\] Daemon:/m.test(text) && /^\[OK\] Extension:/m.test(text) && /^\[OK\] Connectivity:/m.test(text);
  if (ok) {
    const good = text.split('\n').find((line) => line.trim() === 'Everything looks good!');
    return { ok: true, issues: [], detail: good?.trim() ?? tailLines(text, 1) };
  }

  const found = new Set<PreflightBridgeIssue>();
  if (!/^\[OK\] Daemon:/m.test(text)) found.add('daemon');
  if (!/^\[OK\] Extension:/m.test(text)) found.add('extension');
  if (/Multiple Chrome profiles are connected/i.test(text)) found.add('profile');
  if (/Default browser profile is stale|Selected browser profile is not connected/i.test(text)) {
    found.add('stale');
  }
  if (found.has('profile') || found.has('stale')) found.delete('extension');
  if (found.size === 0) found.add('unknown');

  return { ok: false, issues: BRIDGE_ISSUE_ORDER.filter((issue) => found.has(issue)), detail: issuesSection(text) };
}

function issuesSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^Issues:/.test(line.trim()));
  if (start < 0) return tailLines(text, 6);
  return lines.slice(start).join('\n').trim();
}

export interface EntryIssue {
  readonly label: string;
  readonly message: string;
}

const issues: EntryIssue[] = [];

interface BootScope {
  readonly __DSH_BOOT__?: { readonly release?: { readonly version?: unknown } | undefined } | undefined;
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runtimeVersionOf(scope: unknown = globalThis): string | undefined {
  const boot = (scope as BootScope | undefined)?.__DSH_BOOT__;
  const version = boot?.release?.version;
  return typeof version === 'string' && version !== '' ? version : undefined;
}

export function entryReportLine(
  kind: '失败' | '跳过',
  label: string,
  reason: string,
  version: string | undefined = runtimeVersionOf(),
): string {
  const fields = version === undefined ? [label, reason] : [label, version, reason];
  return `[dsh-workbench] 客户端入口${kind}：${fields.join(' / ')}`;
}

function remember(kind: '失败' | '跳过', label: string, error: unknown, version?: string | undefined): string {
  const message = entryReportLine(kind, label, reasonOf(error), version);
  issues.push({ label, message });
  return message;
}

export function reportEntrySkip(label: string, error: unknown, version?: string | undefined): void {
  console.warn(remember('跳过', label, error, version));
}

export function reportEntryFailure(label: string, error: unknown, version?: string | undefined): void {
  console.error(remember('失败', label, error, version), error);
}

export function attemptEntry(label: string, step: () => void): boolean {
  try {
    step();
    return true;
  } catch (error) {
    reportEntrySkip(label, error);
    return false;
  }
}

export function guardedEffect(label: string, body: () => (() => void) | undefined): () => void {
  try {
    return body() ?? (() => undefined);
  } catch (error) {
    reportEntrySkip(label, error);
    return () => undefined;
  }
}

export function entryIssues(): readonly EntryIssue[] {
  return issues;
}

export function resetEntryIssues(): void {
  issues.length = 0;
}

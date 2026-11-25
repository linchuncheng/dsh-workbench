import { join } from 'node:path';
import { readJsonObject } from '@dsh-workbench/shared/host';
import { readBridgeReport, type PreflightBridgeIssue } from '../runtime/bridge-report.js';
import { rememberBridgeFacts } from '../runtime/bridge-facts.js';

const WARMABLE_BRIDGE_ISSUES: readonly PreflightBridgeIssue[] = ['daemon', 'stale'];

export interface BridgeVerdict {
  readonly ok: boolean;
  readonly detail: string;
  readonly issues: readonly PreflightBridgeIssue[];
  readonly command?: string | undefined;
  readonly stalled?: boolean | undefined;
  readonly facts?: { readonly extension?: string | undefined } | undefined;
}

export function canWarm(bridge: { ok: boolean; issues: readonly PreflightBridgeIssue[] }): boolean {
  return bridge.ok || bridge.issues.every((issue) => WARMABLE_BRIDGE_ISSUES.includes(issue));
}

export function bundledExtensionVersion(dir: string | undefined): string | undefined {
  if (dir === undefined) return undefined;
  const version = readJsonObject(join(dir, 'manifest.json'))?.['version'];
  return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
}

export function extensionDriftOf(installed: string | undefined, bundled: string | undefined): string | undefined {
  if (installed === undefined || bundled === undefined || installed === bundled) return undefined;
  return `浏览器扩展是 v${installed}，工作台需要 v${bundled}`;
}
export type BridgeExec =
  | { readonly kind: 'ok'; readonly stdout: string }
  | { readonly kind: 'nonzero'; readonly detail: string }
  | { readonly kind: 'error'; readonly detail: string }
  | { readonly kind: 'stalled'; readonly detail: string };

export interface BridgeProbeDeps {
  readonly doctor: () => Promise<BridgeExec>;
  readonly stop: () => Promise<BridgeExec>;
  readonly restart: () => Promise<BridgeExec>;
  readonly log: (line: string) => void;
  readonly fixCommand: (issues: readonly PreflightBridgeIssue[]) => string | undefined;
}

export function createBridgeProbe(deps: BridgeProbeDeps): () => Promise<BridgeVerdict> {
  let healed = false;

  async function restartStaleDaemon(report: {
    ok: boolean;
    issues: readonly PreflightBridgeIssue[];
  }): Promise<BridgeVerdict | undefined> {
    if (healed) return undefined;
    if (!report.issues.includes('stale')) return undefined;
    healed = true;
    deps.log('先停旧 daemon 再起新的：版本不一致时 restart 顶不掉占着端口的那一个');
    await deps.stop();
    const started = await deps.restart();
    if (started.kind !== 'ok') return undefined;
    const again = await deps.doctor();
    if (again.kind !== 'ok') return undefined;
    const after = readBridgeReport(again.stdout);
    rememberBridgeFacts(after.facts);
    return after.ok ? after : { ...after, command: deps.fixCommand(after.issues) };
  }

  return async (): Promise<BridgeVerdict> => {
    const result = await deps.doctor();
    if (result.kind === 'stalled') {
      return { ok: false, detail: result.detail, issues: ['unknown'], stalled: true };
    }
    if (result.kind !== 'ok') return { ok: false, detail: result.detail, issues: ['unknown'] };
    const report = readBridgeReport(result.stdout);
    rememberBridgeFacts(report.facts);
    if (report.ok) return report;
    const restarted = await restartStaleDaemon(report);
    if (restarted !== undefined) return restarted;
    return { ...report, command: deps.fixCommand(report.issues) };
  };
}

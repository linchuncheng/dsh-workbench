import { join } from 'node:path';
import type { DshHostContext, Seam } from '@dsh-workbench/shared/host';
import { noWrite, quoteShellArg, seamOf } from '@dsh-workbench/shared/host';
import { moduleFactOf } from '@/shared/api/host/diy-publish-preview';
import { toolchainArgvOf, toolchainBinOf } from '@/shared/api/host/diy-surface';
import { jsonOf } from './diy-browser';
import { asRecord, asText } from './diy-context';
import {
  publishAuthorOf,
  publishRequestOf,
  releaseArgvOf,
  type PublishAuthorHint,
  type PublishPreviewOf,
} from './publish-request';
import { DIY_PUBLISH_TOOL } from '../unit';

export const PREFLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

const PROBE_TIMEOUT_MS = 20 * 1000;

const supported = new Map<string, true>();

export interface PublishPreflightDeps {
  readonly root: (workspace: string | undefined) => string | null;
  readonly previewOf: PublishPreviewOf;
  readonly inferredAuthorOf: PublishAuthorHint;
}

export interface PublishPreflightAsk {
  readonly workspace?: string | undefined;
  readonly unit: string;
  readonly arguments?: unknown;
}

export type PublishPreflight = (ask: PublishPreflightAsk) => Promise<string | undefined>;

interface NeedsUser {
  readonly step: string;
  readonly text: string;
  readonly command: string;
}

function reasonOf(why: string, unit: string, extra: readonly string[] = []): string {
  return [
    `发布前检查未通过，这次发布已拒绝（没有发起审批）：${why.trim()}`,
    ...extra,
    `处理后重新调用 ${DIY_PUBLISH_TOOL}（unit=${unit}）。`,
  ].join('\n');
}

function needsExtraOf(needs: NeedsUser): readonly string[] {
  if (needs.step === 'changelog') return ['这次调用带上 changelogNote（一行一条）。'];
  if (needs.step === 'license') return ['这次调用带上 license（例如 MIT）。'];
  if (needs.command === '' || needs.text.includes(needs.command)) return [];
  return [`命令：${needs.command}`];
}

async function preflightSupported(seam: Seam, bin: string, root: string): Promise<boolean> {
  if (supported.has(bin)) return true;
  const probe = await seam.run({
    command: [...toolchainArgvOf(bin), 'release', '--help'].map(quoteShellArg).join(' '),
    intent: noWrite(),
    workdir: root,
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  const found = `${probe.stdout}\n${probe.stderr}`.includes('--preflight');
  if (found) supported.set(bin, true);
  return found;
}

function needsUserOf(result: { readonly exitCode: number | null; readonly stdout: string }): NeedsUser | undefined {
  if (result.exitCode !== 3) return undefined;
  const needs = asRecord(asRecord(jsonOf(result.stdout))['needsUser']);
  const text = asText(needs['text']);
  return text === ''
    ? undefined
    : { step: asText(needs['step']), text, command: asText(needs['command']) };
}

async function preflight(
  ctx: DshHostContext,
  deps: PublishPreflightDeps,
  ask: PublishPreflightAsk,
): Promise<string | undefined> {
  const root = deps.root(ask.workspace);
  if (root === null) return reasonOf('读不到这条会话的登记工作区。先在左栏选中这个项目。', ask.unit);
  const fact = moduleFactOf(root, ask.unit);
  if (fact === null) {
    return reasonOf(
      `当前工作区里没有模块「${ask.unit}」。先用 workbench_diy_status 确认工作区与模块标识。`,
      ask.unit,
    );
  }
  const seam = seamOf(ctx);
  if (seam === undefined) return reasonOf('本机没有 shell 服务，无法发布。', ask.unit);
  const bin = toolchainBinOf(root) ?? toolchainBinOf(fact.dir);
  if (bin === null) {
    return reasonOf(
      `当前工作区没有 dsh-wb-module（${join(root, 'node_modules')} 下不存在）。先执行 pnpm install。`,
      ask.unit,
    );
  }
  const request = publishRequestOf(ask.arguments);
  if (request.verify) return undefined;
  if (!(await preflightSupported(seam, bin, root))) return undefined;
  const author = await publishAuthorOf(request, deps.previewOf, deps.inferredAuthorOf, root, ask.unit);
  const argv = releaseArgvOf(bin, fact.dir, request, author, 'preflight');
  const result = await seam.run({
    command: argv.map(quoteShellArg).join(' '),
    intent: noWrite(),
    workdir: root,
    timeoutMs: PREFLIGHT_TIMEOUT_MS,
    env: { GIT_OPTIONAL_LOCKS: '0' },
  });
  if (result.exitCode === 0) return undefined;
  const needs = needsUserOf(result);
  if (needs !== undefined) return reasonOf(needs.text, ask.unit, needsExtraOf(needs));
  const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-3).join(' | ');
  return reasonOf(
    `命令退出码 ${String(result.exitCode)}${tail === '' ? '' : `：${tail}`}`,
    ask.unit,
  );
}

export function createPublishPreflight(ctx: DshHostContext, deps: PublishPreflightDeps): PublishPreflight {
  return (ask) => preflight(ctx, deps, ask);
}

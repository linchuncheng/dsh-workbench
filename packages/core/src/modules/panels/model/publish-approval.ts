import type { ApprovalCall, ApprovalDetail, ApprovalVerdict } from '@dsh-workbench/shared/host';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import { publishClaimDenyOf } from './publish-claim';
import { copiesOf } from './approval-questions';
import { DIY_PUBLISH_TOOL } from '../unit';

export type PublishApprovalPreview = PublishPreview;

export interface PublishPreviewAsk {
  readonly workspace?: string | undefined;
  readonly unit: string;
  readonly author?: string | undefined;
}

export type PublishPreviewLookup =
  | { readonly ok: true; readonly preview: PublishApprovalPreview }
  | { readonly ok: false; readonly reason: string };

export interface PublishPreflightAsk {
  readonly workspace?: string | undefined;
  readonly unit: string;
  readonly arguments?: unknown;
}

export type PublishPreflightLookup = (ask: PublishPreflightAsk) => Promise<string | undefined>;

function argsOf(call: ApprovalCall): Record<string, unknown> {
  const raw = call.arguments;
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

function textOf(raw: Record<string, unknown>, key: string): string {
  return typeof raw[key] === 'string' ? String(raw[key]).trim() : '';
}

function pair(zh: string, en: string): ApprovalDetail {
  return { zh, en };
}

function labelsOfArgs(raw: Record<string, unknown>): readonly string[] {
  const value = raw['labels'];
  if (!Array.isArray(value)) return [];
  const labels = value.filter((one): one is string => typeof one === 'string' && one.trim() !== '');
  return [...new Set(labels.map((one) => one.trim()))];
}

export function publishVerdict(
  call: ApprovalCall,
  preview?: (ask: PublishPreviewAsk) => PublishPreviewLookup,
  preflight?: PublishPreflightLookup,
): ApprovalVerdict {
  const raw = argsOf(call);
  if (raw['verify'] === true || raw['target'] === 'local') return { kind: 'allow' };
  const refresh = raw['refresh'] === true;
  const unit = textOf(raw, 'unit');
  const askedAuthor = textOf(raw, 'author');
  const lookup =
    unit === ''
      ? undefined
      : preview?.({
          ...(call.workspace === undefined ? {} : { workspace: call.workspace }),
          unit,
          ...(askedAuthor === '' ? {} : { author: askedAuthor }),
        });
  if (lookup !== undefined && !lookup.ok) return { kind: 'deny', reason: lookup.reason };
  const found = lookup?.ok === true ? lookup.preview : null;
  const asked = textOf(raw, 'target');
  const target = refresh
    ? 'market'
    : asked === ''
      ? found?.market === undefined
        ? found?.registry === undefined
          ? 'tarball'
          : 'team'
        : 'market'
      : asked;
  const source = textOf(raw, 'source');
  const claimReason = publishClaimDenyOf(found?.claim, found?.name ?? unit);
  if (source === '' && target !== 'tarball' && target !== 'local' && claimReason !== undefined) {
    return { kind: 'deny', reason: claimReason };
  }
  const label = unit === '' ? '工作台模块' : `工作台模块 [${unit}]`;
  const labelEn = unit === '' ? 'the workbench module' : `the workbench module [${unit}]`;
  if (!refresh && found?.changelog?.missing === true && textOf(raw, 'changelogNote') === '') {
    return {
      kind: 'deny',
      reason:
        `当前版本尚未提供更新日志（${found.changelog.version}）。请提供 changelogNote（一行一条）后再调用；` +
        '发布时会一并写入 CHANGELOG.md 并随包发布',
    };
  }
  const category = typeof raw['category'] === 'string' ? raw['category'].trim() : '';
  if (/[\r\n]/u.test(category)) {
    return { kind: 'deny', reason: '分类只接受一个短词，不能包含换行。' };
  }
  const labels = labelsOfArgs(raw);
  if (labels.length > 2) {
    return {
      kind: 'deny',
      reason: `标签最多两个（收到 ${String(labels.length)} 个）。请挑选最能说明该模块用途的 1–2 个。`,
    };
  }
  if (target === 'market' && category === '' && (found?.category ?? '') === '') {
    return {
      kind: 'deny',
      reason:
        '该模块尚未设置市集分类。发布到市场时请用 category 指定一个短词（说明它属于哪类，例如「任务与协作」）；' +
        '已有分类则无需传入。',
    };
  }
  const copies = copiesOf(label, labelEn);
  const copy = copies[target] ?? copies['team'];
  const targetLabel =
    found === null
      ? target
      : target === 'market' && found.market !== undefined
        ? `${found.name}@${found.version} → market (${found.market.url})`
        : `${found.name}@${found.version} → ${target}${found.registry === undefined ? '' : ` (${found.registry})`}`;
  const question = refresh
    ? pair(
        `只刷新${label}在市集里的元数据（标题 / 作者 / 说明 / 标签 / 分类），不更新版本、不重新发布产物，允许吗？`,
        `Only refresh ${labelEn}'s market metadata (title, author, description, labels, category); no version bump, no artifacts. Allow?`,
      )
    : pair(copy.zh, copy.en);
  return {
    kind: 'ask',
    reason: `${DIY_PUBLISH_TOOL} ${targetLabel}${refresh ? '（元数据）' : ''}`,
    question,
    fallback: question,
    headline: refresh
      ? { zh: '刷新市场元数据', en: 'Refresh market metadata' }
      : { zh: '发布模块', en: 'Publish module' },
    ...(preflight === undefined
      ? {}
      : {
          preflight: () =>
            preflight({
              ...(call.workspace === undefined ? {} : { workspace: call.workspace }),
              unit,
              arguments: call.arguments,
            }),
        }),
  };
}

export function publishVerdictFor(
  call: ApprovalCall,
  preview: ((ask: PublishPreviewAsk) => PublishPreviewLookup) | undefined,
  preflight?: PublishPreflightLookup | undefined,
): ApprovalVerdict | undefined {
  return publishVerdict(call, preview, preflight);
}

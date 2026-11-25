import type { Translate } from '../../lib/dsh-client.js';
import type { ApprovalInput, ApprovalPlanData, UnitClientFace } from './board-module.js';
import { Fragment, h, type ReactNode } from '../../lib/react.js';
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives';
import { ApprovalPlan, type ApprovalPlanRow } from './ApprovalPlan.js';
import { CardBoundary } from './CardBoundary.js';
import './ApprovalDetail.css';

interface ToolCallRoot {
  readonly callId?: string;
  readonly name?: string;
  readonly phase?: string;
  readonly argsRaw?: string;
  readonly subCalls?: readonly ToolCallRoot[];
}

const MAX_CALL_DEPTH = 64;

interface ChatSnapshot {
  readonly nodes?: { values(): Iterable<{ readonly kind?: string; readonly data?: { readonly root?: ToolCallRoot } }> };
}

type UseChat = <T>(selector: (snapshot: ChatSnapshot) => T) => T | undefined;

/**
 * `ApprovalDetail` 的契约：调用 id、读会话快照的钩子、已装模块与兜底渲染。
 */
export interface ApprovalDetailProps {
  readonly callId?: string;
  readonly useChat?: UseChat;
  readonly units?: readonly UnitClientFace[];
  readonly t?: Translate;
  readonly renderShell?: ((input: ApprovalInput, t: Translate) => ReactNode) | undefined;
}

function findCall(root: ToolCallRoot | undefined, callId: string, depth: number): ToolCallRoot | undefined {
  if (root === undefined || depth > MAX_CALL_DEPTH) return undefined;
  if (root.callId === callId && root.phase === 'start') return root;
  for (const child of root.subCalls ?? []) {
    const found = findCall(child, callId, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function callOf(snapshot: ChatSnapshot, callId: string | undefined): { name?: string; argsRaw: string } | undefined {
  if (callId === undefined) return undefined;
  for (const node of snapshot.nodes?.values() ?? []) {
    const root = node.kind === 'tool-call' ? node.data?.root : undefined;
    const call = findCall(root, callId, 0);
    if (call === undefined) continue;
    return { ...(call.name === undefined ? {} : { name: call.name }), argsRaw: call.argsRaw ?? '' };
  }
  return undefined;
}

function parseArgs(raw: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function planRowsOf(plan: ApprovalPlanData, t: Translate): readonly ApprovalPlanRow[] {
  const rows: ApprovalPlanRow[] = [
    { label: plan.objectLabel ?? t('approval.fact.object'), value: plan.object },
    { label: t('approval.fact.change'), value: plan.change },
    { label: t('approval.fact.target'), value: plan.target },
    { label: t('approval.fact.impact'), value: plan.impact },
  ];
  return plan.extra === undefined ? rows : [...rows, ...plan.extra];
}

function planNodeOf(plan: ApprovalPlanData, t: Translate): ReactNode {
  return h(ApprovalPlan, {
    rows: planRowsOf(plan, t),
    ...(plan.warn === undefined ? {} : { warn: plan.warn }),
  });
}

function missingNodeOf(t: Translate): ReactNode {
  return h(ApprovalPlan, { rows: [], warn: t('approval.missingDetail') });
}

function planOf(
  plan: (input: ApprovalInput, t: Translate) => ApprovalPlanData | null,
  input: ApprovalInput,
  t: Translate,
): ApprovalPlanData | null {
  try {
    return plan(input, t);
  } catch (error) {
    console.error(`[dsh-workbench] 模块审批详情读取失败：${reasonOf(error)}`);
    return null;
  }
}

/**
 * 审批屏的详情格：先画模块交的四行事实或它自己的渲染器，再退回外壳那张表或一段原始命令。
 * @param props.callId - 这次工具调用的 id；不给就直接走兜底（连调用都找不到）。
 * @param props.useChat - 读会话快照的钩子（dsh 注入）；不给就当作读不到调用。
 * @param props.units - 已装模块的面，按各自的 `approval.tools` 认领这次调用。
 * @param props.t - 翻译函数；不给就用返回 key 的直通实现。
 * @param props.renderShell - 没有模块认领时外壳自己的渲染（那张表）；不给且这次调用没带 `command` 时整格返回 `null`。
 * @returns 认领方的四行表 / 自定义渲染、外壳那张表，或一段可复制的命令。
 */
export function ApprovalDetail(props: ApprovalDetailProps) {
  const useChat = props.useChat ?? ((): undefined => undefined);
  const call = useChat((snapshot) => callOf(snapshot, props.callId));
  const t = props.t ?? ((key: string): string => key);

  const args = parseArgs(call?.argsRaw ?? '');
  const input: ApprovalInput = { tool: call?.name ?? '', args };
  const command = typeof args.command === 'string' ? args.command : '';

  const owner = (props.units ?? []).find((face) => face.approval?.tools.includes(input.tool) === true);
  if (owner?.approval !== undefined) {
    const approval = owner.approval;
    if (approval.plan !== undefined) {
      const plan = planOf(approval.plan, input, t);
      if (plan === null) return missingNodeOf(t);
      const fallback = planNodeOf(plan, t);
      const render = approval.render;
      if (render === undefined) return fallback;
      let custom: ReactNode;
      try {
        custom = render({ input, plan, t });
      } catch (error) {
        console.error(`[dsh-workbench] 模块审批自定义渲染失败：${reasonOf(error)}`);
        return fallback;
      }
      if (custom === null || custom === undefined || custom === false) return fallback;
      return (
        <CardBoundary unit={owner.unit} resetKey={props.callId ?? ''} t={t} fallback={fallback}>
          {custom}
        </CardBoundary>
      );
    }
    const Render = approval.render;
    return (
      <CardBoundary unit={owner.unit} resetKey={props.callId ?? ''} t={t} fallback={missingNodeOf(t)}>
        <Render input={input} t={t} />
      </CardBoundary>
    );
  }

  const shell = props.renderShell?.(input, t);
  if (shell !== undefined && shell !== null) return <Fragment>{shell}</Fragment>;

  if (command === '') return null;
  return (
    <CodeBlock
      code={command}
      className="wb-approvalCommand"
      copyLabel={t('blocker.copy')}
      copiedLabel={t('env.copied')}
    />
  );
}

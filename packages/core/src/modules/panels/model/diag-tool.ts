import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { DiagReadResult, DiagRecord, DshHostContext, DshToolDefinition } from '@dsh-workbench/shared/host';
import { diagMatches, diagSummary, originsOf, UNITS_SERVICE, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagHostOf, diagRoutesOf } from '@/shared/api/host/diag-routes';
import { refusalRowsOf, type UnitRefusalRow } from '@/shared/api/host/unit-refusals';
import { preflightEvidenceOf, readPreflightSnapshot } from '@/shared/api/host/diag-preflight';
import { OUTPUT } from './diy-context';
import { toolRegistryOf } from './tool-registry-guard';
import { DIAG_TOOL } from '../unit';

dayjs.extend(utc);

export const DIAG_HISTORY_LIMIT = 20;

const DIAG_DESCRIPTION =
  '读取最近的故障记录、按故障码的计数与启动检查快照（只读）。启动页停住时先调它；history 是跨会话的磁盘记录。默认只读当前工作台；host 可指定另一份工作台，* 为全部。';

const DIAG_INPUT = {
  type: 'object',
  properties: {
    host: {
      type: 'string',
      description: '读取哪份工作台的记录；不填 = 当前工作台，* = 全部，其他值见返回的 hosts。',
    },
  },
  additionalProperties: false,
} as const;

export interface DiagHistory {
  readonly records: readonly DiagRecord[];
  readonly read: number;
  readonly skipped: number;
}

function recordKey(record: DiagRecord): string {
  return `${record.ts}|${record.code}|${record.corrId}`;
}

export function diagHistoryOf(
  memory: readonly DiagRecord[],
  disk: DiagReadResult | undefined,
  limit = DIAG_HISTORY_LIMIT,
  host?: string,
): DiagHistory | undefined {
  if (disk === undefined) return undefined;
  const seen = new Set(memory.map(recordKey));
  const fresh = disk.records.filter(
    (record) => !seen.has(recordKey(record)) && diagMatches(record, host === undefined ? {} : { host }),
  );
  return {
    records: fresh.slice(Math.max(0, fresh.length - limit)),
    read: disk.read,
    skipped: disk.skipped,
  };
}

function hostOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = (raw as { readonly host?: unknown }).host;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function registerDiagTools(ctx: DshHostContext): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过诊断工具注册');
  if (tools === undefined) return [];
  const tool: DshToolDefinition = {
    name: DIAG_TOOL,
    description: DIAG_DESCRIPTION,
    parameters: { ...DIAG_INPUT },
    output: OUTPUT,
    execute(raw: unknown) {
      const routes = diagRoutesOf(workbenchRoot(), diagHostOf(ctx));
      const current = routes.host?.profile ?? 'unknown';
      const asked = hostOf(raw);
      const view = asked === undefined || asked === current ? 'current' : asked === '*' ? 'all' : 'other';
      const summary = diagSummary(routes.recorder);
      const day = dayjs().utc().format('YYYY-MM-DD');
      let disk: DiagReadResult | undefined;
      let diskState: 'ok' | 'unavailable' = 'unavailable';
      try {
        disk = routes.readDisk?.(day);
        if (disk !== undefined) diskState = 'ok';
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-workbench] 读诊断记录失败：${String(error)}`);
      }
      const historyHost = view === 'current' ? current : asked;
      const history = disk === undefined
        ? undefined
        : diagHistoryOf(
            view === 'current' ? summary.records : [],
            disk,
            DIAG_HISTORY_LIMIT,
            historyHost,
          );
      const hosts = [...new Set([current, ...originsOf(disk?.records ?? []).map((one) => one.host)])].sort();
      const root = workbenchRoot();
      let preflight: ReturnType<typeof preflightEvidenceOf> = null;
      try {
        preflight = preflightEvidenceOf(readPreflightSnapshot(root), root);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-workbench] 读启动检查快照失败：${String(error)}`);
      }
      const units = ctx.get(UNITS_SERVICE) as { refusals(): readonly UnitRefusalRow[] } | undefined;
      const refusals = units === undefined ? [] : refusalRowsOf(units);
      const base = {
        view,
        host: current,
        disk: diskState,
        hosts,
        ...(refusals.length === 0 ? {} : { refusals }),
        preflight,
      };
      const output =
        view === 'current'
          ? {
              ...base,
              counts: summary.counts,
              shown: summary.total,
              records: summary.records,
              others: originsOf(disk?.records ?? [], current),
              ...(history === undefined ? {} : { history: { day, ...history } }),
            }
          : view === 'all'
            ? {
                ...base,
                countsByHost: originsOf(disk?.records ?? []),
                ...(history === undefined ? {} : { history: { day, ...history } }),
              }
            : {
                ...base,
                ...(history === undefined ? {} : { history: { day, ...history } }),
              };
      return Promise.resolve(output);
    },
  };
  return [tools.register(tool)];
}

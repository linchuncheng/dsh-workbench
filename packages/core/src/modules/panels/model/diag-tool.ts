import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { DiagReadResult, DiagRecord, DshHostContext, DshToolDefinition } from '@dsh-workbench/shared/host';
import { diagSummary, UNITS_SERVICE, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagRoutesOf } from '@/shared/api/host/diag-routes';
import { refusalRowsOf, type UnitRefusalRow } from '@/shared/api/host/unit-refusals';
import { preflightEvidenceOf, readPreflightSnapshot } from '@/shared/api/host/diag-preflight';
import { OUTPUT } from './diy-context';
import { toolRegistryOf } from './tool-registry-guard';
import { DIAG_TOOL } from '../unit';

dayjs.extend(utc);

export const DIAG_HISTORY_LIMIT = 20;

const DIAG_DESCRIPTION =
  '读取最近的故障记录、按故障码的计数与启动检查快照（只读）。启动页停住时先调它；history 是跨会话的磁盘记录。';

const DIAG_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const;

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
): DiagHistory | undefined {
  if (disk === undefined) return undefined;
  const seen = new Set(memory.map(recordKey));
  const fresh = disk.records.filter((record) => !seen.has(recordKey(record)));
  return {
    records: fresh.slice(Math.max(0, fresh.length - limit)),
    read: disk.read,
    skipped: disk.skipped,
  };
}

export function registerDiagTools(ctx: DshHostContext): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过诊断工具注册');
  if (tools === undefined) return [];
  const tool: DshToolDefinition = {
    name: DIAG_TOOL,
    description: DIAG_DESCRIPTION,
    parameters: { ...DIAG_INPUT },
    output: OUTPUT,
    execute() {
      const routes = diagRoutesOf(workbenchRoot());
      const summary = diagSummary(routes.recorder);
      const day = dayjs().utc().format('YYYY-MM-DD');
      const history = diagHistoryOf(summary.records, routes.readDisk?.(day));
      const root = workbenchRoot();
      let preflight: ReturnType<typeof preflightEvidenceOf> = null;
      try {
        preflight = preflightEvidenceOf(readPreflightSnapshot(root), root);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-workbench] 读启动检查快照失败：${String(error)}`);
      }
      const units = ctx.get(UNITS_SERVICE) as { refusals(): readonly UnitRefusalRow[] } | undefined;
      const refusals = units === undefined ? [] : refusalRowsOf(units);
      const output = {
        counts: summary.counts,
        shown: summary.total,
        records: summary.records,
        ...(refusals.length === 0 ? {} : { refusals }),
        preflight,
        ...(history === undefined ? {} : { history: { day, ...history } }),
      };
      return Promise.resolve(output);
    },
  };
  return [tools.register(tool)];
}

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { DiagReadResult, DiagRecord, DshHostContext, DshToolDefinition } from '@dsh-workbench/shared/host';
import { diagSummary, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagRoutesOf } from '@/shared/api/host/diag-routes';
import { OUTPUT } from './diy-context';
import { toolRegistryOf } from './tool-registry-guard';
import { DIAG_TOOL } from '../unit';

dayjs.extend(utc);

export const DIAG_HISTORY_LIMIT = 20;

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
    description: '读取最近的故障记录与按故障码的计数（只读，常驻）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    execute() {
      const routes = diagRoutesOf(workbenchRoot());
      const summary = diagSummary(routes.recorder);
      const day = dayjs().utc().format('YYYY-MM-DD');
      const history = diagHistoryOf(summary.records, routes.readDisk?.(day));
      return Promise.resolve(history === undefined ? summary : { ...summary, history: { day, ...history } });
    },
  };
  return [tools.register(tool)];
}

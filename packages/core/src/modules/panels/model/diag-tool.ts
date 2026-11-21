import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { workbenchRoot } from '@dsh-workbench/shared/host';
import { diagSummary } from '@dsh-workbench/shared/host';
import { OUTPUT } from './diy-context';
import { diagRoutesOf } from '@/shared/api/host/diag-routes';
import { DIAG_TOOL } from '../unit';

export function registerDiagTools(_ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const tool: DshToolDefinition = {
    name: DIAG_TOOL,
    description: '读取最近的故障记录与按故障码的计数（只读，不写记录、不改状态）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    execute() {
      return Promise.resolve(diagSummary(diagRoutesOf(workbenchRoot()).recorder));
    },
  };
  const off = tools.register(tool);
  return [off];
}

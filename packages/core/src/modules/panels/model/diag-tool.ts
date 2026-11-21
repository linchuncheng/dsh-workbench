import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { diagSummary, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagRoutesOf } from '@/shared/api/host/diag-routes';
import { OUTPUT } from './diy-context';
import { DIAG_TOOL } from '../unit';

export function registerDiagTools(_ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const tool: DshToolDefinition = {
    name: DIAG_TOOL,
    description: '读取最近的故障记录与按故障码的计数（只读，常驻）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    execute() {
      return Promise.resolve(diagSummary(diagRoutesOf(workbenchRoot()).recorder));
    },
  };
  return [tools.register(tool)];
}

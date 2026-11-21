import type { DshHostContext, DshToolDefinition } from '@dsh-workbench/shared/host';
import { diagSummary, workbenchRoot } from '@dsh-workbench/shared/host';
import { diagRoutesOf } from '@/shared/api/host/diag-routes';
import { OUTPUT } from './diy-context';
import { toolRegistryOf } from './tool-registry-guard';
import { DIAG_TOOL } from '../unit';

export function registerDiagTools(ctx: DshHostContext): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过诊断工具注册');
  if (tools === undefined) return [];
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

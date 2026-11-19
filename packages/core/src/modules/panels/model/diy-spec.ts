import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { productWrite, seamOf } from '@dsh-workbench/shared/host';
import { plainLine } from './diy-browser';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { asNumber, asRecord, asText, OUTPUT, plainJson } from './diy-context';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { jsonOf } from './diy-browser';
import { DIY_SPEC_TOOL } from '../unit';

export const SPEC_TIMEOUT_MS = 20000;

export function specArgvOf(command: string): readonly string[] {
  const parts = command
    .trim()
    .replace(/\//g, ' ')
    .split(/\s+/)
    .filter((one) => one !== '');
  if (parts.length !== 2) return [];
  return [parts[0] ?? '', parts[1] ?? '', '--help', '-f', 'json'];
}

export function specTool(ctx: DshHostContext): DshToolDefinition {
  const surface = surfaceOf(ctx);
  return {
    name: DIY_SPEC_TOOL,
    description: `查询${surface?.name ?? '运行时'}命令规格（入参 / 出参列 / access / 预览档）：返回 \`--help -f json\` 的原始输出，插件与内置命令都可查询。`,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '站点与命令名两个词，例 `inventory publish`（`inventory/publish` 也可）。' },
        timeoutMs: { type: 'number', description: '超时毫秒（默认 20000）。' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, _exec: DshToolRunContext) {
      const args = asRecord(raw);
      const argv = specArgvOf(asText(args['command']));
      if (argv.length === 0) {
        throw new Error('需要一条命令：站点与命令名两个词，例 `inventory publish`（`inventory/publish` 也接受）。');
      }
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法查询命令规格');
      const asked = asNumber(args['timeoutMs']);
      const timeoutMs = asked !== undefined && asked > 0 ? asked : SPEC_TIMEOUT_MS;
      const result = await seam.run({
        command: (surfaceOf(ctx)?.background ?? plainLine)(cliCommandOf(ctx), argv),
        intent: productWrite(),
        timeoutMs,
      });
      const spec = jsonOf(result.stdout);
      return plainJson({
        ok: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        ...(spec === undefined ? {} : { spec }),
      });
    },
  };
}

export function registerSpecTool(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  return [tools.register(specTool(ctx))];
}

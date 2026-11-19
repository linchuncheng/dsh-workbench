import { hostOsOf } from '../facts.js';
import type { HostOs } from '../../../contract/protocol/platform.js';

const MAX_WIN32_ARGV = 24_000;

export function scriptArgProblemOf(script: string, platform: HostOs = hostOsOf()): string | undefined {
  if (platform !== 'win32') return undefined;
  if (Math.ceil(Buffer.byteLength(script, 'utf8') / 3) * 4 <= MAX_WIN32_ARGV) return undefined;
  return '这份计划在 Windows 上太长（脚本超过命令行上限）：拆成几份计划，或把步骤写短一点';
}

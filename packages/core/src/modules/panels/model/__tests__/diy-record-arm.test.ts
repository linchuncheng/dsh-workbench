import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared/host';
import { armRecordPage } from '../diy-record';
import { RECORD_ARM_SCRIPT, RECORD_ARM_SCRIPTS } from '../diy-record-scripts';
import { armFailureText } from '../diy-record-text';
import { fakeSeamOf } from '../../__tests__/seam-fake';

const WINDOWS_LINE_CAP = 8191;
const PART_CAP = 6000;

type Plan = { readonly stdout?: string; readonly exitCode?: number };

function shellOf(plan: readonly Plan[], seen: string[]): DshShell {
  let index = 0;
  return {
    resolve(request: { command: string }) {
      seen.push(request.command);
      return request;
    },
    async execute() {
      const step = plan[Math.min(index, plan.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode ?? 0,
          timedOut: false,
          aborted: false,
          stdout: { text: step.stdout ?? '{"ok":true}', truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
}

const wireRead = (raw: string): unknown => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const box = parsed as Record<string, unknown>;
  if (typeof box['ok'] !== 'boolean') return parsed;
  return typeof box['data'] === 'string' ? JSON.parse(box['data']) : box['data'];
};

const armed = (plan: readonly Plan[]) => {
  const seen: string[] = [];
  return { seen, out: armRecordPage(fakeSeamOf(shellOf(plan, seen)), '', 'workbench-rec', { read: wireRead }) };
};

describe('浮条分段注入：每段都离 Windows 的命令行上限有余量', () => {
  it('★★★ 每一段都短于 6000 字符（Windows 单条命令 8191），合起来仍是原来那份钩子', () => {
    expect(RECORD_ARM_SCRIPTS.length).toBeGreaterThanOrEqual(5);
    for (const part of RECORD_ARM_SCRIPTS) {
      expect(part.length).toBeLessThanOrEqual(PART_CAP);
      expect(part.length + 200).toBeLessThan(WINDOWS_LINE_CAP);
    }
    expect(RECORD_ARM_SCRIPT).toContain('结束录制');
    expect(RECORD_ARM_SCRIPT).toContain('calls: []');
  });

  it('★★ 逐段装完：浮条先以「正在准备录制…」出现，钩子最后才装', async () => {
    const total = RECORD_ARM_SCRIPTS.length;
    const plan = [
      {},
      { stdout: '{"ok":true,"fresh":true}' },
      ...Array.from({ length: total - 3 }, () => ({ stdout: '{"ok":true}' })),
      { stdout: '{"ok":true,"phase":"armed","calls":[]}' },
    ];
    const { seen, out } = armed(plan);
    const outcome = await out;
    expect(seen).toHaveLength(total);
    expect(outcome.part).toBe(total);
    expect(outcome.parts).toBe(total);
    expect(seen[1]).toContain('__dsh-record-bar');
    expect(seen.findIndex((one) => one.includes('正在准备录制…'))).toBeLessThan(
      seen.findIndex((one) => one.includes('XMLHttpRequest')),
    );
  });

  it('★★ 2.x 把页面答案装在 data 里：拆一层之后最后一段仍带得出页面状态', async () => {
    const total = RECORD_ARM_SCRIPTS.length;
    const { out } = armed([
      ...Array.from({ length: total - 1 }, () => ({})),
      { stdout: JSON.stringify({ ok: true, data: { ok: true, phase: 'recording', calls: [] } }) },
    ]);
    const outcome = await out;
    expect(outcome.step.payload?.['phase']).toBe('recording');
  });

  it('★★ 第三段就失败 ⇒ 后面的不再发，且说得出是第几段', async () => {
    const total = RECORD_ARM_SCRIPTS.length;
    const { seen, out } = armed([{}, {}, { exitCode: 1, stdout: '{"ok":false,"code":"no-bar"}' }]);
    const outcome = await out;
    expect(seen).toHaveLength(3);
    expect(outcome.step.ok).toBe(false);
    expect(outcome).toMatchObject({ part: 3, parts: total });
  });
});

describe('注入失败说清是哪一种', () => {
  it('★★ 命令行太长 ⇒ 说是 Windows 上限，别让他等页面加载', () => {
    const text = armFailureText({ raw: 'The command line is too long.', code: '', part: 2, parts: 5 });
    expect(text).toContain('第 2/5 段');
    expect(text).toContain('8191');
    expect(text).not.toContain('等页面加载完');
  });

  it('★ 页面没回话 ⇒ 有 code 就报 code', () => {
    expect(armFailureText({ raw: '', code: 'no-bar', part: 4, parts: 5 })).toContain('no-bar');
    expect(armFailureText({ raw: '', code: '', part: 1, parts: 5 })).toContain('页面没有回话');
  });

  it('★ 其它原文 ⇒ 原样带上，并给下一步', () => {
    const text = armFailureText({ raw: 'SyntaxError: boom', code: '', part: 5, parts: 5 });
    expect(text).toContain('SyntaxError: boom');
    expect(text).toContain('doctor');
  });
});

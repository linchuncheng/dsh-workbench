import { describe, expect, it, vi } from 'vitest';
import type { Seam } from '../../seam/run.js';
import { PlanCancelledError, runPlan } from '../plan-run.js';

describe('安装计划可以被取消', () => {
  it('★ 已经撤了 signal → 一步都不跑，抛取消', async () => {
    const run = vi.fn();
    const control = new AbortController();
    control.abort();

    await expect(
      runPlan([{ kind: 'run', line: 'pnpm add x' }], {
        seam: { run } as unknown as Seam,
        intent: { kind: 'product' } as never,
        signal: control.signal,
      }),
    ).rejects.toBeInstanceOf(PlanCancelledError);
    expect(run).not.toHaveBeenCalled();
  });

  it('★ signal 挂到命令上，中途被撤 → 执行缝回 aborted → 抛取消', async () => {
    const control = new AbortController();
    const run = vi.fn(async (request: { signal?: AbortSignal }) => {
      expect(request.signal).toBe(control.signal);
      control.abort();
      return { exitCode: null, timedOut: false, aborted: true, stdout: '', stderr: '', truncated: false, stalled: false };
    });

    await expect(
      runPlan([{ kind: 'run', line: 'pnpm add x' }], {
        seam: { run } as unknown as Seam,
        intent: { kind: 'product' } as never,
        signal: control.signal,
      }),
    ).rejects.toBeInstanceOf(PlanCancelledError);
  });

  it('没给 signal → 照旧跑完', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0, timedOut: false, aborted: false, stdout: '', stderr: '', truncated: false, stalled: false,
    }));

    await runPlan([{ kind: 'run', line: 'pnpm add x' }], {
      seam: { run } as unknown as Seam,
      intent: { kind: 'product' } as never,
    });

    expect(run).toHaveBeenCalledTimes(1);
  });
});

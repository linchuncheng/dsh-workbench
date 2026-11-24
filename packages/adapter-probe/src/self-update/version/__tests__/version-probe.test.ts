import { describe, expect, it } from 'vitest';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { probeOpencliVersion, type OpencliVersionRun } from '../version-probe.js';

function probe(stdout: string) {
  return probeOpencliVersion({
    run: () => Promise.resolve<OpencliVersionRun>({ kind: 'ok', stdout }),
    attempts: 1,
    log: () => undefined,
  });
}

describe('opencli 版本探针：跟着 pin 走', () => {
  it('★ 和 pin 一致才算过', async () => {
    const verdict = await probe(`opencli ${OPENCLI_PIN}\n`);

    expect(verdict.ok).toBe(true);
    expect(verdict.behind).toBeUndefined();
    expect(verdict.detail).toBe(`opencli ${OPENCLI_PIN}`);
  });

  it('★ 区间内但不是 pin → behind：要重装成 pin', async () => {
    const verdict = await probe('opencli 1.8.8\n');

    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toBe(false);
    expect(verdict.behind).toBe(true);
    expect(verdict.detail).toContain('1.8.8');
    expect(verdict.detail).toContain(OPENCLI_PIN);
  });

  it('区间外 → missing（按缺失处理，照旧报只认哪个区间）', async () => {
    const verdict = await probe('opencli 0.9.0\n');

    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toBe(true);
    expect(verdict.behind).toBeUndefined();
  });

  it('读不出版本号 → 放行（不拿一行无关输出当版本）', async () => {
    const verdict = await probe('ok\n');

    expect(verdict.ok).toBe(true);
    expect(verdict.behind).toBeUndefined();
  });
});

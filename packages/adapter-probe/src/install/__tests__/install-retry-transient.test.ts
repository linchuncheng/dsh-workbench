import { describe, expect, it } from 'vitest';
import { installWithRetry } from '../install-retry';

const wording = {
  what: '工作台包',
  dropLabel: 'node_modules',
  mismatch: '缓存对不上',
  unresolved: '装完读不到',
  settled: '装好了',
  unresolvedAgain: '还是读不到',
  failedAgain: '还是没装上',
};

function depsOf(replies: readonly { readonly ok: boolean; readonly detail?: string }[]) {
  const runs: string[] = [];
  const dropped: number[] = [];
  let at = 0;
  return {
    runs,
    dropped,
    deps: {
      run: async (command: string) => {
        runs.push(command);
        const reply = replies[Math.min(at, replies.length - 1)];
        at += 1;
        return { ok: reply?.ok === true, detail: reply?.detail ?? '' };
      },
      resolves: () => true,
      drop: () => dropped.push(1),
      waitMs: 1,
    },
  };
}

describe('刚发布完 tarball 还没铺开：重试，而不是让用户再点一次', () => {
  it('★ 第一次 404、第二次好了 → 成功，且不清 node_modules', async () => {
    const { deps, dropped } = depsOf([
      { ok: false, detail: 'ERR_PNPM_FETCH_404  GET .../adapter-runtime-1.4.0-beta.0.tgz: Not Found' },
      { ok: true },
    ]);

    const result = await installWithRetry(deps, 'pnpm add x', wording);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(false);
    expect(dropped).toEqual([]);
  });

  it('★ 三次都 404 → 如实失败，且没走「清掉重装」那条路', async () => {
    const { deps, dropped, runs } = depsOf([
      { ok: false, detail: 'ERR_PNPM_FETCH_404' },
      { ok: false, detail: 'ERR_PNPM_FETCH_404' },
      { ok: false, detail: 'ERR_PNPM_FETCH_404' },
    ]);

    const result = await installWithRetry(deps, 'pnpm add x', wording);

    expect(result.ok).toBe(false);
    expect(dropped).toEqual([]);
    expect(runs).toHaveLength(3);
  });

  it('★ 不是临时性的错（比如 401）→ 不重试，立刻如实报告', async () => {
    const { deps, runs } = depsOf([{ ok: false, detail: 'ERR_PNPM_FETCH_401  unauthorized' }]);

    const result = await installWithRetry(deps, 'pnpm add x', wording);

    expect(result.ok).toBe(false);
    expect(runs).toHaveLength(1);
  });
});

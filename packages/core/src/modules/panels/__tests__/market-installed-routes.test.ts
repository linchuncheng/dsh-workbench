import { describe, expect, it, vi } from 'vitest';
import type { DiscoverProblem } from '@/kernel/contract/market-index';
import { MARKET_INSTALLED_ROUTE } from '@/kernel/contract/market-index';
import { marketInstalledRoutes } from '../model/market-installed';

const setup = (
  problem?: DiscoverProblem,
): {
  readonly refresh: ReturnType<typeof vi.fn>;
  readonly read: ReturnType<typeof vi.fn>;
  readonly call: (search: string) => Promise<{ ok: boolean; modules: readonly unknown[]; problem?: DiscoverProblem }>;
} => {
  const refresh = vi.fn(async (): Promise<DiscoverProblem | undefined> => problem);
  const read = vi.fn(() => ({ modules: [] }));
  const handler = marketInstalledRoutes({ refresh, read })[MARKET_INSTALLED_ROUTE] as (
    search: URLSearchParams,
  ) => Promise<{ ok: boolean; modules: readonly unknown[]; problem?: DiscoverProblem }>;
  return { refresh, read, call: async (search) => handler(new URLSearchParams(search)) };
};

describe('已安装模块的路由', () => {
  it('★ 只有检查才去问市场源：后台读（check=0）一次都不拉索引', async () => {
    const { refresh, read, call } = setup();

    expect(await call('check=0')).toEqual({ ok: true, modules: [] });
    expect(refresh).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('进页面补的那一次按 TTL 读（不 force），点 ⟳ 才 force 去拉', async () => {
    const { refresh, call } = setup();

    await call('');
    expect(refresh).toHaveBeenLastCalledWith({ check: true, force: false });
    await call('force=1');
    expect(refresh).toHaveBeenLastCalledWith({ check: true, force: true });
  });

  it('★ 市场源拉不下来时把问题带回去，清单照旧交出去', async () => {
    const problem: DiscoverProblem = { kind: 'git-network', detail: 'ssh: connect to host timed out' };
    const { call } = setup(problem);

    const body = await call('');
    expect(body.ok).toBe(true);
    expect(body.modules).toEqual([]);
    expect(body.problem).toEqual(problem);
  });
});
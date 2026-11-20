import { describe, expect, it, vi } from 'vitest';
import { removeWorkbenchModule } from '../model/market-remove';

const PROFILE = '/tmp/wb-profile';

describe('卸载工作台模块：pnpm remove + 删行', () => {
  it('★ 跑一条 pnpm remove，再把行同步掉', async () => {
    const lines: string[] = [];
    const removed: string[] = [];
    const syncRows = vi.fn();

    const change = await removeWorkbenchModule({
      profileDir: PROFILE,
      pkg: '@t/module-a',
      runAll: async (steps) => {
        for (const step of steps) {
          if (step.kind === 'run') lines.push(step.line);
          if (step.kind === 'remove') removed.push(step.path);
        }
      },
      syncRows,
    });

    expect(lines).toEqual([`'pnpm' remove --dir '${PROFILE}' '@t/module-a'`]);
    expect(removed).toEqual([`${PROFILE}/node_modules/@t/module-a`]);
    expect(syncRows).toHaveBeenCalledTimes(1);
    expect(change).toMatchObject({ application: 'applied', stage: 'remove', changed: true, target: '@t/module-a' });
  });

  it('pnpm remove 跑的目录不对时，行也不动', async () => {
    const syncRows = vi.fn();

    const change = await removeWorkbenchModule({
      profileDir: PROFILE,
      pkg: '@t/module-a',
      runAll: async () => {
        throw new Error('EPERM');
      },
      syncRows,
    });

    expect(syncRows).not.toHaveBeenCalled();
    expect(change).toMatchObject({ application: 'failed', stage: 'remove', changed: false });
    expect(change.errorDetail).toContain('EPERM');
  });

  it('删行失败 → 包已卸掉，但留一条警告', async () => {
    const warn = vi.fn();
    const change = await removeWorkbenchModule({
      profileDir: PROFILE,
      pkg: '@t/module-a',
      runAll: async () => {},
      syncRows: () => {
        throw new Error('patch 写不进去');
      },
      logger: { warn },
    });

    expect(warn.mock.calls[0]?.[0]).toContain('模块行没有删除');
    expect(change).toMatchObject({ application: 'failed', errorCode: 'module-row-failed' });
    expect(change.errorDetail).toContain('cordis.patch.yml');
  });
});

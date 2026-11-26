import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildApplier, installedBuildTargets, type BuildApplyOutcome } from '../unit-builds';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

interface Recorded {
  readonly unit: string;
  readonly state: string;
  readonly reason?: string | undefined;
}

interface Harness {
  readonly applier: ReturnType<typeof createBuildApplier>;
  readonly records: Recorded[];
  readonly applied: number[];
  readonly warned: string[];
}

function harness(options: {
  apply?: () => Promise<BuildApplyOutcome>;
  targets?: () => readonly { unit: string; dir: string }[];
} = {}): Harness {
  vi.useFakeTimers();
  const records: Recorded[] = [];
  const applied: number[] = [];
  const warned: string[] = [];
  const applier = createBuildApplier({
    targets: options.targets ?? (() => [{ unit: 'a', dir: '/w/a' }]),
    apply:
      options.apply ??
      (async () => {
        applied.push(1);
        return { ran: true };
      }),
    record: (unit, record) => records.push({ unit, ...record }),
    logger: { warn: (message) => warned.push(message) },
    settleMs: 10,
    retryMs: 10,
  });
  return { applier, records, applied, warned };
}

describe('installedBuildTargets（已装模块的真实目录）', () => {
  it('每个已装模块一条，走 realpath（link 进来的也能盯到）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-unit-builds-'));
    dirs.push(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { 'acme-inventory': '1.0.0' } }), 'utf8');
    const dir = join(root, 'node_modules', 'acme-inventory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'acme-inventory', version: '1.0.0', dsh: { workbench: { unit: 'inventory' } } }),
      'utf8',
    );

    expect(installedBuildTargets(root, () => undefined)).toEqual([{ unit: 'inventory', dir: realpathSync(dir) }]);
    expect(installedBuildTargets(null, () => undefined)).toEqual([]);
  });
});

describe('createBuildApplier（收到推送就重新对账）', () => {
  it('推送来了：防抖后对账一次，记 applied', async () => {
    const { applier, records, applied } = harness();

    applier.push('a');
    await vi.advanceTimersByTimeAsync(10);

    expect(applied).toHaveLength(1);
    expect(records).toEqual([{ unit: 'a', state: 'applied', at: expect.any(Number) }]);
    applier.dispose();
  });

  it('两个模块连着推：一次对账、两条回执', async () => {
    const { applier, records, applied } = harness({ targets: () => [{ unit: 'a', dir: '/w/a' }, { unit: 'b', dir: '/w/b' }] });

    applier.push('a');
    applier.push('b');
    await vi.advanceTimersByTimeAsync(10);

    expect(applied).toHaveLength(1);
    expect(records.map((one) => one.unit).sort()).toEqual(['a', 'b']);
    applier.dispose();
  });

  it('这份 profile 没装的模块：忽略并说一次，不为它对账', async () => {
    const { applier, records, applied, warned } = harness();

    applier.push('ghost');
    applier.push('ghost');
    await vi.advanceTimersByTimeAsync(10);

    expect(applied).toHaveLength(0);
    expect(records).toEqual([]);
    expect(warned.join('\n')).toContain('没有安装它');
    expect(warned).toHaveLength(1);
    applier.dispose();
  });

  it('对账说这个模块换不了：记 pending 与原因（别报成成功）', async () => {
    const { applier, records } = harness({
      apply: async () => ({
        ran: true,
        pending: [{ url: pathToFileURL('/w/a').href + '/dist/host.js', reason: 'host-module' }],
      }),
    });

    applier.push('a');
    await vi.advanceTimersByTimeAsync(10);

    expect(records[0]?.state).toBe('pending');
    expect(records[0]?.reason).toBe('host-module');
    applier.dispose();
  });

  it('这台 dsh 未启用热更新：记 unavailable（修改后要重启）', async () => {
    const { applier, records } = harness({ apply: async () => ({ ran: false, reason: 'no-hmr' }) });

    applier.push('a');
    await vi.advanceTimersByTimeAsync(10);

    expect(records[0]?.state).toBe('unavailable');
    expect(records[0]?.reason).toContain('热更新');
    applier.dispose();
  });

  it('对账抛了会重试，成功后才落回执（启动期不该丢这次构建）', async () => {
    let calls = 0;
    const { applier, records, warned } = harness({
      apply: async () => {
        calls += 1;
        if (calls === 1) throw new Error('还没就绪');
        return { ran: true };
      },
    });

    applier.push('a');
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toBe(2);
    expect(warned.join('\n')).toContain('还没就绪');
    expect(records).toEqual([{ unit: 'a', state: 'applied', at: expect.any(Number) }]);
    applier.dispose();
  });

  it('停掉之后不再对账（卸载不留定时器）', async () => {
    const { applier, applied } = harness();

    applier.dispose();
    applier.push('a');
    await vi.advanceTimersByTimeAsync(100);

    expect(applied).toHaveLength(0);
  });
});

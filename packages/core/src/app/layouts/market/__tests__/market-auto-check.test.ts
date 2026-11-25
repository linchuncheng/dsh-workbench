import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_CHECK_BOOT_DELAY_MS,
  AUTO_CHECK_INTERVAL_MS,
  AUTO_CHECK_VISIBLE_GAP_MS,
  createMarketAutoCheck,
} from '../market-auto-check';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function harness(
  options: {
    readonly visible?: boolean;
    readonly run?: () => Promise<void>;
    readonly checkedAt?: number | null;
  } = {},
) {
  let clock = 0;
  let visible = options.visible ?? true;
  let checkedAt: number | null = options.checkedAt ?? null;
  const due = new Map<number, { readonly at: number; readonly run: () => void }>();
  let seq = 0;
  const runs: number[] = [];
  const auto = createMarketAutoCheck({
    now: () => clock,
    after: (ms, run) => {
      seq += 1;
      due.set(seq, { at: clock + ms, run });
      return seq;
    },
    cancel: (id) => {
      due.delete(id as number);
    },
    run: () => {
      runs.push(clock);
      return options.run === undefined ? Promise.resolve() : options.run();
    },
    visible: () => visible,
    lastCheckedAt: () => checkedAt,
  });
  const advance = (ms: number): void => {
    const target = clock + ms;
    for (;;) {
      const next = [...due.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (next === undefined) break;
      due.delete(next[0]);
      clock = next[1].at;
      next[1].run();
    }
    clock = target;
  };
  return {
    auto,
    runs,
    advance,
    pending: (): number => due.size,
    setVisible: (next: boolean): void => {
      visible = next;
    },
    setCheckedAt: (next: number | null): void => {
      checkedAt = next;
    },
    now: (): number => clock,
  };
}

describe('后台静默检查的节奏', () => {
  it('★ 三个数是定下来的：启动 60 秒、每 1 小时、切回窗口满 10 分钟', () => {
    expect(AUTO_CHECK_BOOT_DELAY_MS).toBe(60_000);
    expect(AUTO_CHECK_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(AUTO_CHECK_VISIBLE_GAP_MS).toBe(10 * 60 * 1000);
  });
});

describe('后台静默检查的时机', () => {
  it('★ 启动先等 60 秒，不跟首屏抢', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS - 1);
    expect(h.runs).toEqual([]);
    h.advance(1);
    expect(h.runs).toEqual([AUTO_CHECK_BOOT_DELAY_MS]);
  });

  it('★ 之后每 1 小时一次，且任何时刻只挂一个定时器', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.advance(AUTO_CHECK_INTERVAL_MS - 1);
    expect(h.runs).toHaveLength(1);
    expect(h.pending()).toBe(1);
    h.advance(1);
    expect(h.runs).toHaveLength(2);
    expect(h.pending()).toBe(1);
  });

  it('★ 重复 start 不叠加（热重载、二次挂载都只是同一个排期）', () => {
    const h = harness();
    h.auto.start();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    expect(h.runs).toHaveLength(1);
    expect(h.pending()).toBe(1);
  });

  it('stop 之后不再查', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.auto.stop();
    h.advance(2 * AUTO_CHECK_INTERVAL_MS);
    expect(h.runs).toHaveLength(1);
    expect(h.pending()).toBe(0);
  });
});

describe('看不见的时候不查', () => {
  it('★ 到点时页面不可见 → 不查，也不排下一次（等回到可见）', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.setVisible(false);
    h.advance(AUTO_CHECK_INTERVAL_MS);
    expect(h.runs).toHaveLength(1);
    expect(h.pending()).toBe(0);
  });

  it('★ 回到可见且距上次已满 10 分钟 → 立刻补一次', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.setVisible(false);
    h.advance(AUTO_CHECK_INTERVAL_MS);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toHaveLength(2);
    expect(h.pending()).toBe(1);
  });

  it('回到可见但距上次不足 10 分钟 → 不查，原来的排期留着', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.setVisible(false);
    h.advance(5 * MINUTE);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toHaveLength(1);
    expect(h.pending()).toBe(1);
  });

  it('分界：正好 10 分钟算「够久了」', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.setVisible(false);
    h.advance(AUTO_CHECK_VISIBLE_GAP_MS);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toHaveLength(2);
  });

  it('★ 启动时页面就不可见：60 秒到了也不查，第一次回到可见才查', () => {
    const h = harness({ visible: false });
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    expect(h.runs).toEqual([]);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toEqual([AUTO_CHECK_BOOT_DELAY_MS]);
  });

  it('★ 距上次检查不足 10 分钟就不补查 —— 才在别的入口查过（比如点了「检查更新」）也不重复问', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.advance(AUTO_CHECK_INTERVAL_MS);
    expect(h.runs).toHaveLength(2);
    h.advance(AUTO_CHECK_INTERVAL_MS / 2);
    h.setCheckedAt(h.now());
    h.setVisible(false);
    h.advance(5 * MINUTE);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toHaveLength(2);
  });

  it('★ 上一次检查（不管谁发起的）已满 10 分钟 → 补查', () => {
    const h = harness();
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    h.setCheckedAt(h.now());
    h.setVisible(false);
    h.advance(2 * HOUR);
    h.setVisible(true);
    h.auto.noteVisible();
    expect(h.runs).toHaveLength(2);
  });

  it('还不可见时收到「回到可见」不算数', () => {
    const h = harness();
    h.auto.start();
    h.setVisible(false);
    h.auto.noteVisible();
    expect(h.runs).toEqual([]);
    expect(h.pending()).toBe(1);
  });
});

describe('接到客户端入口上', () => {
  const client = readFileSync(new URL('../../../client.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../market-auto-check.ts', import.meta.url), 'utf8');

  it('★ 插件挂载时就把静默检查排上 —— 删掉这行后台就一次也不查了', () => {
    expect(client).toContain('startMarketAutoCheck()');
  });

  it('★ 桌面端窗口只是失焦时 visibilityState 仍是 visible —— 除了 visibilitychange 还要认窗口 focus', () => {
    expect(source).toContain("addEventListener('visibilitychange', wake)");
    expect(source).toContain("addEventListener('focus', wake)");
    expect(source).toContain("addEventListener('pageshow', wake)");
  });
});

describe('查失败也不影响下一次', () => {
  it('★ 一次查失败留一条警告，1 小时后的排期照旧', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness({ run: () => Promise.reject(new Error('offline')) });
    h.auto.start();
    h.advance(AUTO_CHECK_BOOT_DELAY_MS);
    expect(h.runs).toHaveLength(1);
    h.advance(AUTO_CHECK_INTERVAL_MS);
    expect(h.runs).toHaveLength(2);
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

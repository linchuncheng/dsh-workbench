import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  attemptEntry,
  entryIssues,
  entryReportLine,
  guardedEffect,
  reasonOf,
  reportEntryFailure,
  reportEntrySkip,
  resetEntryIssues,
  runtimeVersionOf,
} from '../entry-report';
import { boundaryOf } from '../../components/EntryBoundary';

const CLIENT = readFileSync(new URL('../../../app/client.tsx', import.meta.url), 'utf8');

describe('客户端入口的失败不连坐', () => {
  it('★ 入口不再把错误抛给 dsh：apply 里没有 rethrow', () => {
    expect(CLIENT).not.toContain('apply failed');
    expect(CLIENT).not.toMatch(/catch \(error\) \{[\s\S]{0,200}?throw error;/);
  });

  it('★ 注册步骤抛错只记一条，不中断后面的注册', () => {
    resetEntryIssues();
    const after = vi.fn();
    const first = attemptEntry('sidebar', () => {
      throw new Error('槽不存在');
    });
    after();
    expect(first).toBe(false);
    expect(after).toHaveBeenCalledOnce();
    expect(entryIssues().map((item) => item.label)).toEqual(['sidebar']);
    expect(entryIssues()[0]?.message).toContain('客户端入口跳过');
    expect(entryIssues()[0]?.message).toContain('sidebar');
    expect(entryIssues()[0]?.message).toContain('槽不存在');
  });

  it('★ 成功时返回 true 且不记东西', () => {
    resetEntryIssues();
    expect(attemptEntry('market-panel', () => undefined)).toBe(true);
    expect(entryIssues()).toEqual([]);
  });

  it('★ 副作用体抛错时给一个空的清理函数，不把异常带出激活过程', () => {
    resetEntryIssues();
    const dispose = guardedEffect('workshop-preset', () => {
      throw new Error('注册口没有');
    });
    expect(() => dispose()).not.toThrow();
    expect(entryIssues()[0]?.label).toBe('workshop-preset');
  });

  it('★ 副作用体正常时交回它自己的清理函数', () => {
    resetEntryIssues();
    const own = vi.fn();
    expect(guardedEffect('env-gate', () => own)).toBe(own);
    expect(entryIssues()).toEqual([]);
  });
});

describe('失败消息的形状', () => {
  it('★ 失败：前缀 + 位置 + 运行时版本 + 原因，字段用 / 分隔', () => {
    expect(entryReportLine('失败', 'mount', '槽不存在', '0.2.3-alpha.2')).toBe(
      '[dsh-workbench] 客户端入口失败：mount / 0.2.3-alpha.2 / 槽不存在',
    );
  });

  it('★ 跳过：没有运行时版本时只留两个字段，不写 undefined', () => {
    expect(entryReportLine('跳过', 'sidebar', '槽不存在', undefined)).toBe(
      '[dsh-workbench] 客户端入口跳过：sidebar / 槽不存在',
    );
  });

  it('★ 运行时版本从 dsh 的启动清单里读，读不到就是 undefined', () => {
    expect(runtimeVersionOf({ __DSH_BOOT__: { release: { version: '0.2.3-alpha.2' } } })).toBe('0.2.3-alpha.2');
    expect(runtimeVersionOf({ __DSH_BOOT__: { release: {} } })).toBeUndefined();
    expect(runtimeVersionOf({})).toBeUndefined();
  });

  it('★ 原因取原话，非 Error 也照样能记', () => {
    expect(reasonOf(new Error('原始原因'))).toBe('原始原因');
    expect(reasonOf('一串文本')).toBe('一串文本');
  });

  it('★ 记失败也不抛：入口在 dsh 侧只会看到一条消息，不会看到异常', () => {
    resetEntryIssues();
    expect(() => reportEntryFailure('mount', new Error('注册失败'), '0.2.3-alpha.2')).not.toThrow();
    expect(entryIssues()[0]?.message).toContain('客户端入口失败');
  });
});

describe('渲染边界', () => {
  it('★ 一块渲染失败不影响别的块：边界只换掉自己那一块', () => {
    const Inner = (): null => null;
    const Bounded = boundaryOf('rightbar', Inner as unknown as (props: object) => null);
    expect(typeof Bounded).toBe('function');
    const element = Bounded({} as object);
    expect(element).not.toBeNull();
    expect(typeof element).toBe('object');
  });

  it('★ 边界自己把失败收成状态，渲染出 null 而不是把异常继续往上抛', () => {
    const element = createElement(boundaryOf('rightbar', ((): null => null) as () => null), {});
    expect(element).toBeTruthy();
  });

  it('★ 跳过记录里能看出是哪一块', () => {
    resetEntryIssues();
    reportEntrySkip('rightbar', new Error('渲染失败'));
    expect(entryIssues().map((item) => item.label)).toEqual(['rightbar']);
  });
});

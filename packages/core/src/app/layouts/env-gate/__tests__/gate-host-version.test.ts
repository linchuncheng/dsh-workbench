import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { en, zh } from '@dsh-workbench/shared';
import { gateActionOf } from '../boot-gate';
import { hostVersionWhyText, stepDetailText } from '../gate-text';

function translatorOf(dict: Readonly<Record<string, string>>): Translate {
  return (key, params) => {
    const template = dict[key] ?? key;
    return Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      template,
    );
  };
}

const t = translatorOf(zh as Record<string, string>);
const ten = translatorOf(en as Record<string, string>);

function snapshotOf(extra: Partial<PreflightSnapshot> = {}): PreflightSnapshot {
  return { phase: 'ready', steps: [], at: 0, ...extra };
}

const NEWER = { tier: 'newer' as const, runtime: '0.3.0-rc.1', verified: '0.2.3-alpha.2' };
const OLDER = { ...NEWER, tier: 'older' as const, runtime: '0.2.2-rc.5', command: 'npm i -g @deepseek-ai/dsh@latest' };

describe('启动检查的 dsh 版本一档', () => {
  it('★ 这一步的三种状态各有一句话', () => {
    expect(stepDetailText({ id: 'host', status: 'ok' }, snapshotOf(), t)).toBe('已就绪');
    expect(stepDetailText({ id: 'host', status: 'warn' }, snapshotOf({ hostGap: NEWER }), t)).toBe('未验证');
    expect(stepDetailText({ id: 'host', status: 'warn' }, snapshotOf({ hostGap: OLDER }), t)).toBe('版本过低');
  });

  it('★ 未验证的句子说清「这台是哪一版、验的是哪一版、下一步是什么」', () => {
    const text = hostVersionWhyText(NEWER, t);
    expect(text).toContain('0.3.0-rc.1');
    expect(text).toContain('0.2.3-alpha.2');
    expect(text).toContain('升级工作台');
    expect(text).not.toContain('{');
  });

  it('★ 版本过低的句子给升级与重启，不写区间原文', () => {
    const text = hostVersionWhyText(OLDER, t);
    expect(text).toContain('0.2.3-alpha.2 或更高');
    expect(text).toContain('0.2.2-rc.5');
    expect(text).not.toContain('>=');
  });

  it('★ 有缺口就停在门这一屏（不是进去才发现），没缺口照旧撤', () => {
    expect(gateActionOf(snapshotOf({ hostGap: NEWER }))).toBe('hold');
    expect(gateActionOf(snapshotOf({ hostGap: OLDER }))).toBe('hold');
    expect(gateActionOf(snapshotOf())).toBe('close');
  });

  it('★ 两语同构：六条键都在，英文不是直译的中文', () => {
    const keys = [
      'env.step.hostVersion',
      'env.hostVersion.newer',
      'env.hostVersion.older',
      'env.hostVersion.newer.why',
      'env.hostVersion.older.why',
      'env.hostVersion.older.step',
      'env.hostVersion.recover',
      'env.hostVersion.recover.detail',
    ] as const;
    for (const key of keys) {
      expect((zh as Record<string, string>)[key]).toBeTruthy();
      expect((en as Record<string, string>)[key]).toBeTruthy();
    }
    expect(ten('env.hostVersion.newer')).toBe('Unverified');
    expect(hostVersionWhyText(NEWER, ten)).toContain('0.3.0-rc.1');
  });
});

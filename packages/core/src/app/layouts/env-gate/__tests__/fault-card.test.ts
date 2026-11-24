import { describe, expect, it } from 'vitest';
import { en, zh, type Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { bridgeFallbackOf, diyCardOf, faultPromptOf, type GateFacts } from '../fault-card';

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

const PATHS = { workbenchRoot: '/tmp/wb', dshHome: '/tmp/home' };

const OLDER = { tier: 'older' as const, runtime: '0.2.2-rc.5', verified: '0.2.3-alpha.2' };

const GATE: GateFacts = { deployment: 'web', retried: 0, host: 'dsh' };

function snapshotOf(extra: Partial<PreflightSnapshot> = {}): PreflightSnapshot {
  return {
    phase: 'ready',
    steps: [],
    at: 1,
    paths: PATHS,
    hostFacts: {
      version: '0.2.2-rc.5',
      from: 'DSH_VERSION',
      profileDir: '/tmp/home/profiles/workbench',
      verified: '0.2.3-alpha.2',
    },
    ...extra,
  };
}

describe('启动门故障卡：确定性卡与兜底卡', () => {
  it('★ 版本过低 → 确定性卡：说清两个版本，网页版带升级命令', () => {
    const card = diyCardOf(
      snapshotOf({ diyGap: { kind: 'older-dsh', rows: ['tool-schedule'], detail: 'never started', command: 'npm i -g @deepseek-ai/dsh@latest' }, hostGap: OLDER }),
      GATE,
      t,
    );

    expect(card?.mode).toBe('deterministic');
    if (card?.mode !== 'deterministic') return;
    expect(card.why).toContain('0.2.2-rc.5');
    expect(card.why).toContain('0.2.3-alpha.2');
    expect(card.step).toContain('升级 dsh');
    expect(card.command).toBe('npm i -g @deepseek-ai/dsh@latest');
  });

  it('★ 桌面版不给命令（那条命令改不到正在跑的 dsh）', () => {
    const card = diyCardOf(
      snapshotOf({ diyGap: { kind: 'older-dsh', rows: [], detail: 'x', command: 'npm i -g @deepseek-ai/dsh@latest' }, hostGap: OLDER }),
      { ...GATE, deployment: 'desktop' },
      t,
    );

    expect(card?.mode).toBe('deterministic');
    if (card?.mode !== 'deterministic') return;
    expect(card.command).toBeUndefined();
  });

  it('★ 行没有启动 → 兜底卡：只陈述事实，提示词带证据文件与版本', () => {
    const card = diyCardOf(
      snapshotOf({ diyGap: { kind: 'broken-row', rows: ['tool-schedule'], detail: 'tool-schedule: never started' } }),
      GATE,
      t,
    );

    expect(card?.mode).toBe('fallback');
    if (card?.mode !== 'fallback') return;
    expect(card.title).toBe(t('askAgent.title'));
    expect(card.facts.join('\n')).toContain('tool-schedule');
    expect(card.hint ?? '').toContain('启动日志');
    expect(card.prompt).toContain('位置：准备工作台 · 检查 DIY 模式');
    expect(card.prompt).toContain('没有启动的行：tool-schedule');
    expect(card.prompt).toContain('证据文件：/tmp/wb/preflight.json');
    expect(card.prompt).toContain('dsh 启动日志目录：/tmp/home/logs');
    expect(card.prompt).toContain('工作台配置目录：/tmp/home/profiles/workbench');
    expect(card.prompt).toContain('打开方式：网页版');
    expect(card.prompt).not.toContain('{');
  });

  it('★ 名册里没有 → 兜底卡说「没有找到」，不说版本旧', () => {
    const card = diyCardOf(
      snapshotOf({ diyGap: { kind: 'preset-missing', rows: [], detail: 'preset 名单里没有 workbench-diy' } }),
      GATE,
      t,
    );

    expect(card?.mode).toBe('fallback');
    if (card?.mode !== 'fallback') return;
    expect(card.facts.join('\n')).toContain('没有在 dsh 的模式列表里找到');
    expect(card.prompt).not.toContain('没有启动的行');
  });

  it('★ 浏览器连接认不出 → 兜底卡；认得出的 issue 不触发', () => {
    const snapshot = snapshotOf({
      steps: [{ id: 'bridge', status: 'warn', detail: 'Something unexpected\n更多输出' }],
      bridgeIssues: ['unknown'],
    });
    const card = bridgeFallbackOf(snapshot, GATE, t);

    expect(card?.mode).toBe('fallback');
    expect(card?.facts.join('\n')).toContain('没能识别是哪一类');
    expect(card?.prompt).toContain('未能识别的问题：Something unexpected');
    expect(bridgeFallbackOf(snapshotOf({ bridgeIssues: ['extension'] }), GATE, t)).toBeUndefined();
  });
});

describe('提示词：空的整行省略，值原样', () => {
  it('只有位置时，不出现空标签', () => {
    const prompt = faultPromptOf({ screen: '启动检查', step: '连接浏览器' }, t);

    expect(prompt).toContain('位置：启动检查 · 连接浏览器');
    expect(prompt).not.toContain('现象：');
    expect(prompt).not.toContain('证据文件：');
    expect(prompt).not.toContain('已经试过：');
    expect(prompt).not.toContain('{');
    expect(prompt.split('\n').at(-1)).toBe(t('askAgent.prompt.ask'));
  });

  it('试过几次只在真的试过时写；版本、部署、目录按事实逐行出现', () => {
    const prompt = faultPromptOf(
      {
        screen: '启动检查',
        step: '检查 DIY 模式',
        problem: { why: 'tool-schedule: never started' },
        host: { label: 'dsh', version: '0.2.2-rc.5', verified: '0.2.3-alpha.2' },
        context: {
          deployment: '网页版',
          configDir: '/tmp/home/profiles/workbench',
          evidence: '/tmp/wb/preflight.json',
          tried: 2,
        },
      },
      t,
    );

    expect(prompt).toContain('已经试过：重试 2 次。');
    expect(prompt).toContain('运行的是 dsh 0.2.2-rc.5，工作台验证过的是 0.2.3-alpha.2。');
    expect(prompt).toContain('工作台配置目录：/tmp/home/profiles/workbench');
    expect(prompt).toContain('证据文件：/tmp/wb/preflight.json');
  });

  it('英文重写不直译，且同样不带空标签', () => {
    const card = bridgeFallbackOf(
      snapshotOf({ steps: [{ id: 'bridge', status: 'warn', detail: 'unexpected' }], bridgeIssues: ['unknown'] }),
      { ...GATE, deployment: 'desktop' },
      ten,
    );

    expect(card?.prompt).toContain('Where:');
    expect(card?.prompt).toContain('Unrecognized problem: unexpected');
    expect(card?.prompt).not.toContain('{');
    expect(card?.prompt.split('\n').at(-1)).toBe(ten('askAgent.prompt.ask'));
  });
});

describe('兜底卡必须带出口：用户手里总有一件事可做', () => {
  it('★ 三种兜底（行没启动 / 名册没有 / 桥接认不出）都给标题与可复制的提示词', () => {
    const cards = [
      diyCardOf(snapshotOf({ diyGap: { kind: 'broken-row', rows: ['a'], detail: 'x' } }), GATE, t),
      diyCardOf(snapshotOf({ diyGap: { kind: 'preset-missing', rows: [], detail: 'x' } }), GATE, t),
      bridgeFallbackOf(
        snapshotOf({ steps: [{ id: 'bridge', status: 'warn', detail: 'x' }], bridgeIssues: ['unknown'] }),
        GATE,
        t,
      ),
    ];

    for (const card of cards) {
      expect(card?.mode).toBe('fallback');
      if (card?.mode !== 'fallback') continue;
      expect(card.title).not.toBe('');
      expect(card.prompt.trim()).not.toBe('');
      expect(card.prompt.split('\n').at(-1)).toBe(t('askAgent.prompt.ask'));
    }
  });

  it('★ 确定性卡（版本过低）要么给命令、要么给能照做的步骤句', () => {
    const card = diyCardOf(
      snapshotOf({ diyGap: { kind: 'older-dsh', rows: [], detail: 'x' }, hostGap: OLDER }),
      { ...GATE, deployment: 'desktop' },
      t,
    );

    expect(card?.mode).toBe('deterministic');
    if (card?.mode !== 'deterministic') return;
    expect(card.step).not.toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createSeam } from '@dsh-workbench/shared/host';
import { createPreflight } from '../preflight.js';

const NO_CLI = { console: false, pluginMarket: false, browserBridge: false };

function seamFor(shell: Parameters<typeof createSeam>[0]['shell']) {
  return createSeam({ shell, runtimeRoot: '/tmp/wb-seam-host-version' });
}

describe('启动检查读运行中的 dsh 版本', () => {
  it('同代：这一步出现且为已就绪，不出缺口', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => ({ tier: 'ok', log: ['profile: /tmp/wb', 'dsh: 0.2.3-alpha.2'] }),
    });

    const snapshot = await preflight.run();
    const step = snapshot.steps.find((item) => item.id === 'host');
    expect(step?.status).toBe('ok');
    expect(step?.log).toContain('dsh: 0.2.3-alpha.2');
    expect(snapshot.hostGap).toBeUndefined();
    expect(snapshot.phase).toBe('ready');
  });

  it('★ 跨代：步骤是提醒态，快照带上缺口（不拦路，门自己决定停不停）', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => ({
        tier: 'newer',
        runtime: '0.3.0-rc.1',
        verified: '0.2.3-alpha.2',
        log: ['profile: /tmp/wb', 'dsh: 0.3.0-rc.1', 'from: /tmp/wb/node_modules/@deepseek-ai/dsh/package.json'],
      }),
    });

    const snapshot = await preflight.run();
    const step = snapshot.steps.find((item) => item.id === 'host');
    expect(step?.status).toBe('warn');
    expect(step?.detail).toBe('0.3.0-rc.1');
    expect(step?.log).toContain('dsh: 0.3.0-rc.1');
    expect(step?.log?.join('\n')).toContain('@deepseek-ai/dsh/package.json');
    expect(snapshot.hostGap).toMatchObject({ tier: 'newer', runtime: '0.3.0-rc.1', verified: '0.2.3-alpha.2' });
    expect(snapshot.phase).toBe('ready');
  });

  it('★ 版本过低：缺口带升级命令，命令与 DIY 那一档同一条', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => ({
        tier: 'older',
        runtime: '0.2.2-rc.5',
        verified: '0.2.3-alpha.2',
        command: 'npm i -g @deepseek-ai/dsh@latest',
      }),
    });

    const snapshot = await preflight.run();
    const step = snapshot.steps.find((item) => item.id === 'host');
    expect(step?.status).toBe('warn');
    expect(step?.command).toBe('npm i -g @deepseek-ai/dsh@latest');
    expect(snapshot.hostGap?.tier).toBe('older');
    expect(snapshot.phase).toBe('ready');
  });

  it('★ 快照带运行时事实：版本、来源与工作台配置目录跟着 host 步骤一起出来', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => ({
        tier: 'ok',
        log: [],
        facts: { version: '0.2.3-alpha.2', from: 'DSH_CLIENT_VERSION', profileDir: '/tmp/wb' },
      }),
    });

    const snapshot = await preflight.run();
    expect(snapshot.hostFacts).toEqual({
      version: '0.2.3-alpha.2',
      from: 'DSH_CLIENT_VERSION',
      profileDir: '/tmp/wb',
    });
  });

  it('★ 重来一轮：上一轮的运行时事实不留在快照上', async () => {
    const fake = createFakeShell([]);
    let facts: { version?: string; from?: string; profileDir?: string } | undefined = {
      version: '0.2.3-alpha.2',
      from: 'DSH_CLIENT_VERSION',
      profileDir: '/tmp/wb',
    };
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => (facts === undefined ? undefined : { tier: 'ok', log: [], facts }),
    });

    expect((await preflight.run()).hostFacts).toBeDefined();
    facts = undefined;
    const again = await preflight.run({ hard: true });
    expect(again.hostFacts).toBeUndefined();
    expect(again.steps.some((item) => item.id === 'host')).toBe(false);
  });

  it('★ 读不到运行版本：这一行整个撤掉，不声称可用也不报故障', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      seam: seamFor(fake.shell),
      capabilities: NO_CLI,
      probeHost: () => undefined,
    });

    const snapshot = await preflight.run();
    expect(snapshot.steps.some((item) => item.id === 'host')).toBe(false);
    expect(snapshot.hostGap).toBeUndefined();
    expect(snapshot.phase).toBe('ready');
  });

  it('没接这条探针时这一步不出现（老宿主不受影响）', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({ seam: seamFor(fake.shell), capabilities: NO_CLI });
    const snapshot = await preflight.run();
    expect(snapshot.steps.some((item) => item.id === 'host')).toBe(false);
    expect(snapshot.hostGap).toBeUndefined();
  });
});

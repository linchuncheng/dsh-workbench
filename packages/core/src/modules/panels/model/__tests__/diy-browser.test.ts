import { describe, expect, it } from 'vitest';
import { plainLine } from '../diy-browser';
import type { DshShell } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { actBrowser } from '../diy-browser-act';
import { bindCurrentTab, jsonOf, payloadOf, readyPageOf, runBrowserStep, runForegroundStep, writeShotsDir } from '../diy-browser';
import { cardSelectorOf } from '../diy-scripts';
import { fakeSeamOf } from '../../__tests__/seam-fake';

const backgroundLine = (command: string, argv: readonly string[]): string =>
  [quoteShellArg(command), ...argv.map(quoteShellArg)].join(' ');

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}

function fakeShell(steps: readonly Step[]) {
  const lines: string[] = [];
  const envs: Array<Readonly<Record<string, string>> | undefined> = [];
  let index = 0;
  const shell = {
    resolve(request: { command: string; env?: Readonly<Record<string, string>> }) {
      lines.push(request.command);
      envs.push(request.env);
      return request;
    },
    async execute() {
      const step = steps[Math.min(index, steps.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode === undefined ? 0 : step.exitCode,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: step.truncated ?? false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  };
  return { shell: shell as unknown as DshShell, seam: fakeSeamOf(shell as unknown as DshShell), lines, envs };
}

describe('跑一条 opencli：argv 原样交给执行缝，窗口模式钉在 env 上', () => {
  it('★★ 每个参数各自引号，会话与子命令一个不改', async () => {
    const rig = fakeShell([{ stdout: 'ok' }]);
    const step = await runBrowserStep(
      rig.seam,
      'opencli',
      ['browser', 'workbench', 'state', '--source', 'ax', '--window', 'background'],
      undefined,
      { line: backgroundLine },
    );

    expect(rig.lines[0]).toBe(
      "'opencli' 'browser' 'workbench' 'state' '--source' 'ax' '--window' 'background'",
    );
    expect(step.ok).toBe(true);
    expect(step.stdout).toBe('ok');
  });

  it('★★ ok = exitCode 0 且没超时；truncated 是两路合并后的那个布尔', async () => {
    const failed = fakeShell([{ exitCode: 3, stdout: 'out', stderr: 'boom' }]);
    const slow = fakeShell([{ timedOut: true, exitCode: null }]);
    const cut = fakeShell([{ stdout: 'x', truncated: true }]);

    expect(await runBrowserStep(failed.seam, 'opencli', ['browser', 'workbench', 'state'], undefined, { line: backgroundLine })).toMatchObject({
      ok: false,
      exitCode: 3,
      timedOut: false,
      truncated: false,
      stdout: 'out',
      stderr: 'boom',
    });
    expect(await runBrowserStep(slow.seam, 'opencli', ['browser', 'workbench', 'state'], undefined, { line: backgroundLine })).toMatchObject({
      ok: false,
      timedOut: true,
    });
    expect(await runBrowserStep(cut.seam, 'opencli', ['browser', 'workbench', 'state'], undefined, { line: backgroundLine })).toMatchObject({
      ok: true,
      truncated: true,
    });
  });
});

describe('窗口模式钉在执行缝里（ADR-0036）', () => {
  it('★★ 默认那条口子一律 background —— 调用点忘了写 --window 也压不回来', async () => {
    const rig = fakeShell([{ stdout: 'ok' }, { stdout: 'ok' }, { stdout: 'ok' }]);

    await runBrowserStep(rig.seam, 'opencli', ['browser', 'workbench', 'eval', '1']);
    await bindCurrentTab(rig.seam, 'opencli', 'workbench');
    await actBrowser(rig.seam, 'opencli', 'workbench-rec', ['screenshot', '/tmp/a.png']);

    expect(rig.envs.map((env) => env?.['OPENCLI_WINDOW'])).toEqual([
      'background',
      'background',
      'background',
    ]);
  });

  it('★★ 要前台必须显式换口子：只有 runForegroundStep 发 foreground', async () => {
    const rig = fakeShell([{ stdout: 'ok' }, { stdout: 'ok' }]);

    await runForegroundStep(rig.seam, 'opencli', ['browser', 'workbench-rec', 'tab', 'new', 'https://x', '--window', 'foreground']);
    await runBrowserStep(rig.seam, 'opencli', ['browser', 'workbench-rec', 'wait', 'time', '2']);

    expect(rig.envs[0]?.['OPENCLI_WINDOW']).toBe('foreground');
    expect(rig.envs[1]?.['OPENCLI_WINDOW']).toBe('background');
  });
});

describe('抠 JSON 与那一页的握手', () => {
  it('★ 命令里混着别的话也能把信封抠出来；抠不出就老实说没有', () => {
    expect(jsonOf('noise {"a":1} tail')?.['a']).toBe(1);
    expect(jsonOf('null')).toBeUndefined();
    expect(jsonOf('[]')).toBeUndefined();
    expect(jsonOf('{')).toBeUndefined();
    expect(jsonOf('没有什么')).toBeUndefined();
  });

  it('★ 连不上/不是工作台都有话说（不给用户看一句空错）', async () => {
    const bad = fakeShell([{ stdout: JSON.stringify({ error: { code: 'no-extension', message: '扩展没连上' } }) }]);
    const bound = await bindCurrentTab(bad.seam, 'opencli', 'workbench', undefined, { line: backgroundLine });

    expect(bound.ok).toBe(false);
    expect(bound.reason).toContain('扩展没连上');
    expect(bad.lines[0]).toContain("'browser' 'workbench' 'bind'");
    expect(bad.lines[0]).toContain("'--window' 'background'");

    const good = fakeShell([
      { stdout: JSON.stringify({ session: 'workbench', url: 'http://127.0.0.1:3081/', title: '工作台' }) },
    ]);
    expect(await bindCurrentTab(good.seam, 'opencli', 'workbench')).toMatchObject({
      ok: true,
      url: 'http://127.0.0.1:3081/',
      title: '工作台',
    });
  });

  it('★★ 已经绑着工作台就**不再 bind**（只有本次会话第一次要用户把工作台切到前台）', async () => {
    const rig = fakeShell([
      { stdout: JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'u', title: 't' }) },
    ]);
    const handshake = await readyPageOf(rig.seam, 'opencli', 'workbench');

    expect(handshake.ok).toBe(true);
    expect(handshake.bound).toBe(false);
    expect(rig.lines).toHaveLength(1);
    expect(rig.lines[0]).toContain("'eval'");
  });

  it('★ 没绑着（会话是个 about:blank 空目标）才 bind，绑完再认一次那一页', async () => {
    const rig = fakeShell([
      { stdout: JSON.stringify({ plugin: null, pid: null, url: 'about:blank', title: '' }) },
      { stdout: JSON.stringify({ session: 'workbench', url: 'http://127.0.0.1:3081/', title: '工作台' }) },
      { stdout: JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'http://127.0.0.1:3081/', title: '工作台' }) },
    ]);
    const handshake = await readyPageOf(rig.seam, 'opencli', 'workbench');

    expect(handshake).toMatchObject({ ok: true, bound: true });
    expect(rig.lines[1]).toContain("'bind'");
  });

  it('★ 建截图目录走 shell（套件不许自己 import node:fs —— arch S67）', async () => {
    const rig = fakeShell([{ stdout: 'ok' }]);

    expect(await writeShotsDir(rig.seam, '/w/demo/shots')).toBe(true);
    expect(rig.lines[0]).toBe("'mkdir' '-p' '/w/demo/shots'");
  });

  it('★ 卡锚点是外壳盖的那一个（模块自己写的卡壳也认）', () => {
    expect(cardSelectorOf('demo')).toBe('#wb-card-demo');
  });
});

describe('运行时输出怎么读：由命令面决定，外壳只负责托着', () => {
  const read = (raw: string): unknown => {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return parsed;
    const box = parsed as Record<string, unknown>;
    if (typeof box['ok'] !== 'boolean') return parsed;
    return typeof box['data'] === 'string' ? JSON.parse(box['data']) : box['data'];
  };

  it('★★ 没有读法就按裸 JSON 读（1.x 的集合）；给了读法就用它拆', () => {
    expect(payloadOf(JSON.stringify({ href: 'u' }))).toMatchObject({ href: 'u' });
    expect(payloadOf(JSON.stringify({ ok: true, data: { href: 'u' } }))).toMatchObject({ ok: true });
    expect(payloadOf(JSON.stringify({ ok: true, data: { href: 'u' } }), read)).toMatchObject({ href: 'u' });
  });

  it('★★ 那一页的握手把同一个读法传下去（2.x 的 data 里才有 url / title）', async () => {
    const rig = fakeShell([
      {
        stdout: JSON.stringify({
          ok: true,
          data: { plugin: '@dsh-workbench/core', pid: 1, url: 'http://127.0.0.1:3081/', title: '工作台' },
        }),
      },
    ]);
    expect(await readyPageOf(rig.seam, 'opencli', 'workbench', { read })).toMatchObject({ ok: true, bound: false });
  });
});

describe('会话方言归命令面，外壳只给原始 argv', () => {
  it('★★ plainLine 不自己加 --session：方言由适配器的命令面决定', () => {
    const line = plainLine('opencli', ['browser', 'Record', 'eval', '1+1', '--window', 'background']);

    expect(line).toBe("'opencli' 'browser' 'Record' 'eval' '1+1' '--window' 'background'");
    expect(line).not.toContain('--session');
  });
});

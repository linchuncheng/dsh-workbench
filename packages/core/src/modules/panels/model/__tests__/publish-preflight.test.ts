import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext, Seam, SeamOutcome } from '@dsh-workbench/shared/host';
import { WORKBENCH_SEAM } from '@dsh-workbench/shared/host';
import { createPublishPreflight, type PublishPreflightAsk } from '../publish-preflight';

interface Step {
  readonly match: string;
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

interface Rig {
  readonly root: string;
  readonly requests: Array<{ readonly command: string; readonly intent: unknown }>;
}

function outcomeOf(step: Step): SeamOutcome {
  return {
    exitCode: step.exitCode,
    timedOut: false,
    aborted: false,
    stdout: step.stdout ?? '',
    stderr: step.stderr ?? '',
    truncated: false,
    stalled: false,
  };
}

function withSeam(rig: Rig, steps: readonly Step[]) {
  const seam = {
    async run(request: { command?: string; intent: unknown }) {
      const command = request.command ?? '';
      rig.requests.push({ command, intent: request.intent });
      const step = [...steps].reverse().find((one) => command.includes(one.match));
      return outcomeOf(step ?? { match: '', exitCode: 0 });
    },
    facts: () => [],
  } as unknown as Seam;
  const ctx = {
    get: (key: string) => (key === WORKBENCH_SEAM ? seam : undefined),
  } as unknown as DshHostContext;
  return ctx;
}

function scaffold(root: string, unit = 'demo'): string {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  const dir = path.join(root, 'packages', `module-${unit}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: `@dsh-workbench/module-${unit}`,
      version: '0.1.0',
      dsh: { workbench: { unit } },
    }),
  );
  return dir;
}

function withBin(root: string): string {
  const bin = path.join(root, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, 'dsh-wb-module');
  fs.writeFileSync(file, '');
  return file;
}

const ASK: PublishPreflightAsk = { unit: 'demo', workspace: '/w/repo', arguments: { unit: 'demo', target: 'team' } };

describe('createPublishPreflight：弹审批之前把能判的先判掉', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-preflight-'));
    scaffold(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('没有工具链：说清先 pnpm install，不去跑 seam', async () => {
    const rig: Rig = { root, requests: [] };
    const preflight = createPublishPreflight(withSeam(rig, []), {
      root: () => root,
      previewOf: () => null,
      inferredAuthorOf: async () => undefined,
    });

    const reason = await preflight(ASK);

    expect(reason).toContain('pnpm install');
    expect(rig.requests).toHaveLength(0);
  });

  it('工具链还不认 --preflight：跳过预检，退回原来的审批流程', async () => {
    withBin(root);
    const rig: Rig = { root, requests: [] };
    const preflight = createPublishPreflight(
      withSeam(rig, [{ match: '--help', exitCode: 0, stdout: '选项：--yes --json' }]),
      { root: () => root, previewOf: () => null, inferredAuthorOf: async () => undefined },
    );

    expect(await preflight(ASK)).toBeUndefined();
    expect(rig.requests.map((one) => one.command.includes('--preflight'))).toEqual([false]);
  });

  it('★ 预检通过：不返回理由，只执行一次不带 --yes 的检查', async () => {
    withBin(root);
    const rig: Rig = { root, requests: [] };
    const preflight = createPublishPreflight(
      withSeam(rig, [
        { match: '--help', exitCode: 0, stdout: '--preflight --json' },
        { match: '--preflight', exitCode: 0, stdout: '{"ok":true,"preflight":true}' },
      ]),
      {
        root: () => root,
        previewOf: () => null,
        inferredAuthorOf: async () => 'Ada',
      },
    );

    expect(await preflight(ASK)).toBeUndefined();
    const run = rig.requests[1]?.command ?? '';
    expect(run).toContain('--preflight');
    expect(run).not.toContain('--yes');
    expect(rig.requests[1]?.intent).toEqual({ kind: 'none' });
  });

  it('★ needsUser：把还差哪一步与命令原样带回来，并说清下一步', async () => {
    withBin(root);
    const rig: Rig = { root, requests: [] };
    const payload = JSON.stringify({
      ok: false,
      target: 'team',
      needsUser: { step: 'login', text: '团队源尚未登录', command: 'npm login --registry https://npm.demo.test/' },
    });
    const preflight = createPublishPreflight(
      withSeam(rig, [
        { match: '--help', exitCode: 0, stdout: '--preflight' },
        { match: '--preflight', exitCode: 3, stdout: payload },
      ]),
      { root: () => root, previewOf: () => null, inferredAuthorOf: async () => undefined },
    );

    const reason = await preflight(ASK);

    expect(reason).toContain('发布前检查未通过');
    expect(reason).toContain('团队源尚未登录');
    expect(reason).toContain('npm login --registry https://npm.demo.test/');
    expect(reason).toContain('重新调用 workbench_diy_publish（unit=demo）');
  });

  it('别的退出码：带回退出码与尾巴，不假装通过', async () => {
    withBin(root);
    const rig: Rig = { root, requests: [] };
    const preflight = createPublishPreflight(
      withSeam(rig, [
        { match: '--help', exitCode: 0, stdout: '--preflight' },
        { match: '--preflight', exitCode: 2, stderr: '✖ 该包不是 wb 模块包' },
      ]),
      { root: () => root, previewOf: () => null, inferredAuthorOf: async () => undefined },
    );

    const reason = await preflight(ASK);

    expect(reason).toContain('命令退出码 2');
    expect(reason).toContain('该包不是 wb 模块包');
  });

  it('verify 那一趟不跑预检（它本来就不问）', async () => {
    withBin(root);
    const rig: Rig = { root, requests: [] };
    const preflight = createPublishPreflight(
      withSeam(rig, [{ match: '--help', exitCode: 0, stdout: '--preflight' }]),
      { root: () => root, previewOf: () => null, inferredAuthorOf: async () => undefined },
    );

    expect(await preflight({ ...ASK, arguments: { unit: 'demo', verify: true } })).toBeUndefined();
    expect(rig.requests).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { InstallFailure } from '@dsh-workbench/shared';
import { failureCardOf, installCardOf, ownerLabel, shellPath, updateStuckCardOf } from '../failure-card-text';

const t: Translate = (key, params) => {
  if (params === undefined) return key;
  return Object.keys(params)
    .sort()
    .reduce((text, name) => text.replaceAll(`{${name}}`, String(params[name])), key);
};

function failure(over: Partial<InstallFailure> = {}): InstallFailure {
  return {
    kind: 'permission',
    command: 'npm i --prefix /x/libs opencli-workflow@1.1.24 --cache /x/npm-cache',
    exitCode: 255,
    output: 'npm error code EACCES',
    path: '/x',
    mode: '755',
    owner: { uid: 0, gid: 0 },
    current: { uid: 502, gid: 20 },
    fix: { kind: 'chown', path: '/x', uid: 502, gid: 20 },
    ...over,
  };
}

describe('updateStuckCardOf（更新没换上那张卡）', () => {
  it('★ 同一张卡：标题说没换上，修法就是那条 dsh plugin 命令，复制后提示重启', () => {
    const card = updateStuckCardOf(t, {
      command: "dsh plugin --profile workbench add '@p/x@0.2.0'",
      from: '0.1.0',
      latest: '0.2.0',
    });

    expect(card.title).toBe('panels.market.updateStuck.title');
    expect(card.fact).toBe('panels.market.updateStuck.factNoChange');
    expect(card.fix).toBe("dsh plugin --profile workbench add '@p/x@0.2.0'");
    expect(card.fixLabel).toBe('panels.market.failure.copyFix');
    expect(card.copiedHint).toBe('panels.market.updateStuck.copiedHint');
    expect(card.command).toBe('');
    expect(card.output).toBe('');
  });

  it('★ 已经有原因那句（stop-profile）→ 事实用那句，不再拼版本号', () => {
    const card = updateStuckCardOf(t, {
      command: 'dsh plugin --profile workbench add @p/x',
      fact: 'panels.market.add.failureStopProfile',
      from: '0.1.0',
      latest: '0.2.0',
    });

    expect(card.fact).toBe('panels.market.add.failureStopProfile');
  });
});

describe('installCardOf（安装失败那一行：一句话原因 + 下一步 + 原始输出）', () => {
  it('★ 通用失败：原因那句 + 点「更新」重试 + 可复制的输出', () => {
    const card = installCardOf(
      {
        application: 'failed',
        target: '@a/mod',
        errorCode: 'operation-error',
        errorDetail: 'ERR_PNPM_FETCH_401\nForbidden',
      } as never,
      t,
      '安装过程中出错。',
    );

    expect(card).toMatchObject({
      title: 'panels.market.failure.installTitleOf',
      fact: '安装过程中出错。 panels.market.failure.retryAdvice',
      fixLabel: 'panels.market.failure.copyOutput',
      fix: 'ERR_PNPM_FETCH_401\nForbidden',
      copiedHint: 'panels.market.failure.copyOutputHint',
      output: 'ERR_PNPM_FETCH_401\nForbidden',
      command: '',
    });
    expect(card?.exitCode).toBeNull();
  });

  it('★ 清单那类失败：原因本身已经说了怎么修，不再叠一句「重试」', () => {
    const card = installCardOf(
      {
        application: 'failed',
        errorCode: 'module-row-failed',
        errorDetail: 'cordis.patch.yml: 写不进去',
      } as never,
      t,
      '请修好这份清单，再重启工作台。',
    );

    expect(card?.fact).toBe('请修好这份清单，再重启工作台。');
  });

  it('★ 命令非零退出 → 卡片带真实退出码（不是「没有退出码」），标题点名模块', () => {
    const card = installCardOf(
      {
        application: 'failed',
        target: '@pagoda-dsh-workbench/module-cmdb',
        errorCode: 'operation-error',
        errorDetail: '命令失败（退出码 127）：bash: nope',
        packageResult: {
          exitCode: 127,
          command: "'pnpm' add --dir '/x' '@a/mod' --save-exact",
          output: '命令失败（退出码 127）：bash: nope',
          truncated: false,
          logPath: '',
        },
      } as never,
      t,
      '安装过程中出错。',
    );

    expect(card?.exitCode).toBe(127);
    expect(card?.command).toBe("'pnpm' add --dir '/x' '@a/mod' --save-exact");
    expect(card?.title).toBe('panels.market.failure.installTitleOf');
  });

  it('没有原始输出就不出卡片（退回到一行红字，不编原因）', () => {
    expect(installCardOf({ application: 'failed', errorCode: 'operation-error' } as never, t, 'x')).toBeUndefined();
    expect(installCardOf({ application: 'failed', errorDetail: '   ' } as never, t, 'x')).toBeUndefined();
    expect(installCardOf(undefined, t, 'x')).toBeUndefined();
  });
});

describe('failureCardOf（卡片上那三行 + 能照抄的那条）', () => {
  it('属主不对 → 主句说没权限，事实点名是谁的，修法是 chown 回自己', () => {
    const card = failureCardOf(failure(), t);

    expect(card.title).toBe('panels.market.failure.permission');
    expect(card.fact).toBe('panels.market.failure.factOwner');
    expect(card.fix).toBe('sudo chown -R 502:20 /x');
    expect(card.fixLabel).toBe('panels.market.failure.copyFix');
    expect(card.command).toContain('opencli-workflow');
    expect(card.exitCode).toBe(255);
  });

  it('只是没写位 → chmod，不唬人跑 sudo', () => {
    const card = failureCardOf(
      failure({ fix: { kind: 'chmod', path: '/x' }, owner: { uid: 502, gid: 20 } }),
      t,
    );

    expect(card.fix).toBe('chmod -R u+w /x');
  });

  it('被沙箱拦的 → 不是命令，是给 agent 的一段话（带命令、路径、退出码）', () => {
    const withParams: Translate = (key, params) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`;
    const card = failureCardOf(failure({ kind: 'sandbox', fix: { kind: 'handoff' } }), withParams);

    expect(card.fixLabel).toBe('panels.market.failure.askAgent');
    expect(card.fix).toContain('npm i --prefix /x/libs');
    expect(card.fix).toContain('/x');
    expect(card.fix).toContain('255');
  });

  it('★ 私有源拒绝（401）→ 主句说没凭据，复制给 agent 的话点名源地址与真实输出', () => {
    const withParams: Translate = (key, params) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`;
    const card = failureCardOf(
      failure({
        kind: 'auth',
        fix: { kind: 'handoff' },
        registry: 'https://r.invalid/x/',
        output: 'ERR_PNPM_FETCH_401 GET https://r.invalid/x/opencli-plugin-cmdb: Unauthorized - 401',
        summary: 'ERR_PNPM_FETCH_401 GET https://r.invalid/x/opencli-plugin-cmdb: Unauthorized - 401',
      }),
      withParams,
    );

    expect(card.title).toBe('panels.market.failure.auth');
    expect(card.fact).toBe('panels.market.failure.factAuth {"registry":"https://r.invalid/x/"}');
    expect(card.fixLabel).toBe('panels.market.failure.askAgent');
    expect(card.fix).toContain('panels.market.failure.askAgentAuth');
    expect(card.fix).toContain('https://r.invalid/x/');
    expect(card.fix).toContain('Unauthorized');
  });

  it('★ 认不出原因 → 不再说"无法写入某个路径"：事实就是认不出，复制的话带输出摘要', () => {
    const withParams: Translate = (key, params) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`;
    const card = failureCardOf(
      failure({
        kind: 'unknown',
        fix: { kind: 'handoff' },
        path: '/x/plugins-npm',
        exitCode: 1,
        output: 'Plugin "cmdb" is not installed.',
        summary: 'Plugin "cmdb" is not installed.',
      }),
      withParams,
    );

    expect(card.title).toBe('panels.market.failure.unknown');
    expect(card.fact).toBe('panels.market.failure.factUnknown {"code":"1"}');
    expect(card.fix).toContain('panels.market.failure.askAgentUnknown');
    expect(card.fix).toContain('is not installed');
  });

  it('认不出原因又没有摘要 → 退到输出的第一行，别把理由空着', () => {
    const withParams: Translate = (key, params) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`;
    const card = failureCardOf(
      failure({ kind: 'unknown', fix: { kind: 'handoff' }, exitCode: null, output: '\n  something odd\n' }),
      withParams,
    );

    expect(card.fix).toContain('something odd');
  });

  it('盘满 → 给一条能看出谁占了地方的命令', () => {
    const card = failureCardOf(failure({ kind: 'disk-full', fix: { kind: 'space', path: '/x' } }), t);

    expect(card.fix).toBe('du -sh /x');
  });

  it('带空格的路径要能直接粘进终端', () => {
    expect(shellPath('/Users/a b/x')).toBe("'/Users/a b/x'");
    expect(shellPath('/Users/ksen/.dsh')).toBe('/Users/ksen/.dsh');
  });

  it('uid 0 说 root，别的说 uid', () => {
    expect(ownerLabel(0)).toBe('root');
    expect(ownerLabel(502)).toBe('uid 502');
  });
});

import { describe, expect, it } from 'vitest';
import { extensionNeedOf, fakeNpmSource, manifestOf } from '@dsh-workbench/shared/testing';
import { installedToShow } from '../market-installed-list';
import { marketRows } from '../market-rows';
import { actionLabelKey, depsOnlyInstall, progressKeyOf } from '../market-view-text';

const NEED = extensionNeedOf('demo', { commands: ['x'], sources: [fakeNpmSource] });

const unit = manifestOf({ id: 'argocd', needs: [NEED] });

describe('安装按钮怎么说：装模块还是装依赖', () => {
  it('★ 本机已经有了（本地 / 已装版本）→ 「安装依赖」，不写「安装」', () => {
    const local = marketRows([unit], {}, { argocd: { installed: '1.1.9', local: true, pkg: '@a/argocd' } })[0];
    const installed = marketRows([unit], {}, { argocd: { installed: '1.1.9', pkg: '@a/argocd' } })[0];

    expect(actionLabelKey(local, 'install')).toBe('panels.market.installDeps');
    expect(actionLabelKey(installed, 'install')).toBe('panels.market.installDeps');
    expect(progressKeyOf(local, 'install')).toBe('panels.market.installingDeps');
  });

  it('本机还没有这个模块 → 照旧说「安装」', () => {
    const row = marketRows([unit], {})[0];

    expect(actionLabelKey(row, 'install')).toBe('panels.market.install');
    expect(progressKeyOf(row, 'install')).toBe('panels.market.installing');
  });

  it('★ 「安装依赖」钮跟「更新依赖」同一套黄色：靠动作语义判，不靠动作名', () => {
    const installed = marketRows([unit], {}, { argocd: { installed: '1.1.9', pkg: '@a/argocd' } })[0];

    expect(depsOnlyInstall(installed, 'install')).toBe(true);
    expect(depsOnlyInstall(marketRows([unit], {})[0], 'install')).toBe(false);
    expect(depsOnlyInstall(installed, 'update')).toBe(false);
  });

  it('更新那一档不受影响：依赖有新版仍然叫「更新依赖」', () => {
    const row = marketRows([unit], {}, { argocd: { installed: '1.1.9', pkg: '@a/argocd' } })[0];

    expect(actionLabelKey(row, 'update')).toBe('panels.market.update');
  });
});

describe('安装过程中哪些行还留在已安装那一栏', () => {
  const modules = [{ unit: 'local-a' }, { unit: 'market-b' }];

  it('★ 本机模块在缓冲期不消失（它没有目录行可回落），目录里有行的那条才让位', () => {
    const shown = installedToShow(modules, {
      listed: new Set(['market-b']),
      settling: new Set(['local-a', 'market-b']),
    });

    expect(shown.map((module) => module.unit)).toEqual(['local-a']);
  });

  it('正在装的那一条留着（有进度可看），确认要删的那条让位', () => {
    expect(
      installedToShow(modules, {
        listed: new Set(['market-b']),
        settling: new Set(['local-a', 'market-b']),
        busyId: 'local-a',
      }),
    ).toEqual([{ unit: 'local-a' }]);
    expect(
      installedToShow(modules, {
        listed: new Set(['market-b']),
        settling: new Set(['local-a']),
        removing: 'local-a',
      }),
    ).toEqual([{ unit: 'market-b' }]);
  });
});

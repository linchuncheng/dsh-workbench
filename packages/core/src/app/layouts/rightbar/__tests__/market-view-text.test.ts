import { describe, expect, it } from 'vitest';
import { extensionNeedOf, fakeNpmSource, manifestOf } from '@dsh-workbench/shared/testing';
import { marketRows } from '../market-rows';
import { actionLabelKey, progressKeyOf } from '../market-view-text';

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

  it('更新那一档不受影响：依赖有新版仍然叫「更新依赖」', () => {
    const row = marketRows([unit], {}, { argocd: { installed: '1.1.9', pkg: '@a/argocd' } })[0];

    expect(actionLabelKey(row, 'update')).toBe('panels.market.update');
  });
});

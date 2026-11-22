import { describe, expect, it } from 'vitest';
import { installedNameOf } from '../model/market-installed-name';

const modules = [
  { pkg: '@dsh-workbench/core' },
  { pkg: '@dsh-workbench/module-hello' },
];

describe('按已装模块认包名', () => {
  it('原样就是包名时直接用它', () => {
    expect(installedNameOf(modules, '@dsh-workbench/module-hello')).toBe('@dsh-workbench/module-hello');
  });

  it('★ 只拿到 git 路径末段（module-hello）时，认出带 scope 的真包名', () => {
    expect(installedNameOf(modules, 'module-hello')).toBe('@dsh-workbench/module-hello');
  });

  it('认不出来就原样交回，不瞎改', () => {
    expect(installedNameOf(modules, 'module-missing')).toBe('module-missing');
  });
});

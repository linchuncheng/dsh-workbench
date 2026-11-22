import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleRowsIn, type ProfileModule } from '@dsh-workbench/shared/host';
import { diagnoseModuleRows, syncModuleRows } from '../module-rows-sync';

const dirs: string[] = [];

function profile(bundles: readonly string[], deps: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-module-rows-'));
  dirs.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-test', dsh: { profile: { bundles } }, dependencies: deps }),
    'utf8',
  );
  for (const pkg of Object.keys(deps)) {
    const dir = path.join(root, 'node_modules', pkg);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkg, version: '1.0.0' }), 'utf8');
  }
  return root;
}

function modules(...rows: readonly [string, string][]): readonly ProfileModule[] {
  return rows.map(([unit, pkg]) => ({ unit, pkg, version: '1.0.0', local: false, fromRegistry: true }));
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('把「不是 bundle 的模块」同步成 profile patch 里的行', () => {
  it('★ 在 bundles 里、但没声明 dsh.bundle 的模块也写行（bundles 载不动它）', () => {
    const root = profile(['@dsh-workbench/core', '@pagoda-dsh-workbench/module-argocd'], {
      '@dsh-workbench/core': 'link:/core',
      '@dsh-workbench/module-hello': 'link:/hello',
      '@pagoda-dsh-workbench/module-argocd': 'link:/argocd',
    });
    const out = syncModuleRows({
      profileDir: root,
      modules: modules(['hello', '@dsh-workbench/module-hello'], ['argocd', '@pagoda-dsh-workbench/module-argocd']),
    });
    expect(out.changed).toBe(true);
    expect(out.added).toEqual(['wb-hello', 'wb-argocd']);
    expect(moduleRowsIn(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'))).toEqual([
      { id: 'wb-hello', name: '@dsh-workbench/module-hello' },
      { id: 'wb-argocd', name: '@pagoda-dsh-workbench/module-argocd' },
    ]);
  });

  it('★ 声明了 dsh.bundle 的模块不写行（组合包自己装）', () => {
    const root = profile(['@dsh-workbench/core', '@dsh-workbench/module-hello'], {
      '@dsh-workbench/core': 'link:/core',
      '@dsh-workbench/module-hello': 'link:/hello',
    });
    const out = syncModuleRows({
      profileDir: root,
      modules: [{ unit: 'hello', pkg: '@dsh-workbench/module-hello', version: '1.0.0', local: false, fromRegistry: true, shipsBundle: true }],
    });

    expect(out.added).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it('★ 再同步一次什么都不改（幂等）', () => {
    const root = profile(['@dsh-workbench/core'], {
      '@dsh-workbench/core': 'link:/core',
      '@dsh-workbench/module-hello': 'link:/hello',
    });
    const input = { profileDir: root, modules: modules(['hello', '@dsh-workbench/module-hello']) };
    expect(syncModuleRows(input).changed).toBe(true);
    const again = syncModuleRows(input);
    expect(again.changed).toBe(false);
    expect(again.rows).toEqual([{ id: 'wb-hello', name: '@dsh-workbench/module-hello' }]);
  });

  it('★ 模块卸载后行跟着消失', () => {
    const root = profile(['@dsh-workbench/core'], {
      '@dsh-workbench/core': 'link:/core',
      '@dsh-workbench/module-hello': 'link:/hello',
    });
    syncModuleRows({ profileDir: root, modules: modules(['hello', '@dsh-workbench/module-hello']) });
    const out = syncModuleRows({ profileDir: root, modules: [] });
    expect(out.changed).toBe(true);
    expect(out.removed).toEqual(['wb-hello']);
    expect(moduleRowsIn(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'))).toEqual([]);
  });

  it('★ 模块被选进 bundles 但没声明 dsh.bundle，行留着（撤了它就没东西装载）', () => {
    const root = profile(['@dsh-workbench/core'], {
      '@dsh-workbench/core': 'link:/core',
      '@dsh-workbench/module-hello': 'link:/hello',
    });
    syncModuleRows({ profileDir: root, modules: modules(['hello', '@dsh-workbench/module-hello']) });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'dsh-profile-test',
        dsh: { profile: { bundles: ['@dsh-workbench/core', '@dsh-workbench/module-hello'] } },
        dependencies: { '@dsh-workbench/core': 'link:/core', '@dsh-workbench/module-hello': 'link:/hello' },
      }),
      'utf8',
    );
    const out = syncModuleRows({ profileDir: root, modules: modules(['hello', '@dsh-workbench/module-hello']) });
    expect(out.removed).toEqual([]);
    expect(moduleRowsIn(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'))).toEqual([
      { id: 'wb-hello', name: '@dsh-workbench/module-hello' },
    ]);
  });

  it('没有 profile 目录 → 一个字节都不写', () => {
    expect(syncModuleRows({ profileDir: null, modules: modules(['hello', '@dsh-workbench/module-hello']) })).toEqual({
      changed: false,
      rows: [],
      added: [],
      removed: [],
      stuck: [],
    });
  });

  it('★ 还声明着 dsh.bundle 的包：不写行，但记进 stuck（迁移没做完）', () => {
    const root = profile(['@dsh-workbench/core'], { '@dsh-workbench/core': 'link:/core' });
    const out = syncModuleRows({
      profileDir: root,
      modules: [{ unit: 'old', pkg: '@a/old', version: '1.0.0', local: false, fromRegistry: true, shipsBundle: true }],
    });
    expect(out.rows).toEqual([]);
    expect(out.stuck).toEqual(['@a/old']);
  });

  it('已有的用户层原样保留', () => {
    const root = profile(['@dsh-workbench/core'], { '@dsh-workbench/core': 'link:/core' });
    const original = "- id: ui-sidebar\n  disabled: true\n";
    fs.writeFileSync(path.join(root, 'cordis.patch.yml'), original, 'utf8');
    syncModuleRows({ profileDir: root, modules: [] });
    expect(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')).toBe(original);
  });
});

describe('行那份文件坏了要能看见（不是只有启动日志）', () => {
  it('★ YAML 坏了 → 健康检查里报出来，带上原因', () => {
    const root = profile(['@dsh-workbench/core'], { '@dsh-workbench/core': 'link:/core' });
    fs.writeFileSync(path.join(root, 'cordis.patch.yml'), '- insert:\n    - id: wb-x\n  bad: [\n', 'utf8');

    const health = diagnoseModuleRows(root);

    expect(health.ok).toBe(false);
    expect(health.ok === false ? health.problem : '').toContain('cordis.patch.yml');
  });

  it('文件正常 / 不存在 → ok', () => {
    const root = profile(['@dsh-workbench/core'], { '@dsh-workbench/core': 'link:/core' });
    expect(diagnoseModuleRows(root)).toEqual({ ok: true });
    fs.writeFileSync(path.join(root, 'cordis.patch.yml'), "- id: ui-sidebar\n  disabled: true\n", 'utf8');
    expect(diagnoseModuleRows(root)).toEqual({ ok: true });
  });

  it('没有 profile 目录 → ok（不是有问题的意思）', () => {
    expect(diagnoseModuleRows(null)).toEqual({ ok: true });
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hasModuleRow, moduleRowId, moduleRowsFrom, moduleRowsIn, withModuleRows } from '../module-rows.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const HELLO = { id: moduleRowId('hello'), name: '@dsh-workbench/module-hello' };

const OTHER = `# 用户自己写的层
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: xwj
`;

describe('模块行的 id 与来源', () => {
  it('行 id 带 wb- 前缀，unit 直接接在后面', () => {
    expect(moduleRowId('hello')).toBe('wb-hello');
    expect(moduleRowId('coding-analysis')).toBe('wb-coding-analysis');
  });

  it('★ 已经是 bundle 的模块不再写行（会重复装载）', () => {
    const modules = [
      { unit: 'hello', pkg: '@dsh-workbench/module-hello' },
      { unit: 'argocd', pkg: '@pagoda-dsh-workbench/module-argocd' },
    ];
    expect(moduleRowsFrom(modules, ['@pagoda-dsh-workbench/module-argocd'])).toEqual([
      { id: 'wb-hello', name: '@dsh-workbench/module-hello' },
    ]);
  });

  it('★ 包里还声明着 dsh.bundle → 也不写行（否则行和组合包两份装载）', () => {
    const rows = moduleRowsFrom([{ unit: 'hello', pkg: HELLO.name, shipsBundle: true }], []);

    expect(rows).toEqual([]);
  });

  it('顺序跟已装清单一致，不排序', () => {
    const modules = [
      { unit: 'b', pkg: '@a/b' },
      { unit: 'a', pkg: '@a/a' },
    ];
    expect(moduleRowsFrom(modules, []).map((row) => row.id)).toEqual(['wb-b', 'wb-a']);
  });
});

describe('读 patch 里的模块行', () => {
  it('只认 insert 里、id 带 wb- 的行', () => {
    const text = `${OTHER}
- insert:
    - id: wb-hello
      name: '@dsh-workbench/module-hello'
    - id: other-row
      name: '@a/other'
`;
    expect(moduleRowsIn(text)).toEqual([HELLO]);
  });

  it('坏 YAML 明确抛错，不装作没有行', () => {
    expect(() => moduleRowsIn('- insert: [')).toThrow(/无法解析/);
  });
});

describe('写模块行', () => {
  it('空 patch → 追加一块', () => {
    const next = withModuleRows('', [HELLO]);
    expect(moduleRowsIn(next)).toEqual([HELLO]);
    expect(next).toBe(`- insert:
    - id: wb-hello
      name: '@dsh-workbench/module-hello'
`);
  });

  it('★ 有别人的层时，另起一块并留空行，别的层原样不动', () => {
    const next = withModuleRows(OTHER, [HELLO]);
    expect(next.startsWith(OTHER)).toBe(true);
    expect(next).toContain('\n\n- insert:');
    expect(moduleRowsIn(next)).toEqual([HELLO]);
  });

  it('★ 再写一次不叠加（原地替换那一块）', () => {
    const once = withModuleRows(OTHER, [HELLO]);
    const twice = withModuleRows(once, [HELLO]);
    expect(twice).toBe(once);
    expect(moduleRowsIn(twice)).toEqual([HELLO]);
  });

  it('★ 加一个模块：同一块里两行', () => {
    const argocd = { id: moduleRowId('argocd'), name: '@pagoda-dsh-workbench/module-argocd' };
    const next = withModuleRows(withModuleRows(OTHER, [HELLO]), [HELLO, argocd]);
    expect(moduleRowsIn(next)).toEqual([HELLO, argocd]);
    expect(next.match(/- insert:/g)).toHaveLength(1);
  });

  it('★ 移除最后一个模块：整块拿掉，别的层还在', () => {
    const next = withModuleRows(withModuleRows(OTHER, [HELLO]), []);
    expect(moduleRowsIn(next)).toEqual([]);
    expect(next).toBe(OTHER);
  });

  it('移除其中一个，另一个留着', () => {
    const argocd = { id: moduleRowId('argocd'), name: '@pagoda-dsh-workbench/module-argocd' };
    const withBoth = withModuleRows(OTHER, [HELLO, argocd]);
    const onlyArgocd = withModuleRows(withBoth, [argocd]);
    expect(moduleRowsIn(onlyArgocd)).toEqual([argocd]);
  });

  it('★ 行被挤进别人的块时不动别人的块，也不重复加', () => {
    const mixed = `- insert:
    - id: somebody
      name: '@a/somebody'
    - id: wb-hello
      name: '@dsh-workbench/module-hello'
`;
    const next = withModuleRows(mixed, [HELLO]);
    expect(next).toBe(mixed);
    expect(moduleRowsIn(next)).toEqual([HELLO]);
  });
});

describe('判断某个包是不是靠 wb- 行装载的', () => {
  it('★ 行里有这个包 → true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-has-row-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), withModuleRows('', [HELLO]));
    expect(hasModuleRow(dir, HELLO.name)).toBe(true);
  });

  it('行里没有这个包 → false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-has-row-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), withModuleRows('', [HELLO]));
    expect(hasModuleRow(dir, '@t/other')).toBe(false);
  });

  it('没有 patch 文件 → false，不抛', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-has-row-'));
    roots.push(dir);
    expect(hasModuleRow(dir, HELLO.name)).toBe(false);
  });
});

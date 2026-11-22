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

  it('★ 在 bundles 里但没声明 dsh.bundle 的模块照写行（否则永远加载不起来）', () => {
    const modules = [
      { unit: 'hello', pkg: '@dsh-workbench/module-hello' },
      { unit: 'zentao-stories', pkg: '@pagoda-dsh-workbench/module-zentao-stories' },
    ];

    expect(moduleRowsFrom(modules)).toEqual([
      { id: 'wb-hello', name: '@dsh-workbench/module-hello' },
      { id: 'wb-zentao-stories', name: '@pagoda-dsh-workbench/module-zentao-stories' },
    ]);
  });

  it('★ 包里还声明着 dsh.bundle → 也不写行（否则行和组合包两份装载）', () => {
    const rows = moduleRowsFrom([{ unit: 'hello', pkg: HELLO.name, shipsBundle: true }]);

    expect(rows).toEqual([]);
  });

  it('顺序跟已装清单一致，不排序', () => {
    const modules = [
      { unit: 'b', pkg: '@a/b' },
      { unit: 'a', pkg: '@a/a' },
    ];
    expect(moduleRowsFrom(modules).map((row) => row.id)).toEqual(['wb-b', 'wb-a']);
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

  it('★ dsh 生成的空文件（注释 + []）→ 替换 []，不是往后追加（追加会写出两个 YAML 根）', () => {
    const canonical = '# Your patch layer for this dsh profile\n# 注释\n[]\n';
    const next = withModuleRows(canonical, [HELLO]);
    expect(next).toContain('# Your patch layer for this dsh profile');
    expect(next.match(/- insert:/g)).toHaveLength(1);
    expect(moduleRowsIn(next)).toEqual([HELLO]);
  });

  it('★ 有别人的层时，另起一块并留空行，别的层原样不动', () => {
    const next = withModuleRows(OTHER, [HELLO]);
    expect(next.startsWith(OTHER)).toBe(true);
    expect(next).toContain('\n\n- insert:');
    expect(moduleRowsIn(next)).toEqual([HELLO]);
  });

  it('★ 去掉最后一行：留下注释 + []，而不是只剩注释（dsh 会拒绝非数组的 patch）', () => {
    const withOne = withModuleRows('# 注释\n[]\n', [HELLO]);
    const empty = withModuleRows(withOne, []);
    expect(empty).toContain('# 注释');
    expect(empty.trimEnd().endsWith('[]')).toBe(true);
    expect(moduleRowsIn(empty)).toEqual([]);
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

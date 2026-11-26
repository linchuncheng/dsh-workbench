import { describe, expect, it } from 'vitest';
import {
  byLocationOf,
  excerptOf,
  filesOf,
  findFileOf,
  installedVersionOf,
  kitBucketsOf,
  namesIn,
  nearNamesOf,
  renderSurfaceText,
  rootsOf,
  scopeOf,
  TWO_FACE_ALL,
  wantsKit,
  wantsPrimitives,
} from '../diy-surface';
import {
  DEPS_NAMES,
  depDeclarationFiles,
  depDeclarationOf,
  depDeclarationsOf,
  isDepName,
  renderDepText,
  renderDepsText,
  surfaceCoreRoot,
} from '../diy-deps';
import { kit, primitives } from './diy-surface-samples';

describe('workbench_diy_surface · 解析与落点', () => {
  it('多个名称按逗号 / 中文逗号 / 空白拆开，并去重', () => {
    expect(namesIn('Card, CardProps useApiResource')).toEqual(['Card', 'CardProps', 'useApiResource']);
    expect(namesIn(' Card，Card ')).toEqual(['Card']);
    expect(namesIn('')).toEqual([]);
  });

  it('scope 只认已知面，别的都当 all', () => {
    expect(scopeOf('kit')).toBe('kit');
    expect(scopeOf('primitives')).toBe('primitives');
    expect(scopeOf('platform')).toBe('platform');
    expect(scopeOf('deps')).toBe('deps');
    expect(scopeOf('')).toBe('all');
    expect(scopeOf('nonsense')).toBe('all');
    expect([wantsPrimitives('all'), wantsKit('all')]).toEqual([true, true]);
    expect([wantsPrimitives('kit'), wantsKit('kit')]).toEqual([false, true]);
    expect([wantsPrimitives('primitives'), wantsKit('primitives')]).toEqual([true, false]);
    expect([wantsPrimitives('deps'), wantsKit('deps')]).toEqual([false, false]);
  });

  it('deps 面覆盖工作台 kit 与单元挂载口：24 个成员，含 drafts', () => {
    expect(DEPS_NAMES).toHaveLength(24);
    expect(new Set(DEPS_NAMES).size).toBe(24);
    for (const name of ['surface', 'flow', 'commands', 'seam', 'data', 'store', 'longTasks', 'drafts']) {
      expect(DEPS_NAMES).toContain(name);
    }
    expect(isDepName('drafts')).toBe(true);
    expect(isDepName('nope')).toBe(false);
  });

  it('★ deps 每个成员都在声明里带 JSDoc（路径:行 + JSDoc + 声明；drafts 在 host-kit，probe 跨行）', () => {
    const root = surfaceCoreRoot();
    const files = depDeclarationFiles(root);
    expect(files).toHaveLength(2);

    const facts = depDeclarationsOf(root);
    expect(facts).toHaveLength(24);
    for (const fact of facts) expect(fact.text.trimStart().startsWith('/**'), fact.name).toBe(true);

    const drafts = facts.find((one) => one.name === 'drafts');
    expect(drafts?.path).toMatch(/host-kit\.(?:d\.ts|ts)$/);
    expect(drafts?.line).toBeGreaterThan(0);
    expect(drafts?.text).toContain('会话草稿库');
    expect(drafts?.text).toContain('readonly drafts');

    const probe = facts.find((one) => one.name === 'probe');
    expect(probe?.text.split('\n').length).toBeGreaterThan(1);
    expect(probe?.text).toContain('Promise<UnitCapability');
    expect(probe?.text.trimEnd().endsWith(';')).toBe(true);
    expect(depDeclarationOf('nope', root)).toBeNull();
  });

  it('deps 列表：先给声明文件，每项首句来自 JSDoc；单点给 路径:行 + JSDoc + 声明', () => {
    const root = surfaceCoreRoot();
    const text = renderDepsText(root);
    expect(text.startsWith('工作台 deps（UnitMountDeps，24 项）：')).toBe(true);
    expect(text).toContain('声明：');
    expect(text).toContain('drafts: 会话草稿库');

    const one = renderDepText('seam', root);
    expect(one.split('\n')[0]).toMatch(/^seam → .+host-kit\.(?:d\.ts|ts):\d+$/);
    expect(one).toContain('/**');
    expect(one).toContain('受控执行缝');
    expect(one).toContain('readonly seam');
    expect(one).toContain('类型：UnitSeam → ');
    expect(renderDepText('nope', root)).toContain('「nope」不在工作台 deps 里');
  });

  it('files / roots / 装机版本从工具链的 JSON 里取出来（形状不对就是空表，不抛）', () => {
    expect(filesOf(primitives)['Button']).toBe('/w/primitives/lib/types/Button.d.ts');
    expect(rootsOf(kit)['shared']).toBe('/w/core/node_modules/@dsh-workbench/shared/dist');
    expect(installedVersionOf(primitives)).toBe('0.2.1-rc.2');
    expect(installedVersionOf({ installed: null })).toBeNull();
    expect(filesOf(undefined)).toEqual({});
    expect(rootsOf({ roots: { a: 1 } })).toEqual({});
  });

  it('★ 给名字回那一件的文件：kit 与原语都认，两个面都有同名时先给原语', () => {
    expect(findFileOf('Card', { primitives, kit })).toEqual({ file: '/w/shared/dist/components/Card.d.ts', from: 'kit' });
    expect(findFileOf('Button', { primitives, kit })).toEqual({
      file: '/w/primitives/lib/types/Button.d.ts',
      from: 'primitives',
    });
    const both = { ...primitives, files: { ...primitives.files, Shared: '/w/primitives/lib/types/Shared.d.ts' } };
    expect(findFileOf('Shared', { primitives: both, kit: { files: { Shared: '/w/share.d.ts' } } })?.from).toBe('primitives');
    expect(findFileOf('NopeNotHere', { primitives, kit })).toBeNull();
  });

  it('★ 找不到时的近似名：两边一起找、短的先给、封顶 8 个', () => {
    const names = [...Object.keys(primitives.files), ...Object.keys(kit.files)];
    expect(nearNamesOf('button', names)).toEqual(['Button']);
    expect(nearNamesOf('Icon', names)).toEqual(['IconSearchOutlineRegular']);
    expect(nearNamesOf('Buton', names)).toEqual(['Button']);
    expect(nearNamesOf('zzz', names)).toEqual([]);
    expect(nearNamesOf('e', names, 2)).toHaveLength(2);
  });

  it('文件摘录：切掉 sourceMappingURL、超行数就截断并说还剩多少', () => {
    const text = '/** 一句话。 */\nexport declare const A: string;\n//# sourceMappingURL=A.d.ts.map\n';
    expect(excerptOf(text)).toBe('/** 一句话。 */\nexport declare const A: string;');
    const long = Array.from({ length: 70 }, (_unused, index) => `line ${String(index)}`).join('\n');
    const cut = excerptOf(long, 60);
    expect(cut.split('\n')).toHaveLength(61);
    expect(cut).toContain('还有 10 行');
  });
});

describe('workbench_diy_surface · 人话', () => {
  it('清单档：两个面都在、按落点分组、"只有原语有"在、末尾是类型面根', () => {
    const text = renderSurfaceText({ primitives, kit }, { scope: 'all', all: false });
    expect(text).toContain('kit 2：组件 1 · shared/hooks 1');
    expect(text).toContain('组件(1)：Card');
    expect(text).toContain('shared/hooks(1)：useApiResource');
    expect(text).toContain('shared=/w/core/node_modules/@dsh-workbench/shared/dist');
    expect(text).toContain('原语 0.2.1-rc.2：只有它有 components Button, Modal · icons IconSearchOutlineRegular');
    expect(text).toContain('kit 里已有：relativeTime');
  });

  it('默认档每桶封顶 12 个并提示 all:true；指名一面给了 all 就列全', () => {
    const many = Array.from({ length: 30 }, (_unused, index) => `Thing${String(index)}`);
    const payload = { ...primitives, onlyPrimitives: { ...primitives.onlyPrimitives, components: many } };
    expect(renderSurfaceText({ primitives: payload, kit }, { scope: 'primitives', all: false })).toContain('…+18');
    expect(renderSurfaceText({ primitives: payload, kit }, { scope: 'primitives', all: true })).toContain('Thing29');
  });

  it('★ 不指名 scope 又要 all：只回那一句，不带任何目录数据（这一格原来会超预算，现在连数据都不发）', () => {
    const many = Array.from({ length: 400 }, (_unused, index) => `Thing${String(index)}WithALongName`);
    const payload = {
      ...primitives,
      files: Object.fromEntries(many.map((one) => [one, `/w/primitives/lib/types/${one}.d.ts`])),
      onlyPrimitives: { ...primitives.onlyPrimitives, components: many },
    };
    const text = renderSurfaceText({ primitives: payload, kit }, { scope: 'all', all: true });

    expect(text).toBe(TWO_FACE_ALL);
    expect(text).not.toMatch(/kit \d+/u);
    expect(text).not.toContain('类型面');
    expect(text).not.toContain('Thing399WithALongName');
  });

  it('★ 那一句只认"两面 + all"这一格：指名一面、不给 all、或带 bucket，都照常出清单', () => {
    expect(renderSurfaceText({ primitives, kit }, { scope: 'all', all: false })).toContain('kit 2：组件 1');
    expect(renderSurfaceText({ primitives, kit }, { scope: 'kit', all: true })).toContain('组件(1)：Card');
    expect(renderSurfaceText({ primitives, kit }, { scope: 'all', all: true, bucket: 'components' })).toContain('  组件(1)：Card');
  });

  it('★ 目录档自己长到超预算时不再自己截断：全表原样给出，预算归平台的 post-execute 策略', () => {
    const files = Object.fromEntries(
      Array.from({ length: 30 }, (_unused, bi) => `b${String(bi)}`).flatMap((b) =>
        Array.from({ length: 14 }, (_unused, index) => [
          `${b}Name${String(index)}WithAVeryLongTailIndeed`,
          `/w/core/dist/types/${b}/Name${String(index)}.d.ts`,
        ]),
      ),
    );
    const big = { roots: { shell: '/w/core/dist/types' }, files };
    const text = renderSurfaceText({ primitives, kit: big }, { scope: 'all', all: false });

    expect(text.length).toBeGreaterThan(8192);
    expect(text).not.toContain('这份清单');
    expect(renderSurfaceText({ primitives, kit: big }, { scope: 'kit', all: false })).not.toContain('这份清单');
  });

  it('★ 单面全表自己也长到超预算时（原语长大以后）：整份给全，不再警告', () => {
    const many = Array.from({ length: 400 }, (_unused, index) => `Thing${String(index)}WithALongName`);
    const payload = {
      ...primitives,
      files: Object.fromEntries(many.map((one) => [one, `/w/primitives/lib/types/${one}.d.ts`])),
      onlyPrimitives: { ...primitives.onlyPrimitives, components: many },
    };
    const text = renderSurfaceText({ primitives: payload }, { scope: 'primitives', all: true });
    expect(text.length).toBeGreaterThan(8192);
    expect(text).not.toContain('这份清单');
  });

  it('装机那份没装：把那句能照做的补法说出来，不假装有清单', () => {
    const text = renderSurfaceText(
      { primitives: { installed: null, snippet: { devDependency: { name: 'x', version: '0.2.1-rc.2' } } } },
      { scope: 'all', all: false },
    );
    expect(text).toContain('原语：没装');
    expect(text).toContain('0.2.1-rc.2');
  });
});

describe('workbench_diy_surface · 清单按类型文件落点分（桶的计数会骗人）', () => {
  const real = {
    roots: { shell: '/w/core/dist/types', shared: '/w/core/node_modules/@dsh-workbench/shared/dist' },
    buckets: { api: ['Card', 'CardHead'], components: ['Card', 'CardHead'], lib: ['Card'] },
    files: {
      Card: '/w/core/node_modules/@dsh-workbench/shared/dist/components/Card.d.ts',
      CardHead: '/w/core/node_modules/@dsh-workbench/shared/dist/components/CardHead.d.ts',
      BlockerState: '/w/core/dist/types/shared/components/BlockerState.d.ts',
      readText: '/w/core/dist/types/modules/panels/model/diy-report.d.ts',
      useApiResource: '/w/core/node_modules/@dsh-workbench/shared/dist/hooks/use-api-resource.d.ts',
    },
  };

  it('byLocationOf：相对类型面根取目录，落点各自成组、按人数降序', () => {
    expect(byLocationOf(real)).toEqual([
      { where: 'components', names: ['Card', 'CardHead'] },
      { where: 'hooks', names: ['useApiResource'] },
      { where: 'modules/panels/model', names: ['readText'] },
      { where: 'shared/components', names: ['BlockerState'] },
    ]);
  });

  it('类型面扫不到（files 空）但桶里有名字：先把名字列出来，别装成"清单是空的"', () => {
    const text = renderSurfaceText({ kit: { buckets: { components: ['Card', 'CardHead'] }, files: {} } }, { scope: 'kit', all: false });

    expect(text).toContain('类型面扫不到，只有名字');
    expect(text).toContain('Card, CardHead');
  });

  it('★ 摘要按落点报真计数（组件那两个目录归并），不出现 CLI 那几个重叠的桶', () => {
    const text = renderSurfaceText({ kit: real }, { scope: 'kit', all: true });

    expect(text.split('\n')[0]).toBe('kit 5：组件 3 · hooks 1 · modules/panels/model 1');
    expect(text).toContain('  组件(3)：BlockerState, Card, CardHead');
    expect(text).not.toContain('共用面(');
    expect(text).not.toContain('api 2');
  });
});

describe('workbench_diy_surface · 给 bucket 就把那一桶列全（一桶装得下，不必去 shell）', () => {
  const many = Array.from({ length: 30 }, (_unused, index) => `Thing${String(index)}`);
  const wide = { ...primitives, onlyPrimitives: { ...primitives.onlyPrimitives, icons: many } };

  it('原语那一桶：整桶列全（不再封顶 12），其余桶只靠头部那行计数', () => {
    const text = renderSurfaceText({ primitives: wide, kit }, { scope: 'all', all: false, bucket: 'icons' });

    expect(text).toContain('原语 0.2.1-rc.2：只有它有 components 2 · icons 30');
    expect(text).toContain('  icons(30)：Thing0,');
    expect(text).toContain('Thing29');
    expect(text).not.toContain('…+18');
    expect(text.length).toBeLessThan(8192);
  });

  it('kit 那一桶：按落点分组；末段同名也认（hooks 命中 shared/hooks）', () => {
    const exact = renderSurfaceText({ kit }, { scope: 'kit', all: false, bucket: 'components' });
    expect(exact).toContain('kit 2：组件 1 · shared/hooks 1');
    expect(exact).toContain('  组件(1)：Card');

    const byTail = renderSurfaceText({ kit }, { scope: 'kit', all: false, bucket: 'hooks' });
    expect(byTail).toContain('  shared/hooks(1)：useApiResource');
  });

  it('★ 没有这一桶：说没有、把可用的桶名列出来，不装成清单是空的', () => {
    const text = renderSurfaceText({ primitives, kit }, { scope: 'all', all: false, bucket: 'nope' });

    expect(text).toContain('没有「nope」这一桶');
    expect(text).toContain('kit → components / shared/hooks');
    expect(text).toContain('primitives → components / icons');
    expect(text).toContain('kit 2：组件 1 · shared/hooks 1');
    expect(text).not.toContain('  组件(1)：Card');
  });

  it('两个面都有 components 时都列：kit 走落点、原语走它自己的桶', () => {
    const text = renderSurfaceText({ primitives, kit }, { scope: 'all', all: false, bucket: 'components' });

    expect(text).toContain('  组件(1)：Card');
    expect(text).toContain('  components(2)：Button, Modal');
  });

  it('★ 归并口径与摘要同源：shared/components 那类折进"组件"，头部计数与展开条数不许对不上', () => {
    const real = {
      roots: { shell: '/w/core/dist/types', shared: '/w/core/node_modules/@dsh-workbench/shared/dist' },
      files: {
        Card: '/w/core/node_modules/@dsh-workbench/shared/dist/components/Card.d.ts',
        CardHead: '/w/core/node_modules/@dsh-workbench/shared/dist/components/CardHead.d.ts',
        BlockerState: '/w/core/dist/types/shared/components/BlockerState.d.ts',
        readText: '/w/core/dist/types/modules/panels/model/diy-report.d.ts',
      },
    };
    const text = renderSurfaceText({ kit: real }, { scope: 'kit', all: false, bucket: 'components' });

    expect(kitBucketsOf(real).map((one) => one.key)).toEqual(['components', 'modules/panels/model']);
    expect(text).toContain('kit 4：组件 3 · modules/panels/model 1');
    expect(text).toContain('  组件(3)：BlockerState, Card, CardHead');
  });

  it('★ 参数在工具定义里写着，清单里不复述一遍（其余桶也不另起一行）', () => {
    const text = renderSurfaceText({ primitives: wide, kit }, { scope: 'all', all: false, bucket: 'icons' });

    expect(text).not.toContain('name=<件>');
    expect(text).not.toContain('all=true 出全表');
    expect(text).not.toContain('其余桶');
    expect(text.split('\n').at(-1)).toBe(
      '类型面：shell=/w/core/dist/types · shared=/w/core/node_modules/@dsh-workbench/shared/dist · primitives=/w/primitives/lib/types',
    );
  });
});

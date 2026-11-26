import { describe, expect, it } from 'vitest';
import { surfaceTool, registerSurfaceTool } from '../diy-surface';
import { DIY_SURFACE_TOOL, READ_TOOLS, WRITE_TOOLS } from '../../unit';
import { surfaceCoreRoot } from '@/shared/api/host/diy-deps';
import { publicTypeOf, renderTypeText } from '@/shared/api/host/diy-types';

describe('workbench_diy_surface · 工具形状', () => {
  it('★ 名字是那一把、四个参数（name / scope / bucket / all），scope 只认五个面，而且只归读侧（不写东西、不用点头）', () => {
    const tool = surfaceTool({} as never);

    expect(tool.name).toBe(DIY_SURFACE_TOOL);
    expect(tool.description.length).toBeGreaterThan(10);
    const properties = (tool.parameters as { properties: Record<string, { enum?: readonly string[] }> }).properties;
    expect(Object.keys(properties)).toEqual(['name', 'scope', 'bucket', 'all']);
    expect(properties['scope']?.enum).toEqual(['kit', 'primitives', 'tokens', 'platform', 'deps']);
    expect(READ_TOOLS).toContain(DIY_SURFACE_TOOL);
    expect(WRITE_TOOLS).not.toContain(DIY_SURFACE_TOOL);
  });

  it('name 支持逗号 / 空白分隔多个，一次回多段', async () => {
    const ctx = {
      get: (key: string) =>
        key === 'workspaceRegistry'
          ? { resolveByPath: async () => ({ path: process.cwd(), title: 'x' }) }
          : undefined,
    } as never;
    const exec = { agent: { session: { header: { cwd: process.cwd() } } } } as never;
    const out = (await surfaceTool(ctx).execute({ name: 'seam, ai', scope: 'deps' }, exec)) as {
      names?: readonly string[];
      text?: string;
    };
    expect(out.names).toEqual(['seam', 'ai']);
    expect(out.text).toContain('seam →');
    expect(out.text).toContain('ai →');
  });

  it('★ 公开类型能答出声明与 JSDoc：CardProps / ApprovalPlanData / UnitMountDeps', () => {
    const root = surfaceCoreRoot();
    expect(root).not.toBeNull();

    for (const name of ['CardProps', 'ApprovalPlanData', 'UnitMountDeps']) {
      const fact = publicTypeOf(name, root, []);
      expect(fact, name).not.toBeNull();
      if (fact === null) throw new Error(`缺公开类型 ${name}`);
      const text = renderTypeText(fact);
      expect(text, name).toContain(name);
      expect(text, name).toContain('/**');
    }
  });

  it('注册恰好一把，并回一个能撤销的 disposer', () => {
    const seen: Array<{ name?: string }> = [];
    const tools = {
      register: (definition: { name?: string }) => {
        seen.push(definition);
        return () => {};
      },
    };

    const disposers = registerSurfaceTool({} as never, tools as never);

    expect(seen.map((one) => one.name)).toEqual([DIY_SURFACE_TOOL]);
    expect(disposers).toHaveLength(1);
    expect(typeof disposers[0]).toBe('function');
  });
});

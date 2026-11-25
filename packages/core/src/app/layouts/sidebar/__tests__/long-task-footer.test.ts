import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string =>
  readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const ACTION = read('LongTaskFooterAction.tsx');
const SHELL = read('Sidebar.tsx');
const CLIENT = read('../../client.tsx');

describe('左栏底部的长任务入口：一条入口 + 一张全局长任务表', () => {
  it('★★ 读的是全局长任务那一份，不另起一条轮询', () => {
    expect(ACTION).toContain('useShellLongTasks()');
    expect(ACTION).toContain('if (rows.length === 0) return null;');
  });

  it('★★ 按单元分组，每一条都复用外壳的长任务行（读 / 停 / 重查 / 回执全接好）', () => {
    expect(ACTION).toContain('new Map<string, ShellLongTaskRow[]>()');
    expect(ACTION).toContain('byUnit.get(row.unit)');
    expect(ACTION).toContain('h(SchemaLongTaskView, {');
    expect(ACTION).toContain('stopRouteOf(unit)');
    expect(ACTION).toContain('recheckRouteOf(unit)');
    expect(ACTION).toContain('answerRouteOf(unit)');
  });

  it('★★ 入口挂在左栏底部、排在调试那条之前；不新增槽位注册', () => {
    expect(SHELL).toContain('h(LongTaskFooterAction, { wide, t })');
    expect(SHELL.indexOf('h(LongTaskFooterAction')).toBeLessThan(
      SHELL.indexOf("renderSlot('sidebar.footer.action'"),
    );
    expect(CLIENT).not.toContain('registerLongTaskFooter');
  });

  it('★★ 等待人工处理时点升级成 warning（与左栏状态点同一套）', () => {
    expect(ACTION).toContain("row.status === 'needs-human'");
    expect(ACTION).toContain("waiting ? 'warning' : 'ongoing'");
  });
});

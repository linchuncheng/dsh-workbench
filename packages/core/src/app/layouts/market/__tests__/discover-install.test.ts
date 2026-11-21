import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('发现页点安装：一次点击就开始装（不再要第二次确认）', () => {
  it('★ 行里的安装带上 autoInstall：弹层只负责进度与结果', () => {
    expect(read('use-discover.ts')).toContain('autoInstall: true');
  });

  it('★ 弹层拿到 autoInstall 后，预检一过就直接开装（不再停在预览屏等人点）', () => {
    const hook = read('use-add-module.ts');

    expect(hook).toContain('if (preset?.autoInstall === true) {');
    expect(hook).toContain('        install();\n        return;');
  });

  it('★ 手动添加那条路不带 autoInstall：Add module 按钮仍然先给人看预览', () => {
    expect(read('panel.tsx')).toContain("setAdding({ spec: '' })");
  });
});

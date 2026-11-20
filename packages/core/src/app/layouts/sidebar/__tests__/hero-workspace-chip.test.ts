import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const CSS = read('../../../shared/styles/sidebar-app.css');
const VIEW = read('Sidebar.tsx');

describe('hero 里那颗「选择工作区」：只跟着自定义左栏藏', () => {
  it('★ 官方档（.wb-root 不在场）还给 dsh 自己那颗按钮', () => {
    expect(CSS).toContain('html:has(.wb-root) button[class$=_workspace]');
    expect(CSS).not.toMatch(/^button\[class\$=_workspace\]/m);
  });

  it('★ 那个标记就是自定义左栏的根，不另造一个', () => {
    expect(VIEW).toContain("'wb-root'");
  });
});

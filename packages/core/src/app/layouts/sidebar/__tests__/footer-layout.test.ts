import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const SHELL = read('FooterAction.module.css');
const SHELL_TSX = read('FooterAction.tsx');
const SHELL_SHEET = read('../../../shared/styles/sidebar.css');

describe('左栏底部那两颗状态：各自占一行', () => {
  it('★★ 录制与调试各占一行（同一格外壳：那一格撑满一行 + 外壳容器可换行）', () => {
    expect(SHELL, '那一格的 .slot 要撑满一行').toMatch(/\.slot\s*\{[^}]*flex:\s*0 0 100%/);
    expect(SHELL, '那一格里的块也要撑满一行').toMatch(/\.slot > \*\s*\{[^}]*flex:\s*0 0 100%/);
    expect(SHELL_TSX, '两颗状态共用同一格外壳').toContain('styles.slot');
    expect(SHELL_SHEET).toContain('.wb-footerActions{display:flex;flex-wrap:wrap');
  });
});

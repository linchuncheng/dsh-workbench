import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generationDirOf } from '../module-root.js';

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-generation-'));
  roots.push(dir);
  return dir;
}

function writePackage(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name, version: '1.3.1' })}\n`);
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('generationDirOf（正在运行的那一代装在哪）', () => {
  it('按代安装：从包内任意一层文件都能认出 versions/<版本>', () => {
    const root = tempRoot();
    const pkg = join(root, 'node_modules', '@dsh-workbench', 'shared');
    writePackage(pkg, '@dsh-workbench/shared');
    const file = join(pkg, 'dist', 'host', 'supply', 'module-root.js');
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, '');

    expect(generationDirOf(pathToFileURL(file).href)).toBe(root);
  });

  it('从仓库直接链接（不是按代安装）→ 认不出来，返回 undefined', () => {
    const root = tempRoot();
    const pkg = join(root, 'packages', 'shared');
    writePackage(pkg, '@dsh-workbench/shared');
    const file = join(pkg, 'src', 'host', 'supply', 'module-root.ts');
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, '');

    expect(generationDirOf(pathToFileURL(file).href)).toBeUndefined();
  });

  it('不是工作台的包 → 返回 undefined（不去猜）', () => {
    const root = tempRoot();
    const pkg = join(root, 'node_modules', 'other');
    writePackage(pkg, 'other');
    const file = join(pkg, 'index.js');
    writeFileSync(file, '');

    expect(generationDirOf(pathToFileURL(file).href)).toBeUndefined();
  });
});

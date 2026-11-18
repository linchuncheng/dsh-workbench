import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PnpmConfigError,
  workspaceDeclarationIn,
  workspaceDeclarationOf,
  workspaceDirsOf,
} from '../pnpm-workspace.js';

const roots: string[] = [];

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-wb-pnpm-workspace-'));
  roots.push(root);
  return root;
}

function dirsOf(root: string, paths: readonly string[]): void {
  for (const path of paths) mkdirSync(join(root, path), { recursive: true });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('workspaceDeclarationOf：pnpm-workspace.yaml 的 packages', () => {
  it('块列表：pattern 原样，! 排除不丢', () => {
    expect(workspaceDeclarationOf(fixture('workspace/block.yaml'))).toEqual({
      declared: true,
      patterns: ['packages/*', '!packages/fixture-*'],
      empty: false,
    });
  });

  it('行内数组、引号、CRLF、注释都归一到同一份 patterns', () => {
    expect(workspaceDeclarationOf(fixture('workspace/flow.yaml')).patterns).toEqual([
      'apps/*',
      '!**/fixtures/**',
    ]);
    expect(workspaceDeclarationOf(fixture('workspace/quoted.yaml')).patterns).toEqual([
      '@scope/*',
      './tools/legacy',
    ]);
    expect(workspaceDeclarationOf(fixture('workspace/crlf.yaml')).patterns).toEqual(['packages/*']);
    expect(workspaceDeclarationOf(fixture('workspace/comments.yaml')).patterns).toEqual(['packages/*']);
  });

  it('花括号交给 glob，不在这里拒绝', () => {
    expect(workspaceDeclarationOf(fixture('workspace/braces.yaml')).patterns).toEqual(['{packages,apps}/*']);
  });

  it('显式空数组：declared 但 empty', () => {
    expect(workspaceDeclarationOf(fixture('workspace/empty.yaml'))).toEqual({
      declared: true,
      patterns: [],
      empty: true,
    });
  });

  it('没有 packages：没声明', () => {
    expect(workspaceDeclarationOf('catalog:\n  react: ^19.0.0\n')).toEqual({
      declared: false,
      patterns: [],
      empty: false,
    });
  });

  it('空文件 / 只有注释：没声明', () => {
    expect(workspaceDeclarationOf('').declared).toBe(false);
    expect(workspaceDeclarationOf('# 只有注释\n').declared).toBe(false);
  });

  it('非法 YAML：unparsable，消息带原因', () => {
    try {
      workspaceDeclarationOf(fixture('workspace/invalid.yaml'));
      throw new Error('应该抛');
    } catch (error) {
      expect(error).toBeInstanceOf(PnpmConfigError);
      expect((error as PnpmConfigError).code).toBe('unparsable');
      expect((error as PnpmConfigError).message).toContain('pnpm-workspace.yaml');
    }
  });

  it('packages 不是字符串列表：unsupported-shape，点名第几项', () => {
    try {
      workspaceDeclarationOf('packages:\n  - 42\n');
      throw new Error('应该抛');
    } catch (error) {
      expect(error).toBeInstanceOf(PnpmConfigError);
      expect((error as PnpmConfigError).code).toBe('unsupported-shape');
      expect((error as PnpmConfigError).message).toContain('packages[0]');
    }
  });

  it('packages 写成对象：unsupported-shape', () => {
    expect(() => workspaceDeclarationOf('packages:\n  app: apps/*\n')).toThrowError(PnpmConfigError);
  });
});

describe('workspaceDeclarationIn：pnpm 文件优先，package.json 兜底', () => {
  it('有 pnpm-workspace.yaml 就只认它', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n', 'utf8');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }), 'utf8');
    expect(workspaceDeclarationIn(root).patterns).toEqual(['packages/*']);
  });

  it('没有 pnpm 文件时读 package.json 的 workspaces 数组与对象两种写法', () => {
    const flat = tempRoot();
    writeFileSync(join(flat, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }), 'utf8');
    expect(workspaceDeclarationIn(flat)).toEqual({ declared: true, patterns: ['apps/*'], empty: false });

    const nested = tempRoot();
    writeFileSync(
      join(nested, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['tools/*'] } }),
      'utf8',
    );
    expect(workspaceDeclarationIn(nested).patterns).toEqual(['tools/*']);
  });

  it('都没有：没声明，不猜 packages/', () => {
    expect(workspaceDeclarationIn(tempRoot())).toEqual({ declared: false, patterns: [], empty: false });
  });
});

describe('workspaceDirsOf：glob 展开', () => {
  it('* 只返回目录，按路径排序', () => {
    const root = tempRoot();
    dirsOf(root, ['packages/a', 'packages/b', 'apps/c', 'packages/node_modules/x']);
    expect(workspaceDirsOf(root, ['packages/*'])).toEqual([join(root, 'packages/a'), join(root, 'packages/b')]);
  });

  it('! 排除生效', () => {
    const root = tempRoot();
    dirsOf(root, ['packages/a', 'packages/b']);
    expect(workspaceDirsOf(root, ['packages/*', '!packages/b'])).toEqual([join(root, 'packages/a')]);
  });

  it('{a,b} 与 ** 都能展开', () => {
    const root = tempRoot();
    dirsOf(root, ['packages/a', 'apps/c', 'deep/nested/d']);
    expect(workspaceDirsOf(root, ['{packages,apps}/*'])).toEqual([
      join(root, 'apps/c'),
      join(root, 'packages/a'),
    ]);
    expect(workspaceDirsOf(root, ['deep/**'])).toContain(join(root, 'deep/nested/d'));
  });

  it('. 就是根目录；不存在的目录不返回', () => {
    const root = tempRoot();
    expect(workspaceDirsOf(root, ['.'])).toEqual([root]);
    expect(workspaceDirsOf(root, ['missing/*'])).toEqual([]);
  });

  it('同一个目录被多个 pattern 命中时只留一条', () => {
    const root = tempRoot();
    dirsOf(root, ['packages/a']);
    expect(workspaceDirsOf(root, ['packages/*', 'packages/a'])).toEqual([join(root, 'packages/a')]);
  });

  it('软链到工作区外的目录也返回，由调用方判 insideRoot', () => {
    const root = tempRoot();
    const outside = tempRoot();
    dirsOf(root, ['packages']);
    mkdirSync(join(outside, 'pkg'), { recursive: true });
    symlinkSync(join(outside, 'pkg'), join(root, 'packages', 'linked'), 'dir');
    expect(workspaceDirsOf(root, ['packages/*'])).toEqual([join(root, 'packages', 'linked')]);
  });
});

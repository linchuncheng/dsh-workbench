import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageRootOf(moduleUrl: string): string {
  return dirname(dirname(dirname(fileURLToPath(moduleUrl))));
}

function workbenchPackageRoot(moduleUrl: string): string | undefined {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { readonly name?: unknown }).name;
        if (typeof name === 'string' && name.startsWith('@dsh-workbench/')) return dir;
      } catch {
        return undefined;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * 正在运行的那一代工作台装在哪：从某个工作台包往上认出包根，再认 `node_modules/@dsh-workbench`。
 * @param moduleUrl 包内某个模块的 `import.meta.url`。
 * @returns `versions/<版本>` 目录；从仓库直接链接、不是按代安装时返回 `undefined`。
 */
export function generationDirOf(moduleUrl: string): string | undefined {
  const root = workbenchPackageRoot(moduleUrl);
  if (root === undefined) return undefined;
  const scope = dirname(root);
  if (basename(scope) !== '@dsh-workbench') return undefined;
  const modules = dirname(scope);
  return basename(modules) === 'node_modules' ? dirname(modules) : undefined;
}

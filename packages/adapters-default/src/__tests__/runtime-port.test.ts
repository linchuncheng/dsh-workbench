import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runtimeSeedPaths } from '@dsh-workbench/adapter-probe';
import { libsBinDir } from '@dsh-workbench/adapter-runtime';
import { createRuntimePort, prependRuntimePath, runtimePathDirs } from '../runtime-port.js';

describe('运行时上 PATH：顺序就是优先级', () => {
  it('★ 自己那份 opencli 排最前，共用依赖其次，入口目录最后', () => {
    expect(runtimePathDirs(runtimeSeedPaths('/dsh/workbench'))).toEqual([
      join('/dsh/workbench', 'opencli', 'bin'),
      libsBinDir(),
      join('/dsh/workbench', 'bin'),
    ]);
  });

  it('★ 前插之后，子进程按名字找 opencli 命中的是运行时那份', () => {
    const env = { PATH: `/usr/bin${delimiter}/bin` };
    prependRuntimePath(runtimeSeedPaths('/dsh/workbench'), env);

    expect(env.PATH.split(delimiter).slice(0, 3)).toEqual([
      join('/dsh/workbench', 'opencli', 'bin'),
      libsBinDir(),
      join('/dsh/workbench', 'bin'),
    ]);
  });

  it('PATH 已经接好了就不重复插（不越跑越长）', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(prependRuntimePath(runtimeSeedPaths('/dsh/workbench'), env)).toHaveLength(3);
    expect(prependRuntimePath(runtimeSeedPaths('/dsh/workbench'), env)).toEqual([]);
    expect(env.PATH?.split(delimiter)).toHaveLength(3);
  });
});
describe('浏览器扩展：端口只做转交', () => {
  const roots: string[] = [];

  function temp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wb-port-ext-'));
    roots.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('★ env 指到有效目录 → 直接返回它，不碰稳定目录', () => {
    const asked = temp();
    writeFileSync(join(asked, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '1.0.99' }));
    const stable = join(temp(), 'extension');
    const port = createRuntimePort({
      extension: { env: { DSH_WB_OPENCLI_EXTENSION: asked }, stableDir: stable, bundledDir: join(asked, 'nope') },
    });

    const found = port.browserExtension?.({} as never);

    expect(found).toEqual({ dir: asked, version: '1.0.99', source: 'env' });
    expect(existsSync(stable)).toBe(false);
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtinCommandsOf, builtinMissingOf } from '../builtin-catalog.js';

function catalogOf(entries: readonly unknown[]): ReadonlyMap<string, readonly string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-builtin-'));
  const file = join(dir, 'cli-manifest.json');
  writeFileSync(file, JSON.stringify(entries));
  return builtinCommandsOf(file);
}

const builtin = { kind: 'builtin' as const };

describe('builtinMissingOf', () => {
  it('站点与命令都在 → 不缺', () => {
    const catalog = catalogOf([{ site: 'zhihu', name: 'hot' }]);
    expect(
      builtinMissingOf([{ kind: 'extension', runtime: 'opencli', name: 'zhihu', commands: ['hot'], purpose: '测试', sources: [builtin] }], catalog),
    ).toEqual([]);
  });

  it('清单里没有这个站点 → 缺', () => {
    const catalog = catalogOf([{ site: 'zhihu', name: 'hot' }]);
    expect(
      builtinMissingOf([{ kind: 'extension', runtime: 'opencli', name: 'weibo', commands: ['hot'], purpose: '测试', sources: [builtin] }], catalog),
    ).toEqual(['weibo']);
  });

  it('站点在、命令不在 → 缺', () => {
    const catalog = catalogOf([{ site: 'zhihu', name: 'hot' }]);
    expect(
      builtinMissingOf([{ kind: 'extension', runtime: 'opencli', name: 'zhihu', commands: ['search'], purpose: '测试', sources: [builtin] }], catalog),
    ).toEqual(['zhihu']);
  });

  it('没声明 builtin 来源的不算（那是别人的安装路径）', () => {
    const catalog = catalogOf([]);
    expect(
      builtinMissingOf([{ kind: 'extension', runtime: 'opencli', name: 'coding', purpose: '测试', sources: [{ kind: 'npm', package: 'opencli-plugin-coding' }] }], catalog),
    ).toEqual([]);
  });
});

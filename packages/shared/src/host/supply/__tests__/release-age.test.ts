import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureReleaseAge, releaseAgeFileOf, withReleaseAge, withReleaseAgeScopes } from '../release-age.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-release-age-'));

const PACKAGES = ['@dsh-workbench/core', '@dsh-workbench/shared'];

const WORKSPACE = [
  'packages:',
  '  - .',
  '',
  'nodeLinker: hoisted',
  'autoInstallPeers: false',
  'minimumReleaseAgeExclude:',
  "  - '@dsh-workbench/core@1.2.3'",
  "  - '@dsh-workbench/shared@1.2.3 || 1.2.4'",
  '',
].join('\n');

describe('pnpm 冷却期豁免：把当前这一版补进名单', () => {
  it('已有的包就地追加版本，别的键原样不动', () => {
    const text = withReleaseAge('1.2.9', PACKAGES, WORKSPACE);
    expect(text).toContain("  - '@dsh-workbench/core@1.2.3 || 1.2.9'");
    expect(text).toContain("  - '@dsh-workbench/shared@1.2.3 || 1.2.4 || 1.2.9'");
    expect(text).toContain('nodeLinker: hoisted');
    expect(text).toContain('packages:\n  - .');
  });

  it('★ 名单里没有这个包 → 补一行；名单整个没有 → 补一段', () => {
    const added = withReleaseAge('1.2.9', PACKAGES, WORKSPACE);
    expect(added.split('\n').filter((line) => line.includes('@dsh-workbench/core@')).length).toBe(1);

    const fresh = withReleaseAge('1.2.9', PACKAGES, 'packages:\n  - .\n');
    expect(fresh).toContain('minimumReleaseAgeExclude:');
    expect(fresh).toContain("  - '@dsh-workbench/core@1.2.9'");
    expect(fresh).toContain("  - '@dsh-workbench/shared@1.2.9'");
  });

  it('同一个版本写两遍等于写一遍', () => {
    const once = withReleaseAge('1.2.9', PACKAGES, WORKSPACE);
    expect(withReleaseAge('1.2.9', PACKAGES, once)).toBe(once);
  });

  it('★ 文件不在就不造：返回 false，也不落文件', () => {
    const dir = mkdtempSync(join(ROOT, 'none-'));
    expect(ensureReleaseAge({ dir, packages: PACKAGES })).toBe(false);
    expect(existsSync(releaseAgeFileOf(dir))).toBe(false);
  });

  it('★ 文件在 → 补一条 scope 通配就够，第二次没有变化就不再写', () => {
    const dir = mkdtempSync(join(ROOT, 'profile-'));
    writeFileSync(releaseAgeFileOf(dir), WORKSPACE, 'utf8');

    expect(ensureReleaseAge({ dir, packages: PACKAGES })).toBe(true);
    expect(readFileSync(releaseAgeFileOf(dir), 'utf8')).toContain("  - '@dsh-workbench/*'");
    expect(ensureReleaseAge({ dir, packages: PACKAGES })).toBe(false);
  });

  it('flow 写法先转块再补，不写坏 YAML', () => {
    const flow = ['packages:', '  - .', "minimumReleaseAgeExclude: ['@dsh-workbench/core@1.2.3']", ''].join('\n');
    const out = withReleaseAge('1.2.9', PACKAGES, flow);
    expect(out).toContain("  - '@dsh-workbench/core@1.2.3 || 1.2.9'");
    expect(out).toContain("  - '@dsh-workbench/shared@1.2.9'");
    expect(out).not.toContain('[');
    expect(withReleaseAge('1.2.9', PACKAGES, out)).toBe(out);
  });

  it('注释不因追加而丢', () => {
    const commented = [
      '# 顶注',
      'packages:',
      '  - .',
      '',
      'minimumReleaseAgeExclude:',
      "  - '@dsh-workbench/core@1.2.3' # 行内注",
      '',
    ].join('\n');
    const out = withReleaseAge('1.2.9', PACKAGES, commented);
    expect(out).toContain('# 顶注');
    expect(out).toContain('# 行内注');
    expect(out).toContain("  - '@dsh-workbench/shared@1.2.9'");
  });

  it('名单写成字符串：明确报块列表，不猜', () => {
    expect(() => withReleaseAge('1.2.9', PACKAGES, "minimumReleaseAgeExclude: '@x@1.0.0'\n")).toThrow(/块列表/);
  });

  it('坏 YAML 的 ensure 不抛，返回 false', () => {
    const dir = mkdtempSync(join(ROOT, 'broken-'));
    writeFileSync(releaseAgeFileOf(dir), 'minimumReleaseAgeExclude: [\n', 'utf8');
    expect(ensureReleaseAge({ dir, packages: PACKAGES })).toBe(false);
  });

  it('scope 通配只写一条；换了 scope 才补新的', () => {
    const once = withReleaseAgeScopes(['@dsh-workbench/*', '@dsh-workbench/*'], WORKSPACE);
    expect(once.split('\n').filter((line) => line.trim() === "- '@dsh-workbench/*'").length).toBe(1);
    expect(once).toBe(withReleaseAgeScopes(['@dsh-workbench/*'], once));
  });
});

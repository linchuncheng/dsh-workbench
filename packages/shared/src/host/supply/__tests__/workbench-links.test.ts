import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reconcileWorkbenchLinks } from '../workbench-links.js';

const PKGS = ['core', 'shared'] as const;

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-links-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writePackage(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version })}\n`);
}

interface Fixture {
  readonly root: string;
  readonly profile: string;
  readonly versions: Readonly<Record<'old' | 'new', string>>;
}

function fixture(options: { lock?: boolean; oldAsDir?: boolean } = {}): Fixture {
  const root = tempRoot();
  const profile = join(root, 'profiles', 'desktop');
  const old = join(root, 'workbench', 'versions', '1.3.0');
  const next = join(root, 'workbench', 'versions', '1.3.1');
  for (const pkg of PKGS) {
    writePackage(join(old, 'node_modules', '@dsh-workbench', pkg), '1.3.0');
    writePackage(join(next, 'node_modules', '@dsh-workbench', pkg), '1.3.1');
  }
  mkdirSync(join(profile, 'node_modules', '@dsh-workbench'), { recursive: true });
  const dependencies: Record<string, string> = {};
  for (const pkg of PKGS) {
    dependencies[`@dsh-workbench/${pkg}`] =
      `link:../../workbench/versions/1.3.0/node_modules/@dsh-workbench/${pkg}`;
    const link = join(profile, 'node_modules', '@dsh-workbench', pkg);
    if (options.oldAsDir === true) {
      writePackage(join(link, ''), '1.3.0');
    } else {
      symlinkSync(
        `../../../../workbench/versions/1.3.0/node_modules/@dsh-workbench/${pkg}`,
        link,
      );
    }
  }
  writeFileSync(
    join(profile, 'package.json'),
    `${JSON.stringify({ name: 'dsh-profile-desktop', dependencies }, undefined, 2)}\n`,
  );
  if (options.lock !== false) {
    const entries = PKGS.map(
      (pkg) =>
        `      '@dsh-workbench/${pkg}':\n` +
        `        specifier: link:../../../workbench/versions/1.3.0/node_modules/@dsh-workbench/${pkg}\n` +
        `        version: link:../../../workbench/versions/1.3.0/node_modules/@dsh-workbench/${pkg}`,
    ).join('\n');
    writeFileSync(
      join(profile, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n${entries}\n`,
    );
  }
  return { root, profile, versions: { old, new: next } };
}

function manifestSpecs(profile: string): Record<string, string> {
  return JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dependencies as Record<string, string>;
}

describe('reconcileWorkbenchLinks（换版时把清单、锁、软链一起对齐）', () => {
  it('★ 清单 / 锁 / 软链都指向旧的一代 → 三处一起换成新的一代', () => {
    const { profile, versions } = fixture();

    const result = reconcileWorkbenchLinks({ profileDir: profile, versionDir: versions.new });

    expect(result.changed).toEqual(['@dsh-workbench/core', '@dsh-workbench/shared']);
    expect(result.unsupported).toEqual([]);
    const specs = manifestSpecs(profile);
    const lock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8');
    for (const pkg of PKGS) {
      const wanted = `link:../../workbench/versions/1.3.1/node_modules/@dsh-workbench/${pkg}`;
      expect(specs[`@dsh-workbench/${pkg}`]).toBe(wanted);
      expect(lock).toContain(`specifier: ${wanted}`);
      expect(lock).toContain(`version: ${wanted}`);
      const link = join(profile, 'node_modules', '@dsh-workbench', pkg);
      expect(resolve(dirname(link), readlinkSync(link))).toBe(
        resolve(profile, `../../workbench/versions/1.3.1/node_modules/@dsh-workbench/${pkg}`),
      );
    }
  });

  it('★ 已经一致 → 什么都不改（幂等）', () => {
    const { profile, versions } = fixture();
    reconcileWorkbenchLinks({ profileDir: profile, versionDir: versions.new });

    const again = reconcileWorkbenchLinks({ profileDir: profile, versionDir: versions.new });

    expect(again.changed).toEqual([]);
    expect(again.unsupported).toEqual([]);
  });

  it('没有锁文件 → 只改清单和软链，不造一个锁出来', () => {
    const { profile, versions } = fixture({ lock: false });

    const result = reconcileWorkbenchLinks({ profileDir: profile, versionDir: versions.new });

    expect(result.changed).toEqual(['@dsh-workbench/core', '@dsh-workbench/shared']);
    expect(existsSync(join(profile, 'pnpm-lock.yaml'))).toBe(false);
    expect(manifestSpecs(profile)['@dsh-workbench/core']).toContain('versions/1.3.1/');
  });

  it('node_modules 里是真目录、不是软链 → 记进 unsupported，不动它', () => {
    const { profile, versions } = fixture({ oldAsDir: true });

    const result = reconcileWorkbenchLinks({ profileDir: profile, versionDir: versions.new });

    expect(result.unsupported).toEqual(['@dsh-workbench/core', '@dsh-workbench/shared']);
    expect(result.changed).toEqual([]);
    expect(manifestSpecs(profile)['@dsh-workbench/core']).toContain('versions/1.3.0/');
  });

  it('要切换过去的那一代里没有这族包 → 一个字节都不动', () => {
    const { root, profile } = fixture();

    const result = reconcileWorkbenchLinks({ profileDir: profile, versionDir: join(root, 'workbench', 'versions', '9.9.9') });

    expect(result.changed).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(manifestSpecs(profile)['@dsh-workbench/core']).toContain('versions/1.3.0/');
  });
});

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acquireUpdateLease,
  linkDir,
  readUpdateJournal,
  recoverUpdateJournal,
  restoreUpdateJournal,
  rollForward,
  updateJournalFile,
  writeUpdateJournal,
  writeJsonFile,
  type LinkFn,
  type UpdateJournalRecord,
} from '@dsh-workbench/shared/host';
import {
  carryPreviousVersion,
  flipProfileLinks,
  installVersionDir,
  isManagedLinkSpec,
  previousVersionLinksOf,
  versionLinksOf,
  versionProjectFiles,
  versionSelfCheck,
  writeProfileLinks,
} from '../version-dir.js';
import { switchJournalOf } from '../version-switch.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-version-switch-'));
const V1 = '1.2.3-beta.2';
const V2 = '1.2.3-beta.3';
const PACKAGES = ['@dsh-workbench/core', '@dsh-workbench/shared'];
const ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'];

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function caseDir(): string {
  return mkdtempSync(join(ROOT, 'case-'));
}

function writePackage(dir: string, pkg: string, version: string): string {
  const pkgDir = join(dir, 'node_modules', pkg);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: pkg, version }), 'utf8');
  return pkgDir;
}

function fakeVersionDir(versionsDir: string, version: string): string {
  const dir = join(versionsDir, version);
  for (const pkg of PACKAGES) writePackage(dir, pkg, version);
  for (const artifact of ARTIFACTS) {
    const file = join(dir, 'node_modules', '@dsh-workbench/core', artifact);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, version, 'utf8');
  }
  return dir;
}

function fakeProfile(): string {
  const dir = mkdtempSync(join(ROOT, 'profile-'));
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dsh-profile-probe',
        private: true,
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@dsh-workbench/core'] } },
        dependencies: {
          '@dsh-workbench/core': V1,
          '@dsh-workbench/shared': V1,
          '@pagoda-dsh-workbench/module-cmdb': '1.1.5',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
}

function projectOf(profileDir: string, versionsDir: string, version: string) {
  return versionProjectFiles({ profileDir, versionsDir, version, packages: PACKAGES });
}

describe('版本目录：自检与安装', () => {
  it('自检：七个包与客户端产物齐了才算好；缺一个就不算', () => {
    const versionsDir = join(caseDir(), 'versions');
    const dir = fakeVersionDir(versionsDir, V2);
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(true);
    expect(versionSelfCheck({ versionDir: dir, version: V1, packages: PACKAGES })).toBe(false);
    rmSync(join(dir, 'node_modules', '@dsh-workbench/shared'), { recursive: true, force: true });
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(false);
    fakeVersionDir(versionsDir, V2);
    rmSync(join(dir, 'node_modules', '@dsh-workbench/core', 'client.js'));
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(false);
  });

  it('第一遍就装好：不重装、只跑一遍', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    const run = async () => {
      fakeVersionDir(versionsDir, V2);
      return { ok: true, detail: '+ 工作台 7 个包' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(result).toEqual({ ok: true, detail: '+ 工作台 7 个包', reinstalled: false });
    expect(existsSync(join(project.dir, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('第一遍"成功"但读不到：清掉重装一遍，只清一次', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    let sawLeftover = false;
    const run = async () => {
      calls += 1;
      if (calls === 1) {
        mkdirSync(join(project.dir, 'node_modules'), { recursive: true });
        writeFileSync(join(project.dir, 'node_modules', 'leftover.txt'), 'first', 'utf8');
        return { ok: true, detail: '第一遍的输出' };
      }
      sawLeftover = existsSync(join(project.dir, 'node_modules', 'leftover.txt'));
      fakeVersionDir(versionsDir, V2);
      return { ok: true, detail: '第二遍的输出' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(2);
    expect(sawLeftover).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('工作台包 装了两遍');
    expect(result.detail).toContain('清掉 node_modules 重装后装好了');
    expect(result.detail).toContain('第一遍的输出');
    expect(result.detail).toContain('第二遍的输出');
  });

  it('两遍都撞 store 对不上：如实说没装上，且不再跑第三遍', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { ok: false, detail: calls === 1 ? 'ERR_PNPM_UNEXPECTED_STORE  expected /a, got /b' : 'ERR_PNPM_UNEXPECTED_STORE  still wrong' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('还是没装上');
    expect(result.detail).toContain('still wrong');
  });

  it('第一遍就失败但不是 store 对不上：原样返回，不重装', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { ok: false, detail: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@dsh-workbench%2Fcore' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(1);
    expect(result).toEqual({
      ok: false,
      detail: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@dsh-workbench%2Fcore',
      reinstalled: false,
    });
  });
});

describe('翻链：只换指针，不碰旧版本目录', () => {
  it('换到新版：node_modules 里是链接，旧版本目录一个字节不动', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const oldManifests = PACKAGES.map((pkg) => join(versionsDir, V1, 'node_modules', pkg, 'package.json'));
    const before = oldManifests.map((file) => statSync(file).mtimeMs);

    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));

    for (const pkg of PACKAGES) {
      const link = join(profileDir, 'node_modules', pkg);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8'))).toEqual({ name: pkg, version: V2 });
    }
    expect(oldManifests.map((file) => statSync(file).mtimeMs)).toEqual(before);
    expect(JSON.parse(readFileSync(oldManifests[0] ?? '', 'utf8'))).toEqual({ name: '@dsh-workbench/core', version: V1 });
  });

  it('翻回旧版：链接回来，新版本目录也还在', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V1), packages: PACKAGES }));
    for (const pkg of PACKAGES) {
      const link = join(profileDir, 'node_modules', pkg);
      expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')).version).toBe(V1);
    }
    expect(existsSync(join(versionsDir, V2, 'node_modules', '@dsh-workbench/core', 'client.js'))).toBe(true);
  });

  it('依赖那几行改成 link:，别人的行与 bundles 一个字不动；写两遍幂等', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const links = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES });
    writeProfileLinks({ profileDir, links });
    const first = readFileSync(join(profileDir, 'package.json'), 'utf8');
    writeProfileLinks({ profileDir, links });
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(first);

    const manifest = JSON.parse(first) as {
      dependencies: Record<string, string>;
      dsh: { profile: { bundles: readonly string[] } };
    };
    for (const link of links) {
      expect(manifest.dependencies[link.pkg]).toBe(link.spec);
      expect(link.spec.startsWith('link:')).toBe(true);
      expect(isManagedLinkSpec(link.spec, versionsDir, profileDir)).toBe(true);
    }
    expect(manifest.dependencies['@pagoda-dsh-workbench/module-cmdb']).toBe('1.1.5');
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@dsh-workbench/core',
    ]);
  });

  it('只认自己管的版本目录：指向仓库的开发副本被拒', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const managed = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES })[0];
    expect(isManagedLinkSpec(managed?.spec ?? '', versionsDir, profileDir)).toBe(true);
    expect(isManagedLinkSpec('link:../../../../项目/个人项目/dsh-workbench/packages/core', versionsDir, profileDir)).toBe(false);
    expect(isManagedLinkSpec(`link:${['..', 'elsewhere', 'core'].join('/')}`, versionsDir, profileDir)).toBe(false);
    expect(isManagedLinkSpec(V2, versionsDir, profileDir)).toBe(false);
  });
});

describe('迁移现场：真目录先搬进版本目录，回退才翻得回去', () => {
  const V0 = '1.2.3-beta.1';

  it('真目录搬进版本目录；已经是链接的那条不动', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const older = join(versionsDir, V0, 'node_modules', PACKAGES[1] as string);
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, 'package.json'), JSON.stringify({ name: PACKAGES[1], version: V0 }), 'utf8');
    writePackage(profileDir, PACKAGES[0] as string, V1);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V0), packages: [PACKAGES[1] as string] }));

    const moved = carryPreviousVersion({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    expect(moved).toEqual([PACKAGES[0]]);
    const kept = join(versionsDir, V0, 'node_modules', PACKAGES[0] as string, 'package.json');
    expect(JSON.parse(readFileSync(kept, 'utf8')).version).toBe(V1);
    expect(existsSync(join(profileDir, 'node_modules', PACKAGES[0] as string))).toBe(false);
    expect(lstatSync(join(profileDir, 'node_modules', PACKAGES[1] as string)).isSymbolicLink()).toBe(true);
    expect(existsSync(join(versionsDir, V0, 'package.json'))).toBe(true);
  });

  it('回退那七条按现场算：真目录落进版本目录，已有的链接回自己那条', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const older = join(versionsDir, V0, 'node_modules', PACKAGES[1] as string);
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, 'package.json'), JSON.stringify({ name: PACKAGES[1], version: V0 }), 'utf8');
    writePackage(profileDir, PACKAGES[0] as string, V1);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V0), packages: [PACKAGES[1] as string] }));
    carryPreviousVersion({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    const links = previousVersionLinksOf({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    expect(links.map((link) => link.target)).toEqual([
      join(versionsDir, V0, 'node_modules', PACKAGES[0] as string),
      join(versionsDir, V0, 'node_modules', PACKAGES[1] as string),
    ]);
    for (const link of links) expect(existsSync(link.target)).toBe(true);
  });
});

function linkedProfile(versionsDir: string, version: string): string {
  const profileDir = fakeProfile();
  flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, version), packages: PACKAGES }));
  return profileDir;
}

function linkedVersion(profileDir: string, pkg: string): string {
  return JSON.parse(readFileSync(join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8')).version as string;
}

function journalFor(profileDir: string, versionsDir: string, from: string, to: string): UpdateJournalRecord {
  return switchJournalOf({
    profileDir,
    versionsDir,
    versionDir: join(versionsDir, to),
    from,
    to,
    links: versionLinksOf({ profileDir, versionDir: join(versionsDir, to), packages: PACKAGES }),
    at: '2026-11-14T10:00:00.000Z',
  });
}

describe('换版事务日志：快照先落盘，失败按快照恢复', () => {
  it('换链换到一半：链接回到旧版、清单原样不动、日志清掉', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const manifestBefore = readFileSync(join(profileDir, 'package.json'), 'utf8');
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    writeUpdateJournal(journalPath, record);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }).slice(0, 1));

    const restored = restoreUpdateJournal({
      record: { ...record, state: 'flipping', cursor: 1 },
      file: journalPath,
    });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) expect(linkedVersion(profileDir, pkg)).toBe(V1);
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(manifestBefore);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('清单已经改成新版：回滚只回写被接管的依赖，等待期间新增的依赖保留', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const manifestBefore = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    writeUpdateJournal(journalPath, record);

    // 模拟已经走到写清单这一步：链接与清单都指到 V2
    const links = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES });
    flipProfileLinks(links);
    writeProfileLinks({ profileDir, links });
    // 等待期间用户装了新插件，回滚不能把它吞掉
    const manifestNow = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    writeJsonFile(join(profileDir, 'package.json'), {
      ...manifestNow,
      dependencies: { ...manifestNow.dependencies, '@pagoda-dsh-workbench/module-new': '2.0.0' },
    });

    const restored = restoreUpdateJournal({ record: { ...record, state: 'manifest' }, file: journalPath });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) expect(linkedVersion(profileDir, pkg)).toBe(V1);
    const after = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const pkg of PACKAGES) expect(after.dependencies[pkg]).toBe(manifestBefore.dependencies[pkg]);
    expect(after.dependencies['@pagoda-dsh-workbench/module-new']).toBe('2.0.0');
    expect(existsSync(journalPath)).toBe(false);
  });

  it('更新前没有这条依赖：回滚要把它删掉，而不是留成 null', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const manifestPath = join(profileDir, 'package.json');
    const before = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    delete before.dependencies['@dsh-workbench/shared'];
    writeJsonFile(manifestPath, before);
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    writeUpdateJournal(journalPath, record);
    expect(record.manifestDeps?.['@dsh-workbench/shared']).toBeNull();

    const links = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES });
    flipProfileLinks(links);
    writeProfileLinks({ profileDir, links });
    const restored = restoreUpdateJournal({ record: { ...record, state: 'manifest' }, file: journalPath });

    expect(restored.ok).toBe(true);
    const after = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    expect(after.dependencies).not.toHaveProperty('@dsh-workbench/shared');
    expect(after.dependencies).toHaveProperty('@dsh-workbench/core');
    expect(existsSync(journalPath)).toBe(false);
  });

  it('★ 前滚中途有一条换链失败：已经换过的那条按快照退回，现场不留半截', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    // 第二条链接的父路径做成普通文件，linkDir 一定失败
    writeFileSync(join(profileDir, 'blocked'), 'x', 'utf8');
    const broken = {
      ...record,
      links: record.links.map((link, index) =>
        index === 1 ? { ...link, path: join(profileDir, 'blocked', 'x'), kind: 'missing' as const } : link,
      ),
    };

    const result = rollForward(broken);

    expect(result.ok).toBe(false);
    expect(linkedVersion(profileDir, record.links[0]?.pkg ?? '')).toBe(V1);
  });

  it('★ 前滚第二条换链失败：失败那条也按快照退回', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    const calls: { target: string; path: string }[] = [];
    let attempt = 0;
    const fakeLink: LinkFn = (target, path) => {
      attempt += 1;
      calls.push({ target, path });
      // 第一次换链成功，第二次（失败那条）抛错
      if (attempt === 2) throw new Error('boom');
      linkDir(target, path);
    };

    const result = rollForward(record, fakeLink);

    expect(result.ok).toBe(false);
    for (const pkg of PACKAGES) expect(linkedVersion(profileDir, pkg)).toBe(V1);
    const failed = record.links[1];
    // 失败那条也要有一次“指回旧目标”的回退调用
    expect(
      calls.slice(2).some((call) => call.path === failed?.path && call.target.includes(V1)),
    ).toBe(true);
  });

  it('搬迁过的实目录按快照搬回来，版本目录里的副本不再留着', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const profileDir = fakeProfile();
    for (const pkg of PACKAGES) writePackage(profileDir, pkg, V1);
    fakeVersionDir(versionsDir, V2);
    const journalPath = updateJournalFile(base);
    const record = switchJournalOf({
      profileDir,
      versionsDir,
      versionDir: join(versionsDir, V2),
      from: V1,
      to: V2,
      links: versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }),
      carry: { versionsDir, version: V1, packages: PACKAGES },
      at: '2026-11-14T10:00:00.000Z',
    });
    expect(record.carry).toHaveLength(2);
    writeUpdateJournal(journalPath, record);
    expect(carryPreviousVersion({ profileDir, versionsDir, version: V1, packages: PACKAGES })).toHaveLength(2);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));

    const restored = restoreUpdateJournal({
      record: { ...record, state: 'flipping', cursor: 2, carried: 2 },
      file: journalPath,
    });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) {
      expect(lstatSync(join(profileDir, 'node_modules', pkg)).isDirectory()).toBe(true);
      expect(linkedVersion(profileDir, pkg)).toBe(V1);
    }
    expect(readUpdateJournal(journalPath)).toBeUndefined();
  });

  it('还没搬走的实目录不会被恢复动作删掉', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const profileDir = fakeProfile();
    for (const pkg of PACKAGES) writePackage(profileDir, pkg, V1);
    fakeVersionDir(versionsDir, V2);
    const journalPath = updateJournalFile(base);
    const record = switchJournalOf({
      profileDir,
      versionsDir,
      versionDir: join(versionsDir, V2),
      from: V1,
      to: V2,
      links: versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }),
      carry: { versionsDir, version: V1, packages: PACKAGES },
      at: '2026-11-14T10:00:00.000Z',
    });
    writeUpdateJournal(journalPath, record);

    const restored = restoreUpdateJournal({ record, file: journalPath });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) {
      expect(lstatSync(join(profileDir, 'node_modules', pkg)).isDirectory()).toBe(true);
      expect(linkedVersion(profileDir, pkg)).toBe(V1);
    }
    expect(readUpdateJournal(journalPath)).toBeUndefined();
  });
});

describe('强杀后的恢复规则：只有没提交、目标没启动、快照还在才恢复', () => {
  const AT = '2026-11-14T10:00:00.000Z';

  function caseSetup(): {
    base: string;
    versionsDir: string;
    profileDir: string;
    journalPath: string;
    markerPath: string;
    record: UpdateJournalRecord;
  } {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const markerPath = join(base, 'self-update.json');
    writeJsonFile(markerPath, { state: 'running', from: V1, to: V2, at: AT });
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    writeUpdateJournal(journalPath, record);
    return { base, versionsDir, profileDir, journalPath, markerPath, record };
  }

  it('已提交：只清日志，链接保持新版', () => {
    const setup = caseSetup();
    flipProfileLinks(versionLinksOf({ profileDir: setup.profileDir, versionDir: join(setup.versionsDir, V2), packages: PACKAGES }));
    writeUpdateJournal(setup.journalPath, { ...setup.record, state: 'committed' });

    const recovered = recoverUpdateJournal({ file: setup.journalPath, markerPath: setup.markerPath });

    expect(recovered.kind).toBe('cleared');
    for (const pkg of PACKAGES) expect(linkedVersion(setup.profileDir, pkg)).toBe(V2);
    expect(existsSync(setup.journalPath)).toBe(false);
  });

  it('已确认可用（marker ok）：清日志时不再降回「重启后生效」', () => {
    const setup = caseSetup();
    flipProfileLinks(versionLinksOf({ profileDir: setup.profileDir, versionDir: join(setup.versionsDir, V2), packages: PACKAGES }));
    writeUpdateJournal(setup.journalPath, { ...setup.record, state: 'committed' });
    writeJsonFile(setup.markerPath, { state: 'ok', version: V2, at: AT });

    const recovered = recoverUpdateJournal({ file: setup.journalPath, markerPath: setup.markerPath });

    expect(recovered.kind).toBe('cleared');
    expect(JSON.parse(readFileSync(setup.markerPath, 'utf8'))).toMatchObject({ state: 'ok', version: V2 });
  });

  it('没提交、目标没启动：按快照恢复并标记失败', () => {
    const setup = caseSetup();

    const recovered = recoverUpdateJournal({ file: setup.journalPath, markerPath: setup.markerPath });

    expect(recovered.kind).toBe('restored');
    for (const pkg of PACKAGES) expect(linkedVersion(setup.profileDir, pkg)).toBe(V1);
    expect(existsSync(setup.journalPath)).toBe(false);
    expect(JSON.parse(readFileSync(setup.markerPath, 'utf8'))).toMatchObject({
      state: 'failed',
      version: V1,
      reason: 'incomplete',
    });
  });

  it('目标版本已经启动过：按日志前滚到新版，不留下半截现场', () => {
    const setup = caseSetup();
    // 只有换链开始后才可能“新版真的起来了”
    writeUpdateJournal(setup.journalPath, { ...setup.record, state: 'flipping', cursor: PACKAGES.length });
    const bootFile = join(setup.base, 'self-update-boot.json');
    writeJsonFile(bootFile, { version: V2, at: '2026-11-14T10:05:00.000Z' });

    const recovered = recoverUpdateJournal({ file: setup.journalPath, bootFile, markerPath: setup.markerPath });

    expect(recovered.kind).toBe('cleared');
    for (const pkg of PACKAGES) expect(linkedVersion(setup.profileDir, pkg)).toBe(V2);
    expect(existsSync(setup.journalPath)).toBe(false);
    expect(JSON.parse(readFileSync(setup.markerPath, 'utf8'))).toMatchObject({
      state: 'pending-restart',
      version: V2,
    });
    // 清单也要跟着指到新版，否则下一次 pnpm install 会悄悄把依赖降回旧版
    const manifest = JSON.parse(readFileSync(join(setup.profileDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const pkg of PACKAGES) expect(manifest.dependencies?.[pkg]).toMatch(/^link:/);
  });

  it('还没换链（prepared）即使启动记录是新版：不拿别人的 boot 记录改这份 profile', () => {
    const setup = caseSetup();
    const bootFile = join(setup.base, 'self-update-boot.json');
    writeJsonFile(bootFile, { version: V2, at: '2026-11-14T10:05:00.000Z' });

    const recovered = recoverUpdateJournal({ file: setup.journalPath, bootFile, markerPath: setup.markerPath });

    // 走普通恢复：链接与清单仍指旧版，日志被清掉
    expect(recovered.kind).toBe('restored');
    for (const pkg of PACKAGES) expect(linkedVersion(setup.profileDir, pkg)).toBe(V1);
    expect(existsSync(setup.journalPath)).toBe(false);
  });

  it('快照里的旧目录已经不在了：不猜，保留现场', () => {
    const setup = caseSetup();
    rmSync(join(setup.versionsDir, V1), { recursive: true, force: true });

    const recovered = recoverUpdateJournal({ file: setup.journalPath, markerPath: setup.markerPath });

    expect(recovered.kind).toBe('kept');
    expect(existsSync(setup.journalPath)).toBe(true);
  });

  it('日志损坏或缺字段：当没有日志，一个字节都不动', () => {
    const setup = caseSetup();
    writeFileSync(setup.journalPath, 'not json', 'utf8');
    expect(recoverUpdateJournal({ file: setup.journalPath }).kind).toBe('none');
    expect(readFileSync(setup.journalPath, 'utf8')).toBe('not json');

    const partial = { ...setup.record } as Record<string, unknown>;
    delete partial['manifestText'];
    writeJsonFile(setup.journalPath, partial);
    expect(recoverUpdateJournal({ file: setup.journalPath }).kind).toBe('none');
    // 缺字段的日志一个字都不许改
    expect(JSON.parse(readFileSync(setup.journalPath, 'utf8'))).not.toHaveProperty('manifestText');
  });

  it('★ 更新执行器还活着：恢复点不接手，日志原样留着', () => {
    const setup = caseSetup();
    const lease = acquireUpdateLease({ root: dirname(setup.journalPath) });
    try {
      const recovered = recoverUpdateJournal({ file: setup.journalPath, markerPath: setup.markerPath });
      expect(recovered.kind).toBe('none');
      expect(existsSync(setup.journalPath)).toBe(true);
    } finally {
      lease?.release();
    }
  });

  it('★ 重装同一版：启动记录不代表新版已启动，仍按日志恢复', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    const profileDir = linkedProfile(versionsDir, V1);
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V1);
    writeUpdateJournal(journalPath, record);
    const bootFile = join(base, 'self-update-boot.json');
    writeJsonFile(bootFile, { version: V1, at: '2026-11-14T10:05:00.000Z' });

    const recovered = recoverUpdateJournal({ file: journalPath, bootFile });

    expect(recovered.kind).toBe('restored');
    expect(existsSync(journalPath)).toBe(false);
    for (const pkg of PACKAGES) expect(linkedVersion(profileDir, pkg)).toBe(V1);
  });

  it('相对软链目标按链接目录解析，快照仍算完好', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    const profileDir = fakeProfile();
    const pkg = PACKAGES[0] as string;
    const link = join(profileDir, 'node_modules', pkg);
    mkdirSync(dirname(link), { recursive: true });
    const target = join(versionsDir, V1, 'node_modules', pkg);
    symlinkSync(relative(dirname(link), target), link);
    const journalPath = updateJournalFile(base);
    const record = switchJournalOf({
      profileDir,
      versionsDir,
      versionDir: join(versionsDir, V2),
      from: V1,
      to: V2,
      links: versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: [pkg] }),
      at: '2026-11-14T10:00:00.000Z',
    });
    writeUpdateJournal(journalPath, record);

    const recovered = recoverUpdateJournal({ file: journalPath });

    expect(recovered.kind).toBe('restored');
    expect(existsSync(join(profileDir, 'node_modules', pkg, 'package.json'))).toBe(true);
  });
});

describe('恢复的保守动作：按现场判断，不误删也不误覆盖', () => {
  it('★ 搬迁到一半被强杀：carried 没落盘也要把已搬走的目录搬回', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const profileDir = fakeProfile();
    for (const pkg of PACKAGES) writePackage(profileDir, pkg, V1);
    fakeVersionDir(versionsDir, V2);
    const journalPath = updateJournalFile(base);
    const record = switchJournalOf({
      profileDir,
      versionsDir,
      versionDir: join(versionsDir, V2),
      from: V1,
      to: V2,
      links: versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }),
      carry: { versionsDir, version: V1, packages: PACKAGES },
      at: '2026-11-14T10:00:00.000Z',
    });
    writeUpdateJournal(journalPath, record);
    carryPreviousVersion({ profileDir, versionsDir, version: V1, packages: PACKAGES });
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));

    const restored = restoreUpdateJournal({ record: { ...record, state: 'carrying', carried: 0 }, file: journalPath });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) {
      expect(lstatSync(join(profileDir, 'node_modules', pkg)).isDirectory()).toBe(true);
      expect(linkedVersion(profileDir, pkg)).toBe(V1);
    }
  });

  it('★ 重装同一版失败恢复：链接指回已装好的版本目录，profile 不缺包', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    const profileDir = fakeProfile();
    for (const pkg of PACKAGES) writePackage(profileDir, pkg, V1);
    const journalPath = updateJournalFile(base);
    const record = switchJournalOf({
      profileDir,
      versionsDir,
      versionDir: join(versionsDir, V1),
      from: V1,
      to: V1,
      links: versionLinksOf({ profileDir, versionDir: join(versionsDir, V1), packages: PACKAGES }),
      carry: { versionsDir, version: V1, packages: PACKAGES },
      at: '2026-11-14T10:00:00.000Z',
    });
    expect(record.carry).toHaveLength(0);
    writeUpdateJournal(journalPath, record);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V1), packages: PACKAGES }));

    const restored = restoreUpdateJournal({ record: { ...record, state: 'flipping', cursor: 2 }, file: journalPath });

    expect(restored.ok).toBe(true);
    for (const pkg of PACKAGES) {
      expect(lstatSync(join(profileDir, 'node_modules', pkg)).isSymbolicLink()).toBe(true);
      expect(linkedVersion(profileDir, pkg)).toBe(V1);
    }
  });

  it('★ 还没写到清单就失败：不覆盖等待期间用户改过的清单', () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const profileDir = linkedProfile(versionsDir, V1);
    const journalPath = updateJournalFile(base);
    const record = journalFor(profileDir, versionsDir, V1, V2);
    writeUpdateJournal(journalPath, record);
    const manifestPath = join(profileDir, 'package.json');
    const changed = readFileSync(manifestPath, 'utf8').replace('"dependencies"', '"extra": 1,\n  "dependencies"');
    writeFileSync(manifestPath, changed, 'utf8');

    const restored = restoreUpdateJournal({ record, file: journalPath });

    expect(restored.ok).toBe(true);
    expect(readFileSync(manifestPath, 'utf8')).toBe(changed);
  });
});

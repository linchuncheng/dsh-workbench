import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateJournalFile, writeJsonFile, writeUpdateJournal } from '@dsh-workbench/shared/host';
import { bootChores, noteBoot } from '../boot-chores';

const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-boot-chores-'));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('启动这一拍：先落 boot 记录，再接着排没跑完的更新', () => {
  it('★ 报出自己这一版，并把 boot 记录落进工作台那本目录', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', join(dir, 'workbench'));
    const version = bootChores({
      ctx: {} as never,
      supply: undefined,
      home: dir,
      profileDir: null,
      version: '1.2.3-beta.3',
    });

    expect(version).toBe('1.2.3-beta.3');
    expect(JSON.parse(readFileSync(join(dir, 'workbench', 'self-update-boot.json'), 'utf8'))).toMatchObject({
      version: '1.2.3-beta.3',
      pid: process.pid,
    });
  });

  it('★ 问不到版本（跑在源码上那种）→ 不写记录、也不抛', () => {
    vi.stubEnv('DSH_WORKBENCH_HOME', join(dir, 'nowhere'));
    expect(bootChores({ ctx: {} as never, supply: undefined, home: dir, profileDir: null })).toBeUndefined();
  });
});

describe('启动这一拍点名旧包：还声明 dsh.bundle 的模块', () => {
  it('★ 声明着 dsh.bundle 且已在名单里 → 启动日志点名，提示重发去掉', () => {
    const root = join(dir, 'legacy');
    vi.stubEnv('DSH_WORKBENCH_HOME', join(root, 'workbench'));
    const profileDir = join(root, 'profile');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'package.json'),
      JSON.stringify({
        name: 'p',
        dsh: { profile: { bundles: ['@a/old'] } },
        dependencies: { '@a/old': '1.0.0' },
      }),
      'utf8',
    );
    const lines: string[] = [];
    bootChores({
      ctx: {} as never,
      supply: {
        profileModules: () => [{ pkg: '@a/old', unit: 'old', version: '1.0.0', shipsBundle: true }],
        startSelfUpdate: () => ({ started: false, reason: 'none' }),
      } as never,
      home: root,
      profileDir,
      version: '1.2.3-beta.3',
      log: (line) => lines.push(line),
    });

    expect(lines.join('\n')).toContain('还声明着 dsh.bundle');
    expect(lines.join('\n')).toContain('@a/old');
  });
});

describe('启动期兜底：插件能加载时把换版日志收掉', () => {
  it('★ 已提交的日志只清掉，不动链接与清单', () => {
    const root = join(dir, 'committed');
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const file = updateJournalFile(root);
    writeUpdateJournal(file, {
      schema: 1,
      state: 'committed',
      from: '1.2.3-beta.2',
      to: '1.2.3-beta.3',
      profileDir: join(root, 'profiles', 'workbench'),
      versionsDir: join(root, 'versions'),
      versionDir: join(root, 'versions', '1.2.3-beta.3'),
      manifestPath: join(root, 'profiles', 'workbench', 'package.json'),
      manifestText: '{}\n',
      links: [],
      carry: [],
      cursor: 0,
      carried: 0,
      at: '2026-11-14T10:00:00.000Z',
    });

    expect(noteBoot({ version: '1.2.3-beta.3' })).toBe('1.2.3-beta.3');
    expect(existsSync(file)).toBe(false);
  });

  it('★ 日志损坏：不抛，原样留着', () => {
    const root = join(dir, 'broken');
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const file = updateJournalFile(root);
    writeJsonFile(file, { schema: 1 });

    expect(noteBoot({ version: '1.2.3-beta.3' })).toBe('1.2.3-beta.3');
    expect(existsSync(file)).toBe(true);
  });
});

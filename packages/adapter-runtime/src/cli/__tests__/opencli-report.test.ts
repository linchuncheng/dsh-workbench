import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-report-'));
  roots.push(dir);
  return dir;
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

async function load() {
  vi.resetModules();
  return import('../opencli-report.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('opencli 版本握手', () => {
  it('钉的版本与盘上一致才算握手通过', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      name: '@jackwener/opencli',
      version: '2.0.3',
    });
    writeJson(join(root, 'plugins-npm', 'node_modules', 'opencli-plugin-workbench', 'opencli-plugin.json'), {
      name: 'workbench',
      version: '0.2.0',
    });

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText } = await load();
    const report = opencliVersionReport();

    expect(report.pin).toBe('2.0.3');
    expect(report.cli).toBe('2.0.3');
    expect(report.channel).toBe('0.2.0');
    expect(report.compatible).toBe(true);
    expect(opencliHandshakeOk(report)).toBe(true);
    expect(opencliHandshakeText(report)).toContain('2.0.3');
  });

  it('盘上是别的版本：握手不通过，话里点出两边', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      version: '2.1.0',
    });

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText } = await load();
    const report = opencliVersionReport();

    expect(opencliHandshakeOk(report)).toBe(false);
    expect(opencliHandshakeText(report)).toContain('2.1.0');
    expect(opencliHandshakeText(report)).toContain('2.0.3');
  });

  it('灰度：DSH_WB_OPENCLI_PIN 一设，钉的版本跟着走', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    vi.stubEnv('DSH_WB_OPENCLI_PIN', '3.0.0');
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      version: '3.0.0',
    });

    const { opencliVersionReport, opencliHandshakeOk } = await load();
    const report = opencliVersionReport();

    expect(report.pin).toBe('3.0.0');
    expect(report.compatible).toBe(false);
    expect(opencliHandshakeOk(report)).toBe(false);
  });

  it('隔离运行时没装：握手不通过，话说「还没有」', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText } = await load();
    const report = opencliVersionReport();

    expect(report.cli).toBeUndefined();
    expect(opencliHandshakeOk(report)).toBe(false);
    expect(opencliHandshakeText(report)).toContain('还没有');
  });
});

describe('插件的 peer 范围也要进握手', () => {
  function seed(home: string, peer: string): void {
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      name: '@jackwener/opencli',
      version: '2.0.3',
    });
    writeJson(join(root, 'plugins-npm', 'node_modules', 'opencli-plugin-demo', 'package.json'), {
      name: 'opencli-plugin-demo',
      version: '1.0.0',
      peerDependencies: { '@jackwener/opencli': peer },
    });
  }

  it('★ 插件的范围容得下当前版本 → 不算问题', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    seed(home, '>=2.0.0 <3.0.0');

    const { opencliVersionReport, opencliHandshakeOk } = await load();
    const report = opencliVersionReport();

    expect(report.peerProblems).toEqual([]);
    expect(opencliHandshakeOk(report)).toBe(true);
  });

  it('★ 插件的范围容不下当前版本 → 握手不通过，点名是哪个插件、要哪一段', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    seed(home, '>=3.0.0');

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText, opencliHandshakeNote } =
      await load();
    const report = opencliVersionReport();

    expect(report.peerProblems).toEqual([{ name: 'opencli-plugin-demo', range: '>=3.0.0' }]);
    expect(opencliHandshakeOk(report)).toBe(false);
    expect(opencliHandshakeText(report)).toContain('opencli-plugin-demo');
    expect(opencliHandshakeText(report)).toContain('>=3.0.0');
    expect(opencliHandshakeNote(report).zh).toContain('opencli-plugin-demo');
  });

  it('★ 换 pin 到 3.x：原来合格的插件立刻算问题（换代时能被发现）', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    seed(home, '>=1.8.0 <3.0.0');
    vi.stubEnv('DSH_WB_OPENCLI_PIN', '3.0.0');

    const { opencliVersionReport } = await load();

    expect(opencliVersionReport().peerProblems).toEqual([
      { name: 'opencli-plugin-demo', range: '>=1.8.0 <3.0.0' },
    ]);
  });
});

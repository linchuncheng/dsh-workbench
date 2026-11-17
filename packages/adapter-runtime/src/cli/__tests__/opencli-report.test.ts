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
      version: '1.8.8',
    });
    writeJson(join(root, 'plugins-npm', 'node_modules', 'opencli-plugin-workbench', 'opencli-plugin.json'), {
      name: 'workbench',
      version: '1.3.2',
    });
    writeJson(join(root, 'extension', 'manifest.json'), { name: 'OpenCLI', version: '1.0.27' });

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText } = await load();
    const report = opencliVersionReport();

    expect(report.pin).toBe('1.8.8');
    expect(report.cli).toBe('1.8.8');
    expect(report.channel).toBe('1.3.2');
    expect(report.extension).toBe('1.0.27');
    expect(report.compatible).toBe(true);
    expect(opencliHandshakeOk(report)).toBe(true);
    expect(opencliHandshakeText(report)).toContain('1.8.8');
  });

  it('盘上是别的版本：握手不通过，话里点出两边', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      version: '1.9.0',
    });

    const { opencliVersionReport, opencliHandshakeOk, opencliHandshakeText } = await load();
    const report = opencliVersionReport();

    expect(opencliHandshakeOk(report)).toBe(false);
    expect(opencliHandshakeText(report)).toContain('1.9.0');
    expect(opencliHandshakeText(report)).toContain('1.8.8');
  });

  it('灰度：DSH_WB_OPENCLI_PIN 一设，钉的版本跟着走', async () => {
    const home = tempHome();
    vi.stubEnv('DSH_HOME', home);
    vi.stubEnv('DSH_WB_OPENCLI_PIN', '2.0.0');
    const root = join(home, 'workbench', 'opencli');
    writeJson(join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json'), {
      version: '2.0.0',
    });

    const { opencliVersionReport, opencliHandshakeOk } = await load();
    const report = opencliVersionReport();

    expect(report.pin).toBe('2.0.0');
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

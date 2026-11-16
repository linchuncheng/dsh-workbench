import { describe, expect, it, vi } from 'vitest';
import { smokeInstalledCli, versionCommandLine } from '../install-smoke.js';

const DIR = '/wb/opencli/toolchain';

function runner(result: { ok: boolean; detail: string }) {
  return vi.fn(async () => result);
}

describe('smokeInstalledCli', () => {
  it('命令回的就是那棵树的版本 → 过', async () => {
    const run = runner({ ok: true, detail: '1.8.8' });

    const verdict = await smokeInstalledCli({ command: 'opencli', dir: DIR, run, pin: '1.8.8' });

    expect(verdict).toEqual({ ok: true, detail: '1.8.8' });
    expect(run).toHaveBeenCalledWith("'opencli' --version");
  });

  it('★ 装到了 A，命令回的却是别的版本 → 说清"装到哪"和"要哪个"', async () => {
    const verdict = await smokeInstalledCli({
      command: 'opencli',
      dir: DIR,
      run: runner({ ok: true, detail: '1.8.7' }),
      pin: '1.8.8',
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain(DIR);
    expect(verdict.detail).toContain('1.8.7');
    expect(verdict.detail).toContain('1.8.8');
  });

  it('★ 命令没跑通 → 把树被指向别处时那句原文带出来', async () => {
    const verdict = await smokeInstalledCli({
      command: 'C:\\Users\\me\\.dsh\\workbench\\opencli\\bin\\opencli.cmd',
      dir: DIR,
      run: runner({ ok: false, detail: 'dsh-workbench: opencli 的隔离运行时还没装好（D:\\wb\\opencli\\toolchain）。' }),
      pin: '1.8.8',
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain(DIR);
    expect(verdict.detail).toContain('D:\\wb\\opencli\\toolchain');
  });

  it('没输出 → 说"没有输出"，不留空', async () => {
    const verdict = await smokeInstalledCli({
      command: 'opencli',
      dir: DIR,
      run: runner({ ok: false, detail: '  ' }),
      pin: '1.8.8',
    });

    expect(verdict.detail).toContain('没有输出');
  });
});

describe('versionCommandLine', () => {
  it('路径带空格 → 整段带引号', () => {
    expect(versionCommandLine('C:\\Users\\John Smith\\opencli.cmd', 'win32')).toBe(
      "'C:\\Users\\John Smith\\opencli.cmd' --version",
    );
    expect(versionCommandLine('opencli', 'linux')).toBe("'opencli' --version");
  });
});

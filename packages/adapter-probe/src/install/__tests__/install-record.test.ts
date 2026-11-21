import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeInstallRecord,
  installRecordFile,
  readInstallRecord,
  recordInstall,
} from '../install-record.js';

const AT = '2026-11-16T01:00:00.000Z';

describe('install-record', () => {
  it('★ 记录落在 toolchain 旁边：整棵树被删了，这条还在', () => {
    const root = mkdtempSync(join(tmpdir(), 'install-record-'));
    const live = join(root, 'toolchain');

    expect(installRecordFile(live)).toBe(join(root, 'install-record.json'));

    recordInstall(live, '1.8.8', AT);

    expect(readInstallRecord(installRecordFile(live))).toEqual({
      schema: 1,
      dir: live,
      pin: '1.8.8',
      at: AT,
    });
  });

  it('写不进去也不炸：装好了就是装好了', () => {
    const root = mkdtempSync(join(tmpdir(), 'install-record-ro-'));
    const blocker = join(root, 'blocker');
    writeFileSync(blocker, 'x');

    expect(() => recordInstall(join(blocker, 'toolchain'), '1.8.8', AT)).not.toThrow();
  });

  it('文件不在 / 字段缺 / schema 不对 → 当没有记录', () => {
    const root = mkdtempSync(join(tmpdir(), 'install-record-'));
    const file = join(root, 'install-record.json');

    expect(readInstallRecord(file)).toBeUndefined();

    writeFileSync(file, `${JSON.stringify({ schema: 1, dir: '/a', pin: '1.8.8' })}\n`);
    expect(readInstallRecord(file)).toBeUndefined();

    writeFileSync(file, `${JSON.stringify({ schema: 2, dir: '/a', pin: '1.8.8', at: AT })}\n`);
    expect(readInstallRecord(file)).toBeUndefined();
  });

  it('★ 三种对不上各说各的：换根 / 换 pin / 装好又被删', () => {
    const record = { schema: 1 as const, dir: '/wb/opencli/toolchain', pin: '1.8.8', at: AT };

    expect(describeInstallRecord(record, '/other/opencli/toolchain', '1.8.8')).toBe(
      '上次装到 /wb/opencli/toolchain，这次看的是 /other/opencli/toolchain',
    );
    expect(describeInstallRecord(record, '/wb/opencli/toolchain', '1.8.9')).toBe(
      '上次装的是 1.8.8，这次要 1.8.9',
    );
    expect(describeInstallRecord(record, '/wb/opencli/toolchain', '1.8.8')).toBe(
      `上次装好是 ${AT}，现在读不到`,
    );
  });
});

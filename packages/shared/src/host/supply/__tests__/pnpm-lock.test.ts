import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lockEntriesOf, lockEntryMapOf } from '../pnpm-lock.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('lockEntriesOf：pnpm-lock.yaml 的 packages', () => {
  it('v9：scoped 与普通包都能拆出 name/version；tarball 推 registry 根', () => {
    const entries = lockEntriesOf(fixture('lock/v9.yaml'));
    expect(entries).toEqual([
      {
        name: '@acme/module-inventory',
        version: '0.1.7',
        tarball:
          'https://npm.example.com/team/@acme/module-inventory/-/module-inventory-0.1.7.tgz',
        registry: 'https://npm.example.com/team/',
      },
      { name: 'lodash', version: '4.17.21' },
      {
        name: '@acme/module-inventory',
        version: '0.2.0',
        tarball:
          'https://npm.example.com/team/@acme/module-inventory/-/module-inventory-0.2.0.tgz',
        registry: 'https://npm.example.com/team/',
      },
    ]);
  });

  it('v6：/name/version 键也能读，普通包与 scoped 包各一条', () => {
    expect(lockEntriesOf(fixture('lock/v6.yaml'))).toEqual([
      {
        name: '@acme/module-legacy',
        version: '0.3.0',
        tarball: 'https://npm.example.com/team/@acme/module-legacy/-/module-legacy-0.3.0.tgz',
        registry: 'https://npm.example.com/team/',
      },
      {
        name: 'plain-pkg',
        version: '1.2.3',
        tarball: 'https://npm.example.com/plain-pkg/-/plain-pkg-1.2.3.tgz',
        registry: 'https://npm.example.com/',
      },
    ]);
  });

  it('多行 resolution 与行内 map 同解', () => {
    expect(lockEntriesOf(fixture('lock/multiline.yaml'))).toEqual([
      {
        name: '@acme/x',
        version: '1.0.0',
        tarball: 'https://npm.example.com/team/@acme/x/-/x-1.0.0.tgz',
        registry: 'https://npm.example.com/team/',
      },
    ]);
  });

  it('没有 tarball 就不编 registry', () => {
    expect(lockEntriesOf(fixture('lock/no-tarball.yaml'))).toEqual([
      { name: '@acme/y', version: '1.0.0' },
    ]);
  });

  it('★ git 依赖的 tarball 不是 registry：别把 codeload 的域名当成源', () => {
    const text = [
      "lockfileVersion: '9.0'",
      '',
      'packages:',
      '',
      "  '@acme/module-from-git@1.0.0':",
      '    resolution: {tarball: https://codeload.github.com/acme/market/tar.gz/abc123}',
      '',
    ].join('\n');

    expect(lockEntriesOf(text)).toEqual([
      {
        name: '@acme/module-from-git',
        version: '1.0.0',
        tarball: 'https://codeload.github.com/acme/market/tar.gz/abc123',
      },
    ]);
  });

  it('本地 .tgz 文件也不算：origin 是 null，不能当源', () => {
    const text = [
      "lockfileVersion: '9.0'",
      '',
      'packages:',
      '',
      "  '@acme/module-local@1.0.0':",
      '    resolution: {tarball: file:../acme-module-1.0.0.tgz}',
      '',
    ].join('\n');

    expect(lockEntriesOf(text)).toEqual([
      {
        name: '@acme/module-local',
        version: '1.0.0',
        tarball: 'file:../acme-module-1.0.0.tgz',
      },
    ]);
  });

  it('坏 lock：空数组，不抛', () => {
    expect(lockEntriesOf(fixture('lock/malformed.yaml'))).toEqual([]);
    expect(lockEntriesOf('')).toEqual([]);
    expect(lockEntriesOf('lockfileVersion: 9\n')).toEqual([]);
  });

  it('v9 带 peer 后缀的键：version 不含括号', () => {
    const text = [
      'packages:',
      "  '@scope/pkg@2.0.0(peer@1.0.0)':",
      '    resolution: {integrity: sha512-abc}',
      '',
    ].join('\n');
    expect(lockEntriesOf(text)).toEqual([{ name: '@scope/pkg', version: '2.0.0' }]);
  });

  it('v6 带 _peer 后缀的键：version 截到 _ 前', () => {
    const text = [
      'packages:',
      '  /plain-pkg/1.2.3_peer@1.0.0:',
      '    resolution: {integrity: sha512-abc}',
      '',
    ].join('\n');
    expect(lockEntriesOf(text)).toEqual([{ name: 'plain-pkg', version: '1.2.3' }]);
  });
});

describe('lockEntryMapOf：按包名索引', () => {
  it('同一个包多版时优先留带 registry 的那条', () => {
    const text = [
      'packages:',
      "  '@acme/x@1.0.0':",
      '    resolution: {integrity: sha512-abc}',
      "  '@acme/x@2.0.0':",
      '    resolution: {integrity: sha512-def, tarball: https://npm.example.com/team/@acme/x/-/x-2.0.0.tgz}',
      '',
    ].join('\n');
    expect(lockEntryMapOf(text).get('@acme/x')).toMatchObject({
      version: '2.0.0',
      registry: 'https://npm.example.com/team/',
    });
  });

  it('没有 registry 的包也留一条，只是没有 registry', () => {
    const map = lockEntryMapOf(fixture('lock/no-tarball.yaml'));
    expect(map.get('@acme/y')).toEqual({ name: '@acme/y', version: '1.0.0' });
  });
});

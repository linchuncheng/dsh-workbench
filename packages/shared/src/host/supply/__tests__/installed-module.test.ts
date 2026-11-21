import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { profileModules, readInstalledModule, unreadableModules } from '../installed-module.js';

let dir = '';

function writeManifest(profileDir: string, pkg: string, value: unknown): void {
  const target = path.join(profileDir, 'node_modules', pkg);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(value), 'utf8');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-installed-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('已安装模块的读取', () => {
  it('读得出来：进已装清单，不进「读不出来」那份', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'acme-inventory': '1.0.0' } }),
      'utf8',
    );
    writeManifest(dir, 'acme-inventory', { name: 'acme-inventory', version: '1.0.0', dsh: { workbench: { unit: 'inventory' } } });

    expect(profileModules(dir).map((one) => one.unit)).toEqual(['inventory']);
    expect(unreadableModules(dir)).toEqual([]);
  });

  it('★ 声明了但 package.json 坏了：不再悄悄消失，而是带着原因出现在「读不出来」清单里', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'acme-broken': '1.0.0' } }),
      'utf8',
    );
    const target = path.join(dir, 'node_modules', 'acme-broken');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), '{ 这不是 JSON', 'utf8');

    expect(profileModules(dir)).toEqual([]);
    const unreadable = unreadableModules(dir);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]?.pkg).toBe('acme-broken');
    expect(unreadable[0]?.reason).not.toBe('');
  });

  it('★ 包根本没装上：也说清楚是「没装上」，不是含糊的读不到', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'acme-missing': '1.0.0' } }),
      'utf8',
    );

    const read = readInstalledModule(dir, 'acme-missing');
    expect(read.kind).toBe('unknown');
    expect(read.kind === 'unknown' ? read.reason : '').toContain('没装上');
    expect(unreadableModules(dir)).toHaveLength(1);
  });
});
